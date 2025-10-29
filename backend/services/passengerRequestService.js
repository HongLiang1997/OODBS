const { trafficAwarenessService } = require('./trafficAwarenessService');

/**
 * Passenger Request Processing Service
 * Orchestrates the complete flow from passenger request to schedule confirmation
 * 
 * Flow: Request → Find Bus → Add to Schedule → Route → Traffic Analysis → Threshold Check → Confirm/Reject
 */
class PassengerRequestService {
    constructor(pool) {
        this.pool = pool;
        this.trafficService = trafficAwarenessService;
        
        // Configurable thresholds for request acceptance
        this.acceptanceThresholds = {
            maxDelay: 30,           // Maximum acceptable delay in minutes
            maxRiskLevel: 'HIGH',   // Maximum acceptable risk level
            maxDetourFactor: 1.5,   // Maximum route length increase (1.5 = 50% longer)
            minEfficiencyScore: 60  // Minimum overall efficiency score
        };
    }

    /**
     * Main method: Process passenger request through complete workflow
     * @param {Object} passengerRequest - The passenger's booking request
     * @returns {Object} Processing result with confirmation or rejection
     */
    async processPassengerRequest(passengerRequest) {
        const {
            passenger_id,
            pickup_location_id,
            destination_id,
            requested_pickup_time,
            passenger_count = 1,
            special_requirements = null
        } = passengerRequest;

        console.log(`🚌 Processing request for passenger ${passenger_id}`);

        try {
            // Step 1: Find available buses for pickup location
            const availableBuses = await this.findAvailableBuses(pickup_location_id, requested_pickup_time);
            
            if (availableBuses.length === 0) {
                // Create pending request for admin review
                const pendingRequestId = await this.createPendingRequest(passengerRequest);
                console.log(`   ✅ Created pending request ${pendingRequestId} with no bus assignment`);
                
                return this.createRejectionResponse('NO_AVAILABLE_BUS', 
                    'No buses available for your pickup location and time. Your request has been added to the pending queue for admin review.', 
                    null, { pending_request_id: pendingRequestId });
            }

            // Step 2: For each available bus, simulate adding passenger and analyze impact
            const busAnalyses = [];
            
            for (const bus of availableBuses) {
                console.log(`🔍 Analyzing bus ${bus.bus_id} (Service: ${bus.service_id})`);
                
                // Step 3: Simulate adding passenger to schedule
                const simulatedSchedule = await this.simulatePassengerAddition(
                    bus, pickup_location_id, destination_id, requested_pickup_time, passenger_count
                );

                // Step 4: Run routing algorithm on simulated schedule
                const routingResult = await this.runRoutingAlgorithm(simulatedSchedule);

                // Step 5: Run traffic awareness analysis
                const trafficAnalysis = await this.analyzeTrafficImpact(routingResult);

                // Step 6: Calculate overall efficiency and impact
                const impactAssessment = this.assessOverallImpact(routingResult, trafficAnalysis, bus);

                busAnalyses.push({
                    bus: bus,
                    simulatedSchedule: simulatedSchedule,
                    routingResult: routingResult,
                    trafficAnalysis: trafficAnalysis,
                    impactAssessment: impactAssessment,
                    meetsThreshold: this.checkAcceptanceThresholds(impactAssessment)
                });
            }

            // Step 7: Find best option that meets thresholds
            const acceptableBuses = busAnalyses.filter(analysis => analysis.meetsThreshold);
            
            if (acceptableBuses.length === 0) {
                return this.createRejectionResponse('THRESHOLD_EXCEEDED', 
                    'Request would cause unacceptable delays or route changes', busAnalyses);
            }

            // Step 8: Select SINGLE best bus (highest efficiency score)
            const bestBus = acceptableBuses.reduce((best, current) => 
                current.impactAssessment.efficiencyScore > best.impactAssessment.efficiencyScore ? current : best
            );

            console.log(`🎯 SELECTED SINGLE BEST BUS: Bus ${bestBus.bus.bus_id} (${bestBus.bus.plate_number})`);
            console.log(`   Efficiency Score: ${bestBus.impactAssessment.efficiencyScore}`);
            console.log(`   Expected Delay: ${bestBus.trafficAnalysis.totalDelay} minutes`);
            console.log(`   Analyzed ${busAnalyses.length} buses, ${acceptableBuses.length} acceptable, confirming with 1 bus only`);

            // Step 9: Confirm the schedule with ONLY the selected best bus
            const confirmedSchedule = await this.confirmPassengerAddition(bestBus, passengerRequest);

            console.log(`✅ CONFIRMED booking with Bus ${bestBus.bus.bus_id} only - no other buses modified`);

            return this.createConfirmationResponse(confirmedSchedule, bestBus);

        } catch (error) {
            console.error('❌ Error processing passenger request:', error);
            return this.createRejectionResponse('SYSTEM_ERROR', error.message);
        }
    }

