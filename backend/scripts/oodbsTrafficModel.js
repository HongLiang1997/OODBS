const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

/**
 * Traffic Awareness Model - Adapted for OODBS Route Structure
 * Works with: schedules, pickup_locations, destinations tables
 */
class OODBSTrafficModel {
    constructor() {
        this.pickupLocations = new Map(); // id -> {name, lat, lng, organization_id}
        this.destinations = new Map();    // id -> {name, lat, lng, organization_id}
        this.schedules = [];              // Array of route sequences
        this.routeMatrix = new Map();     // pickup_id-destination_id -> trip data
        this.serviceRoutes = new Map();   // service_id -> array of routes
        this.trafficAnalysis = new Map(); // location pairs -> traffic metrics
    }

    /**
     * Load pickup locations data
     */
    loadPickupLocations(data) {
        console.log('🚌 Loading pickup locations...');
        
        data.forEach(row => {
            const pickup = {
                id: parseInt(row.id),
                organizationId: parseInt(row.organization_id),
                type: row.type,
                name: row.name,
                latitude: parseFloat(row.latitude),
                longitude: parseFloat(row.longitude),
                connections: new Set(),
                trafficScore: 0
            };
            
            this.pickupLocations.set(pickup.id, pickup);
        });
        
        console.log(`✅ Loaded ${this.pickupLocations.size} pickup locations`);
    }

    /**
     * Load destinations data
     */
    loadDestinations(data) {
        console.log('🎯 Loading destinations...');
        
        data.forEach(row => {
            const destination = {
                id: parseInt(row.id),
                organizationId: parseInt(row.organization_id),
                name: row.name,
                latitude: parseFloat(row.latitude),
                longitude: parseFloat(row.longitude),
                connections: new Set(),
                trafficScore: 0
            };
            
            this.destinations.set(destination.id, destination);
        });
        
        console.log(`✅ Loaded ${this.destinations.size} destinations`);
    }

    /**
     * Load and process schedule data (your route structure)
     */
    loadSchedules(data) {
        console.log('📅 Loading schedules...');
        
        // Group by schedule_id and service_id
        const groupedSchedules = new Map();
        
        data.forEach(row => {
            const schedule = {
                scheduleId: parseInt(row.schedule_id),
                serviceId: parseInt(row.service_id),
                destinationId: parseInt(row.destination_id),
                busId: parseInt(row.bus_id),
                sequence: parseInt(row.sequence),
                scheduledTime: new Date(row.scheduled_time)
            };
            
            this.schedules.push(schedule);
            
            const key = `${schedule.scheduleId}-${schedule.serviceId}`;
            if (!groupedSchedules.has(key)) {
                groupedSchedules.set(key, []);
            }
            groupedSchedules.get(key).push(schedule);
        });
        
        // Sort sequences and build route chains
        for (const [key, routes] of groupedSchedules) {
            routes.sort((a, b) => a.sequence - b.sequence);
            this.serviceRoutes.set(key, routes);
        }
        
        console.log(`✅ Loaded ${this.schedules.length} schedule entries`);
        console.log(`📋 Created ${groupedSchedules.size} service routes`);
        
        return groupedSchedules;
    }

    /**
     * Analyze traffic patterns from your route data
     */
    analyzeRouteTraffic() {
        console.log('🔍 Analyzing traffic patterns...');
        
        // For each service route, analyze the pickup -> destination -> destination chain
        for (const [routeKey, scheduleSequence] of this.serviceRoutes) {
            const [scheduleId, serviceId] = routeKey.split('-').map(Number);
            
            // Get pickup location for this service (assuming service starts from a pickup)
            // You'll need to link this with your pickup_locations table
            const firstDestination = scheduleSequence[0];
            const pickupLocation = this.findNearestPickup(firstDestination.destinationId);
            
            if (pickupLocation) {
                // Analyze pickup -> first destination
                this.recordTrip(
                    `pickup_${pickupLocation.id}`, 
                    `dest_${firstDestination.destinationId}`,
                    'pickup_to_destination',
                    scheduleSequence.length // Use sequence length as traffic indicator
                );
                
                // Analyze destination to destination routes
                for (let i = 0; i < scheduleSequence.length - 1; i++) {
                    const current = scheduleSequence[i];
                    const next = scheduleSequence[i + 1];
                    
                    this.recordTrip(
                        `dest_${current.destinationId}`,
                        `dest_${next.destinationId}`,
                        'destination_to_destination',
                        1 // Each route segment counts as 1 trip
                    );
                }
            }
        }
        
        console.log(`✅ Analyzed ${this.routeMatrix.size} route segments`);
    }

