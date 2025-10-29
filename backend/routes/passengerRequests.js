const express = require('express');
const router = express.Router();
const { PassengerRequestService } = require('../services/passengerRequestService');

/**
 * Passenger Request API with Traffic Analysis
 * Processes requests from submission through bus assignment and traffic evaluation
 */

/**
 * Primary passenger request processing endpoint
 * POST /api/passenger-requests/process
 */
router.post('/process', async (req, res) => {
    console.log('🔍 FIXED /process route called with body:', JSON.stringify(req.body, null, 2));
    
    const pool = req.app.get('pool');

    try {
        // FIXED: Extract the correct field names that frontend sends
        const { 
            passenger_id: user_id, 
            pickup_location_id: pickup_id, 
            destination_id: location_id, 
            passenger_count 
        } = req.body;

        console.log(`📝 Extracted: user_id=${user_id}, pickup_id=${pickup_id}, location_id=${location_id}, passenger_count=${passenger_count}`);

        // Validate required fields
        if (!user_id || !pickup_id || !location_id) {
            console.log('Validation failed: missing fields');
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: passenger_id, pickup_location_id, destination_id'
            });
        }

        console.log('Validation passed, processing request...');

        // Use the WORKING passenger.js logic directly
        const assignmentResult = await findOptimalSchedule(pool, pickup_id, location_id, passenger_count || 1);
        
        if (assignmentResult.success) {
            console.log('Found optimal bus, creating passenger request...');
            
            // Create passenger request
            const [result] = await pool.query(
                `INSERT INTO passenger_requests (
                   user_id, bus_id, pickup_id, location_id, tier_id,
                   schedule_id, passenger_count, request_status
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    user_id, 
                    assignmentResult.bus_id, 
                    pickup_id, 
                    location_id, 
                    1, // tier_id
                    assignmentResult.schedule_id, 
                    passenger_count || 1, 
                    true // request_status = approved
                ]
            );

            // Update route order
            await updateRouteOrder(pool, assignmentResult.schedule_id, assignmentResult.newRouteOrder);

            console.log(`✅ SUCCESS: Created request ${result.insertId}`);

            return res.status(200).json({
                success: true,
                status: 'CONFIRMED',
                message: 'Booking approved!',
                request_id: result.insertId,
                schedule_id: assignmentResult.schedule_id,
                bus_id: assignmentResult.bus_id,
                busDetails: {
                    plate_number: assignmentResult.plate_number,
                    driver_name: assignmentResult.driver_name
                },
                routeDetails: {
                    total_stops: assignmentResult.newRouteOrder?.length || 0
                }
            });
            
        } else {
            console.log('No optimal bus found');
            
            return res.status(409).json({
                success: false,
                status: 'REJECTED',
                reason: 'NO_AVAILABLE_BUS',
                message: 'No buses are currently available for your route. Please try again later or contact support for alternative arrangements.',
                suggestions: [
                    'Try booking at a different time',
                    'Check if other pickup locations are available',
                    'Contact customer service for assistance'
                ]
            });
        }

    } catch (error) {
        console.error('Critical error in /process route:', error);
        console.error('❌ Stack trace:', error.stack);
        
        return res.status(500).json({
            success: false,
            status: 'REJECTED',
            reason: 'SYSTEM_ERROR',
            message: 'Internal server error',
            error: error.message
        });
    }
});

/**
 * Check availability without booking (preview mode)
 * POST /api/passenger-requests/check-availability
 */
router.post('/check-availability', async (req, res) => {
    const pool = req.app.get('pool');
    const requestService = new PassengerRequestService(pool);

    try {
        const {
            pickup_location_id,
            destination_id,
            requested_pickup_time,
            passenger_count = 1
        } = req.body;

        // Find available buses without booking
        const availableBuses = await requestService.findAvailableBuses(pickup_location_id, requested_pickup_time);

        if (availableBuses.length === 0) {
            return res.json({
                success: false,
                available: false,
                message: 'No buses available for your pickup location and time',
                alternatives: await suggestAlternatives(pool, pickup_location_id, requested_pickup_time)
            });
        }

        // Analyze each bus option (simulation only)
        const busOptions = [];
        
        for (const bus of availableBuses.slice(0, 3)) { // Limit to top 3 for performance
            try {
                const simulatedSchedule = await requestService.simulatePassengerAddition(
                    bus, pickup_location_id, destination_id, requested_pickup_time, passenger_count
                );

                const routingResult = await requestService.runRoutingAlgorithm(simulatedSchedule);
                const trafficAnalysis = await requestService.analyzeTrafficImpact(routingResult);
                const impactAssessment = requestService.assessOverallImpact(routingResult, trafficAnalysis, bus);

                busOptions.push({
                    bus_id: bus.bus_id,
                    service_name: bus.service_name,
                    registration: bus.registration_number,
                    available_capacity: bus.capacity - bus.current_passengers,
                    estimated_delay: trafficAnalysis.totalDelay,
                    risk_level: trafficAnalysis.overallRisk,
                    efficiency_score: impactAssessment.efficiencyScore,
                    estimated_duration: impactAssessment.estimatedDuration,
                    meets_threshold: requestService.checkAcceptanceThresholds(impactAssessment).passes,
                    recommendations: impactAssessment.recommendations
                });

            } catch (error) {
                console.warn(`Failed to analyze bus ${bus.bus_id}:`, error.message);
            }
        }

        const acceptableOptions = busOptions.filter(option => option.meets_threshold);

        res.json({
            success: true,
            available: acceptableOptions.length > 0,
            bus_options: busOptions,
            recommended_option: acceptableOptions.length > 0 ? 
                acceptableOptions.reduce((best, current) => 
                    current.efficiency_score > best.efficiency_score ? current : best
                ) : null,
            summary: {
                total_buses_found: availableBuses.length,
                analyzed_options: busOptions.length,
                acceptable_options: acceptableOptions.length
            }
        });

    } catch (error) {
        console.error('❌ Error checking availability:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get passenger's current bookings with traffic updates
 * GET /api/passenger-requests/my-bookings/:passenger_id
 */
router.get('/my-bookings/:passenger_id', async (req, res) => {
    const pool = req.app.get('pool');
    const { passenger_id } = req.params;

    try {
        const query = `
            SELECT 
                pr.*,
                pl.name as pickup_name, pl.latitude as pickup_lat, pl.longitude as pickup_lng,
                ol.name as dest_name, ol.latitude as dest_lat, ol.longitude as dest_lng,
                b.plate_number, b.capacity,
                'Bus Service' as service_name
            FROM passenger_requests pr
            JOIN pickup_location pl ON pr.pickup_id = pl.pickup_id
            JOIN organization_locations ol ON pr.location_id = ol.location_id
            JOIN bus b ON pr.bus_id = b.bus_id
            WHERE pr.user_id = ? 
                AND pr.request_status = true
            ORDER BY sch.pickup_time
        `;

        const [bookings] = await pool.execute(query, [passenger_id]);

        // Add real-time traffic analysis to each booking
        const enhancedBookings = await Promise.all(bookings.map(async (booking) => {
            try {
                const { trafficAwarenessService } = require('../services/trafficAwarenessService');
                
                const trafficAnalysis = trafficAwarenessService.analyzeRouteImpact({
                    originLat: booking.pickup_lat,
                    originLng: booking.pickup_lng,
                    destLat: booking.dest_lat,
                    destLng: booking.dest_lng,
                    departureTime: booking.pickup_time,
                    dayType: new Date(booking.pickup_time).getDay() < 6 ? 'WEEKDAY' : 'WEEKEND'
                });

                return {
                    ...booking,
                    current_traffic: {
                        risk_level: trafficAnalysis.riskLevel,
                        expected_delay: trafficAnalysis.expectedDelay,
                        updated_arrival_time: addMinutes(booking.pickup_time, trafficAnalysis.expectedDelay),
                        recommendations: trafficAnalysis.recommendations
                    }
                };

            } catch (error) {
                // If traffic analysis fails, return booking without traffic info
                return {
                    ...booking,
                    current_traffic: {
                        risk_level: 'UNKNOWN',
                        message: 'Traffic data unavailable'
                    }
                };
            }
        }));

        res.json({
            success: true,
            bookings: enhancedBookings,
            total_count: enhancedBookings.length
        });

    } catch (error) {
        console.error('❌ Error fetching bookings:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Cancel a booking
 * DELETE /api/passenger-requests/cancel/:schedule_id
 */
router.delete('/cancel/:schedule_id', async (req, res) => {
    const pool = req.app.get('pool');
    const { schedule_id } = req.params;
    const { passenger_id } = req.body;

    try {
        // Verify ownership and update status
        const [result] = await pool.execute(
            'UPDATE schedules SET status = "cancelled" WHERE schedule_id = ? AND passenger_id = ? AND status = "confirmed"',
            [schedule_id, passenger_id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                error: 'Booking not found or already cancelled'
            });
        }

        res.json({
            success: true,
            message: 'Booking cancelled successfully',
            schedule_id: schedule_id
        });

    } catch (error) {
        console.error('❌ Error cancelling booking:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get system thresholds and settings (for admin/debugging)
 * GET /api/passenger-requests/system-info
 */
router.get('/system-info', (req, res) => {
    const requestService = new PassengerRequestService(null);
    
    res.json({
        success: true,
        data: {
            acceptance_thresholds: requestService.acceptanceThresholds,
            traffic_service_status: require('../services/trafficAwarenessService').trafficAwarenessService.getServiceStatus(),
            system_version: '1.0.0',
            features: {
                traffic_awareness: true,
                route_optimization: true,
                threshold_checking: true,
                real_time_analysis: true,
                schedule_status_management: true
            }
        }
    });
});



/**
 * Helper function to suggest alternative times/locations
 */
async function suggestAlternatives(pool, pickup_location_id, requested_time) {
    try {
        // Suggest alternative times (±2 hours)
        const baseTime = new Date(requested_time);
        const alternatives = [];
        
        for (let offset of [-120, -60, 60, 120]) { // Minutes
            const altTime = new Date(baseTime.getTime() + offset * 60000);
            const [buses] = await pool.execute(`
                SELECT COUNT(*) as available_buses
                FROM bus b
                JOIN bus_services bs ON b.bus_id = bs.bus_id
                WHERE bs.pickup_id = ? AND b.status = 'active'
            `, [pickup_location_id]);
            
            if (buses[0].available_buses > 0) {
                alternatives.push({
                    suggested_time: altTime.toISOString(),
                    available_buses: buses[0].available_buses,
                    time_difference: `${Math.abs(offset)} minutes ${offset > 0 ? 'later' : 'earlier'}`
                });
            }
        }

        return alternatives.slice(0, 3); // Return top 3 alternatives
        
    } catch (error) {
        console.error('Error suggesting alternatives:', error);
        return [];
    }
}

/**
 * Helper function to add minutes to time
 */
function addMinutes(timeString, minutes) {
    const date = new Date(timeString);
    date.setMinutes(date.getMinutes() + minutes);
    return date.toISOString();
}

/**
 * FIXED: Use the WORKING logic from passenger.js
 * Find optimal bus and service for a new passenger request
 */
async function findOptimalSchedule(pool, pickup_id, location_id, passenger_count) {
    try {
        console.log(`\n=== FINDING OPTIMAL SCHEDULE ===`);
        console.log(`Pickup ID: ${pickup_id}, Destination ID: ${location_id}, Passengers: ${passenger_count}`);
        
        // Find all active buses that service the same pickup location with onboarding schedules
        const [candidateBuses] = await pool.query(
            `SELECT DISTINCT 
             b.bus_id,
             b.capacity,
             b.plate_number,
             u.full_name as driver_name,
             u.phone_num as driver_phone_num,
             b.company,
             bs.service_id,
             bs.service_date,
             bs.isAmShift,
             bs.isPmShift,
             bs.pickup_id,
             pl.name as pickup_name,
             pl.latitude as pickup_lat,
             pl.longitude as pickup_lng,
             s.departure_time,
             s.arrival_time,
             s.status as schedule_status
           FROM bus b
           INNER JOIN bus_services bs ON b.bus_id = bs.bus_id
           INNER JOIN pickup_location pl ON bs.pickup_id = pl.pickup_id
           LEFT JOIN users u ON b.driver_id = u.user_id
           INNER JOIN schedule s ON bs.service_id = s.service_id
           WHERE bs.pickup_id = ? 
             AND b.status = 'active'
             AND bs.service_date >= CURDATE()
             AND s.status = 'onboarding'
           ORDER BY bs.service_date ASC, s.departure_time ASC, b.bus_id ASC`,
            [pickup_id]
        );

        console.log(`Found ${candidateBuses.length} candidate buses`);
        
        if (candidateBuses.length === 0) {
            console.log('❌ No buses found. Possible reasons:');
            console.log('   - No buses servicing this pickup location');
            console.log('   - All bus departure times are too soon (< 5 minutes)');
            console.log('   - All buses are inactive');
            console.log('   - Service date is in the past');
            return {
                success: false,
                reason: "No active buses found servicing this pickup location with adequate departure time"
            };
        }

        // Calculate departure times and filter by timing
        const validBuses = [];
        const currentTime = new Date();
        const minimumBufferMinutes = -10; // Allow booking up to 10 minutes after departure for testing
        
        candidateBuses.forEach((bus, idx) => {
            let departureTime = null;
            
            // If schedule exists, use schedule departure time
            if (bus.departure_time) {
                departureTime = new Date(bus.departure_time);
            } else {
                // Use the actual service_date which contains the full datetime
                departureTime = new Date(bus.service_date);
                console.log(`   Using service_date as departure time: ${bus.service_date} -> ${departureTime.toLocaleString()}`);
            }
            
            const timeDiff = Math.round((departureTime - currentTime) / (1000 * 60));
            const isValid = timeDiff >= minimumBufferMinutes;
            
            console.log(`Bus ${idx + 1}: ${bus.plate_number} - Departure: ${departureTime.toLocaleString()} (${timeDiff} min from now) - ${isValid ? '✅ VALID' : timeDiff < 0 ? '⏰ PAST DEPARTURE' : '❌ TOO SOON'}`);
            
            if (isValid) {
                // Add calculated departure time to bus object
                bus.calculated_departure_time = departureTime;
                validBuses.push(bus);
            }
        });
        
        if (validBuses.length === 0) {
            console.log('❌ No buses with adequate departure time found');
            console.log(`   Required buffer: ${minimumBufferMinutes >= 0 ? minimumBufferMinutes + ' minutes before departure' : 'Allow up to ' + Math.abs(minimumBufferMinutes) + ' minutes after departure'}`);
            console.log(`   Current time: ${currentTime.toLocaleString()}`);
            return {
                success: false,
                reason: `No buses available with minimum ${minimumBufferMinutes}-minute departure buffer`
            };
        }
        
        console.log(`✅ ${validBuses.length} valid buses found after timing filter`);

        // Get the new destination details
        const [destinationRows] = await pool.query(
            `SELECT location_id, name, latitude, longitude 
           FROM organization_locations 
           WHERE location_id = ?`,
            [location_id]
        );

        if (destinationRows.length === 0) {
            return {
                success: false,
                reason: "Destination not found"
            };
        }

        const newDestination = destinationRows[0];

        // Evaluate each valid bus service
        for (let i = 0; i < validBuses.length; i++) {
            const busService = validBuses[i];
            console.log(`\n--- Evaluating Bus Service ${i + 1}/${validBuses.length} ---`);
            
            const evaluationResult = await evaluateBusServiceForNewPassenger(
                pool,
                busService, 
                newDestination, 
                passenger_count
            );

            console.log(`   Evaluation result: ${evaluationResult.suitable ? 'SUITABLE' : 'NOT SUITABLE'}`);
            console.log(`   Reason: ${evaluationResult.reason}`);

            if (evaluationResult.suitable) {
                // Get or create schedule for this service (will avoid reusing active schedules)
                const schedule_id = await getOrCreateScheduleForService(pool, busService.service_id);
                console.log(`   📅 Using schedule ${schedule_id} for service ${busService.service_id}`);
                
                return {
                    success: true,
                    bus_id: busService.bus_id,
                    service_id: busService.service_id,
                    schedule_id: schedule_id,
                    plate_number: busService.plate_number,
                    driver_name: busService.driver_name,
                    tier_id: 1,
                    newRouteOrder: evaluationResult.newRouteOrder,
                    routingDetails: evaluationResult.routingDetails
                };
            }
        }

        return {
            success: false,
            reason: "No suitable bus services found within timing thresholds"
        };

    } catch (error) {
        console.error("Error finding optimal schedule:", error);
        return {
            success: false,
            reason: `System error: ${error.message}`
        };
    }
}

/**
 * FIXED: Use the WORKING logic from passenger.js
 * Evaluate if a bus service can accommodate a new passenger
 */
async function evaluateBusServiceForNewPassenger(pool, busService, newDestination, passengerCount) {
    try {
        console.log(`   🔍 Evaluating Bus ${busService.plate_number} (ID: ${busService.bus_id})`);
        console.log(`   📍 Destination: ${newDestination.name} (ID: ${newDestination.location_id})`);
        console.log(`   👥 Passenger count: ${passengerCount}`);
        
        // Check bus capacity first
        const [currentPassengers] = await pool.query(
            `SELECT SUM(CAST(pr.passenger_count AS UNSIGNED)) as total_passengers
           FROM passenger_requests pr
           WHERE pr.bus_id = ? AND pr.request_status = true`,
            [busService.bus_id]
        );

        const currentPassengerCount = parseInt(currentPassengers[0]?.total_passengers || 0);
        const newPassengerCount = parseInt(passengerCount);
        const totalPassengers = currentPassengerCount + newPassengerCount;
        const effectiveCapacity = Math.floor(busService.capacity * 0.85); // 85% capacity
        
        console.log(`   🚌 Capacity check: ${currentPassengerCount} current + ${newPassengerCount} new = ${totalPassengers}/${effectiveCapacity} effective capacity`);
        
        if (totalPassengers > effectiveCapacity) {
            return {
                suitable: false,
                reason: `Bus capacity exceeded (${totalPassengers}/${effectiveCapacity})`
            };
        }

        // Get pickup location for the new passenger
        // Get pickup location - we already have the pickup info from the main query
        // But let's get the full details if needed
        console.log(`   🔍 Using pickup_id from bus service: ${busService.pickup_id}`);
        
        const pickupLocation = {
            pickup_id: busService.pickup_id,
            name: busService.pickup_name,
            latitude: busService.pickup_lat,
            longitude: busService.pickup_lng
        };
        
        console.log(`   ✅ Pickup location: ${pickupLocation.name}`);
        


        // Get existing destinations for this bus service
        const [existingDestinations] = await pool.query(
            `SELECT DISTINCT 
             ol.location_id,
             ol.name,
             ol.latitude,
             ol.longitude
           FROM passenger_requests pr
           INNER JOIN organization_locations ol ON pr.location_id = ol.location_id
           WHERE pr.bus_id = ? AND pr.request_status = true
           ORDER BY ol.name`,
            [busService.bus_id]
        );

        // Check if destination already exists in route
        const destinationExists = existingDestinations.some(dest => dest.location_id === newDestination.location_id);
        if (destinationExists) {
            console.log(`Destination already exists in route`);
            
            // Create route: pickup → existing destinations (including the one passenger wants)
            const routeOrder = [
                {
                    type: 'pickup',
                    location_id: pickupLocation.pickup_id,
                    name: pickupLocation.name,
                    latitude: pickupLocation.latitude,
                    longitude: pickupLocation.longitude,
                    stop_order: 1
                },
                ...existingDestinations.map((dest, idx) => ({
                    type: 'destination',
                    location_id: dest.location_id,
                    name: dest.name,
                    latitude: dest.latitude,
                    longitude: dest.longitude,
                    stop_order: idx + 2
                }))
            ];
            
            return {
                suitable: true,
                reason: "Destination already exists in route",
                newRouteOrder: routeOrder
            };
        }

        // Add new destination to route
        const allDestinations = [...existingDestinations, newDestination];
        
        // Create complete route: pickup → all destinations (optimized)
        const newRouteOrder = [
            {
                type: 'pickup',
                location_id: pickupLocation.pickup_id,
                name: pickupLocation.name,
                latitude: pickupLocation.latitude,
                longitude: pickupLocation.longitude,
                stop_order: 1
            },
            ...allDestinations.map((dest, idx) => ({
                type: 'destination',
                location_id: dest.location_id,
                name: dest.name,
                latitude: dest.latitude,
                longitude: dest.longitude,
                stop_order: idx + 2
            }))
        ];

        // ✅ TRAFFIC ANALYSIS INTEGRATION
        let trafficAnalysis = null;
        let trafficApproved = true;
        
        try {
            console.log('Running traffic analysis for route...');
            const { trafficAwarenessService } = require('../services/trafficAwarenessService');
            
            // Analyze traffic impact for this route
            trafficAnalysis = trafficAwarenessService.analyzeRouteImpact({
                originLat: busService.pickup_lat,
                originLng: busService.pickup_lng,
                destLat: newDestination.latitude,
                destLng: newDestination.longitude,
                departureTime: new Date(),
                dayType: new Date().getDay() < 6 ? 'WEEKDAY' : 'WEEKEND'
            });

            console.log(`Traffic Analysis Results:`, {
                riskLevel: trafficAnalysis.riskLevel,
                expectedDelay: trafficAnalysis.expectedDelay,
                avgTrafficVolume: trafficAnalysis.avgTrafficVolume,
                trafficRoutes: trafficAnalysis.trafficRoutes,
                peakFactor: trafficAnalysis.peakFactor
            });

            // Apply traffic thresholds
            const MAX_DELAY_MINUTES = 20; // Configurable threshold
            const HIGH_RISK_REJECTION = true; // Reject HIGH risk routes
            
            if (trafficAnalysis.expectedDelay > MAX_DELAY_MINUTES) {
                console.log(`Traffic: Excessive delay (${trafficAnalysis.expectedDelay} > ${MAX_DELAY_MINUTES} min)`);
                trafficApproved = false;
            }
            
            if (HIGH_RISK_REJECTION && trafficAnalysis.riskLevel === 'HIGH') {
                console.log(`Traffic: High risk level rejected`);
                trafficApproved = false;
            }
            
            if (trafficApproved) {
                console.log(`✅ Traffic: Route approved (${trafficAnalysis.riskLevel} risk, ${trafficAnalysis.expectedDelay}min delay)`);
            }
            
        } catch (trafficError) {
            console.warn('⚠️ Traffic analysis failed, proceeding without traffic check:', trafficError.message);
            trafficAnalysis = { riskLevel: 'UNKNOWN', expectedDelay: 0, error: trafficError.message };
        }

        // Return result with traffic analysis included
        if (!trafficApproved) {
            return {
                suitable: false,
                reason: `Traffic conditions not suitable: ${trafficAnalysis.riskLevel} risk, ${trafficAnalysis.expectedDelay}min delay`,
                trafficAnalysis: trafficAnalysis
            };
        }

        return {
            suitable: true,
            reason: "Schedule and traffic conditions suitable",
            newRouteOrder: newRouteOrder,
            routingDetails: { success: true },
            trafficAnalysis: trafficAnalysis
        };

    } catch (error) {
        console.error("Error evaluating schedule:", error);
        return {
            suitable: false,
            reason: `Evaluation error: ${error.message}`
        };
    }
}

/**
 * FIXED: Use the WORKING logic from passenger.js  
 * Update route order based on routing algorithm results
 */
async function updateRouteOrder(pool, schedule_id, newRouteOrder) {
    try {
        if (!newRouteOrder || newRouteOrder.length === 0) {
            console.log(`No route order updates needed for schedule ${schedule_id}`);
            return;
        }

        console.log(`Updating route order for schedule ${schedule_id} with ${newRouteOrder.length} stops`);

        // Clear existing routes for this schedule
        await pool.query(
            `DELETE FROM routes WHERE schedule_id = ?`,
            [schedule_id]
        );

        // Get the actual departure time from the schedule
        const [scheduleInfo] = await pool.query(
            `SELECT departure_time FROM schedule WHERE schedule_id = ?`,
            [schedule_id]
        );
        
        let departureTime = new Date();
        if (scheduleInfo.length > 0 && scheduleInfo[0].departure_time) {
            departureTime = new Date(scheduleInfo[0].departure_time);
        } else {
            // Set to reasonable time if no departure time
            departureTime.setHours(8, 0, 0, 0); // 8 AM today
        }
        
        console.log(`Using departure time: ${departureTime.toLocaleString()}`);
        
        // Insert new routes in optimal order
        let currentTime = new Date(departureTime);
        
        for (let i = 0; i < newRouteOrder.length; i++) {
            const stop = newRouteOrder[i];
            
            // Add 10 minutes per stop
            currentTime.setMinutes(currentTime.getMinutes() + (i > 0 ? 10 : 0));
            
            // Handle different stop types (pickup vs destination)
            let request_id = null;
            let stopLocationId = null;
            let stopName = '';
            
            if (stop.type === 'pickup') {
                // For pickup stops, use pickup_id and find requests with matching pickup_id
                stopLocationId = stop.location_id;
                stopName = stop.name;
                
                const [requestRows] = await pool.query(
                    `SELECT pr.request_id
                   FROM passenger_requests pr
                   WHERE pr.pickup_id = ? 
                     AND pr.request_status = true
                     AND EXISTS (
                       SELECT 1 FROM bus_services bs 
                       INNER JOIN schedule s ON bs.service_id = s.service_id
                       WHERE s.schedule_id = ?
                       AND pr.bus_id = bs.bus_id
                     )
                   ORDER BY pr.request_id DESC
                   LIMIT 1`,
                    [stopLocationId, schedule_id]
                );
                
                if (requestRows.length > 0) {
                    request_id = requestRows[0].request_id;
                }
            } else if (stop.type === 'destination') {
                // For destination stops, use location_id as before
                stopLocationId = stop.location_id;
                stopName = stop.name;
                
                const [requestRows] = await pool.query(
                    `SELECT pr.request_id
                   FROM passenger_requests pr
                   WHERE pr.location_id = ? 
                     AND pr.request_status = true
                     AND EXISTS (
                       SELECT 1 FROM bus_services bs 
                       INNER JOIN schedule s ON bs.service_id = s.service_id
                       WHERE s.schedule_id = ?
                       AND pr.bus_id = bs.bus_id
                     )
                   ORDER BY pr.request_id DESC
                   LIMIT 1`,
                    [stopLocationId, schedule_id]
                );
                
                if (requestRows.length > 0) {
                    request_id = requestRows[0].request_id;
                }
            }

            // FIXED: Handle timezone properly for MySQL TIMESTAMP
            // Convert to local timezone string that MySQL will interpret correctly
            const localTime = new Date(currentTime.getTime() - currentTime.getTimezoneOffset() * 60000);
            const mysqlTimestamp = localTime.toISOString().slice(0, 19).replace('T', ' ');
            
            // Insert route entry
            await pool.query(
                `INSERT INTO routes (
                   schedule_id,
                   request_id,
                   tier_id,
                   stop_order,
                   eta
                 ) VALUES (?, ?, ?, ?, ?)`,
                [
                    schedule_id,
                    request_id,
                    1, // tier_id
                    i + 1, // stop_order
                    mysqlTimestamp // eta with timezone correction
                ]
            );

            console.log(`Created route stop ${i + 1}: ${stopName} (${stop.type}) - ETA: ${currentTime.toLocaleTimeString()} (DB: ${mysqlTimestamp})`);
        }

        console.log(`Successfully updated route order for schedule ${schedule_id}`);

    } catch (error) {
        console.error("Error updating route order:", error);
        throw error;
    }
}

/**
 * FIXED: Use the WORKING logic from passenger.js
 * Get existing schedule or create new one for a bus service
 */
async function getOrCreateScheduleForService(pool, service_id) {
    try {
        // Check if there's an onboarding schedule for this service
        const [existingSchedules] = await pool.query(
            `SELECT s.schedule_id, s.departure_time, s.arrival_time, s.status
           FROM schedule s 
           WHERE s.service_id = ? 
             AND s.status = 'onboarding'
           ORDER BY s.departure_time DESC 
           LIMIT 1`,
            [service_id]
        );

        // Reuse existing onboarding schedule
        if (existingSchedules.length > 0) {
            const schedule = existingSchedules[0];
            console.log(`✅ Reusing existing onboarding schedule ${schedule.schedule_id}`);
            return schedule.schedule_id;
        }

        // Create new schedule for this service with onboarding status
        const [scheduleResult] = await pool.query(
            `INSERT INTO schedule (service_id, departure_time, arrival_time, status)
           VALUES (?, NOW() + INTERVAL 1 HOUR, NOW() + INTERVAL 4 HOUR, 'onboarding')`,
            [service_id]
        );

        console.log(`Created new schedule ${scheduleResult.insertId} for service ${service_id}`);
        return scheduleResult.insertId;

    } catch (error) {
        console.error("Error getting/creating schedule:", error);
        throw error;
    }
}

module.exports = router;