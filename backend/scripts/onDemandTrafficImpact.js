const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

/**
 * On-Demand Bus Traffic Impact Model
 * Uses public bus OD data to predict delays for private/on-demand bus routes
 * 
 * Logic: High public bus traffic = more congestion = potential delays for your buses
 */
class OnDemandTrafficImpactModel {
    constructor() {
        this.publicBusStops = new Map();     // Public bus stops from CSV
        this.publicTrafficMatrix = new Map(); // Public bus OD trips data
        this.trafficHotspots = new Map();    // High traffic areas
        this.congestionZones = [];           // Areas with high congestion
        this.impactRadius = 0.5;             // km - how far traffic affects your route
    }

    /**
     * Load public bus stops data
     */
    async loadPublicBusStops() {
        console.log('🚌 Loading public bus stops data...');
        const busStopsPath = path.join(__dirname, '../traffic/bus-stop-dictionary-v1.csv');
        
        return new Promise((resolve, reject) => {
            const stops = [];
            
            fs.createReadStream(busStopsPath)
                .pipe(csv())
                .on('data', (row) => {
                    const stop = {
                        code: row.BusStopCode,
                        roadName: row.RoadName,
                        description: row.Description,
                        latitude: parseFloat(row.Latitude),
                        longitude: parseFloat(row.Longitude),
                        planningArea: row.planning_area,
                        trafficVolume: 0,
                        congestionLevel: 'low'
                    };
                    
                    stops.push(stop);
                    this.publicBusStops.set(row.BusStopCode, stop);
                })
                .on('end', () => {
                    console.log(`✅ Loaded ${stops.length} public bus stops`);
                    resolve(stops);
                })
                .on('error', reject);
        });
    }

    /**
     * Load public bus OD trip data (the total_trips data you mentioned)
     */
    async loadPublicTrafficData() {
        console.log('📊 Loading public bus OD traffic data...');
        
        try {
            await this.loadActualODData();
        } catch (error) {
            console.log('⚠️  Actual OD data not found, generating synthetic data...');
            this.generatePublicTrafficData();
        }
    }

    /**
     * Load actual origin_destination_bus_202508.csv data
     */
    async loadActualODData() {
        const odDataPath = path.join(__dirname, '../traffic/origin_destination_bus_202508.csv');
        console.log(`📂 Attempting to load: ${odDataPath}`);
        
        return new Promise((resolve, reject) => {
            let processedRecords = 0;
            let validRecords = 0;
            let sampleRecords = [];
            
            fs.createReadStream(odDataPath)
                .pipe(csv())
                .on('data', (row) => {
                    processedRecords++;
                    
                    // Debug: Show first few records to understand format
                    if (processedRecords <= 5) {
                        console.log(`📋 Sample record ${processedRecords}:`, row);
                        sampleRecords.push(row);
                    }
                    
                    // Process actual OD data with time_per_hour and total_trips
                    const origin = row.ORIGIN_PT_CODE || row.origin_stop_id || row.origin;
                    const destination = row.DESTINATION_PT_CODE || row.DESTIN_PT_CODE || row.destination_stop_id || row.destination;  
                    const timePerHour = parseInt(row.TIME_PER_HOUR || row.time_per_hour) || 0;
                    const totalTripsStr = row.TOTAL_TRIPS || row.total_trips || '0';
                    const totalTrips = parseInt(totalTripsStr.toString().trim()) || 0;
                    const month = row.YEAR_MONTH || row.month || '202508';
                    const dayType = row.DAY_TYPE || 'WEEKDAY';
                    
                    // Debug first few records
                    if (processedRecords <= 10) {
                        console.log(`🔍 Debug record ${processedRecords}: origin=${origin}, dest=${destination}, trips=${totalTrips}, hour=${timePerHour}`);
                    }
                    
                    // Only process valid records
                    if (origin && destination && totalTrips > 0) {
                        // Your data already separates by DAY_TYPE, so use accordingly
                        let weekdayTrips = 0;
                        let weekendTrips = 0;
                        
                        if (dayType === 'WEEKENDS/HOLIDAY') {
                            weekendTrips = Math.floor(totalTrips / 8); // 8 weekend days in month
                        } else {
                            weekdayTrips = Math.floor(totalTrips / 20); // 20 weekdays in month
                        }
                        
                        // Add traffic pattern
                        this.addActualTrafficData(origin, destination, timePerHour, weekdayTrips, weekendTrips, month);
                        validRecords++;
                    }
                    
                    // Progress indicator for large files
                    if (processedRecords % 100000 === 0) {
                        console.log(`📊 Processed ${processedRecords} records, ${validRecords} valid...`);
                    }
                })
                .on('end', () => {
                    console.log(`✅ Processing complete:`);
                    console.log(`   📊 Total records processed: ${processedRecords}`);
                    console.log(`   ✅ Valid records with traffic data: ${validRecords}`);
                    console.log(`   📈 Traffic matrix size: ${this.publicTrafficMatrix.size}`);
                    
                    if (validRecords === 0) {
                        console.log(`⚠️  No valid records found. Sample data structure:`);
                        sampleRecords.forEach((record, i) => {
                            console.log(`   Record ${i + 1} keys:`, Object.keys(record));
                        });
                        reject(new Error('No valid OD data found'));
                    } else {
                        resolve();
                    }
                })
                .on('error', (error) => {
                    console.error(`❌ Error reading OD file:`, error.message);
                    reject(error);
                });
        });
    }