    /**
     * Step 1: Find buses that can pickup from the specified location
     */
    async findAvailableBuses(pickup_location_id, requested_time) {
        console.log(`=== FINDING OPTIMAL SCHEDULE ===`);
        console.log(`Pickup ID: ${pickup_location_id}, Requested time: ${requested_time}`);
        
        // Updated query to match your actual database structure (removed pickup_time since it doesn't exist)
        const query = `
            SELECT DISTINCT 
                b.bus_id,
                b.plate_number,
                b.capacity,
                b.status,
                bs.service_id,
                bs.service_date,
                bs.isAmShift,
                bs.isPmShift,
                COUNT(pr.request_id) as current_passengers
            FROM bus b
            JOIN bus_services bs ON b.bus_id = bs.bus_id
            LEFT JOIN passenger_requests pr ON b.bus_id = pr.bus_id 
                AND pr.request_status = 1
            WHERE bs.pickup_id = ? 
                AND b.status = 'active'
                AND (bs.service_date >= CURDATE() - INTERVAL 7 DAY OR bs.service_date IS NULL)
            GROUP BY b.bus_id, bs.service_id
            HAVING current_passengers < b.capacity
            ORDER BY (b.capacity - current_passengers) DESC
        `;

        console.log(`🔍 Query: ${query}`);
        console.log(`🔍 Parameters: [${pickup_location_id}]`);
        console.log(`🔍 Current date: ${new Date().toISOString().split('T')[0]}`);

        try {
            const [buses] = await this.pool.execute(query, [pickup_location_id]);
            console.log(`Found ${buses.length} candidate buses:`);
            
            // Debug: Let's also try a simpler query to see what we get
            const [simpleQuery] = await this.pool.execute(`
                SELECT b.bus_id, b.plate_number, b.status, bs.service_id, bs.service_date
                FROM bus b 
                JOIN bus_services bs ON b.bus_id = bs.bus_id 
                WHERE bs.pickup_id = ? AND b.status = 'active'
            `, [pickup_location_id]);
            console.log(`🔍 Simple query result (active buses for pickup ${pickup_location_id}):`, simpleQuery);
            
            if (buses.length === 0) {
                // Debug information
                console.log('❌ No active buses found servicing pickup location', pickup_location_id);
                
                // More detailed debugging - removed LIMIT to see all records
                const [allBuses] = await this.pool.execute('SELECT bus_id, plate_number, status FROM bus ORDER BY bus_id');
                console.log('   Debug - ALL buses in database:', allBuses);
                
                const [allServices] = await this.pool.execute('SELECT * FROM bus_services WHERE pickup_id = ? ORDER BY service_id', [pickup_location_id]);
                console.log('   Debug - ALL services for pickup_id', pickup_location_id, ':', allServices);
                
                const [activeBusesForPickup] = await this.pool.execute(`
                    SELECT b.bus_id, b.plate_number, b.status, bs.service_id, bs.pickup_id 
                    FROM bus b 
                    JOIN bus_services bs ON b.bus_id = bs.bus_id 
                    WHERE bs.pickup_id = ?`, [pickup_location_id]);
                console.log('   Debug - All buses (any status) for this pickup:', activeBusesForPickup);
                
                const [activeOnly] = await this.pool.execute(`
                    SELECT b.bus_id, b.plate_number, b.status, bs.service_id 
                    FROM bus b 
                    JOIN bus_services bs ON b.bus_id = bs.bus_id 
                    WHERE bs.pickup_id = ? AND b.status = 'active'`, [pickup_location_id]);
                console.log('   Debug - ACTIVE buses for this pickup:', activeOnly);
                
                const [pickupLocation] = await this.pool.execute('SELECT * FROM pickup_location WHERE pickup_id = ?', [pickup_location_id]);
                console.log(`   Debug - Pickup location ${pickup_location_id}:`, pickupLocation);
                
                console.log('\n❌ NO SUITABLE BUS FOUND');
                console.log('   Reason: No active buses found servicing this pickup location');
                console.log('   Creating pending request without bus assignment...');
            } else {
                buses.forEach((bus, index) => {
                    console.log(`   ${index + 1}. Bus ${bus.bus_id} (${bus.plate_number}) - Capacity: ${bus.capacity}, Current: ${bus.current_passengers}`);
                });
            }
            
            return buses;
        } catch (error) {
            console.error('❌ Database query failed:', error);
            throw error;
        }
    }

