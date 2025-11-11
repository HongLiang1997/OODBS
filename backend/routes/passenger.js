const express = require("express");
const router = express.Router();
const RoutingService = require("../services/routingService");

// Configuration is now managed by RoutingService
let pool;
const routingService = new RoutingService();

// Middleware to inject the DB pool into router
router.use((req, res, next) => {
  if (!pool) pool = req.app.get("pool");
  next();
});

// GET /passenger/routing-config - Get current routing configuration
router.get("/routing-config", (req, res) => {
  const config = routingService.getConfig();
  res.json({
    config: config,
    description: {
      AVERAGE_SPEED_KMH: "Average driving speed for time calculations",
      METERS_PER_MINUTE: "Calculated meters per minute (derived from speed)",
      MAX_ROUTE_TIME_MINUTES: "Maximum total route duration",
      MAX_DETOUR_MINUTES: "Maximum additional time when adding new passenger",
      BOARDING_TIME_MINUTES: "Time allowance per stop for boarding/alighting",
      DEPARTURE_PREP_MINUTES: "Buffer time before departure (fallback only)",
      CAPACITY_BUFFER_PERCENT: "Reserve percentage of bus capacity"
    }
  });
});

// PUT /passenger/routing-config - Update routing configuration (for tweaking)
router.put("/routing-config", (req, res) => {
  const updates = req.body;
  const result = routingService.updateConfig(updates);
  
  res.json({
    message: "Routing configuration updated",
    updated: result.changes,
    newConfig: result.newConfig
  });
});

