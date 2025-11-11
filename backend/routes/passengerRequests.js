const express = require('express');
const router = express.Router();
const { PassengerRequestService } = require('../services/passengerRequestService');

/**
 * Passenger Request API with Complete Workflow
 * Uses PassengerRequestService for routing, traffic analysis, and processing
 */

/**
 * Primary passenger request processing endpoint
 * POST /api/passenger-requests/process
 */
router.post('/process', async (req, res) => {
    console.log('🔍 Processing passenger request:', JSON.stringify(req.body, null, 2));
    
    const pool = req.app.get('pool');

    try {
        // Extract and validate fields
        const { 
            passenger_id, 
            pickup_location_id, 
            destination_id, 
            passenger_count,
            requested_pickup_time
        } = req.body;

        console.log(`📝 Processing: user_id=${passenger_id}, pickup_id=${pickup_location_id}, location_id=${destination_id}, passenger_count=${passenger_count}`);

        // Validate required fields
        if (!passenger_id || !pickup_location_id || !destination_id) {
            console.log('Validation failed: missing fields');
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: passenger_id, pickup_location_id, destination_id'
            });
        }

        console.log('Validation passed, using PassengerRequestService...');

        // Use PassengerRequestService for complete processing
        const requestService = new PassengerRequestService(pool);
        
        const passengerRequest = {
            passenger_id,
            pickup_location_id,
            destination_id,
            passenger_count: passenger_count || 1,
            requested_pickup_time: requested_pickup_time || new Date().toISOString()
        };

        const result = await requestService.processPassengerRequest(passengerRequest);
        
        if (result.success) {
            console.log(`✅ SUCCESS: Request processed successfully`);

            return res.status(200).json({
                success: true,
                status: 'CONFIRMED',
                message: 'Booking approved!',
                request_id: result.data.schedule.request_id,
                schedule_id: result.data.schedule.schedule_id,
                bus_id: result.data.schedule.bus_id,
                busDetails: result.data.bus_info,
                routeDetails: {
                    estimated_duration: result.data.impact_analysis.estimatedDuration,
                    traffic_delay: result.data.traffic_analysis.expected_delay,
                    risk_level: result.data.traffic_analysis.risk_level
                },
                timing: result.data.estimated_times
            });
            
        } else {
            console.log('Request rejected:', result.reason);
            
            return res.status(409).json({
                success: false,
                status: 'REJECTED',
                reason: result.reason,
                message: result.message,
                analysis: result.analysis_summary || null
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
        const { trafficAwarenessService } = require('../services/trafficAwarenessService');
        
        const enhancedBookings = await Promise.all(bookings.map(async (booking) => {
            try {
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
            'UPDATE schedule SET status = "cancelled" WHERE schedule_id = ? AND passenger_id = ? AND status = "confirmed"',
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
    try {
        const requestService = new PassengerRequestService(null);
        const { trafficAwarenessService } = require('../services/trafficAwarenessService');
        
        res.json({
            success: true,
            data: {
                acceptance_thresholds: requestService.acceptanceThresholds,
                traffic_service_status: trafficAwarenessService.getServiceStatus(),
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
    } catch (error) {
        console.error('Error getting system info:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
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

module.exports = router;