    /**
     * Step 3: Simulate adding passenger to existing schedule
     */
    async simulatePassengerAddition(bus, pickup_location_id, destination_id, requested_time, passenger_count) {
        // Get current schedule for this bus/service
        const currentSchedule = await this.getCurrentSchedule(bus.service_id, requested_time);
        
        // Get pickup and destination coordinates (fixed table names for your schema)
        const [pickupLocation] = await this.pool.execute(
            'SELECT * FROM pickup_location WHERE pickup_id = ?', [pickup_location_id]
        );
        const [destination] = await this.pool.execute(
            'SELECT * FROM organization_locations WHERE location_id = ?', [destination_id]
        );

        // Create simulated schedule entry
        const simulatedEntry = {
            passenger_id: 'SIMULATED',
            pickup_location_id: pickup_location_id,
            destination_id: destination_id,
            pickup_time: requested_time,
            passenger_count: passenger_count,
            pickup_coordinates: { 
                lat: pickupLocation[0].latitude, 
                lng: pickupLocation[0].longitude 
            },
            destination_coordinates: { 
                lat: destination[0].latitude, 
                lng: destination[0].longitude 
            }
        };

        return {
            service_id: bus.service_id,
            bus_id: bus.bus_id,
            current_schedule: currentSchedule,
            simulated_entry: simulatedEntry,
            combined_schedule: [...currentSchedule, simulatedEntry]
        };
    }

    /**
     * Get current schedule for a service on specific date
     */
    async getCurrentSchedule(service_id, date) {
        // Get current passenger requests for this service (using your actual schema)
        const query = `
            SELECT 
                pr.*,
                pl.latitude as pickup_lat,
                pl.longitude as pickup_lng,
                ol.latitude as dest_lat,
                ol.longitude as dest_lng,
                pl.name as pickup_name,
                ol.name as dest_name
            FROM passenger_requests pr
            JOIN pickup_location pl ON pr.pickup_id = pl.pickup_id
            JOIN organization_locations ol ON pr.location_id = ol.location_id
            JOIN bus b ON pr.bus_id = b.bus_id
            JOIN bus_services bs ON b.bus_id = bs.bus_id
            WHERE bs.service_id = ?
                AND pr.request_status = 1
            ORDER BY pr.request_id
        `;

        const [schedule] = await this.pool.execute(query, [service_id]);
        
        return schedule.map(entry => ({
            ...entry,
            pickup_coordinates: { lat: entry.pickup_lat, lng: entry.pickup_lng },
            destination_coordinates: { lat: entry.dest_lat, lng: entry.dest_lng }
        }));
    }