    /**
     * Add actual traffic data with time and day-type patterns
     */
    addActualTrafficData(originCode, destCode, timePerHour, weekdayTrips, weekendTrips, month) {
        const key = `${originCode}-${destCode}-${timePerHour}`;
        
        // Store time-specific traffic data
        this.publicTrafficMatrix.set(key, {
            origin: originCode,
            destination: destCode,
            hour: timePerHour,
            weekdayTrips,
            weekendTrips,
            totalMonthlyTrips: (weekdayTrips * 20) + (weekendTrips * 8),
            peakFactor: this.calculatePeakFactor(timePerHour),
            congestionScore: this.calculateTimedCongestionScore(timePerHour, weekdayTrips, weekendTrips),
            impactLevel: this.getTimedImpactLevel(timePerHour, weekdayTrips, weekendTrips),
            month
        });

        // Update stop traffic volumes with time-aware data
        const originStop = this.publicBusStops.get(originCode);
        const destStop = this.publicBusStops.get(destCode);
        
        if (originStop) {
            originStop.trafficVolume += weekdayTrips + weekendTrips;
            if (!originStop.hourlyPattern) originStop.hourlyPattern = new Array(24).fill(0);
            originStop.hourlyPattern[timePerHour] += weekdayTrips + weekendTrips;
        }
        
        if (destStop) {
            destStop.trafficVolume += weekdayTrips + weekendTrips;
            if (!destStop.hourlyPattern) destStop.hourlyPattern = new Array(24).fill(0);
            destStop.hourlyPattern[timePerHour] += weekdayTrips + weekendTrips;
        }
    }

    /**
     * Calculate peak factor based on hour of day
     */
    calculatePeakFactor(hour) {
        // Singapore peak hours: 7-9 AM, 6-8 PM
        if ((hour >= 7 && hour <= 9) || (hour >= 18 && hour <= 20)) {
            return 2.5; // Peak hours - higher impact
        } else if ((hour >= 6 && hour <= 10) || (hour >= 17 && hour <= 21)) {
            return 1.8; // Semi-peak hours
        } else if (hour >= 10 && hour <= 16) {
            return 1.2; // Off-peak day hours
        } else {
            return 0.5; // Night hours - low impact
        }
    }

    /**
     * Calculate congestion score considering time and volume
     */
    calculateTimedCongestionScore(hour, weekdayTrips, weekendTrips) {
        const peakFactor = this.calculatePeakFactor(hour);
        const avgDailyTrips = (weekdayTrips * 5 + weekendTrips * 2) / 7; // Weekly average
        const adjustedTrips = avgDailyTrips * peakFactor;
        
        if (adjustedTrips > 2000) return 5; // Very high congestion
        if (adjustedTrips > 1000) return 4; // High congestion
        if (adjustedTrips > 500) return 3;  // Medium congestion
        if (adjustedTrips > 100) return 2;  // Low congestion
        return 1; // Very low congestion
    }

    /**
     * Get timed impact level
     */
    getTimedImpactLevel(hour, weekdayTrips, weekendTrips) {
        const peakFactor = this.calculatePeakFactor(hour);
        const avgDailyTrips = (weekdayTrips * 5 + weekendTrips * 2) / 7;
        const adjustedTrips = avgDailyTrips * peakFactor;
        
        if (adjustedTrips > 1500) return 'severe';
        if (adjustedTrips > 800) return 'high';
        if (adjustedTrips > 400) return 'medium';
        if (adjustedTrips > 100) return 'low';
        return 'minimal';
    }

