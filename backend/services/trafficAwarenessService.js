const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

/**
 * Traffic Awareness Service for OODBS
 * Provides real-time traffic impact analysis using Singapore public transport data
 * Integrates with route planning to predict delays and optimize scheduling
 */
class TrafficAwarenessService {
    constructor() {
        this.publicBusStops = new Map();
        this.publicTrafficMatrix = new Map();
        this.congestionZones = [];
        this.isInitialized = false;
        this.impactRadius = 0.5; // km - traffic impact radius
        
        // FIXED: More reasonable thresholds based on average traffic per route
        this.riskThresholds = {
            minimal: 5,    // Very light traffic
            low: 15,       // Light traffic
            medium: 40,    // Moderate traffic  
            high: 80,      // Heavy traffic
        };
    }

    /**
     * Initialize the service with traffic data
     */
    async initialize() {
        if (this.isInitialized) {
            console.log('Traffic Awareness Service already initialized, skipping...');
            return;
        }
        
        try {
            console.log('Initializing Traffic Awareness Service...');
            await this.loadBusStopsData();
            await this.loadTrafficData();
            this.buildCongestionZones();
            this.isInitialized = true;
            console.log('Traffic Awareness Service initialized successfully');
        } catch (error) {
            console.error('Failed to initialize Traffic Awareness Service:', error);
            throw error;
        }
    }

    /**
     * Load public bus stops data
     */
    async loadBusStopsData() {
        const busStopsPath = path.join(__dirname, '../traffic/bus-stop-dictionary-v1.csv');
        
        return new Promise((resolve, reject) => {
            const busStops = new Map();
            
            fs.createReadStream(busStopsPath)
                .pipe(csv())
                .on('data', (row) => {
                    const stopCode = row.BusStopCode?.trim();
                    if (stopCode) {
                        busStops.set(stopCode, {
                            code: stopCode,
                            name: row.Description || 'Unknown Stop',
                            roadName: row.RoadName || '',
                            latitude: parseFloat(row.Latitude) || 0,
                            longitude: parseFloat(row.Longitude) || 0,
                            planningArea: row.PlanningArea || 'Unknown',
                            trafficVolume: 0
                        });
                    }
                })
                .on('end', () => {
                    this.publicBusStops = busStops;
                    console.log(`Loaded ${busStops.size} public bus stops`);
                    resolve();
                })
                .on('error', reject);
        });
    }

    /**
     * Load and process OD traffic data
     */
    async loadTrafficData() {
        const odDataPath = path.join(__dirname, '../traffic/origin_destination_bus_202508.csv');
        let processedRecords = 0;

        return new Promise((resolve, reject) => {
            fs.createReadStream(odDataPath)
                .pipe(csv())
                .on('data', (row) => {
                    const originCode = row.ORIGIN_PT_CODE?.trim();
                    const destCode = row.DESTINATION_PT_CODE?.trim();
                    const totalTrips = parseInt(row.TOTAL_TRIPS) || 0;
                    const timeHour = parseInt(row.TIME_PER_HOUR) || 0;
                    const dayType = row.DAY_TYPE?.trim();

                    if (originCode && destCode && totalTrips > 0) {
                        // Apply day type division factor
                        const adjustedTrips = dayType === 'WEEKDAY' ? 
                            Math.round(totalTrips / 20) : Math.round(totalTrips / 8);

                        // Store traffic data
                        const routeKey = `${originCode}-${destCode}-${timeHour}`;
                        this.publicTrafficMatrix.set(routeKey, {
                            origin: originCode,
                            destination: destCode,
                            trips: adjustedTrips,
                            hour: timeHour,
                            dayType: dayType
                        });

                        // Add to stop volumes
                        if (this.publicBusStops.has(originCode)) {
                            this.publicBusStops.get(originCode).trafficVolume += adjustedTrips;
                        }
                        if (this.publicBusStops.has(destCode)) {
                            this.publicBusStops.get(destCode).trafficVolume += adjustedTrips;
                        }

                        processedRecords++;
                    }
                })
                .on('end', () => {
                    console.log(`Processed ${processedRecords} traffic records`);
                    resolve();
                })
                .on('error', reject);
        });
    }