    /**
     * Step 4: Run routing algorithm on simulated schedule
     */
    async runRoutingAlgorithm(simulatedSchedule) {
        // This would call your existing routing service
        // For now, I'll create a simplified version that calculates basic metrics
        
        const { combined_schedule } = simulatedSchedule;
        
        if (combined_schedule.length === 0) {
            return {
                totalDistance: 0,
                estimatedDuration: 0,
                routeSequence: [],
                efficiency: 100
            };
        }

        // Calculate total route distance and duration
        let totalDistance = 0;
        let estimatedDuration = 0;
        const routeSequence = [];

        for (let i = 0; i < combined_schedule.length; i++) {
            const current = combined_schedule[i];
            routeSequence.push({
                type: 'pickup',
                location: current.pickup_coordinates,
                passenger_id: current.passenger_id,
                time: current.pickup_time
            });

            // Calculate distance to next pickup (if exists)
            if (i < combined_schedule.length - 1) {
                const next = combined_schedule[i + 1];
                const distance = this.calculateDistance(
                    current.pickup_coordinates.lat, current.pickup_coordinates.lng,
                    next.pickup_coordinates.lat, next.pickup_coordinates.lng
                );
                totalDistance += distance;
                estimatedDuration += distance * 2; // Rough estimate: 2 minutes per km
            }
        }

        // Add drop-offs (simplified - in reality, you'd optimize the sequence)
        combined_schedule.forEach(entry => {
            routeSequence.push({
                type: 'dropoff',
                location: entry.destination_coordinates,
                passenger_id: entry.passenger_id
            });
        });

        // Calculate efficiency score (lower distance = higher efficiency)
        const baseEfficiency = Math.max(0, 100 - (totalDistance * 2));

        return {
            totalDistance: totalDistance,
            estimatedDuration: estimatedDuration,
            routeSequence: routeSequence,
            efficiency: baseEfficiency,
            passengerCount: combined_schedule.length
        };
    }

    /**
     * Step 5: Analyze traffic impact using Traffic Awareness Service
     */
    async analyzeTrafficImpact(routingResult) {
        const { routeSequence } = routingResult;
        
        if (routeSequence.length < 2) {
            return { overallRisk: 'LOW', totalDelay: 0, segments: [] };
        }

        const segmentAnalyses = [];
        let totalDelay = 0;
        let maxRiskLevel = 'MINIMAL';

        // Analyze each route segment
        for (let i = 0; i < routeSequence.length - 1; i++) {
            const from = routeSequence[i];
            const to = routeSequence[i + 1];

            try {
                const segmentAnalysis = this.trafficService.analyzeRouteImpact({
                    originLat: from.location.lat,
                    originLng: from.location.lng,
                    destLat: to.location.lat,
                    destLng: to.location.lng,
                    departureTime: from.time || new Date().toISOString(),
                    dayType: this.getDayType(from.time)
                });

                segmentAnalyses.push({
                    from: from,
                    to: to,
                    analysis: segmentAnalysis
                });

                totalDelay += segmentAnalysis.expectedDelay;
                
                // Track highest risk level
                if (this.getRiskLevelWeight(segmentAnalysis.riskLevel) > this.getRiskLevelWeight(maxRiskLevel)) {
                    maxRiskLevel = segmentAnalysis.riskLevel;
                }

            } catch (error) {
                console.warn('Traffic analysis failed for segment, using defaults:', error.message);
                segmentAnalyses.push({
                    from: from,
                    to: to,
                    analysis: { riskLevel: 'MEDIUM', expectedDelay: 5 }
                });
                totalDelay += 5;
            }
        }

        return {
            overallRisk: maxRiskLevel,
            totalDelay: totalDelay,
            segments: segmentAnalyses,
            averageRisk: this.calculateAverageRisk(segmentAnalyses)
        };
    }

    /**
     * Step 6: Assess overall impact of adding passenger
     */
    assessOverallImpact(routingResult, trafficAnalysis, bus) {
        const baseScore = 100;
        let efficiencyScore = baseScore;

        // Penalize for increased distance
        efficiencyScore -= routingResult.totalDistance * 0.5;

        // Penalize for traffic delays
        efficiencyScore -= trafficAnalysis.totalDelay * 0.8;

        // Penalize for high risk
        const riskPenalties = { 'MINIMAL': 0, 'LOW': 5, 'MEDIUM': 15, 'HIGH': 30, 'SEVERE': 50 };
        efficiencyScore -= riskPenalties[trafficAnalysis.overallRisk] || 20;

        // Bonus for bus utilization
        const utilizationBonus = (routingResult.passengerCount / bus.capacity) * 20;
        efficiencyScore += utilizationBonus;

        return {
            efficiencyScore: Math.max(0, efficiencyScore),
            totalDelay: trafficAnalysis.totalDelay,
            riskLevel: trafficAnalysis.overallRisk,
            routeDistance: routingResult.totalDistance,
            estimatedDuration: routingResult.estimatedDuration + trafficAnalysis.totalDelay,
            detourFactor: this.calculateDetourFactor(routingResult),
            recommendations: this.generateRecommendations(routingResult, trafficAnalysis)
        };
    }