    /**
     * Generate realistic public traffic data based on planning areas and routes
     */
    generatePublicTrafficData() {
        const stopCodes = Array.from(this.publicBusStops.keys());
        let totalTrips = 0;

        // Generate traffic data between nearby stops
        for (let i = 0; i < stopCodes.length; i++) {
            for (let j = i + 1; j < Math.min(i + 10, stopCodes.length); j++) {
                const originStop = this.publicBusStops.get(stopCodes[i]);
                const destStop = this.publicBusStops.get(stopCodes[j]);
                
                if (!originStop || !destStop) continue;

                const distance = this.calculateDistance(
                    originStop.latitude, originStop.longitude,
                    destStop.latitude, destStop.longitude
                );

                // Only consider nearby routes (< 5km)
                if (distance < 5.0) {
                    // Calculate trips based on area popularity and distance
                    const areaMultiplier = this.getAreaTrafficMultiplier(originStop.planningArea);
                    const baseTrips = Math.max(10, Math.floor(1000 / Math.pow(distance + 0.5, 1.5)));
                    const totalTrips = Math.floor(baseTrips * areaMultiplier * (0.5 + Math.random()));

                    this.addPublicTrafficData(stopCodes[i], stopCodes[j], totalTrips);
                }
            }
        }

        console.log(`✅ Generated ${this.publicTrafficMatrix.size} public traffic routes`);
    }

    /**
     * Get traffic multiplier based on planning area
     */
    getAreaTrafficMultiplier(planningArea) {
        const multipliers = {
            'BEDOK': 2.0,           // High traffic area
            'TAMPINES': 1.8,
            'JURONG WEST': 1.7,
            'HOUGANG': 1.6,
            'WOODLANDS': 1.5,
            'BUKIT TIMAH': 1.4,
            'ORCHARD': 2.2,         // Very high traffic
            'DOWNTOWN CORE': 2.5,   // Extremely high traffic
            'MARINA SOUTH': 2.0,
            'CHANGI': 1.2,
            'PASIR RIS': 1.1
        };
        
        return multipliers[planningArea] || 1.0;
    }

    /**
     * Add public traffic data between two stops
     */
    addPublicTrafficData(originCode, destCode, totalTrips) {
        const key = `${originCode}-${destCode}`;
        
        this.publicTrafficMatrix.set(key, {
            origin: originCode,
            destination: destCode,
            totalTrips,
            congestionScore: this.calculateCongestionScore(totalTrips),
            impactLevel: this.getImpactLevel(totalTrips)
        });

        // Update stop traffic volumes
        const originStop = this.publicBusStops.get(originCode);
        const destStop = this.publicBusStops.get(destCode);
        
        if (originStop) originStop.trafficVolume += totalTrips;
        if (destStop) destStop.trafficVolume += totalTrips;
    }

    /**
     * Calculate congestion score based on trip volume (DATA-DRIVEN THRESHOLDS)
     * Based on Singapore public bus traffic percentiles
     */
    calculateCongestionScore(totalTrips) {
        if (totalTrips > 2618) return 5; // SEVERE: Top 10% (90th+ percentile)
        if (totalTrips > 1340) return 4; // HIGH: 75th-90th percentile  
        if (totalTrips > 543) return 3;  // MEDIUM: 50th-75th percentile
        if (totalTrips > 100) return 2;  // LOW: Above minimal traffic
        return 1; // MINIMAL: Bottom tier
    }

    /**
     * Get impact level for route planning (DATA-DRIVEN THRESHOLDS)
     * Based on actual Singapore public bus traffic distribution:
     * - 50th percentile (median): 543 trips/day
     * - 75th percentile: 1340 trips/day  
     * - 90th percentile: 2618 trips/day
     * - 95th percentile: 4105 trips/day
     */
    getImpactLevel(totalTrips) {
        if (totalTrips > 2618) return 'SEVERE';   // Top 10% busiest stops
        if (totalTrips > 1340) return 'HIGH';     // 75th-90th percentile  
        if (totalTrips > 543) return 'MEDIUM';    // 50th-75th percentile
        if (totalTrips > 100) return 'LOW';       // Above minimal traffic
        return 'MINIMAL';                         // Bottom tier
    }