    /**
     * Build congestion zones from high-traffic areas
     */
    buildCongestionZones() {
        const zones = [];
        const processedStops = new Set();

        for (const [code, stop] of this.publicBusStops) {
            if (processedStops.has(code) || stop.trafficVolume < this.riskThresholds.high) {
                continue;
            }

            // Find nearby high-traffic stops
            const nearbyStops = this.findNearbyStops(stop, this.impactRadius);
            const highTrafficNearby = nearbyStops.filter(s => 
                s.trafficVolume >= this.riskThresholds.medium
            );

            if (highTrafficNearby.length >= 2) {
                const totalVolume = highTrafficNearby.reduce((sum, s) => sum + s.trafficVolume, 0);
                
                zones.push({
                    centerStop: stop,
                    nearbyStops: highTrafficNearby,
                    totalVolume: totalVolume,
                    averageVolume: Math.round(totalVolume / highTrafficNearby.length),
                    radius: this.impactRadius,
                    planningArea: stop.planningArea,
                    riskLevel: this.calculateRiskLevel(totalVolume),
                    expectedDelay: this.calculateExpectedDelay(totalVolume)
                });

                // Mark stops as processed
                highTrafficNearby.forEach(s => processedStops.add(s.code));
            }
        }

        // Sort by traffic volume (highest first)
        this.congestionZones = zones.sort((a, b) => b.totalVolume - a.totalVolume);
        console.log(`Built ${zones.length} congestion zones`);
    }

    /**
     * Analyze route impact (Main API method)
     * @param {Object} route - Route object with origin/destination coordinates and time
     * @returns {Object} Traffic impact analysis
     */
    analyzeRouteImpact(route) {
        if (!this.isInitialized) {
            throw new Error('Traffic Awareness Service not initialized. Call initialize() first.');
        }

        const { originLat, originLng, destLat, destLng, departureTime, dayType = 'WEEKDAY' } = route;
        
        if (!originLat || !originLng || !destLat || !destLng) {
            throw new Error('Invalid route coordinates provided');
        }

        const hour = this.extractHour(departureTime);
        const peakFactor = this.calculatePeakFactor(hour, dayType);
        
        // Find nearby public transport routes
        const nearbyRoutes = this.findNearbyPublicRoutes(originLat, originLng, destLat, destLng, hour);
        
        // Calculate traffic impact
        const impactAnalysis = this.calculateTrafficImpact(nearbyRoutes, peakFactor);
        
        return {
            routeId: route.id || 'unknown',
            departureTime: departureTime,
            dayType: dayType,
            peakFactor: peakFactor,
            riskLevel: impactAnalysis.riskLevel,
            expectedDelay: impactAnalysis.expectedDelay,
            delayRange: impactAnalysis.delayRange,
            trafficRoutes: nearbyRoutes.length,
            avgTrafficVolume: impactAnalysis.avgVolume,
            recommendations: this.generateRecommendations(impactAnalysis, hour, dayType),
            congestionZones: this.findNearbyCongestionZones(originLat, originLng, destLat, destLng)
        };
    }

    /**
     * Get planning area risk summary
     * @param {string} planningArea - Planning area name
     * @returns {Object} Area risk assessment
     */
    getPlanningAreaRisk(planningArea) {
        const areaStops = Array.from(this.publicBusStops.values())
            .filter(stop => stop.planningArea === planningArea);

        if (areaStops.length === 0) {
            return { planningArea, riskLevel: 'unknown', message: 'No data available' };
        }

        const totalVolume = areaStops.reduce((sum, stop) => sum + stop.trafficVolume, 0);
        const avgVolume = totalVolume / areaStops.length;
        const congestionZones = this.congestionZones.filter(zone => zone.planningArea === planningArea);

        return {
            planningArea,
            totalStops: areaStops.length,
            averageVolumePerStop: Math.round(avgVolume),
            riskLevel: this.calculateRiskLevel(avgVolume),
            congestionZones: congestionZones.length,
            expectedDelay: this.calculateExpectedDelay(avgVolume)
        };
    }