    /**
     * Step 6b: Check if impact meets acceptance thresholds
     */
    checkAcceptanceThresholds(impactAssessment) {
        const checks = {
            delay: impactAssessment.totalDelay <= this.acceptanceThresholds.maxDelay,
            risk: this.getRiskLevelWeight(impactAssessment.riskLevel) <= 
                  this.getRiskLevelWeight(this.acceptanceThresholds.maxRiskLevel),
            detour: impactAssessment.detourFactor <= this.acceptanceThresholds.maxDetourFactor,
            efficiency: impactAssessment.efficiencyScore >= this.acceptanceThresholds.minEfficiencyScore
        };

        return {
            passes: Object.values(checks).every(check => check),
            checks: checks,
            reasons: Object.entries(checks)
                .filter(([key, passes]) => !passes)
                .map(([key]) => `${key}_threshold_exceeded`)
        };
    }

    /**
     * Step 9: Actually confirm the passenger addition to schedule
     */
    async confirmPassengerAddition(bestBusAnalysis, passengerRequest) {
        const { bus, simulatedSchedule } = bestBusAnalysis;
        
        // Insert into passenger_requests table (using your actual schema)
        const insertQuery = `
            INSERT INTO passenger_requests (
                user_id, bus_id, pickup_id, location_id, 
                passenger_count, request_status, schedule_id, tier_id
            ) VALUES (?, ?, ?, ?, ?, 1, ?, 1)
        `;

        // Get or create a schedule_id for this service
        const scheduleId = await this.getOrCreateScheduleId(bus.service_id);

        const [result] = await this.pool.execute(insertQuery, [
            passengerRequest.passenger_id,
            bus.bus_id,
            passengerRequest.pickup_location_id,
            passengerRequest.destination_id,
            passengerRequest.passenger_count,
            scheduleId
        ]);

        const requestId = result.insertId;

        // Insert route information into routes table
        await this.createRouteEntries(requestId, scheduleId, bestBusAnalysis);

        return {
            request_id: requestId,
            schedule_id: scheduleId,
            service_id: bus.service_id,
            bus_id: bus.bus_id,
            confirmed_time: new Date().toISOString(),
            ...passengerRequest
        };
    }

    /**
     * Helper: Create confirmation response
     */
    createConfirmationResponse(confirmedSchedule, bestBusAnalysis) {
        return {
            success: true,
            status: 'CONFIRMED',
            message: 'Your booking has been confirmed',
            data: {
                schedule: confirmedSchedule,
                bus_info: {
                    bus_id: bestBusAnalysis.bus.bus_id,
                    registration: bestBusAnalysis.bus.registration_number,
                    service_name: bestBusAnalysis.bus.service_name
                },
                impact_analysis: bestBusAnalysis.impactAssessment,
                traffic_analysis: {
                    risk_level: bestBusAnalysis.trafficAnalysis.overallRisk,
                    expected_delay: bestBusAnalysis.trafficAnalysis.totalDelay,
                    recommendations: bestBusAnalysis.impactAssessment.recommendations
                },
                estimated_times: {
                    pickup_time: confirmedSchedule.requested_pickup_time,
                    estimated_arrival: this.addMinutes(confirmedSchedule.requested_pickup_time, 
                        bestBusAnalysis.impactAssessment.estimatedDuration)
                }
            }
        };
    }