    /**
     * Build congestion zones based on public traffic data
     */
    buildCongestionZones() {
        console.log('🔥 Building congestion zones...');
        console.log(`📊 Total traffic matrix entries: ${this.publicTrafficMatrix.size}`);

        // Calculate traffic volumes for each stop based on actual OD data
        const stopTrafficSummary = new Map();
        
        for (const [key, trafficData] of this.publicTrafficMatrix) {
            const origin = trafficData.origin;
            const destination = trafficData.destination;
            const dailyVolume = trafficData.weekdayTrips + trafficData.weekendTrips;
            
            // Accumulate traffic for origin stops
            if (!stopTrafficSummary.has(origin)) {
                stopTrafficSummary.set(origin, 0);
            }
            stopTrafficSummary.set(origin, stopTrafficSummary.get(origin) + dailyVolume);
            
            // Accumulate traffic for destination stops
            if (!stopTrafficSummary.has(destination)) {
                stopTrafficSummary.set(destination, 0);
            }
            stopTrafficSummary.set(destination, stopTrafficSummary.get(destination) + dailyVolume);
        }

        console.log(`📈 Calculated traffic for ${stopTrafficSummary.size} unique stops`);

        // Update stop traffic volumes
        for (const [stopCode, volume] of stopTrafficSummary) {
            const stop = this.publicBusStops.get(stopCode);
            if (stop) {
                stop.trafficVolume = volume;
            }
        }

        // Identify high-traffic stops (lowered threshold to get more zones)
        const highTrafficStops = Array.from(this.publicBusStops.values())
            .filter(stop => stop.trafficVolume > 100) // Lowered from 5000
            .sort((a, b) => b.trafficVolume - a.trafficVolume);

        console.log(`🎯 Found ${highTrafficStops.length} high-traffic stops`);

        // Create congestion zones around high-traffic areas
        for (const stop of highTrafficStops.slice(0, 50)) { // Limit to top 50
            const zone = {
                centerStop: stop,
                latitude: stop.latitude,
                longitude: stop.longitude,
                radius: this.impactRadius,
                congestionLevel: stop.trafficVolume > 5000 ? 'severe' : 
                                stop.trafficVolume > 1000 ? 'high' : 'medium',
                expectedDelay: this.calculateExpectedDelay(stop.trafficVolume),
                affectedRoads: [stop.roadName],
                planningArea: stop.planningArea
            };

            this.congestionZones.push(zone);
        }

        console.log(`✅ Created ${this.congestionZones.length} congestion zones`);
        
        if (this.congestionZones.length > 0) {
            const topZone = this.congestionZones[0];
            console.log(`🔥 Top congestion zone: ${topZone.centerStop.description} (${topZone.centerStop.trafficVolume} trips)`);
        }
    }

    /**
     * Calculate expected delay based on traffic volume
     */
    calculateExpectedDelay(trafficVolume) {
        // Delay in minutes based on public bus traffic volume
        if (trafficVolume > 20000) return { min: 8, max: 15, avg: 12 };
        if (trafficVolume > 15000) return { min: 5, max: 12, avg: 8 };
        if (trafficVolume > 10000) return { min: 3, max: 8, avg: 5 };
        if (trafficVolume > 5000) return { min: 1, max: 5, avg: 3 };
        return { min: 0, max: 2, avg: 1 };
    }

    /**
     * Calculate time-aware delay considering peak factors
     */
    calculateTimeAwareDelay(adjustedTrips, peakFactor) {
        // Base delay calculation
        let baseDelay = { min: 0, max: 2, avg: 1 };
        
        if (adjustedTrips > 1500) baseDelay = { min: 6, max: 12, avg: 9 };
        else if (adjustedTrips > 800) baseDelay = { min: 4, max: 8, avg: 6 };
        else if (adjustedTrips > 400) baseDelay = { min: 2, max: 5, avg: 3 };
        else if (adjustedTrips > 100) baseDelay = { min: 1, max: 3, avg: 2 };
        
        // Apply peak factor multiplier
        return {
            min: Math.round(baseDelay.min * Math.max(1, peakFactor * 0.8)),
            max: Math.round(baseDelay.max * peakFactor),
            avg: Math.round(baseDelay.avg * peakFactor)
        };
    }

    /**
     * Get time-specific traffic data for route analysis
     */
    getTimeSpecificTraffic(pickupLat, pickupLng, destLat, destLng, hour, isWeekend) {
        const relevantRoutes = [];
        const searchRadius = 2.0; // km - search radius for nearby traffic

        for (const [key, trafficData] of this.publicTrafficMatrix) {
            // Only consider traffic data for the specific hour
            if (trafficData.hour !== hour) continue;

            const origin = this.publicBusStops.get(trafficData.origin);
            const destination = this.publicBusStops.get(trafficData.destination);

            if (origin && destination) {
                // Check if this traffic route is near our on-demand route
                const distanceFromPickup = Math.min(
                    this.calculateDistance(pickupLat, pickupLng, origin.latitude, origin.longitude),
                    this.calculateDistance(pickupLat, pickupLng, destination.latitude, destination.longitude)
                );

                const distanceFromDest = Math.min(
                    this.calculateDistance(destLat, destLng, origin.latitude, origin.longitude),
                    this.calculateDistance(destLat, destLng, destination.latitude, destination.longitude)
                );

                // If traffic route is within search radius of our route
                if (distanceFromPickup < searchRadius || distanceFromDest < searchRadius) {
                    relevantRoutes.push(trafficData);
                }
            }
        }

        return relevantRoutes.sort((a, b) => {
            const aTrips = isWeekend ? a.weekendTrips : a.weekdayTrips;
            const bTrips = isWeekend ? b.weekendTrips : b.weekdayTrips;
            return (bTrips * b.peakFactor) - (aTrips * a.peakFactor);
        });
    }