    /**
     * Get top congestion zones
     * @param {number} limit - Number of zones to return
     * @returns {Array} Top congestion zones
     */
    getTopCongestionZones(limit = 10) {
        return this.congestionZones.slice(0, limit).map(zone => ({
            name: zone.centerStop.name,
            planningArea: zone.planningArea,
            dailyTrips: zone.totalVolume,
            riskLevel: zone.riskLevel,
            expectedDelay: zone.expectedDelay,
            coordinates: {
                lat: zone.centerStop.latitude,
                lng: zone.centerStop.longitude
            }
        }));
    }

    /**
     * Calculate traffic impact from nearby routes
     */
    calculateTrafficImpact(nearbyRoutes, peakFactor) {
        if (nearbyRoutes.length === 0) {
            return {
                riskLevel: 'LOW',
                expectedDelay: 0,
                delayRange: { min: 0, max: 0 },
                avgVolume: 0
            };
        }

        const totalVolume = nearbyRoutes.reduce((sum, route) => sum + route.trips, 0);
        const avgVolume = Math.round(totalVolume / nearbyRoutes.length);
        const adjustedVolume = Math.round(avgVolume * peakFactor);
        
        // FIXED: Use average volume instead of total volume for delay calculation
        // Base delay should be proportional to average congestion, not total routes found
        const baseDelay = Math.round(avgVolume / 50); // 1 minute per 50 average trips
        const expectedDelay = Math.min(Math.round(baseDelay * peakFactor), 30); // Cap at 30 minutes
        const delayVariance = Math.round(expectedDelay * 0.3);

        return {
            riskLevel: this.calculateRiskLevel(adjustedVolume),
            expectedDelay: expectedDelay,
            delayRange: {
                min: Math.max(0, expectedDelay - delayVariance),
                max: expectedDelay + delayVariance
            },
            avgVolume: avgVolume
        };
    }

    /**
     * Find nearby public transport routes
     */
    findNearbyPublicRoutes(originLat, originLng, destLat, destLng, hour) {
        const nearbyRoutes = [];
        const searchRadius = this.impactRadius;

        for (const [routeKey, route] of this.publicTrafficMatrix) {
            if (route.hour !== hour) continue;

            const originStop = this.publicBusStops.get(route.origin);
            const destStop = this.publicBusStops.get(route.destination);

            if (!originStop || !destStop) continue;

            // Check if route intersects with our route corridor
            const originDistance = this.calculateDistance(
                originLat, originLng, originStop.latitude, originStop.longitude
            );
            const destDistance = this.calculateDistance(
                destLat, destLng, destStop.latitude, destStop.longitude
            );

            if (originDistance <= searchRadius || destDistance <= searchRadius) {
                nearbyRoutes.push(route);
            }
        }

        return nearbyRoutes;
    }

    /**
     * Find nearby congestion zones
     */
    findNearbyCongestionZones(originLat, originLng, destLat, destLng) {
        return this.congestionZones
            .filter(zone => {
                const zoneDistance = Math.min(
                    this.calculateDistance(originLat, originLng, 
                        zone.centerStop.latitude, zone.centerStop.longitude),
                    this.calculateDistance(destLat, destLng,
                        zone.centerStop.latitude, zone.centerStop.longitude)
                );
                return zoneDistance <= zone.radius * 2; // Extended search radius
            })
            .map(zone => ({
                name: zone.centerStop.name,
                riskLevel: zone.riskLevel,
                expectedDelay: zone.expectedDelay,
                distance: Math.min(
                    this.calculateDistance(originLat, originLng, 
                        zone.centerStop.latitude, zone.centerStop.longitude),
                    this.calculateDistance(destLat, destLng,
                        zone.centerStop.latitude, zone.centerStop.longitude)
                )
            }))
            .sort((a, b) => a.distance - b.distance);
    }