    /**
     * Create pending request when no bus is available
     */
    async createPendingRequest(passengerRequest) {
        const insertQuery = `
            INSERT INTO passenger_requests (
                user_id, location_id, pickup_time, passenger_count, 
                special_requirements, status, request_time
            ) VALUES (?, ?, ?, ?, ?, 'pending', NOW())
        `;

        const [result] = await this.pool.execute(insertQuery, [
            passengerRequest.passenger_id,
            passengerRequest.destination_id,
            passengerRequest.requested_pickup_time,
            passengerRequest.passenger_count,
            passengerRequest.special_requirements
        ]);

        return result.insertId;
    }

    /**
     * Helper: Create rejection response
     */
    createRejectionResponse(reason, message, analyses = null, extraData = null) {
        const response = {
            success: false,
            status: 'REJECTED',
            reason: reason,
            message: message,
            timestamp: new Date().toISOString()
        };

        if (analyses) {
            response.analysis_summary = {
                buses_analyzed: analyses.length,
                threshold_failures: analyses.map(a => ({
                    bus_id: a.bus.bus_id,
                    failed_checks: a.meetsThreshold ? [] : a.meetsThreshold.reasons
                }))
            };
        }

        if (extraData) {
            response.data = extraData;
        }

        return response;
    }

    /**
     * Helper methods for calculations
     */
    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    getRiskLevelWeight(riskLevel) {
        const weights = { 'MINIMAL': 1, 'LOW': 2, 'MEDIUM': 3, 'HIGH': 4, 'SEVERE': 5 };
        return weights[riskLevel] || 3;
    }

    getDayType(timeString) {
        const date = new Date(timeString);
        const dayOfWeek = date.getDay();
        return (dayOfWeek === 0 || dayOfWeek === 6) ? 'WEEKEND' : 'WEEKDAY';
    }

    calculateDetourFactor(routingResult) {
        // Simplified calculation - in reality you'd compare to direct route
        return routingResult.passengerCount > 1 ? 1.2 : 1.0;
    }

    calculateAverageRisk(segmentAnalyses) {
        if (segmentAnalyses.length === 0) return 'LOW';
        
        const totalWeight = segmentAnalyses.reduce((sum, segment) => 
            sum + this.getRiskLevelWeight(segment.analysis.riskLevel), 0);
        const avgWeight = totalWeight / segmentAnalyses.length;
        
        if (avgWeight >= 4.5) return 'SEVERE';
        if (avgWeight >= 3.5) return 'HIGH';
        if (avgWeight >= 2.5) return 'MEDIUM';
        if (avgWeight >= 1.5) return 'LOW';
        return 'MINIMAL';
    }

    generateRecommendations(routingResult, trafficAnalysis) {
        const recommendations = [];
        
        if (trafficAnalysis.totalDelay > 15) {
            recommendations.push('Consider departing 10-15 minutes earlier due to traffic');
        }
        
        if (trafficAnalysis.overallRisk === 'SEVERE') {
            recommendations.push('High traffic expected - allow extra travel time');
        }

        if (routingResult.passengerCount > 1) {
            recommendations.push('Multiple passengers on route - shared ride benefits apply');
        }

        return recommendations.length > 0 ? recommendations : ['Normal service expected'];
    }

    addMinutes(timeString, minutes) {
        if (!timeString) {
            console.warn('⚠️ addMinutes called with invalid timeString:', timeString);
            return new Date().toISOString(); // Return current time as fallback
        }
        
        const date = new Date(timeString);
        if (isNaN(date.getTime())) {
            console.warn('⚠️ addMinutes received invalid date:', timeString);
            return new Date().toISOString(); // Return current time as fallback
        }
        
        date.setMinutes(date.getMinutes() + (minutes || 0));
        return date.toISOString();
    }