    /**
     * Analyze your on-demand route for traffic impact with time awareness
     */
    analyzeOnDemandRoute(pickupLat, pickupLng, destinationLat, destinationLng, scheduledTime = null) {
        console.log(`🔍 Analyzing on-demand route impact from (${pickupLat}, ${pickupLng}) to (${destinationLat}, ${destinationLng})`);
        
        // Parse scheduled time for time-aware analysis
        const scheduleDate = scheduledTime ? new Date(scheduledTime) : new Date();
        const hour = scheduleDate.getHours();
        const isWeekend = scheduleDate.getDay() === 0 || scheduleDate.getDay() === 6;
        const dayType = isWeekend ? 'weekend' : 'weekday';

        const analysis = {
            route: { pickup: [pickupLat, pickupLng], destination: [destinationLat, destinationLng] },
            scheduledTime: scheduledTime,
            hour: hour,
            dayType: dayType,
            peakFactor: this.calculatePeakFactor(hour),
            affectedZones: [],
            totalDelay: { min: 0, max: 0, avg: 0 },
            riskLevel: 'low',
            recommendations: [],
            alternativeTimeSlots: []
        };

        // Check time-specific traffic impact using actual OD data
        const nearbyTrafficRoutes = this.getTimeSpecificTraffic(pickupLat, pickupLng, destinationLat, destinationLng, hour, isWeekend);
        
        // Process time-specific congestion zones
        for (const trafficRoute of nearbyTrafficRoutes) {
            const origin = this.publicBusStops.get(trafficRoute.origin);
            const destination = this.publicBusStops.get(trafficRoute.destination);
            
            if (origin && destination) {
                const impactOnPickup = this.calculateDistance(pickupLat, pickupLng, origin.latitude, origin.longitude);
                const impactOnDestination = this.calculateDistance(destinationLat, destinationLng, destination.latitude, destination.longitude);
                const impactOnRoute = this.calculateRouteImpact(pickupLat, pickupLng, destinationLat, destinationLng, origin);

                // If route is affected by this traffic pattern
                if (impactOnRoute < this.impactRadius || impactOnPickup < this.impactRadius || impactOnDestination < this.impactRadius) {
                    const relevantTrips = isWeekend ? trafficRoute.weekendTrips : trafficRoute.weekdayTrips;
                    const adjustedTrips = relevantTrips * trafficRoute.peakFactor;
                    
                    const impact = {
                        origin: origin,
                        destination: destination,
                        hour: trafficRoute.hour,
                        distance: Math.min(impactOnPickup, impactOnDestination, impactOnRoute),
                        severity: trafficRoute.impactLevel,
                        expectedDelay: this.calculateTimeAwareDelay(adjustedTrips, trafficRoute.peakFactor),
                        publicTrafficVolume: relevantTrips,
                        adjustedVolume: adjustedTrips,
                        peakFactor: trafficRoute.peakFactor
                    };

                    analysis.affectedZones.push(impact);

                    // Add to total delay with peak factor consideration
                    const delay = impact.expectedDelay;
                    analysis.totalDelay.min += delay.min;
                    analysis.totalDelay.max += delay.max;
                    analysis.totalDelay.avg += delay.avg;
                }
            }
        }

        // Determine overall risk level
        analysis.riskLevel = this.calculateOverallRisk(analysis.affectedZones);

        // Generate recommendations
        analysis.recommendations = this.generateRecommendations(analysis);

        // Suggest alternative time slots if high risk
        if (analysis.riskLevel === 'high' || analysis.riskLevel === 'severe') {
            analysis.alternativeTimeSlots = this.suggestAlternativeTimeSlots(scheduledTime);
        }

        return analysis;
    }

    /**
     * Calculate how much a route is impacted by a congestion zone
     */
    calculateRouteImpact(startLat, startLng, endLat, endLng, zone) {
        // Calculate closest distance from route line to zone center
        // Simplified: use midpoint of route
        const midLat = (startLat + endLat) / 2;
        const midLng = (startLng + endLng) / 2;
        
        return this.calculateDistance(midLat, midLng, zone.latitude, zone.longitude);
    }

