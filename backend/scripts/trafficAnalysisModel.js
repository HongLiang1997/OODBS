const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

/**
 * Traffic Awareness Model - Standalone Analysis Script
 * This script builds a comprehensive traffic model using bus stop locations and trip data
 * to provide intelligent route recommendations based on actual usage patterns.
 */
class TrafficAwarenessModel {
    constructor() {
        this.busStops = new Map();
        this.tripMatrix = new Map();
        this.routeNetwork = new Map();
        this.trafficHeatMap = new Map();
        this.performanceMetrics = {
            totalStops: 0,
            totalTrips: 0,
            avgTripsPerRoute: 0,
            highTrafficRoutes: [],
            lowTrafficRoutes: []
        };
    }

    /**
     * Load and process bus stop data from CSV
     */
    async loadBusStops() {
        console.log('🚌 Loading bus stop data...');
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
                        connections: new Set(),
                        trafficScore: 0,
                        popularity: 0
                    };
                    
                    stops.push(stop);
                    this.busStops.set(row.BusStopCode, stop);
                })
                .on('end', () => {
                    this.performanceMetrics.totalStops = stops.length;
                    console.log(`✅ Loaded ${stops.length} bus stops`);
                    resolve(stops);
                })
                .on('error', reject);
        });
    }

    /**
     * Generate synthetic trip data based on real stop locations and patterns
     * In production, this would load from your actual trip data
     */
    generateTripData() {
        console.log('📊 Generating synthetic trip data based on stop patterns...');
        
        const stopCodes = Array.from(this.busStops.keys());
        const planningAreaGroups = this.groupStopsByPlanningArea();
        
        let totalTrips = 0;
        
        // Generate high-frequency routes within same planning areas
        for (const [area, stops] of planningAreaGroups.entries()) {
            for (let i = 0; i < stops.length - 1; i++) {
                for (let j = i + 1; j < Math.min(i + 5, stops.length); j++) {
                    const origin = stops[i].code;
                    const destination = stops[j].code;
                    
                    // Calculate trip volume based on proximity and area density
                    const distance = this.calculateDistance(
                        stops[i].latitude, stops[i].longitude,
                        stops[j].latitude, stops[j].longitude
                    );
                    
                    // Higher trips for closer stops and busy areas
                    let baseTrips = Math.max(50, Math.floor(500 / Math.pow(distance + 1, 0.8)));
                    
                    // Area-based multipliers
                    const areaMultipliers = {
                        'BEDOK': 1.5,
                        'BUKIT TIMAH': 1.3,
                        'BUKIT BATOK': 1.2
                    };
                    
                    baseTrips *= (areaMultipliers[area] || 1.0);
                    
                    // Add some randomness
                    const trips = Math.floor(baseTrips * (0.7 + Math.random() * 0.6));
                    
                    this.addTripData(origin, destination, trips);
                    totalTrips += trips;
                }
            }
        }
        
        // Generate inter-area connections (lower frequency)
        this.generateInterAreaTrips();
        
        this.performanceMetrics.totalTrips = totalTrips;
        console.log(`✅ Generated ${totalTrips} trip records`);
    }

    /**
     * Add trip data to the traffic matrix
     */
    addTripData(origin, destination, trips, month = '202508') {
        const directKey = `${origin}-${destination}`;
        const reverseKey = `${destination}-${origin}`;
        
        // Store both directions
        this.tripMatrix.set(directKey, {
            origin,
            destination,
            trips,
            month,
            direction: 'direct'
        });
        
        // Generate reverse traffic (usually lower)
        const reverseTrips = Math.floor(trips * (0.6 + Math.random() * 0.4));
        this.tripMatrix.set(reverseKey, {
            origin: destination,
            destination: origin,
            trips: reverseTrips,
            month,
            direction: 'reverse'
        });
        
        // Update stop connections
        const originStop = this.busStops.get(origin);
        const destStop = this.busStops.get(destination);
        
        if (originStop && destStop) {
            originStop.connections.add(destination);
            destStop.connections.add(origin);
            
            // Update popularity scores
            originStop.popularity += trips;
            destStop.popularity += reverseTrips;
        }
    }

    /**
     * Group stops by planning area for analysis
     */
    groupStopsByPlanningArea() {
        const groups = new Map();
        
        for (const [code, stop] of this.busStops) {
            if (!groups.has(stop.planningArea)) {
                groups.set(stop.planningArea, []);
            }
            groups.get(stop.planningArea).push(stop);
        }
        
        return groups;
    }

    /**
     * Generate inter-area trip connections
     */
    generateInterAreaTrips() {
        const areas = ['BEDOK', 'BUKIT TIMAH', 'BUKIT BATOK'];
        const areaStops = this.groupStopsByPlanningArea();
        
        for (let i = 0; i < areas.length; i++) {
            for (let j = i + 1; j < areas.length; j++) {
                const area1Stops = areaStops.get(areas[i]) || [];
                const area2Stops = areaStops.get(areas[j]) || [];
                
                // Connect major stops between areas
                const majorStops1 = area1Stops.slice(0, Math.min(5, area1Stops.length));
                const majorStops2 = area2Stops.slice(0, Math.min(5, area2Stops.length));
                
                for (const stop1 of majorStops1) {
                    for (const stop2 of majorStops2) {
                        const distance = this.calculateDistance(
                            stop1.latitude, stop1.longitude,
                            stop2.latitude, stop2.longitude
                        );
                        
                        // Inter-area trips are generally lower
                        const trips = Math.max(20, Math.floor(200 / Math.pow(distance + 1, 1.2)));
                        this.addTripData(stop1.code, stop2.code, trips);
                    }
                }
            }
        }
    }

    /**
     * Calculate distance between two coordinates (Haversine formula)
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
     * Build traffic heat map and network analysis
     */
    buildTrafficHeatMap() {
        console.log('🔥 Building traffic heat map...');
        
        // Calculate traffic density for each stop
        for (const [code, stop] of this.busStops) {
            let totalIncoming = 0;
            let totalOutgoing = 0;
            
            for (const [tripKey, tripData] of this.tripMatrix) {
                if (tripData.destination === code) {
                    totalIncoming += tripData.trips;
                }
                if (tripData.origin === code) {
                    totalOutgoing += tripData.trips;
                }
            }
            
            const totalTraffic = totalIncoming + totalOutgoing;
            stop.trafficScore = totalTraffic;
            
            // Categorize heat level
            let heatLevel = 'low';
            if (totalTraffic > 5000) heatLevel = 'very_high';
            else if (totalTraffic > 2000) heatLevel = 'high';
            else if (totalTraffic > 1000) heatLevel = 'medium';
            
            this.trafficHeatMap.set(code, {
                stopCode: code,
                totalTraffic,
                incoming: totalIncoming,
                outgoing: totalOutgoing,
                heatLevel,
                coordinates: { lat: stop.latitude, lng: stop.longitude },
                area: stop.planningArea
            });
        }
        
        console.log('✅ Traffic heat map built');
    }

    /**
     * Build route network graph for pathfinding
     */
    buildRouteNetwork() {
        console.log('🌐 Building route network...');
        
        for (const [tripKey, tripData] of this.tripMatrix) {
            const { origin, destination, trips } = tripData;
            
            if (!this.routeNetwork.has(origin)) {
                this.routeNetwork.set(origin, new Map());
            }
            
            // Store edge weight (inverse of trips - higher trips = lower weight = preferred route)
            const weight = Math.max(1, Math.floor(10000 / (trips + 1)));
            
            this.routeNetwork.get(origin).set(destination, {
                destination,
                weight,
                trips,
                trafficLevel: this.getTrafficLevel(trips)
            });
        }
        
        console.log(`✅ Route network built with ${this.routeNetwork.size} nodes`);
    }

    /**
     * Get traffic level classification
     */
    getTrafficLevel(trips) {
        if (trips > 1000) return 'very_high';
        if (trips > 500) return 'high';
        if (trips > 200) return 'medium';
        if (trips > 50) return 'low';
        return 'very_low';
    }

    /**
     * Find optimal route considering traffic patterns
     */
    findOptimalRoute(startLat, startLon, endLat, endLon, preferences = {}) {
        console.log(`🗺️  Finding optimal route from (${startLat}, ${startLon}) to (${endLat}, ${endLon})`);
        
        // Find nearest stops
        const startStop = this.findNearestStop(startLat, startLon);
        const endStop = this.findNearestStop(endLat, endLon);
        
        if (!startStop || !endStop) {
            return { error: 'Cannot find nearby bus stops' };
        }
        
        console.log(`📍 Start: ${startStop.code} (${startStop.description})`);
        console.log(`🎯 End: ${endStop.code} (${endStop.description})`);
        
        // Run different pathfinding algorithms
        const routes = [];
        
        // 1. Direct route
        const directRoute = this.getDirectRoute(startStop.code, endStop.code);
        if (directRoute) routes.push(directRoute);
        
        // 2. Dijkstra's algorithm for shortest weighted path
        const shortestRoute = this.dijkstraRoute(startStop.code, endStop.code);
        if (shortestRoute) routes.push(shortestRoute);
        
        // 3. High-traffic route (follows popular paths)
        const popularRoute = this.getPopularRoute(startStop.code, endStop.code);
        if (popularRoute) routes.push(popularRoute);
        
        // 4. Low-traffic route (avoids congestion)
        const quietRoute = this.getQuietRoute(startStop.code, endStop.code);
        if (quietRoute) routes.push(quietRoute);
        
        // Rank routes based on preferences
        const rankedRoutes = this.rankRoutes(routes, preferences);
        
        return {
            startStop,
            endStop,
            routes: rankedRoutes,
            recommendation: rankedRoutes[0],
            analysis: this.analyzeRouteOptions(rankedRoutes)
        };
    }

    /**
     * Find nearest bus stop to coordinates
     */
    findNearestStop(lat, lon) {
        let nearest = null;
        let minDistance = Infinity;
        
        for (const [code, stop] of this.busStops) {
            const distance = this.calculateDistance(lat, lon, stop.latitude, stop.longitude);
            
            if (distance < minDistance) {
                minDistance = distance;
                nearest = stop;
            }
        }
        
        return nearest;
    }

    /**
     * Get direct route between two stops
     */
    getDirectRoute(startCode, endCode) {
        const tripData = this.tripMatrix.get(`${startCode}-${endCode}`);
        
        if (!tripData) return null;
        
        const startStop = this.busStops.get(startCode);
        const endStop = this.busStops.get(endCode);
        
        return {
            type: 'direct',
            path: [startStop, endStop],
            totalTrips: tripData.trips,
            trafficLevel: this.getTrafficLevel(tripData.trips),
            estimatedTime: this.estimateTime([startStop, endStop]),
            score: tripData.trips,
            description: 'Direct route with no transfers'
        };
    }

    /**
     * Dijkstra's algorithm for shortest weighted path
     */
    dijkstraRoute(startCode, endCode, maxStops = 5) {
        const distances = new Map();
        const previous = new Map();
        const unvisited = new Set();
        
        // Initialize
        for (const [code] of this.busStops) {
            distances.set(code, Infinity);
            unvisited.add(code);
        }
        distances.set(startCode, 0);
        
        while (unvisited.size > 0) {
            // Find unvisited node with minimum distance
            let current = null;
            let minDistance = Infinity;
            
            for (const node of unvisited) {
                if (distances.get(node) < minDistance) {
                    minDistance = distances.get(node);
                    current = node;
                }
            }
            
            if (!current || minDistance === Infinity) break;
            
            unvisited.delete(current);
            
            if (current === endCode) break;
            
            // Check neighbors
            const neighbors = this.routeNetwork.get(current);
            if (!neighbors) continue;
            
            for (const [neighbor, edgeData] of neighbors) {
                if (!unvisited.has(neighbor)) continue;
                
                const alt = distances.get(current) + edgeData.weight;
                
                if (alt < distances.get(neighbor)) {
                    distances.set(neighbor, alt);
                    previous.set(neighbor, current);
                }
            }
        }
        
        // Reconstruct path
        if (!previous.has(endCode)) return null;
        
        const path = [];
        let current = endCode;
        
        while (current !== undefined) {
            path.unshift(this.busStops.get(current));
            current = previous.get(current);
        }
        
        if (path.length > maxStops) return null;
        
        return {
            type: 'shortest_weighted',
            path,
            totalTrips: this.calculatePathTrips(path),
            trafficLevel: this.calculatePathTrafficLevel(path),
            estimatedTime: this.estimateTime(path),
            score: distances.get(endCode),
            description: `Shortest route with ${path.length - 1} transfers`
        };
    }

    /**
     * Get route following popular/high-traffic paths
     */
    getPopularRoute(startCode, endCode) {
        // Find route through high-traffic intermediates
        const highTrafficStops = Array.from(this.busStops.values())
            .sort((a, b) => b.trafficScore - a.trafficScore)
            .slice(0, 10);
        
        let bestRoute = null;
        let bestScore = 0;
        
        for (const intermediate of highTrafficStops) {
            if (intermediate.code === startCode || intermediate.code === endCode) continue;
            
            const leg1 = this.tripMatrix.get(`${startCode}-${intermediate.code}`);
            const leg2 = this.tripMatrix.get(`${intermediate.code}-${endCode}`);
            
            if (leg1 && leg2) {
                const totalTrips = leg1.trips + leg2.trips;
                
                if (totalTrips > bestScore) {
                    bestScore = totalTrips;
                    bestRoute = {
                        type: 'popular',
                        path: [
                            this.busStops.get(startCode),
                            intermediate,
                            this.busStops.get(endCode)
                        ],
                        totalTrips,
                        trafficLevel: 'high',
                        estimatedTime: this.estimateTime([
                            this.busStops.get(startCode),
                            intermediate,
                            this.busStops.get(endCode)
                        ]),
                        score: totalTrips,
                        description: 'Popular route via high-traffic hub'
                    };
                }
            }
        }
        
        return bestRoute;
    }

    /**
     * Get route avoiding high-traffic areas
     */
    getQuietRoute(startCode, endCode) {
        // Find route through low-traffic intermediates
        const lowTrafficStops = Array.from(this.busStops.values())
            .filter(stop => stop.trafficScore < 2000)
            .sort((a, b) => a.trafficScore - b.trafficScore)
            .slice(0, 10);
        
        let bestRoute = null;
        let bestScore = Infinity;
        
        for (const intermediate of lowTrafficStops) {
            if (intermediate.code === startCode || intermediate.code === endCode) continue;
            
            const leg1 = this.tripMatrix.get(`${startCode}-${intermediate.code}`);
            const leg2 = this.tripMatrix.get(`${intermediate.code}-${endCode}`);
            
            if (leg1 && leg2) {
                // For quiet route, we want LOWER total trips
                const totalTrips = leg1.trips + leg2.trips;
                
                if (totalTrips < bestScore && totalTrips > 0) {
                    bestScore = totalTrips;
                    bestRoute = {
                        type: 'quiet',
                        path: [
                            this.busStops.get(startCode),
                            intermediate,
                            this.busStops.get(endCode)
                        ],
                        totalTrips,
                        trafficLevel: 'low',
                        estimatedTime: this.estimateTime([
                            this.busStops.get(startCode),
                            intermediate,
                            this.busStops.get(endCode)
                        ]),
                        score: bestScore,
                        description: 'Quiet route avoiding congestion'
                    };
                }
            }
        }
        
        return bestRoute;
    }

    /**
     * Calculate total trips for a path
     */
    calculatePathTrips(path) {
        let total = 0;
        
        for (let i = 0; i < path.length - 1; i++) {
            const tripData = this.tripMatrix.get(`${path[i].code}-${path[i + 1].code}`);
            if (tripData) total += tripData.trips;
        }
        
        return total;
    }

    /**
     * Calculate overall traffic level for a path
     */
    calculatePathTrafficLevel(path) {
        const totalTrips = this.calculatePathTrips(path);
        const avgTrips = totalTrips / Math.max(1, path.length - 1);
        return this.getTrafficLevel(avgTrips);
    }

    /**
     * Estimate travel time based on path and traffic
     */
    estimateTime(path) {
        let totalTime = 0;
        
        for (let i = 0; i < path.length - 1; i++) {
            const distance = this.calculateDistance(
                path[i].latitude, path[i].longitude,
                path[i + 1].latitude, path[i + 1].longitude
            );
            
            // Base travel time (assume 30 km/h average)
            let segmentTime = (distance / 30) * 60; // minutes
            
            // Traffic adjustment
            const tripData = this.tripMatrix.get(`${path[i].code}-${path[i + 1].code}`);
            if (tripData) {
                const trafficMultiplier = tripData.trips > 500 ? 1.5 : tripData.trips > 200 ? 1.2 : 1.0;
                segmentTime *= trafficMultiplier;
            }
            
            // Transfer time
            if (i > 0) segmentTime += 5; // 5 minutes transfer time
            
            totalTime += segmentTime;
        }
        
        return Math.round(totalTime);
    }

    /**
     * Rank routes based on preferences
     */
    rankRoutes(routes, preferences = {}) {
        const {
            priorityTime = 0.4,
            priorityTraffic = 0.3,
            priorityTransfers = 0.3
        } = preferences;
        
        return routes.map(route => {
            let score = 0;
            
            // Time score (lower is better)
            const timeScore = 100 - Math.min(100, route.estimatedTime * 2);
            
            // Traffic score (depends on preference - high traffic might mean better service)
            const trafficScore = route.trafficLevel === 'high' ? 80 : 
                                route.trafficLevel === 'medium' ? 60 : 40;
            
            // Transfer score (fewer transfers is better)
            const transferScore = 100 - Math.min(100, (route.path.length - 2) * 20);
            
            score = (timeScore * priorityTime) + 
                   (trafficScore * priorityTraffic) + 
                   (transferScore * priorityTransfers);
            
            return { ...route, finalScore: score };
        }).sort((a, b) => b.finalScore - a.finalScore);
    }

    /**
     * Analyze route options and provide insights
     */
    analyzeRouteOptions(routes) {
        if (!routes.length) return { message: 'No routes found' };
        
        const analysis = {
            totalOptions: routes.length,
            fastestRoute: routes.reduce((prev, curr) => 
                prev.estimatedTime < curr.estimatedTime ? prev : curr),
            mostPopularRoute: routes.reduce((prev, curr) => 
                prev.totalTrips > curr.totalTrips ? prev : curr),
            quietestRoute: routes.reduce((prev, curr) => 
                prev.totalTrips < curr.totalTrips ? prev : curr),
            averageTime: Math.round(routes.reduce((sum, r) => sum + r.estimatedTime, 0) / routes.length),
            trafficDistribution: this.getTrafficDistribution(routes)
        };
        
        return analysis;
    }

    /**
     * Get traffic distribution across routes
     */
    getTrafficDistribution(routes) {
        const distribution = { low: 0, medium: 0, high: 0, very_high: 0, very_low: 0 };
        
        routes.forEach(route => {
            distribution[route.trafficLevel] = (distribution[route.trafficLevel] || 0) + 1;
        });
        
        return distribution;
    }

    /**
     * Generate comprehensive analysis report
     */
    generateAnalysisReport() {
        console.log('\n📊 === TRAFFIC AWARENESS MODEL ANALYSIS REPORT ===\n');
        
        // Basic statistics
        console.log('📈 BASIC STATISTICS:');
        console.log(`   • Total Bus Stops: ${this.performanceMetrics.totalStops}`);
        console.log(`   • Total Trip Records: ${this.performanceMetrics.totalTrips}`);
        console.log(`   • Route Network Nodes: ${this.routeNetwork.size}`);
        console.log(`   • Heat Map Entries: ${this.trafficHeatMap.size}`);
        
        // Top traffic areas
        const topTrafficAreas = Array.from(this.trafficHeatMap.values())
            .sort((a, b) => b.totalTraffic - a.totalTraffic)
            .slice(0, 10);
        
        console.log('\n🔥 TOP 10 HIGHEST TRAFFIC STOPS:');
        topTrafficAreas.forEach((stop, index) => {
            console.log(`   ${index + 1}. ${stop.stopCode} - ${this.busStops.get(stop.stopCode)?.description} (${stop.totalTraffic} trips)`);
        });
        
        // Planning area analysis
        const areaStats = this.analyzeByPlanningArea();
        console.log('\n🗺️  PLANNING AREA ANALYSIS:');
        for (const [area, stats] of areaStats.entries()) {
            console.log(`   • ${area}: ${stats.stops} stops, ${stats.totalTraffic} total trips, avg ${Math.round(stats.avgTraffic)} per stop`);
        }
        
        // Route type distribution
        const routeTypes = this.analyzeRouteTypes();
        console.log('\n🛣️  ROUTE TYPE DISTRIBUTION:');
        console.log(`   • High Traffic Routes: ${routeTypes.high} (${((routeTypes.high/this.tripMatrix.size)*100).toFixed(1)}%)`);
        console.log(`   • Medium Traffic Routes: ${routeTypes.medium} (${((routeTypes.medium/this.tripMatrix.size)*100).toFixed(1)}%)`);
        console.log(`   • Low Traffic Routes: ${routeTypes.low} (${((routeTypes.low/this.tripMatrix.size)*100).toFixed(1)}%)`);
        
        console.log('\n✅ Analysis complete!\n');
    }

    /**
     * Analyze traffic by planning area
     */
    analyzeByPlanningArea() {
        const areaStats = new Map();
        
        for (const [code, stop] of this.busStops) {
            const area = stop.planningArea;
            
            if (!areaStats.has(area)) {
                areaStats.set(area, {
                    stops: 0,
                    totalTraffic: 0,
                    avgTraffic: 0
                });
            }
            
            const stats = areaStats.get(area);
            stats.stops++;
            stats.totalTraffic += stop.trafficScore || 0;
        }
        
        // Calculate averages
        for (const [area, stats] of areaStats) {
            stats.avgTraffic = stats.totalTraffic / stats.stops;
        }
        
        return areaStats;
    }

    /**
     * Analyze route types by traffic level
     */
    analyzeRouteTypes() {
        let high = 0, medium = 0, low = 0;
        
        for (const [key, trip] of this.tripMatrix) {
            if (trip.trips > 500) high++;
            else if (trip.trips > 200) medium++;
            else low++;
        }
        
        return { high, medium, low };
    }

    /**
     * Test the model with sample queries
     */
    async testModel() {
        console.log('\n🧪 TESTING MODEL WITH SAMPLE QUERIES...\n');
        
        // Test cases with coordinates from different areas
        const testCases = [
            {
                name: 'Bedok to Bukit Timah',
                startLat: 1.324538743, startLon: 103.9290382, // Bedok Int
                endLat: 1.323068358, endLon: 103.8119772      // Crown Ctr
            },
            {
                name: 'Within Bedok Area',
                startLat: 1.336381816, startLon: 103.8978557, // Eunos Link
                endLat: 1.324538743, endLon: 103.9290382      // Bedok Int
            },
            {
                name: 'Bukit Batok to Bedok',
                startLat: 1.349993543, startLon: 103.7510619, // Bt Batok Int
                endLat: 1.320671384, endLon: 103.9426001     // Bedok Sth
            }
        ];
        
        for (const testCase of testCases) {
            console.log(`🎯 Testing: ${testCase.name}`);
            const result = this.findOptimalRoute(
                testCase.startLat, testCase.startLon, 
                testCase.endLat, testCase.endLon
            );
            
            if (result.error) {
                console.log(`   ❌ Error: ${result.error}`);
            } else {
                console.log(`   📍 From: ${result.startStop.description}`);
                console.log(`   🎯 To: ${result.endStop.description}`);
                console.log(`   🛣️  Found ${result.routes.length} route options`);
                
                if (result.recommendation) {
                    const rec = result.recommendation;
                    console.log(`   ⭐ Recommended: ${rec.type} route`);
                    console.log(`   ⏱️  Estimated time: ${rec.estimatedTime} minutes`);
                    console.log(`   🚌 Traffic level: ${rec.trafficLevel}`);
                    console.log(`   🔄 Transfers: ${rec.path.length - 2}`);
                }
            }
            console.log('');
        }
    }

    /**
     * Main execution method
     */
    async run() {
        try {
            console.log('🚀 Starting Traffic Awareness Model Analysis...\n');
            
            // Load data
            await this.loadBusStops();
            
            // Generate traffic patterns
            this.generateTripData();
            
            // Build analysis structures
            this.buildTrafficHeatMap();
            this.buildRouteNetwork();
            
            // Generate report
            this.generateAnalysisReport();
            
            // Test the model
            await this.testModel();
            
            console.log('🎉 Traffic Awareness Model analysis complete!');
            
        } catch (error) {
            console.error('❌ Error during analysis:', error);
        }
    }
}

// Run the analysis if this script is executed directly
if (require.main === module) {
    const model = new TrafficAwarenessModel();
    model.run();
}

// Export for use in other modules
module.exports = TrafficAwarenessModel;