    /**
     * Record a trip between two points
     */
    recordTrip(fromId, toId, tripType, weight = 1) {
        const key = `${fromId}-${toId}`;
        
        if (!this.routeMatrix.has(key)) {
            this.routeMatrix.set(key, {
                from: fromId,
                to: toId,
                tripType,
                totalTrips: 0,
                frequency: 0,
                avgTime: 0
            });
        }
        
        const trip = this.routeMatrix.get(key);
        trip.totalTrips += weight;
        trip.frequency += 1;
    }

    /**
     * Find nearest pickup location to a destination
     */
    findNearestPickup(destinationId) {
        const destination = this.destinations.get(destinationId);
        if (!destination) return null;
        
        let nearest = null;
        let minDistance = Infinity;
        
        for (const [id, pickup] of this.pickupLocations) {
            const distance = this.calculateDistance(
                pickup.latitude, pickup.longitude,
                destination.latitude, destination.longitude
            );
            
            if (distance < minDistance) {
                minDistance = distance;
                nearest = pickup;
            }
        }
        
        return nearest;
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
     * Get route recommendations based on your data structure
     */
    getRouteRecommendations(fromLat, fromLng, toLat, toLng, preferences = {}) {
        console.log(`🗺️  Finding route from (${fromLat}, ${fromLng}) to (${toLat}, ${toLng})`);
        
        // Find nearest pickup and destination
        const nearestPickup = this.findNearestLocation(fromLat, fromLng, 'pickup');
        const nearestDestination = this.findNearestLocation(toLat, toLng, 'destination');
        
        if (!nearestPickup || !nearestDestination) {
            return { error: 'Cannot find nearby pickup or destination points' };
        }
        
        // Find routes through your service network
        const routes = this.findServiceRoutes(nearestPickup.id, nearestDestination.id);
        
        return {
            nearestPickup,
            nearestDestination,
            availableRoutes: routes,
            recommendation: routes.length > 0 ? routes[0] : null
        };
    }

    /**
     * Find nearest location (pickup or destination)
     */
    findNearestLocation(lat, lng, type) {
        const locations = type === 'pickup' ? this.pickupLocations : this.destinations;
        
        let nearest = null;
        let minDistance = Infinity;
        
        for (const [id, location] of locations) {
            const distance = this.calculateDistance(lat, lng, location.latitude, location.longitude);
            
            if (distance < minDistance) {
                minDistance = distance;
                nearest = { ...location, distance };
            }
        }
        
        return nearest;
    }

    /**
     * Find service routes connecting pickup to destination
     */
    findServiceRoutes(pickupId, destinationId) {
        const routes = [];
        
        // Look for services that connect these points
        for (const [routeKey, scheduleSequence] of this.serviceRoutes) {
            const destinationIds = scheduleSequence.map(s => s.destinationId);
            
            // Check if target destination is in this route
            if (destinationIds.includes(destinationId)) {
                const pickup = this.pickupLocations.get(pickupId);
                const destination = this.destinations.get(destinationId);
                
                const route = {
                    routeKey,
                    scheduleId: scheduleSequence[0].scheduleId,
                    serviceId: scheduleSequence[0].serviceId,
                    pickup,
                    destination,
                    stops: scheduleSequence.length,
                    estimatedTime: this.estimateRouteTime(scheduleSequence),
                    trafficLevel: this.getRouteTrafficLevel(routeKey)
                };
                
                routes.push(route);
            }
        }
        
        return routes.sort((a, b) => a.estimatedTime - b.estimatedTime);
    }

    /**
     * Estimate route time based on schedule sequence
     */
    estimateRouteTime(scheduleSequence) {
        if (scheduleSequence.length < 2) return 0;
        
        const startTime = scheduleSequence[0].scheduledTime;
        const endTime = scheduleSequence[scheduleSequence.length - 1].scheduledTime;
        
        return (endTime - startTime) / (1000 * 60); // Convert to minutes
    }

    /**
     * Get traffic level for a route
     */
    getRouteTrafficLevel(routeKey) {
        const tripCount = this.routeMatrix.get(routeKey)?.totalTrips || 0;
        
        if (tripCount > 10) return 'high';
        if (tripCount > 5) return 'medium';
        return 'low';
    }

    /**
     * Generate analysis report for your route structure
     */
    generateReport() {
        console.log('\n📊 === OODBS TRAFFIC ANALYSIS REPORT ===\n');
        
        console.log('📈 BASIC STATISTICS:');
        console.log(`   • Pickup Locations: ${this.pickupLocations.size}`);
        console.log(`   • Destinations: ${this.destinations.size}`);
        console.log(`   • Schedule Entries: ${this.schedules.length}`);
        console.log(`   • Service Routes: ${this.serviceRoutes.size}`);
        console.log(`   • Route Segments: ${this.routeMatrix.size}`);
        
        // Analyze by organization
        const orgStats = this.analyzeByOrganization();
        console.log('\n🏢 ORGANIZATION ANALYSIS:');
        for (const [orgId, stats] of orgStats) {
            console.log(`   • Organization ${orgId}: ${stats.pickups} pickups, ${stats.destinations} destinations`);
        }
        
        // Most active routes
        const activeRoutes = Array.from(this.routeMatrix.entries())
            .sort((a, b) => b[1].totalTrips - a[1].totalTrips)
            .slice(0, 5);
            
        console.log('\n🚌 MOST ACTIVE ROUTE SEGMENTS:');
        activeRoutes.forEach(([key, data], index) => {
            console.log(`   ${index + 1}. ${key}: ${data.totalTrips} trips (${data.tripType})`);
        });
        
        console.log('\n✅ Analysis complete!\n');
    }

    /**
     * Analyze data by organization
     */
    analyzeByOrganization() {
        const orgStats = new Map();
        
        for (const [id, pickup] of this.pickupLocations) {
            const orgId = pickup.organizationId;
            if (!orgStats.has(orgId)) {
                orgStats.set(orgId, { pickups: 0, destinations: 0 });
            }
            orgStats.get(orgId).pickups++;
        }
        
        for (const [id, dest] of this.destinations) {
            const orgId = dest.organizationId;
            if (!orgStats.has(orgId)) {
                orgStats.set(orgId, { pickups: 0, destinations: 0 });
            }
            orgStats.get(orgId).destinations++;
        }
        
        return orgStats;
    }

    /**
     * Test with sample data matching your structure
     */
    testWithSampleData() {
        console.log('\n🧪 TESTING WITH SAMPLE DATA...\n');
        
        // Sample pickup locations (your format)
        const samplePickups = [
            { id: 1, organization_id: 1, type: 'Public', name: 'Changi Airport T3', latitude: 1.3644, longitude: 103.992 },
            { id: 2, organization_id: 2, type: 'Public', name: 'Raffles Bus Pickup 1', latitude: 1.2951, longitude: 103.852 },
            { id: 3, organization_id: 1, type: 'Public', name: 'Tanah Merah Ferry Terminal', latitude: 1.31517, longitude: 103.989 },
            { id: 4, organization_id: 1, type: 'Public', name: 'Tuas Bus Terminal', latitude: 1.34149, longitude: 103.639 }
        ];
        
        // Sample destinations (your format)
        const sampleDestinations = [
            { id: 1, organization_id: 1, name: 'Marina Bay Sands', latitude: 1.2834, longitude: 103.861 },
            { id: 2, organization_id: 1, name: 'Gardens by the Bay', latitude: 1.2816, longitude: 103.864 },
            { id: 3, organization_id: 2, name: 'VivoCity', latitude: 1.2645, longitude: 103.823 },
            { id: 15, organization_id: 1, name: 'Changi Terminal 3', latitude: 1.35854, longitude: 103.987 },
            { id: 16, organization_id: 1, name: 'V Hotel Lavender', latitude: 1.308, longitude: 103.863 },
            { id: 17, organization_id: 1, name: 'V hotel Bencoolen', latitude: 1.29907, longitude: 103.851 },
            { id: 18, organization_id: 1, name: 'Hotel Boss', latitude: 1.30584, longitude: 103.86 },
            { id: 21, organization_id: 1, name: 'Hotel MI Bencoolen', latitude: 1.29902, longitude: 103.85 },
            { id: 22, organization_id: 1, name: 'Test Hotel', latitude: 1.300, longitude: 103.855 },
            { id: 27, organization_id: 1, name: 'Another Hotel', latitude: 1.305, longitude: 103.860 },
            { id: 28, organization_id: 1, name: 'Final Hotel', latitude: 1.310, longitude: 103.865 }
        ];
        
        // Sample schedules (your format)
        const sampleSchedules = [
            { schedule_id: 56, service_id: 3, destination_id: 28, bus_id: 1, sequence: 1, scheduled_time: '2025-10-07 12:02:16' },
            { schedule_id: 57, service_id: 3, destination_id: 17, bus_id: 1, sequence: 2, scheduled_time: '2025-10-07 12:27:16' },
            { schedule_id: 58, service_id: 3, destination_id: 18, bus_id: 1, sequence: 3, scheduled_time: '2025-10-07 12:33:16' },
            { schedule_id: 59, service_id: 3, destination_id: 27, bus_id: 1, sequence: 4, scheduled_time: '2025-10-07 12:40:16' },
            { schedule_id: 60, service_id: 3, destination_id: 15, bus_id: 1, sequence: 5, scheduled_time: '2025-10-07 12:46:16' },
            { schedule_id: 61, service_id: 3, destination_id: 16, bus_id: 1, sequence: 6, scheduled_time: '2025-10-07 12:54:16' },
            { schedule_id: 62, service_id: 3, destination_id: 21, bus_id: 1, sequence: 7, scheduled_time: '2025-10-07 13:00:16' },
            { schedule_id: 63, service_id: 3, destination_id: 22, bus_id: 1, sequence: 8, scheduled_time: '2025-10-07 13:12:16' }
        ];
        
        // Load sample data
        this.loadPickupLocations(samplePickups);
        this.loadDestinations(sampleDestinations);
        this.loadSchedules(sampleSchedules);
        
        // Analyze traffic
        this.analyzeRouteTraffic();
        
        // Test route finding
        console.log('🎯 Testing route from Changi Airport to Marina Bay Sands:');
        const result = this.getRouteRecommendations(1.3644, 103.992, 1.2834, 103.861);
        
        if (result.error) {
            console.log(`   ❌ Error: ${result.error}`);
        } else {
            console.log(`   📍 Nearest Pickup: ${result.nearestPickup.name}`);
            console.log(`   🎯 Nearest Destination: ${result.nearestDestination.name}`);
            console.log(`   🛣️  Available Routes: ${result.availableRoutes.length}`);
            
            if (result.recommendation) {
                console.log(`   ⭐ Recommended: Service ${result.recommendation.serviceId}`);
                console.log(`   ⏱️  Estimated Time: ${result.recommendation.estimatedTime} minutes`);
                console.log(`   🚌 Traffic Level: ${result.recommendation.trafficLevel}`);
            }
        }
    }

    /**
     * Main execution method
     */
    async run() {
        try {
            console.log('🚀 Starting OODBS Traffic Analysis...\n');
            
            // Test with sample data that matches your structure
            this.testWithSampleData();
            
            // Generate report
            this.generateReport();
            
            console.log('🎉 OODBS Traffic Analysis complete!');
            
        } catch (error) {
            console.error('❌ Error during analysis:', error);
        }
    }
}

// Run if executed directly
if (require.main === module) {
    const model = new OODBSTrafficModel();
    model.run();
}

module.exports = OODBSTrafficModel;