    /**
     * Calculate overall risk level
     */
    calculateOverallRisk(affectedZones) {
        if (affectedZones.length === 0) return 'low';

        const severeZones = affectedZones.filter(z => z.severity === 'severe').length;
        const highZones = affectedZones.filter(z => z.severity === 'high').length;

        if (severeZones > 0) return 'severe';
        if (highZones > 1) return 'high';
        if (highZones > 0 || affectedZones.length > 2) return 'medium';
        return 'low';
    }

    /**
     * Generate recommendations based on analysis
     */
    generateRecommendations(analysis) {
        const recommendations = [];

        if (analysis.totalDelay.avg > 10) {
            recommendations.push({
                type: 'timing',
                message: `Expect ${analysis.totalDelay.avg} minutes average delay due to public bus traffic`,
                action: 'Inform passengers about potential delays'
            });
        }

        if (analysis.riskLevel === 'severe') {
            recommendations.push({
                type: 'route',
                message: 'Consider alternative route due to severe traffic congestion',
                action: 'Use less congested roads or reschedule'
            });
        }

        if (analysis.affectedZones.length > 3) {
            recommendations.push({
                type: 'buffer',
                message: 'Route passes through multiple congestion zones',
                action: 'Add 15-20 minute buffer to journey time'
            });
        }

        // Time-specific recommendations
        if (analysis.peakFactor > 2.0) {
            recommendations.push({
                type: 'peak_hours',
                message: `Traveling during peak hours (${analysis.hour}:00) - expect ${Math.round(analysis.peakFactor)}x normal delays`,
                action: 'Consider rescheduling to off-peak hours or add significant buffer time'
            });
        }

        // Day type recommendations
        if (analysis.dayType === 'weekend') {
            recommendations.push({
                type: 'weekend_pattern',
                message: 'Weekend travel - generally lower traffic but different patterns',
                action: 'Monitor weekend-specific congestion areas'
            });
        }

        // Traffic-specific recommendations with time awareness
        const highTrafficZones = analysis.affectedZones.filter(z => z.adjustedVolume > 500);
        if (highTrafficZones.length > 0) {
            const avgVolume = Math.round(highTrafficZones.reduce((sum, z) => sum + z.adjustedVolume, 0) / highTrafficZones.length);
            recommendations.push({
                type: 'traffic_awareness',
                message: `High public bus traffic detected at ${analysis.hour}:00 (${avgVolume} avg trips/hour)`,
                action: 'Monitor real-time traffic and consider alternative timing'
            });
        }

        return recommendations;
    }

    /**
     * Suggest alternative time slots
     */
    suggestAlternativeTimeSlots(currentTime) {
        if (!currentTime) return [];

        const alternatives = [];
        const current = new Date(currentTime);

        // Suggest off-peak hours
        const suggestions = [
            { offset: -90, reason: 'Earlier departure to avoid morning peak' },
            { offset: 60, reason: 'Later departure after peak traffic subsides' },
            { offset: -30, reason: '30 minutes earlier to avoid congestion buildup' },
            { offset: 120, reason: 'Afternoon slot with typically lower traffic' }
        ];

        for (const suggestion of suggestions) {
            const alternativeTime = new Date(current.getTime() + suggestion.offset * 60000);
            alternatives.push({
                time: alternativeTime,
                reason: suggestion.reason,
                expectedImprovement: Math.abs(suggestion.offset) > 60 ? 'significant' : 'moderate'
            });
        }

        return alternatives;
    }

    /**
     * Get traffic impact summary for a specific area
     */
    getAreaTrafficSummary(planningArea) {
        const areaStops = Array.from(this.publicBusStops.values())
            .filter(stop => stop.planningArea === planningArea);

        const totalVolume = areaStops.reduce((sum, stop) => sum + stop.trafficVolume, 0);
        const avgVolume = totalVolume / areaStops.length;

        const congestionZones = this.congestionZones.filter(zone => zone.planningArea === planningArea);

        return {
            planningArea,
            totalStops: areaStops.length,
            totalTrafficVolume: totalVolume,
            averageVolumePerStop: Math.round(avgVolume),
            congestionZones: congestionZones.length,
            riskLevel: this.getImpactLevel(avgVolume).toLowerCase(), // Use data-driven thresholds!
            expectedDelay: this.calculateExpectedDelay(avgVolume)
        };
    }