    /**
     * Generate recommendations based on traffic analysis
     */
    generateRecommendations(impactAnalysis, hour, dayType) {
        const recommendations = [];

        if (impactAnalysis.riskLevel === 'SEVERE') {
            recommendations.push('Consider alternative route or departure time');
            recommendations.push('Add 15-30 minutes buffer time');
        } else if (impactAnalysis.riskLevel === 'HIGH') {
            recommendations.push('Add 10-15 minutes buffer time');
            recommendations.push('Monitor traffic conditions');
        } else if (impactAnalysis.riskLevel === 'MEDIUM') {
            recommendations.push('Add 5-10 minutes buffer time');
        }

        // Peak hour recommendations
        if (this.isPeakHour(hour)) {
            recommendations.push('Peak hour detected - expect increased delays');
        }

        // Weekend recommendations
        if (dayType === 'WEEKEND') {
            recommendations.push('Weekend traffic patterns may differ');
        }

        return recommendations.length > 0 ? recommendations : ['No specific recommendations - normal traffic expected'];
    }

    /**
     * Calculate peak factor based on time and day
     */
    calculatePeakFactor(hour, dayType) {
        if (dayType === 'WEEKEND') return 1.2;
        
        // Weekday peak hours: 7-9 AM, 6-8 PM
        if ((hour >= 7 && hour <= 9) || (hour >= 18 && hour <= 20)) {
            return 2.5; // Peak hour multiplier
        } else if ((hour >= 6 && hour <= 10) || (hour >= 17 && hour <= 21)) {
            return 1.8; // Near-peak hours
        }
        return 1.0; // Off-peak
    }

    /**
     * Check if given hour is peak time
     */
    isPeakHour(hour) {
        return (hour >= 7 && hour <= 9) || (hour >= 18 && hour <= 20);
    }

    /**
     * Extract hour from time string or Date object
     */
    extractHour(timeInput) {
        if (typeof timeInput === 'string') {
            // Handle formats like "08:30", "8:30 AM", etc.
            const hourMatch = timeInput.match(/(\d{1,2})/);
            return hourMatch ? parseInt(hourMatch[1]) : 12;
        } else if (timeInput instanceof Date) {
            return timeInput.getHours();
        } else if (typeof timeInput === 'number') {
            return Math.floor(timeInput) % 24;
        }
        return 12; // Default noon
    }

    /**
     * Calculate risk level from traffic volume
     */
    calculateRiskLevel(volume) {
        if (volume > this.riskThresholds.high) return 'SEVERE';
        if (volume > this.riskThresholds.medium) return 'HIGH';
        if (volume > this.riskThresholds.low) return 'MEDIUM';
        if (volume > this.riskThresholds.minimal) return 'LOW';
        return 'MINIMAL';
    }

    /**
     * Calculate expected delay in minutes
     */
    calculateExpectedDelay(volume) {
        // FIXED: More reasonable delay calculation
        const baseDelay = volume / 200; // Base formula: 1 minute per 200 trips
        return Math.min(Math.round(baseDelay), 25); // Cap at 25 minutes for single location
    }

    /**
     * Find nearby stops within radius
     */
    findNearbyStops(centerStop, radiusKm) {
        const nearby = [];
        for (const [code, stop] of this.publicBusStops) {
            if (code === centerStop.code) continue;
            
            const distance = this.calculateDistance(
                centerStop.latitude, centerStop.longitude,
                stop.latitude, stop.longitude
            );
            
            if (distance <= radiusKm) {
                nearby.push({ ...stop, distance });
            }
        }
        return nearby.sort((a, b) => a.distance - b.distance);
    }

    /**
     * Calculate distance between coordinates using Haversine formula
     */
    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371; // Earth's radius in kilometers
        const dLat = this.toRadians(lat2 - lat1);
        const dLng = this.toRadians(lng2 - lng1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
                Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    /**
     * Convert degrees to radians
     */
    toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }

    /**
     * Get service status and statistics
     */
    getServiceStatus() {
        return {
            initialized: this.isInitialized,
            busStopsLoaded: this.publicBusStops.size,
            trafficRoutesLoaded: this.publicTrafficMatrix.size,
            congestionZones: this.congestionZones.length,
            riskThresholds: this.riskThresholds,
            lastUpdated: new Date().toISOString()
        };
    }

    /**
     * Analyze route sequence for traffic impact
     * Wrapper method for analyzeRouteImpact that handles routeSequence format
     * @param {Array} routeSequence - Array of route stops with locations
     * @returns {Object} Traffic analysis results
     */
    async analyzeRoute(routeSequence) {
        if (!routeSequence || routeSequence.length === 0) {
            return {
                overallRisk: 'LOW',
                totalDelay: 0,
                segments: [],
                averageRisk: 'LOW'
            };
        }

        console.log(`🚦 Analyzing traffic for route with ${routeSequence.length} stops`);

        try {
            // For single passenger or first request, provide minimal analysis
            if (routeSequence.length < 2) {
                console.log(`   ⚠️ Insufficient stops for traffic analysis, using defaults`);
                return {
                    overallRisk: 'LOW',
                    totalDelay: 5, // Minimal default delay
                    segments: [],
                    averageRisk: 'LOW',
                    detailMessage: 'Insufficient route data for traffic analysis'
                };
            }

            // Extract pickup and destination from route sequence
            const pickupStop = routeSequence.find(stop => stop.type === 'pickup');
            const destinationStops = routeSequence.filter(stop => stop.type === 'destination');

            if (!pickupStop || destinationStops.length === 0) {
                console.log(`   ⚠️ Invalid route structure, using defaults`);
                return {
                    overallRisk: 'LOW',
                    totalDelay: 5,
                    segments: [],
                    averageRisk: 'LOW',
                    detailMessage: 'Invalid route structure for traffic analysis'
                };
            }

            // Analyze traffic for pickup to first destination (main route segment)
            const firstDestination = destinationStops[0];
            const route = {
                originLat: pickupStop.location.lat,
                originLng: pickupStop.location.lng,
                destLat: firstDestination.location.lat,
                destLng: firstDestination.location.lng,
                departureTime: new Date(), // Current time as default
                dayType: 'WEEKDAY'
            };

            // Validate coordinates before analysis
            if (!route.originLat || !route.originLng || !route.destLat || !route.destLng) {
                console.log(`   ⚠️ Invalid coordinates, using default analysis`);
                return {
                    overallRisk: 'MEDIUM',
                    totalDelay: 8,
                    segments: [],
                    averageRisk: 'MEDIUM',
                    detailMessage: 'Invalid coordinates for traffic analysis'
                };
            }

            // Use existing analyzeRouteImpact method with proper format
            const analysis = this.analyzeRouteImpact(route);

            // Map the response properties correctly
            const overallRisk = analysis.riskLevel || 'LOW';
            const totalDelay = analysis.expectedDelay || 5;

            console.log(`   Traffic Analysis: ${overallRisk} risk, ${totalDelay}min delay`);
            
            return {
                overallRisk: overallRisk,
                totalDelay: totalDelay,
                segments: analysis.trafficRoutes || [],
                averageRisk: overallRisk,
                detailMessage: `Route analysis: pickup to destination analyzed`,
                riskLevel: analysis.riskLevel,
                expectedDelay: analysis.expectedDelay,
                peakFactor: analysis.peakFactor,
                recommendations: analysis.recommendations
            };

        } catch (error) {
            console.error('❌ Traffic route analysis failed:', error);
            // Return safe defaults on error
            return {
                overallRisk: 'MEDIUM',
                totalDelay: 10,
                segments: [],
                averageRisk: 'MEDIUM',
                error: error.message,
                detailMessage: 'Traffic analysis failed, using defaults'
            };
        }
    }
}

// Export singleton instance
const trafficAwarenessService = new TrafficAwarenessService();

module.exports = {
    TrafficAwarenessService,
    trafficAwarenessService
};