    /**
     * Update the entire route with new passenger integrated into existing schedule
     */
    async createRouteEntries(requestId, scheduleId, bestBusAnalysis) {
        const { routingResult } = bestBusAnalysis;
        
        if (!routingResult || !routingResult.routeSequence) {
            console.log('⚠️ No route sequence available for request', requestId);
            return;
        }

        console.log(`📍 UPDATING ENTIRE ROUTE for schedule ${scheduleId} with new passenger (request ${requestId})`);
        console.log(`   This will recalculate ALL stop orders and ETAs for the complete route`);

        try {
            // Step 1: Get existing route entries for this schedule
            const [existingRoutes] = await this.pool.execute(`
                SELECT route_id, request_id, stop_order, eta 
                FROM routes 
                WHERE schedule_id = ? 
                ORDER BY stop_order ASC
            `, [scheduleId]);

            console.log(`   📋 Found ${existingRoutes.length} existing route stops that will be recalculated`);
            
            // Step 1.5: Get existing passenger count for context
            const [existingPassengers] = await this.pool.execute(`
                SELECT COUNT(DISTINCT pr.user_id) as passenger_count
                FROM passenger_requests pr
                WHERE pr.schedule_id = ? AND pr.request_status = 1
            `, [scheduleId]);
            
            const currentPassengerCount = existingPassengers[0]?.passenger_count || 0;
            console.log(`   👥 Current passengers on this route: ${currentPassengerCount}, adding 1 more`);

            // Step 2: Clear ALL existing routes for this schedule (we'll rebuild the entire route)
            await this.pool.execute('DELETE FROM routes WHERE schedule_id = ?', [scheduleId]);

            // Step 3: Rebuild the entire optimized route sequence with the new passenger
            // Use the schedule's departure time as base, or set a reasonable default
            let baseTime = new Date();
            
            // Try to get the actual schedule departure time first
            try {
                const [scheduleInfo] = await this.pool.execute(`
                    SELECT departure_time FROM schedule WHERE schedule_id = ?
                `, [scheduleId]);
                
                if (scheduleInfo.length > 0 && scheduleInfo[0].departure_time) {
                    baseTime = new Date(scheduleInfo[0].departure_time);
                    console.log(`   📅 Using schedule departure time: ${baseTime.toLocaleString()}`);
                } else {
                    // No schedule departure time, create a reasonable one
                    const now = new Date();
                    baseTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0, 0, 0); // 8 AM today
                    
                    // If it's already past 8 AM today, use 8 AM tomorrow
                    if (now.getHours() >= 18) { // If after 6 PM, schedule for next day
                        baseTime.setDate(baseTime.getDate() + 1);
                    }
                    
                    console.log(`   🕐 No schedule departure time found, using default: ${baseTime.toLocaleString()}`);
                }
            } catch (scheduleError) {
                console.warn('   ⚠️ Could not retrieve schedule departure time, using default');
                baseTime.setHours(8, 0, 0, 0); // Default to 8 AM
            }
            
            const baseMinutesPerStop = 8; // Reduced to 8 minutes per stop for realistic timing
            const trafficDelayBuffer = bestBusAnalysis.trafficAnalysis ? 
                (bestBusAnalysis.trafficAnalysis.totalDelay || 0) : 0;

            console.log(`   🕐 Base departure time: ${baseTime.toLocaleString()}`);
            console.log(`   📍 Rebuilding route with ${routingResult.routeSequence.length} total stops (including new passenger)`);
            console.log(`   🚦 Traffic delay buffer: ${trafficDelayBuffer} minutes`);

            // Step 4: Insert the complete optimized route sequence
            for (let i = 0; i < routingResult.routeSequence.length; i++) {
                const stop = routingResult.routeSequence[i];
                
                // Calculate ETA considering:
                // - Base travel time per stop (8 minutes each)  
                // - Traffic delays
                // - Route optimization
                let etaMinutes = i * baseMinutesPerStop;
                
                // Add progressive traffic delay (more delay for later stops)
                if (trafficDelayBuffer > 0) {
                    etaMinutes += Math.round(trafficDelayBuffer * (i / routingResult.routeSequence.length));
                }

                const eta = new Date(baseTime.getTime() + etaMinutes * 60000);
                
                // FIXED: Use the correct passenger request ID from the route sequence
                // Each stop should reference the specific passenger request it belongs to
                let stopRequestId = requestId; // Default to current request
                
                if (stop.passenger_id && stop.passenger_id !== requestId) {
                    // This stop belongs to a different passenger - find their request ID
                    try {
                        const [existingRequest] = await this.pool.execute(`
                            SELECT request_id FROM passenger_requests 
                            WHERE user_id = ? AND schedule_id = ? AND request_status = 1
                            ORDER BY request_id DESC LIMIT 1
                        `, [stop.passenger_id, scheduleId]);
                        
                        if (existingRequest.length > 0) {
                            stopRequestId = existingRequest[0].request_id;
                        }
                    } catch (lookupError) {
                        console.warn(`   ⚠️ Could not find existing request for passenger ${stop.passenger_id}, using current request`);
                    }
                }
                
                const stopOrder = i + 1;
                const formattedEta = eta.toISOString().slice(0, 19).replace('T', ' ');
                
                console.log(`  📍 Processing Stop ${stopOrder}:`);
                console.log(`     - Type: ${stop.type || 'unknown'}`);
                console.log(`     - Schedule ID: ${scheduleId}`);
                console.log(`     - Request ID: ${stopRequestId} (passenger: ${stop.passenger_id || 'current'})`);
                console.log(`     - Stop Order: ${stopOrder}`);
                console.log(`     - ETA: ${formattedEta}`);
                
                try {
                    const [result] = await this.pool.execute(`
                        INSERT INTO routes (
                            schedule_id, 
                            request_id, 
                            tier_id, 
                            stop_order, 
                            eta
                        ) VALUES (?, ?, ?, ?, ?)
                    `, [
                        scheduleId,
                        stopRequestId, // Use the correct request ID for this stop
                        1, // Default tier_id
                        stopOrder, // stop_order (1-based, this MUST not be null)
                        formattedEta // Convert to MySQL TIMESTAMP format
                    ]);

                    console.log(`  ✅ Stop ${stopOrder}: ETA ${eta.toLocaleTimeString()} - Route entry created (ID: ${result.insertId})`);
                    
                } catch (insertError) {
                    console.error(`❌ Failed to insert route stop ${stopOrder}:`, insertError.message);
                    console.error(`   Full error:`, insertError);
                    console.error(`   Values being inserted:`);
                    console.error(`     - scheduleId: ${scheduleId} (type: ${typeof scheduleId})`);
                    console.error(`     - stopRequestId: ${stopRequestId} (type: ${typeof stopRequestId})`);
                    console.error(`     - tier_id: 1 (type: number)`);
                    console.error(`     - stopOrder: ${stopOrder} (type: ${typeof stopOrder})`);
                    console.error(`     - eta: ${formattedEta} (type: ${typeof formattedEta})`);
                    throw insertError;
                }
            }

            // Step 5: Update the schedule arrival time based on final stop
            if (routingResult.routeSequence.length > 0) {
                const finalEtaMinutes = (routingResult.routeSequence.length - 1) * baseMinutesPerStop + trafficDelayBuffer;
                const finalEta = new Date(baseTime.getTime() + finalEtaMinutes * 60000);
                
                await this.pool.execute(`
                    UPDATE schedule 
                    SET arrival_time = ? 
                    WHERE schedule_id = ?
                `, [
                    finalEta.toISOString().slice(0, 19).replace('T', ' '),
                    scheduleId
                ]);

                console.log(`  🏁 Updated schedule arrival time: ${finalEta.toLocaleTimeString()}`);
            }

            console.log(`✅ Successfully updated entire route for schedule ${scheduleId} with ${routingResult.routeSequence.length} stops`);

        } catch (error) {
            console.error(`❌ Failed to update route for schedule ${scheduleId}:`, error);
            throw error;
        }
    }

    /**
     * Get or create schedule ID for a bus service
     */
    async getOrCreateScheduleId(service_id) {
        // Check if schedule already exists for this service
        const [existing] = await this.pool.execute(
            'SELECT schedule_id FROM schedule WHERE service_id = ?', 
            [service_id]
        );

        if (existing.length > 0) {
            return existing[0].schedule_id;
        }

        // Create new schedule entry
        const [result] = await this.pool.execute(`
            INSERT INTO schedule (service_id, departure_time, arrival_time) 
            VALUES (?, NOW(), DATE_ADD(NOW(), INTERVAL 2 HOUR))
        `, [service_id]);

        return result.insertId;
    }
}

module.exports = { PassengerRequestService };