    /**
     * Calculate distance between coordinates
     */
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in km
        const dLat = this.toRadians(lat2 - lat1);
        const dLon = this.toRadians(lon2 - lon1);
        
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }

    /**
     * Test with sample on-demand routes
     */
    testOnDemandRoutes() {
        console.log('\n🧪 TESTING ON-DEMAND ROUTE IMPACT ANALYSIS...\n');

        const testRoutes = [
            {
                name: 'Morning Peak: Changi Airport to Orchard',
                pickup: [1.3644, 103.992],
                destination: [1.3048, 103.8318],
                scheduledTime: '2025-10-28 08:30:00' // Monday morning peak
            },
            {
                name: 'Evening Peak: Bedok to CBD',
                pickup: [1.3244, 103.9304],
                destination: [1.2839, 103.8510],
                scheduledTime: '2025-10-28 18:45:00' // Monday evening peak
            },
            {
                name: 'Off-Peak: Jurong to Tampines',
                pickup: [1.3496, 103.7065],
                destination: [1.3540, 103.9449],
                scheduledTime: '2025-10-28 14:15:00' // Monday afternoon off-peak
            },
            {
                name: 'Weekend: Marina Bay to Sentosa',
                pickup: [1.2834, 103.8607],
                destination: [1.2494, 103.8303],
                scheduledTime: '2025-11-02 11:00:00' // Saturday morning
            }
        ];

        for (const route of testRoutes) {
            console.log(`🚌 Analyzing: ${route.name}`);
            const analysis = this.analyzeOnDemandRoute(
                route.pickup[0], route.pickup[1],
                route.destination[0], route.destination[1],
                route.scheduledTime
            );

            console.log(`   � Time: ${analysis.hour}:00 (${analysis.dayType}) - Peak Factor: ${analysis.peakFactor}x`);
            console.log(`   �🔍 Risk Level: ${analysis.riskLevel.toUpperCase()}`);
            console.log(`   ⏱️  Expected Delay: ${analysis.totalDelay.avg} minutes (${analysis.totalDelay.min}-${analysis.totalDelay.max} min range)`);
            console.log(`   🚦 Traffic Routes Analyzed: ${analysis.affectedZones.length}`);
            
            if (analysis.recommendations.length > 0) {
                console.log(`   💡 Key Recommendation: ${analysis.recommendations[0].message}`);
            }
            
            if (analysis.alternativeTimeSlots.length > 0) {
                console.log(`   🕐 Alternative Time: ${analysis.alternativeTimeSlots[0].reason}`);
            }
            
            // Show hourly traffic pattern if available
            if (analysis.affectedZones.length > 0) {
                const avgAdjustedVolume = Math.round(
                    analysis.affectedZones.reduce((sum, zone) => sum + zone.adjustedVolume, 0) / analysis.affectedZones.length
                );
                console.log(`   📊 Avg Public Traffic Volume: ${avgAdjustedVolume} trips/hour at ${analysis.hour}:00`);
            }
            
            console.log('');
        }
    }

    /**
     * Calculate data-driven thresholds based on actual traffic distribution
     */
    calculateDataDrivenThresholds() {
        console.log('\n📊 CALCULATING DATA-DRIVEN THRESHOLDS...\n');
        
        // Collect all traffic volumes
        const allVolumes = [];
        for (const [code, stop] of this.publicBusStops) {
            if (stop.trafficVolume > 0) {
                allVolumes.push(stop.trafficVolume);
            }
        }
        
        allVolumes.sort((a, b) => a - b);
        
        // Calculate percentiles for meaningful thresholds
        const percentiles = {
            p50: this.getPercentile(allVolumes, 50),  // Median
            p75: this.getPercentile(allVolumes, 75),  // 75th percentile  
            p90: this.getPercentile(allVolumes, 90),  // 90th percentile
            p95: this.getPercentile(allVolumes, 95),  // 95th percentile
            p99: this.getPercentile(allVolumes, 99),  // 99th percentile (extreme)
        };
        
        console.log('📈 TRAFFIC VOLUME DISTRIBUTION:');
        console.log(`   • Total stops with traffic: ${allVolumes.length}`);
        console.log(`   • Minimum volume: ${Math.min(...allVolumes)} trips/day`);
        console.log(`   • Maximum volume: ${Math.max(...allVolumes)} trips/day`);
        console.log(`   • Average volume: ${Math.round(allVolumes.reduce((a, b) => a + b, 0) / allVolumes.length)} trips/day`);
        
        console.log('\n📊 STATISTICAL THRESHOLDS:');
        console.log(`   • 50th Percentile (Median): ${percentiles.p50} trips/day`);
        console.log(`   • 75th Percentile: ${percentiles.p75} trips/day`);  
        console.log(`   • 90th Percentile: ${percentiles.p90} trips/day`);
        console.log(`   • 95th Percentile: ${percentiles.p95} trips/day`);
        console.log(`   • 99th Percentile: ${percentiles.p99} trips/day`);
        
        // Suggest data-driven risk thresholds
        const suggestedThresholds = {
            low: percentiles.p50,        // Below median = LOW risk
            medium: percentiles.p75,     // 75th percentile = MEDIUM risk  
            high: percentiles.p90,       // 90th percentile = HIGH risk
            severe: percentiles.p95      // 95th percentile = SEVERE risk
        };
        
        console.log('\n🎯 SUGGESTED DATA-DRIVEN THRESHOLDS:');
        console.log(`   • LOW Risk: < ${suggestedThresholds.low} trips/day (bottom 50%)`);
        console.log(`   • MEDIUM Risk: ${suggestedThresholds.low} - ${suggestedThresholds.medium} trips/day (50th-75th %ile)`);
        console.log(`   • HIGH Risk: ${suggestedThresholds.medium} - ${suggestedThresholds.high} trips/day (75th-90th %ile)`); 
        console.log(`   • SEVERE Risk: > ${suggestedThresholds.high} trips/day (top 10%)`);
        
        // Show current vs suggested comparison
        console.log('\n⚖️  CURRENT vs SUGGESTED THRESHOLDS:');
        console.log(`   Current LOW: < 5,000 → Suggested: < ${suggestedThresholds.low}`);
        console.log(`   Current MEDIUM: 5,000-10,000 → Suggested: ${suggestedThresholds.low}-${suggestedThresholds.medium}`);
        console.log(`   Current HIGH: 10,000-15,000 → Suggested: ${suggestedThresholds.medium}-${suggestedThresholds.high}`);
        console.log(`   Current SEVERE: > 15,000 → Suggested: > ${suggestedThresholds.high}`);
        
        return suggestedThresholds;
    }
    
    /**
     * Calculate percentile from sorted array
     */
    getPercentile(sortedArray, percentile) {
        const index = (percentile / 100) * (sortedArray.length - 1);
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        const weight = index % 1;
        
        if (upper >= sortedArray.length) return sortedArray[sortedArray.length - 1];
        
        return Math.round(sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight);
    }

    /**
     * Generate comprehensive report
     */
    generateReport() {
        console.log('\n📊 === ON-DEMAND BUS TRAFFIC IMPACT REPORT ===\n');

        console.log('📈 PUBLIC TRAFFIC DATA ANALYSIS:');
        console.log(`   • Public Bus Stops Analyzed: ${this.publicBusStops.size}`);
        console.log(`   • Traffic Routes Processed: ${this.publicTrafficMatrix.size}`);
        console.log(`   • Congestion Zones Identified: ${this.congestionZones.length}`);
        
        // Calculate and show data-driven thresholds
        const suggestedThresholds = this.calculateDataDrivenThresholds();

        // Top congestion areas
        const topCongestionAreas = this.congestionZones
            .sort((a, b) => b.centerStop.trafficVolume - a.centerStop.trafficVolume)
            .slice(0, 10);

        console.log('\n🚨 TOP 10 CONGESTION ZONES (for on-demand bus impact):');
        topCongestionAreas.forEach((zone, index) => {
            console.log(`   ${index + 1}. ${zone.centerStop.description} - ${zone.centerStop.trafficVolume} daily trips`);
            console.log(`      Expected Delay: ${zone.expectedDelay.avg} minutes | Risk: ${zone.congestionLevel.toUpperCase()}`);
        });

        // Planning area summary
        const uniqueAreas = [...new Set(Array.from(this.publicBusStops.values()).map(s => s.planningArea))];
        console.log('\n🗺️  PLANNING AREA RISK ASSESSMENT:');
        
        const areaSummaries = uniqueAreas.slice(0, 10).map(area => this.getAreaTrafficSummary(area))
            .sort((a, b) => b.averageVolumePerStop - a.averageVolumePerStop);

        areaSummaries.forEach(summary => {
            console.log(`   • ${summary.planningArea}: ${summary.riskLevel.toUpperCase()} risk (${summary.averageVolumePerStop} avg trips/stop)`);
        });

        console.log('\n✅ Traffic impact analysis complete!\n');
    }

    /**
     * Main execution method
     */
    async run() {
        try {
            console.log('🚀 Starting On-Demand Bus Traffic Impact Analysis...\n');

            // Load public transport data
            await this.loadPublicBusStops();
            await this.loadPublicTrafficData();

            // Build congestion analysis
            this.buildCongestionZones();

            // Test with sample routes
            this.testOnDemandRoutes();

            // Generate report
            this.generateReport();

            console.log('🎉 On-Demand Bus Traffic Impact Analysis complete!');

        } catch (error) {
            console.error('❌ Error during analysis:', error);
        }
    }
}

// Export for integration
module.exports = OnDemandTrafficImpactModel;

// Run if executed directly
if (require.main === module) {
    const model = new OnDemandTrafficImpactModel();
    model.run();
}