// GET /passenger/pickup-locations - Get all pickup locations
router.get("/pickup-locations", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT 
         pickup_id,
         name,
         type,
         latitude,
         longitude
       FROM pickup_location 
       ORDER BY name ASC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /passenger/destinations - Get all destinations
router.get("/destinations", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT 
         location_id,
         name,
         latitude,
         longitude
       FROM organization_locations
       ORDER BY name ASC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /passenger/requests/:user_id - Get passenger requests by user ID
router.get("/requests/:user_id", async (req, res) => {
  const { user_id } = req.params;
  try {
    const [rows] = await pool.query(
      `SELECT 
         pr.request_id,
         pr.user_id,
         pr.passenger_count,
         pr.request_status,
         pl.name as pickup_name,
         ol.name as destination_name
       FROM passenger_requests pr
       LEFT JOIN pickup_location pl ON pr.pickup_id = pl.pickup_id
       LEFT JOIN organization_locations ol ON pr.location_id = ol.location_id
       WHERE pr.user_id = ?
       ORDER BY pr.request_id DESC`,
      [user_id]
    );
    res.json(rows);
  } catch (err) {
    console.error("Error fetching passenger requests:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /passenger/requests - DEPRECATED - Use /api/passenger-requests/process instead
router.post("/requests", async (req, res) => {
  res.status(410).json({ 
    error: "This endpoint is deprecated. Use /api/passenger-requests/process instead.",
    redirect_to: "/api/passenger-requests/process",
    message: "The passenger request system has been consolidated to use the advanced routing and traffic awareness system."
  });
});

// PUT /passenger/profile/:user_id - Update passenger profile information
router.put("/profile/:user_id", async (req, res) => {
  const { user_id } = req.params;
  const { full_name, email, phone_num } = req.body;
  
  if (!user_id) {
    return res.status(400).json({ 
      error: "User ID is required" 
    });
  }

  try {
    // Update user information in users table
    const [userResult] = await pool.query(
      `UPDATE users 
       SET full_name = ?, email = ?, phone_num = ?
       WHERE user_id = ?`,
      [full_name, email, phone_num, user_id]
    );

    if (userResult.affectedRows === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ 
      message: "Profile updated successfully",
      updated_fields: { full_name, email, phone_num }
    });
  } catch (err) {
    console.error("Error updating passenger profile:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /passenger/request-details/:request_id - Get detailed request information
router.get("/request-details/:request_id", async (req, res) => {
  const { request_id } = req.params;
  
  try {
    // Get the passenger request with related information
    const [requestRows] = await pool.query(
      `SELECT 
         pr.*,
         pl.name as pickup_name,
         ol.name as destination_name,
         u.full_name as passenger_name
       FROM passenger_requests pr
       LEFT JOIN pickup_location pl ON pr.pickup_id = pl.pickup_id
       LEFT JOIN organization_locations ol ON pr.location_id = ol.location_id
       LEFT JOIN users u ON pr.user_id = u.user_id
       WHERE pr.request_id = ?`,
      [request_id]
    );

    if (requestRows.length === 0) {
      return res.status(404).json({ error: "Request not found" });
    }

    const request = requestRows[0];
    let bus = null;
    let schedule = null;
    let routes = [];

    // Get bus details if assigned
    if (request.bus_id) {
      const [busRows] = await pool.query(
        `SELECT 
           b.bus_id,
           b.organization_id,
           b.driver_id,
           b.plate_number,
           b.capacity,
           b.company,
           b.status,
           u.full_name as driver_name,
           u.phone_num as driver_phone_num
         FROM bus b
         LEFT JOIN users u ON b.driver_id = u.user_id 
         WHERE b.bus_id = ?`,
        [request.bus_id]
      );
      bus = busRows.length > 0 ? busRows[0] : null;
    }

    // Get schedule details if assigned
    if (request.schedule_id) {
      const [scheduleRows] = await pool.query(
        `SELECT * FROM schedule WHERE schedule_id = ?`,
        [request.schedule_id]
      );
      
      schedule = scheduleRows.length > 0 ? scheduleRows[0] : null;
      
      // Get route details for this schedule
      if (schedule) {
        const [routeRows] = await pool.query(
          `SELECT 
             MIN(r.stop_order) as stop_order,
             MIN(r.eta) as eta,
             pr.location_id,
             ol.name as destination_name,
             SUM(CAST(pr.passenger_count AS UNSIGNED)) as total_passenger_count,
             MIN(t.name) as tier_name,
             pr.schedule_id,
             (SELECT u.full_name FROM passenger_requests pr2 
              LEFT JOIN users u ON pr2.user_id = u.user_id 
              WHERE pr2.location_id = pr.location_id 
              AND pr2.schedule_id = pr.schedule_id 
              AND pr2.request_status = true
              ORDER BY CASE WHEN pr2.user_id = ? THEN 0 ELSE 1 END, pr2.request_id
              LIMIT 1) as passenger_name
           FROM passenger_requests pr
           LEFT JOIN routes r ON pr.request_id = r.request_id
           LEFT JOIN organization_locations ol ON pr.location_id = ol.location_id
           LEFT JOIN tier t ON pr.tier_id = t.tier_id
           WHERE pr.schedule_id = ? AND pr.request_status = true
           GROUP BY pr.location_id, ol.name, pr.schedule_id
           ORDER BY MIN(r.stop_order) ASC`,
          [request.user_id, request.schedule_id]
        );
        
        routes = routeRows;
      }
    }

    res.json({
      request: request,
      bus: bus,
      schedule: schedule,
      routes: routes
    });

  } catch (err) {
    console.error("Error fetching request details:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /passenger/optimize-pending - Process pending requests using PassengerRequestService
router.post("/optimize-pending", async (req, res) => {
  try {
    // Delegate to the PassengerRequestService for processing
    const { PassengerRequestService } = require('../services/passengerRequestService');
    const requestService = new PassengerRequestService(pool);

    // Get all pending requests
    const [pendingRequests] = await pool.query(
      `SELECT pr.*, pl.name as pickup_name, ol.name as destination_name
       FROM passenger_requests pr
       LEFT JOIN pickup_location pl ON pr.pickup_id = pl.pickup_id
       LEFT JOIN organization_locations ol ON pr.location_id = ol.location_id
       WHERE pr.request_status = false
       ORDER BY pr.request_id ASC`
    );

    if (pendingRequests.length === 0) {
      return res.json({
        message: "No pending requests to optimize",
        processed: 0
      });
    }

    let processedCount = 0;
    const results = [];

    // Process each pending request using the service
    for (const request of pendingRequests) {
      try {
        const passengerRequest = {
          passenger_id: request.user_id,
          pickup_location_id: request.pickup_id,
          destination_id: request.location_id,
          passenger_count: request.passenger_count,
          requested_pickup_time: new Date().toISOString() // Current time as fallback
        };

        const result = await requestService.processPassengerRequest(passengerRequest);

        if (result.success) {
          // Update the pending request to approved
          await pool.query(
            `UPDATE passenger_requests SET request_status = true, bus_id = ?, schedule_id = ? WHERE request_id = ?`,
            [result.data.schedule.bus_id, result.data.schedule.schedule_id, request.request_id]
          );

          processedCount++;
          results.push({
            request_id: request.request_id,
            status: 'optimized',
            bus_id: result.data.schedule.bus_id,
            schedule_id: result.data.schedule.schedule_id
          });
        } else {
          results.push({
            request_id: request.request_id,
            status: 'failed',
            reason: result.reason
          });
        }
      } catch (error) {
        console.error(`Error processing request ${request.request_id}:`, error);
        results.push({
          request_id: request.request_id,
          status: 'error',
          reason: error.message
        });
      }
    }

    res.json({
      message: `Processed ${processedCount} out of ${pendingRequests.length} pending requests`,
      processed: processedCount,
      total: pendingRequests.length,
      results: results
    });

  } catch (error) {
    console.error("Error optimizing pending requests:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;