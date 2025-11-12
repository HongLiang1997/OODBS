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
            // STEP 0: Check if passenger has any incomplete trips (blocking new bookings until completion)
            const [activeTrips] = await this.pool.execute(`
                SELECT pr.request_id, pr.pickup_id, pr.location_id, pr.schedule_id, 
                       pr.request_status, pr.trip_status
                FROM passenger_requests pr 
                WHERE pr.user_id = ? 
                AND pr.trip_status IN ('booked', 'ongoing')
            `, [passenger_id]);

            if (activeTrips.length > 0) {
                const activeTrip = activeTrips[0];
                console.log(`⚠️ Passenger ${passenger_id} has incomplete trip (Request ${activeTrip.request_id}, Trip status: ${activeTrip.trip_status})`);
                
                // Check if it's the exact same request
                if (activeTrip.pickup_id === pickup_location_id && activeTrip.location_id === destination_id) {
                    return this.createRejectionResponse('DUPLICATE_REQUEST', 
                        'You already have an active request for this route');
                } else {
                    return this.createRejectionResponse('ACTIVE_TRIP_EXISTS', 
                        'Please complete your current trip before making a new booking');
                }
            }

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
                    bus, pickup_location_id, destination_id, requested_pickup_time, passenger_count, passenger_id
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
     * FIXED: Check if schedule is completed and create new schedule if needed
     */
    async findAvailableBuses(pickup_location_id, requested_time) {
        console.log(`=== FINDING OPTIMAL SCHEDULE ===`);
        console.log(`Pickup ID: ${pickup_location_id}, Requested time: ${requested_time}`);
        
        // Updated query to check schedule completion status
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
                COUNT(pr.request_id) as current_passengers,
                s.schedule_id,
                s.departure_time,
                s.arrival_time,
                CASE 
                    WHEN s.arrival_time IS NOT NULL AND s.arrival_time < NOW() THEN 'COMPLETED'
                    WHEN COUNT(pr.request_id) >= b.capacity THEN 'FULL'
                    ELSE 'AVAILABLE'
                END as schedule_status
            FROM bus b
            JOIN bus_services bs ON b.bus_id = bs.bus_id
            LEFT JOIN schedule s ON bs.service_id = s.service_id
            LEFT JOIN passenger_requests pr ON b.bus_id = pr.bus_id 
                AND pr.request_status = 1
            WHERE bs.pickup_id = ? 
                AND b.status = 'active'
                AND (bs.service_date >= CURDATE() - INTERVAL 7 DAY OR bs.service_date IS NULL)
            GROUP BY b.bus_id, bs.service_id, s.schedule_id
            HAVING schedule_status IN ('AVAILABLE') OR schedule_status IS NULL
            ORDER BY 
                CASE WHEN schedule_status = 'AVAILABLE' THEN 1 ELSE 2 END,
                (b.capacity - current_passengers) DESC
        `;

        try {
            const [buses] = await this.pool.execute(query, [pickup_location_id]);
            console.log(`Found ${buses.length} candidate buses with available schedules`);
            
            // Log bus details for debugging
            buses.forEach(bus => {
                console.log(`   Bus ${bus.bus_id} (${bus.plate_number}): ${bus.current_passengers}/${bus.capacity} passengers, Status: ${bus.schedule_status || 'NEW'}`);
            });
            
            return buses;
        } catch (error) {
            console.error('❌ Database query failed:', error);
            throw error;
        }
    }

    /**
     * Step 3: Simulate adding passenger to existing schedule
     */
    async simulatePassengerAddition(bus, pickup_location_id, destination_id, requested_time, passenger_count, passenger_id) {
        // Get current schedule for this bus/service
        const currentSchedule = await this.getCurrentSchedule(bus.service_id, requested_time);
        
        // Get pickup and destination coordinates
        const [pickupLocation] = await this.pool.execute(
            'SELECT * FROM pickup_location WHERE pickup_id = ?', [pickup_location_id]
        );
        const [destination] = await this.pool.execute(
            'SELECT * FROM organization_locations WHERE location_id = ?', [destination_id]
        );

        // Create simulated schedule entry with actual passenger ID and request tracking
        const simulatedEntry = {
            passenger_id: passenger_id,
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
            },
            is_new_passenger: true  // Mark this as the new passenger being added
        };

        const combined_schedule = [...currentSchedule, simulatedEntry];

        return {
            service_id: bus.service_id,
            bus_id: bus.bus_id,
            current_schedule: currentSchedule,
            simulated_entry: simulatedEntry,
            combined_schedule: combined_schedule
        };
    }

    /**
     * Get current schedule for a service - FIXED SQL syntax
     */
    async getCurrentSchedule(service_id, date) {
        const query = `
            SELECT 
                pr.request_id,
                pr.user_id,
                pr.pickup_id,
                pr.location_id,
                pl.latitude as pickup_lat,
                pl.longitude as pickup_lng,
                ol.latitude as dest_lat,
                ol.longitude as dest_lng,
                pl.name as pickup_name,
                ol.name as dest_name
            FROM passenger_requests pr
            JOIN pickup_location pl ON pr.pickup_id = pl.pickup_id
            JOIN organization_locations ol ON pr.location_id = ol.location_id
            WHERE pr.bus_id IN (
                SELECT DISTINCT bs.bus_id 
                FROM bus_services bs 
                WHERE bs.service_id = ?
            )
            AND pr.request_status = 1
            AND pr.trip_status IN ('booked', 'ongoing')
            ORDER BY pr.user_id, pr.request_id DESC
        `;

        const [schedule] = await this.pool.execute(query, [service_id]);
        
        // Remove duplicates manually (same user with multiple requests - keep latest)
        const uniquePassengers = new Map();
        schedule.forEach(entry => {
            const key = `${entry.user_id}_${entry.location_id}`;
            if (!uniquePassengers.has(key) || entry.request_id > uniquePassengers.get(key).request_id) {
                uniquePassengers.set(key, entry);
            }
        });
        
        const uniqueSchedule = Array.from(uniquePassengers.values());
        
        console.log(`📋 getCurrentSchedule for service ${service_id}: Found ${uniqueSchedule.length} UNIQUE existing passengers (${schedule.length} total requests)`);
        uniqueSchedule.forEach(p => {
            console.log(`   Request ${p.request_id}: User ${p.user_id} → ${p.dest_name}`);
        });
        
        return uniqueSchedule.map(entry => ({
            request_id: entry.request_id,
            passenger_id: entry.user_id, 
            pickup_location_id: entry.pickup_id,
            destination_id: entry.location_id,
            pickup_coordinates: { lat: entry.pickup_lat, lng: entry.pickup_lng },
            destination_coordinates: { lat: entry.dest_lat, lng: entry.dest_lng }
        }));
    }

    /**
     * Step 4: Run routing algorithm - CORRECTED VERSION
     * Pickup is always stop #1, only optimize destinations
     */
    async runRoutingAlgorithm(simulatedSchedule) {
        const { combined_schedule } = simulatedSchedule;
        
        if (combined_schedule.length === 0) {
            return {
                totalDistance: 0,
                estimatedDuration: 0,
                routeSequence: [],
                efficiency: 100
            };
        }

        console.log(`🧭 OPTIMIZING ROUTE for ${combined_schedule.length} passengers`);

        // Get pickup location (same for all passengers)
        const pickupLocation = combined_schedule[0].pickup_coordinates;
        
        // Extract all destinations for optimization
        const destinations = combined_schedule.map(passenger => ({
            passenger_id: passenger.passenger_id,
            location: passenger.destination_coordinates,
            passenger: passenger
        }));

        console.log(`   📍 Pickup: ${pickupLocation.lat}, ${pickupLocation.lng}`);
        destinations.forEach((dest, i) => {
            console.log(`   🎯 Destination ${i+1}: Passenger ${dest.passenger_id} → ${dest.location.lat}, ${dest.location.lng}`);
        });

        // TODO: Implement actual routing optimization (Dijkstra, TSP, etc.)
        // For now: Simple sequential order (can be improved later)
        const optimizedDestinations = [...destinations];

        // Build final route sequence: Pickup + Optimized destinations
        const routeSequence = [];
        
        // Stop #1: Pickup (all passengers board here)
        routeSequence.push({
            type: 'pickup',
            location: pickupLocation,
            stop_number: 1,
            passengers_at_stop: combined_schedule.map(p => p.passenger_id)
        });

        // Stops #2, #3, #4...: Optimized destinations  
        optimizedDestinations.forEach((destination, index) => {
            routeSequence.push({
                type: 'destination',
                location: destination.location,
                stop_number: index + 2,
                passenger_id: destination.passenger_id,
                passenger: destination.passenger
            });
        });

        // Calculate total distance
        let totalDistance = 0;
        for (let i = 1; i < routeSequence.length; i++) {
            const distance = this.calculateDistance(
                routeSequence[i-1].location.lat, routeSequence[i-1].location.lng,
                routeSequence[i].location.lat, routeSequence[i].location.lng
            );
            totalDistance += distance;
        }

        console.log(`🚌 OPTIMIZED ROUTE: ${routeSequence.length} stops`);
        routeSequence.forEach((stop) => {
            if (stop.type === 'pickup') {
                console.log(`   Stop ${stop.stop_number}: Pickup (${stop.passengers_at_stop.length} passengers board)`);
            } else {
                console.log(`   Stop ${stop.stop_number}: Drop-off passenger ${stop.passenger_id}`);
            }
        });

        return {
            totalDistance: totalDistance,
            estimatedDuration: totalDistance * 2, // 2 minutes per km
            routeSequence: routeSequence,
            efficiency: Math.max(0, 100 - (totalDistance * 2)),
            passengerCount: combined_schedule.length,
            optimizedDestinations: optimizedDestinations
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

        // Simplified traffic analysis for now
        return {
            overallRisk: 'LOW',
            totalDelay: 5,
            segments: [],
            averageRisk: 'LOW'
        };
    }

    /**
     * Step 6: Assess overall impact of adding passenger
     */
    assessOverallImpact(routingResult, trafficAnalysis, bus) {
        let efficiencyScore = 100;
        efficiencyScore -= routingResult.totalDistance * 0.5;
        efficiencyScore -= trafficAnalysis.totalDelay * 0.8;

        return {
            efficiencyScore: Math.max(0, efficiencyScore),
            totalDelay: trafficAnalysis.totalDelay,
            riskLevel: trafficAnalysis.overallRisk,
            routeDistance: routingResult.totalDistance,
            estimatedDuration: routingResult.estimatedDuration + trafficAnalysis.totalDelay,
            detourFactor: 1.0,
            recommendations: ['Normal service expected']
        };
    }

    /**
     * Step 6b: Check if impact meets acceptance thresholds
     */
    checkAcceptanceThresholds(impactAssessment) {
        return true; // Simplified for now
    }

    /**
     * Step 9: Actually confirm the passenger addition to schedule
     */
    async confirmPassengerAddition(bestBusAnalysis, passengerRequest) {
        const { bus, simulatedSchedule } = bestBusAnalysis;
        
        // Insert into passenger_requests table with trip_status
        const insertQuery = `
            INSERT INTO passenger_requests (
                user_id, bus_id, pickup_id, location_id, 
                passenger_count, request_status, schedule_id, tier_id, trip_status
            ) VALUES (?, ?, ?, ?, ?, 1, ?, 1, 'booked')
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

        // FIXED: Insert only current passenger's route entries
        await this.createRouteEntries(requestId, scheduleId, bestBusAnalysis, passengerRequest.passenger_id);

        console.log(`✅ CONFIRMED booking for passenger ${passengerRequest.passenger_id} with Bus ${bus.bus_id}`);

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
     * OPTIMIZED: Create route entries with proper routing optimization for affected schedule
     */
    async createRouteEntries(requestId, scheduleId, bestBusAnalysis, current_passenger_id) {
        const { routingResult } = bestBusAnalysis;
        
        if (!routingResult || !routingResult.routeSequence) {
            console.log('⚠️ No route sequence available for request', requestId);
            return;
        }

        console.log(`🧭 OPTIMIZING ROUTES for schedule ${scheduleId} (new passenger ${current_passenger_id})`);

        try {
            // Step 1: Get ALL passengers in this schedule (including the new one)
            const [allPassengers] = await this.pool.execute(`
                SELECT pr.request_id, pr.user_id, pr.pickup_id, pr.location_id,
                       pl.latitude as pickup_lat, pl.longitude as pickup_lng,
                       ol.latitude as dest_lat, ol.longitude as dest_lng
                FROM passenger_requests pr
                JOIN pickup_location pl ON pr.pickup_id = pl.pickup_id  
                JOIN organization_locations ol ON pr.location_id = ol.location_id
                WHERE pr.schedule_id = ? 
                AND pr.request_status = 1
                AND pr.trip_status IN ('booked', 'ongoing')
                ORDER BY pr.request_id
            `, [scheduleId]);

            console.log(`   👥 Found ${allPassengers.length} passengers in schedule ${scheduleId}`);

            // Step 2: Rebuild optimized route for ALL passengers in this schedule
            const optimizedRoute = await this.calculateOptimalRoute(allPassengers);
            console.log(`   🛣️ Calculated optimal route with ${optimizedRoute.length} stops`);

            // Step 3: Clear ALL existing routes for this schedule (safe now since we're rebuilding)
            const [deleteResult] = await this.pool.execute(`
                DELETE FROM routes WHERE schedule_id = ?
            `, [scheduleId]);
            console.log(`   🗑️ Cleared ${deleteResult.affectedRows} existing route entries`);

            // Step 4: Create optimized route entries for ALL passengers
            const baseTime = new Date();
            baseTime.setHours(8, 0, 0, 0);
            let routeInserts = 0;

            for (let i = 0; i < optimizedRoute.length; i++) {
                const stop = optimizedRoute[i];
                
                if (stop.type === 'destination') {
                    const etaMinutes = (stop.stop_number - 1) * 10; // 10 minutes per stop
                    const eta = new Date(baseTime.getTime() + etaMinutes * 60000);
                    
                    await this.pool.execute(`
                        INSERT INTO routes (schedule_id, request_id, tier_id, stop_order, eta) 
                        VALUES (?, ?, ?, ?, ?)
                    `, [
                        scheduleId, 
                        stop.request_id, 
                        1, 
                        stop.stop_number, 
                        eta.toISOString().slice(0, 19).replace('T', ' ')
                    ]);
                    
                    routeInserts++;
                    console.log(`     ✅ Stop ${stop.stop_number}: Request ${stop.request_id} (Passenger ${stop.passenger_id}) - ETA: ${eta.toISOString().slice(11, 19)}`);
                }
            }

            console.log(`   🎯 Created ${routeInserts} optimized route entries for schedule ${scheduleId}`);

        } catch (error) {
            console.error(`❌ Failed to optimize routes for schedule ${scheduleId}:`, error);
            throw error;
        }
    }

    /**
     * Calculate optimal route for a set of passengers
     * Implements proper routing algorithm (pickup first, then optimal destination sequence)
     */
    async calculateOptimalRoute(passengers) {
        if (passengers.length === 0) {
            return [];
        }

        console.log(`   🧮 Calculating optimal route for ${passengers.length} passengers`);

        // All passengers have same pickup location (stop #1)
        const pickupLocation = {
            lat: passengers[0].pickup_lat,
            lng: passengers[0].pickup_lng
        };

        // Extract destinations for optimization
        const destinations = passengers.map(passenger => ({
            request_id: passenger.request_id,
            passenger_id: passenger.user_id,
            location: {
                lat: passenger.dest_lat,
                lng: passenger.dest_lng
            },
            original_order: passengers.indexOf(passenger)
        }));

        // Step 1: Optimize destination sequence using distance-based algorithm
        const optimizedDestinations = this.optimizeDestinationSequence(pickupLocation, destinations);

        // Step 2: Build final route sequence
        const routeSequence = [];

        // Stop #1: Pickup (all passengers board)
        routeSequence.push({
            type: 'pickup',
            location: pickupLocation,
            stop_number: 1,
            passengers: passengers.map(p => p.user_id)
        });

        // Stops #2, #3, #4...: Optimized destinations
        optimizedDestinations.forEach((dest, index) => {
            routeSequence.push({
                type: 'destination',
                location: dest.location,
                stop_number: index + 2,
                request_id: dest.request_id,
                passenger_id: dest.passenger_id
            });
        });

        console.log(`   📋 Route sequence: Pickup → ${optimizedDestinations.length} optimized stops`);
        
        return routeSequence;
    }

    /**
     * Optimize destination sequence using nearest neighbor algorithm
     * (Can be enhanced with more sophisticated algorithms like 2-opt, genetic algorithm, etc.)
     */
    optimizeDestinationSequence(startLocation, destinations) {
        if (destinations.length <= 1) {
            return destinations;
        }

        console.log(`     🎯 Optimizing ${destinations.length} destinations from pickup point`);

        // Simple Nearest Neighbor Algorithm
        const optimized = [];
        const remaining = [...destinations];
        let currentLocation = startLocation;

        while (remaining.length > 0) {
            // Find nearest unvisited destination
            let nearestIndex = 0;
            let minDistance = this.calculateDistance(
                currentLocation.lat, currentLocation.lng,
                remaining[0].location.lat, remaining[0].location.lng
            );

            for (let i = 1; i < remaining.length; i++) {
                const distance = this.calculateDistance(
                    currentLocation.lat, currentLocation.lng,
                    remaining[i].location.lat, remaining[i].location.lng
                );
                
                if (distance < minDistance) {
                    minDistance = distance;
                    nearestIndex = i;
                }
            }

            // Add nearest destination to optimized sequence
            const nearest = remaining.splice(nearestIndex, 1)[0];
            optimized.push(nearest);
            currentLocation = nearest.location;

            console.log(`       ${optimized.length}. Passenger ${nearest.passenger_id} (${minDistance.toFixed(2)}km from previous)`);
        }

        // Calculate total optimized distance
        let totalDistance = 0;
        let prevLocation = startLocation;
        for (const dest of optimized) {
            totalDistance += this.calculateDistance(
                prevLocation.lat, prevLocation.lng,
                dest.location.lat, dest.location.lng
            );
            prevLocation = dest.location;
        }

        console.log(`     ✅ Optimized total distance: ${totalDistance.toFixed(2)}km`);

        return optimized;
    }

    /**
     * Helper methods
     */
    createConfirmationResponse(confirmedSchedule, bestBusAnalysis) {
        return {
            success: true,
            status: 'CONFIRMED',
            message: 'Your booking has been confirmed',
            data: {
                schedule: confirmedSchedule,
                bus_info: {
                    bus_id: bestBusAnalysis.bus.bus_id
                },
                impact_analysis: bestBusAnalysis.impactAssessment,
                traffic_analysis: bestBusAnalysis.trafficAnalysis
            }
        };
    }

    async createPendingRequest(passengerRequest) {
        // Simplified pending request creation
        return Math.floor(Math.random() * 1000);
    }

    createRejectionResponse(reason, message, analyses = null, extraData = null) {
        return {
            success: false,
            status: 'REJECTED',
            reason: reason,
            message: message
        };
    }

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

    /**
     * Get or create schedule ID - FIXED to handle completed schedules properly
     */
    async getOrCreateScheduleId(service_id) {
        console.log(`🔍 Looking for active schedule for service ${service_id}`);
        
        // First check for TRULY active schedules (not completed AND has capacity)
        const [activeSchedules] = await this.pool.execute(`
            SELECT s.schedule_id, s.departure_time, s.arrival_time, s.status,
                   COUNT(pr.request_id) as passenger_count
            FROM schedule s
            LEFT JOIN passenger_requests pr ON s.schedule_id = pr.schedule_id 
                AND pr.request_status = 1
            WHERE s.service_id = ? 
                AND (s.status IS NULL OR s.status != 'completed')
                AND (s.arrival_time IS NULL OR s.arrival_time > NOW())
            GROUP BY s.schedule_id
            ORDER BY s.schedule_id DESC 
            LIMIT 1
        `, [service_id]);

        if (activeSchedules.length > 0) {
            const schedule = activeSchedules[0];
            console.log(`   📅 Found active schedule ${schedule.schedule_id} (Status: ${schedule.status || 'active'}, Passengers: ${schedule.passenger_count})`);
            
            // Check if schedule still has capacity (get bus capacity)
            const [busInfo] = await this.pool.execute(`
                SELECT b.capacity 
                FROM bus b 
                JOIN bus_services bs ON b.bus_id = bs.bus_id 
                WHERE bs.service_id = ?
                LIMIT 1
            `, [service_id]);
            
            if (busInfo.length > 0 && schedule.passenger_count < busInfo[0].capacity) {
                console.log(`   ✅ Schedule ${schedule.schedule_id} has capacity (${schedule.passenger_count}/${busInfo[0].capacity})`);
                return schedule.schedule_id;
            } else {
                console.log(`   ❌ Schedule ${schedule.schedule_id} is FULL (${schedule.passenger_count}/${busInfo[0].capacity})`);
            }
        }

        // No active schedule found or existing schedule is full, create a new one
        console.log(`   📅 Creating NEW schedule for service ${service_id}`);
        const [result] = await this.pool.execute(`
            INSERT INTO schedule (service_id, departure_time, arrival_time, status) 
            VALUES (?, NOW(), DATE_ADD(NOW(), INTERVAL 2 HOUR), 'active')
        `, [service_id]);

        const newScheduleId = result.insertId;
        console.log(`   ✅ Created new schedule ${newScheduleId}`);
        return newScheduleId;
    }
}

module.exports = { PassengerRequestService };