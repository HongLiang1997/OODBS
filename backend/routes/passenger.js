const express = require("express");
const router = express.Router();
const RoutingService = require("../services/routingService");

let pool;
const routingService = new RoutingService();

// Middleware to inject the DB pool into router
router.use((req, res, next) => {
  if (!pool) pool = req.app.get("pool");
  next();
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

// POST /passenger/requests - Create new passenger request with intelligent schedule assignment
router.post("/requests", async (req, res) => {
  const { 
    user_id, 
    pickup_id, 
    location_id,
    passenger_count
  } = req.body;

  if (!user_id || !pickup_id || !location_id || !passenger_count) {
    return res.status(400).json({ 
      error: "Missing required fields: user_id, pickup_id, location_id, passenger_count" 
    });
  }

  try {
    // Try to find and assign to an optimal existing schedule
    const assignmentResult = await findOptimalSchedule(pickup_id, location_id, passenger_count);
    
    let bus_id, schedule_id, tier_id, request_status;
    
    if (assignmentResult.success) {
      // Found optimal schedule - assign directly
      bus_id = assignmentResult.bus_id;
      schedule_id = assignmentResult.schedule_id;
      tier_id = assignmentResult.tier_id || 1;
      request_status = true; // Auto-approve since it fits existing schedule
      
      console.log(`Assignment successful: schedule_id=${schedule_id}, bus_id=${bus_id}, route_order_length=${assignmentResult.newRouteOrder?.length || 0}`);
      
      // Create the passenger request
      const [result] = await pool.query(
        `INSERT INTO passenger_requests (
           user_id, 
           bus_id,
           pickup_id, 
           location_id, 
           tier_id,
           schedule_id,
           passenger_count, 
           request_status
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [user_id, bus_id, pickup_id, location_id, tier_id, schedule_id, passenger_count, request_status]
      );

      console.log(`\n🔗 CREATING ROUTE LINKAGES:`);
      console.log(`   Request ID: ${result.insertId}`);
      console.log(`   Schedule ID: ${schedule_id}`);
      console.log(`   Bus ID: ${bus_id}`);
      console.log(`   Service ID: ${assignmentResult.service_id}`);
      
      // Create initial route entry for this request
      const [routeResult] = await pool.query(
        `INSERT INTO routes (schedule_id, request_id, tier_id, stop_order, eta)
         VALUES (?, ?, ?, ?, NOW() + INTERVAL 30 MINUTE)`,
        [schedule_id, result.insertId, tier_id, 1]
      );
      
      console.log(`   ✅ Created route entry with ID: ${routeResult.insertId}`);
      
      // Update the route order based on routing algorithm (this will include the new request)
      await updateRouteOrder(schedule_id, assignmentResult.newRouteOrder);

      console.log(`   ✅ Updated route order with ${assignmentResult.newRouteOrder.length} stops`);
      
      // Verify the data was stored correctly
      const [verifyRequest] = await pool.query(
        `SELECT pr.*, s.service_id 
         FROM passenger_requests pr 
         LEFT JOIN schedule s ON pr.schedule_id = s.schedule_id 
         WHERE pr.request_id = ?`,
        [result.insertId]
      );
      
      const [verifyRoutes] = await pool.query(
        `SELECT * FROM routes WHERE schedule_id = ? ORDER BY stop_order`,
        [schedule_id]
      );
      
      console.log(`\n📊 VERIFICATION RESULTS:`);
      console.log(`   Passenger Request:`, verifyRequest[0]);
      console.log(`   Routes (${verifyRoutes.length} total):`, verifyRoutes);

      console.log(`\n✅ Created request ${result.insertId} with route entry and updated route order`);

      res.status(201).json({ 
        message: "Booking request approved and assigned to optimal schedule!",
        request_id: result.insertId,
        schedule_id: schedule_id,
        bus_id: bus_id,
        routing_details: assignmentResult.routingDetails
      });
      
    } else {
      // No suitable schedule found - create pending request WITHOUT bus assignment
      console.log(`\n❌ NO SUITABLE BUS FOUND`);
      console.log(`   Reason: ${assignmentResult.reason}`);
      console.log(`   Creating pending request without bus assignment...`);
      
      const [result] = await pool.query(
        `INSERT INTO passenger_requests (
           user_id, 
           bus_id,
           pickup_id, 
           location_id, 
           tier_id,
           passenger_count, 
           request_status
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [user_id, null, pickup_id, location_id, 1, passenger_count, false] // NULL bus_id for pending status
      );

      console.log(`   ✅ Created pending request ${result.insertId} with no bus assignment`);

      res.status(201).json({ 
        message: "Booking request submitted and pending schedule assignment. Our system will find the best bus and route for you.",
        request_id: result.insertId,
        reason: assignmentResult.reason,
        status: "pending"
      });
    }
    
  } catch (err) {
    console.error("Error creating passenger request:", err);
    res.status(500).json({ error: err.message });
  }
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

// GET /passenger/request-details/:request_id - Get detailed request information including bus, schedule, and routes
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
        `SELECT * FROM bus WHERE bus_id = ?`,
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
             r.*,
             ol.name as destination_name,
             u.full_name as passenger_name,
             pr.passenger_count,
             t.name as tier_name
           FROM routes r
           LEFT JOIN passenger_requests pr ON r.request_id = pr.request_id
           LEFT JOIN organization_locations ol ON pr.location_id = ol.location_id
           LEFT JOIN users u ON pr.user_id = u.user_id
           LEFT JOIN tier t ON r.tier_id = t.tier_id
           WHERE r.schedule_id = ?
           ORDER BY r.stop_order ASC`,
          [request.schedule_id]
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

// POST /passenger/optimize-pending - Process pending requests and assign to optimal schedules
router.post("/optimize-pending", async (req, res) => {
  try {
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

    // Process each pending request
    for (const request of pendingRequests) {
      try {
        const assignmentResult = await findOptimalSchedule(
          request.pickup_id, 
          request.location_id, 
          request.passenger_count
        );

        if (assignmentResult.success) {
          // Update the request with bus assignment
          await pool.query(
            `UPDATE passenger_requests 
             SET bus_id = ?, tier_id = ?, schedule_id = ?, request_status = true
             WHERE request_id = ?`,
            [assignmentResult.bus_id, assignmentResult.tier_id, assignmentResult.schedule_id, request.request_id]
          );

          // Create route entry to link request to schedule
          await pool.query(
            `INSERT INTO routes (schedule_id, request_id, tier_id, stop_order, eta)
             VALUES (?, ?, ?, ?, NOW() + INTERVAL 30 MINUTE)`,
            [assignmentResult.schedule_id, request.request_id, assignmentResult.tier_id, 1]
          );

          // Update route order
          await updateRouteOrder(assignmentResult.schedule_id, assignmentResult.newRouteOrder);

          processedCount++;
          results.push({
            request_id: request.request_id,
            status: 'assigned',
            schedule_id: assignmentResult.schedule_id,
            bus_id: assignmentResult.bus_id
          });
        } else {
          results.push({
            request_id: request.request_id,
            status: 'pending',
            reason: assignmentResult.reason
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

/**
 * Find optimal bus and service for a new passenger request
 * @param {number} pickup_id - Pickup location ID
 * @param {number} location_id - Destination location ID  
 * @param {number} passenger_count - Number of passengers
 * @returns {Object} - Assignment result with bus/service details or failure reason
 */
async function findOptimalSchedule(pickup_id, location_id, passenger_count) {
  try {
    console.log(`\n=== FINDING OPTIMAL SCHEDULE ===`);
    console.log(`Pickup ID: ${pickup_id}, Destination ID: ${location_id}, Passengers: ${passenger_count}`);
    
    // Configuration - these could be moved to environment variables
    const MAX_ROUTE_TIME_MINUTES = 90; // Maximum total route time
    const MAX_DETOUR_MINUTES = 20; // Maximum additional time added by new destination
    
    // Find all active buses that service the same pickup location
    const [candidateBuses] = await pool.query(
      `SELECT DISTINCT 
         b.bus_id,
         b.capacity,
         b.plate_number,
         b.driver_name,
         b.company,
         bs.service_id,
         bs.service_date,
         bs.isAmShift,
         bs.isPmShift,
         pl.name as pickup_name,
         pl.latitude as pickup_lat,
         pl.longitude as pickup_lng
       FROM bus b
       INNER JOIN bus_services bs ON b.bus_id = bs.bus_id
       INNER JOIN pickup_location pl ON bs.pickup_id = pl.pickup_id
       WHERE bs.pickup_id = ? 
         AND b.status = 'active'
         AND bs.service_date >= CURDATE()
       ORDER BY bs.service_date ASC, b.bus_id ASC`,
      [pickup_id]
    );

    console.log(`Found ${candidateBuses.length} candidate buses:`);
    candidateBuses.forEach((bus, index) => {
      console.log(`  ${index + 1}. Bus ${bus.bus_id} (${bus.plate_number}) - Service ${bus.service_id} - Driver: ${bus.driver_name}`);
    });
    
    if (candidateBuses.length === 0) {
      console.log(`❌ No active buses found servicing pickup location ${pickup_id}`);
      
      // Debug: Check what buses exist in general
      const [allBuses] = await pool.query(`SELECT bus_id, plate_number, status FROM bus LIMIT 5`);
      console.log(`   Debug - Sample buses in database:`, allBuses);
      
      // Debug: Check what bus services exist
      const [allServices] = await pool.query(`SELECT * FROM bus_services LIMIT 5`);
      console.log(`   Debug - Sample bus services:`, allServices);
      
      // Debug: Check what pickup locations exist
      const [allPickups] = await pool.query(`SELECT pickup_id, name FROM pickup_location WHERE pickup_id = ?`, [pickup_id]);
      console.log(`   Debug - Pickup location ${pickup_id}:`, allPickups);
      return {
        success: false,
        reason: "No active buses found servicing this pickup location"
      };
    }

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

    // Evaluate each candidate bus service
    for (let i = 0; i < candidateBuses.length; i++) {
      const busService = candidateBuses[i];
      console.log(`\n--- Evaluating Bus Service ${i + 1}/${candidateBuses.length} ---`);
      console.log(`Bus ${busService.bus_id} (${busService.plate_number}) - Service ${busService.service_id}`);
      
      const evaluationResult = await evaluateBusServiceForNewPassenger(
        busService, 
        newDestination, 
        passenger_count,
        MAX_ROUTE_TIME_MINUTES,
        MAX_DETOUR_MINUTES
      );

      console.log(`Evaluation result: ${evaluationResult.suitable ? '✅ SUITABLE' : '❌ NOT SUITABLE'}`);
      console.log(`Reason: ${evaluationResult.reason}`);
      
      if (evaluationResult.suitable) {
        // Create or get schedule for this service
        console.log(`Creating/getting schedule for service ${busService.service_id}...`);
        let schedule_id = await getOrCreateScheduleForService(busService.service_id);
        console.log(`Schedule ID: ${schedule_id}`);
        
        console.log(`\n✅ ASSIGNMENT SUCCESSFUL!`);
        console.log(`Bus ID: ${busService.bus_id}, Service ID: ${busService.service_id}, Schedule ID: ${schedule_id}`);
        
        return {
          success: true,
          bus_id: busService.bus_id,
          service_id: busService.service_id,
          schedule_id: schedule_id,
          tier_id: 1, // Default tier
          routingDetails: evaluationResult.routingDetails,
          newRouteOrder: evaluationResult.newRouteOrder,
          timingAnalysis: evaluationResult.timingAnalysis
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
 * Evaluate if a bus service can accommodate a new passenger within timing constraints
 * @param {Object} busService - Bus service details
 * @param {Object} newDestination - New destination to add
 * @param {number} passengerCount - Number of passengers
 * @param {number} maxRouteTime - Maximum total route time in minutes
 * @param {number} maxDetour - Maximum additional time in minutes
 * @returns {Object} - Evaluation result
 */
async function evaluateBusServiceForNewPassenger(busService, newDestination, passengerCount, maxRouteTime, maxDetour) {
  try {
    console.log(`  🔍 Evaluating bus service:`);
    console.log(`     Bus: ${busService.bus_id} (capacity: ${busService.capacity})`);
    console.log(`     Service: ${busService.service_id} on ${busService.service_date}`);
    console.log(`     New destination: ${newDestination.name}`);
    console.log(`     Passenger count: ${passengerCount}`);
    
    // Check bus capacity first - get current passengers for this bus service
    console.log(`     🔍 Debugging passenger count calculation:`);
    console.log(`        Bus ID: ${busService.bus_id}, Service ID: ${busService.service_id}, Date: ${busService.service_date}`);
    
    // First, let's see what passenger_count values are actually stored
    const [debugPassengers] = await pool.query(
      `SELECT pr.request_id, pr.user_id, pr.passenger_count, pr.request_status
       FROM passenger_requests pr
       WHERE pr.bus_id = ? AND pr.request_status = true 
       AND EXISTS (
         SELECT 1 FROM bus_services bs 
         WHERE bs.bus_id = pr.bus_id 
         AND bs.service_date = ?
         AND bs.service_id = ?
       )`,
      [busService.bus_id, busService.service_date, busService.service_id]
    );
    
    console.log(`        Found ${debugPassengers.length} existing requests:`);
    debugPassengers.forEach(req => {
      console.log(`          Request ${req.request_id}: passenger_count = "${req.passenger_count}" (type: ${typeof req.passenger_count})`);
    });
    
    const [currentPassengers] = await pool.query(
      `SELECT SUM(CAST(pr.passenger_count AS UNSIGNED)) as total_passengers
       FROM passenger_requests pr
       WHERE pr.bus_id = ? AND pr.request_status = true 
       AND EXISTS (
         SELECT 1 FROM bus_services bs 
         WHERE bs.bus_id = pr.bus_id 
         AND bs.service_date = ?
         AND bs.service_id = ?
       )`,
      [busService.bus_id, busService.service_date, busService.service_id]
    );

    const currentPassengerCount = parseInt(currentPassengers[0]?.total_passengers || 0);
    const newPassengerCount = parseInt(passengerCount);
    const totalPassengers = currentPassengerCount + newPassengerCount;
    console.log(`     📊 Capacity calculation:`);
    console.log(`        Raw SUM result: ${currentPassengers[0]?.total_passengers} (type: ${typeof currentPassengers[0]?.total_passengers})`);
    console.log(`        Current passengers: ${currentPassengerCount} (after parseInt)`);
    console.log(`        Adding: ${newPassengerCount} (after parseInt, original: ${passengerCount})`);
    console.log(`        Total: ${totalPassengers}/${busService.capacity}`);
    
    if (totalPassengers > busService.capacity) {
      console.log(`     ❌ Capacity exceeded!`);
      return {
        suitable: false,
        reason: `Bus capacity exceeded (${totalPassengers}/${busService.capacity})`
      };
    }

    // Get current destinations for this bus service
    console.log(`     🔍 Checking existing destinations for bus ${busService.bus_id}, service ${busService.service_id}...`);
    const [existingDestinations] = await pool.query(
      `SELECT DISTINCT 
         ol.location_id,
         ol.name,
         ol.latitude,
         ol.longitude
       FROM passenger_requests pr
       INNER JOIN organization_locations ol ON pr.location_id = ol.location_id
       WHERE pr.bus_id = ? AND pr.request_status = true
       AND EXISTS (
         SELECT 1 FROM bus_services bs 
         WHERE bs.bus_id = pr.bus_id 
         AND bs.service_date = ?
         AND bs.service_id = ?
       )
       ORDER BY ol.name`,
      [busService.bus_id, busService.service_date, busService.service_id]
    );
    
    console.log(`     Found ${existingDestinations.length} existing destinations:`);
    existingDestinations.forEach(dest => {
      console.log(`       - ${dest.name} (ID: ${dest.location_id})`);
    });

    // Check if destination already exists in route
    const destinationExists = existingDestinations.some(dest => dest.location_id === newDestination.location_id);
    if (destinationExists) {
      return {
        suitable: true,
        reason: "Destination already exists in route - no routing changes needed",
        newRouteOrder: [], // No changes needed
        timingAnalysis: { additionalTime: 0, totalTime: "unchanged" }
      };
    }

    // Prepare data for routing algorithm
    const pickupLocation = {
      name: busService.pickup_name,
      lat: busService.pickup_lat,
      lng: busService.pickup_lng
    };

    // Add new destination to existing ones - ensure coordinate format matches routing service
    const formattedExistingDestinations = existingDestinations.map(dest => ({
      location_id: dest.location_id,
      name: dest.name,
      lat: dest.latitude,
      lng: dest.longitude
    }));
    
    const formattedNewDestination = {
      location_id: newDestination.location_id,
      name: newDestination.name,
      lat: newDestination.latitude,
      lng: newDestination.longitude
    };
    
    const allDestinations = [...formattedExistingDestinations, formattedNewDestination];

    // Run routing algorithm to get optimal route
    console.log(`     🚌 Running Dijkstra algorithm:`);
    console.log(`        Pickup: ${pickupLocation.name}`);
    console.log(`        Destinations: ${allDestinations.length} total`);
    allDestinations.forEach((dest, idx) => {
      console.log(`          ${idx + 1}. ${dest.name} (${dest.location_id})`);
    });
    
    const routingResult = routingService.runDijkstra(pickupLocation, allDestinations);

    if (!routingResult.success) {
      console.log(`     ❌ Routing algorithm failed!`);
      console.error("       Error:", routingResult);
      return {
        suitable: false,
        reason: "Routing algorithm failed"
      };
    }

    console.log(`     ✅ Routing algorithm succeeded!`);
    console.log(`        Optimal route order:`);
    routingResult.routeOrder.forEach((stop, idx) => {
      console.log(`          ${idx + 1}. ${stop.location.name} (distance: ${Math.round(stop.distance)}m)`);
    });

    // Calculate timing analysis
    console.log(`     ⏱️ Calculating timing analysis:`);
    const originalDistance = formattedExistingDestinations.length > 0 ? 
      routingService.runDijkstra(pickupLocation, formattedExistingDestinations).totalDistance : 0;
    
    const newTotalDistance = routingResult.totalDistance;
    const additionalDistance = newTotalDistance - originalDistance;
    
    console.log(`        Original route distance: ${Math.round(originalDistance)}m`);
    console.log(`        New total distance: ${Math.round(newTotalDistance)}m`);
    console.log(`        Additional distance: ${Math.round(additionalDistance)}m`);
    
    // Convert distance to time (assuming 45 km/h average speed - more realistic for mixed city/highway driving)
    // 45 km/h = 45,000 meters/hour = 750 meters/minute
    const METERS_PER_MINUTE = 750; // 45 km/h converted to m/min
    const additionalTimeMinutes = Math.ceil(additionalDistance / METERS_PER_MINUTE);
    const totalTimeMinutes = Math.ceil(newTotalDistance / METERS_PER_MINUTE);
    
    console.log(`        Total route time: ${totalTimeMinutes} min (max: ${maxRouteTime} min)`);
    console.log(`        Additional time: ${additionalTimeMinutes} min (max: ${maxDetour} min)`);

    // Check timing constraints
    if (totalTimeMinutes > maxRouteTime) {
      console.log(`        ❌ Total route time exceeds maximum!`);
      return {
        suitable: false,
        reason: `Total route time (${totalTimeMinutes} min) exceeds maximum (${maxRouteTime} min)`
      };
    }

    // For the first passenger on a route, don't apply the detour limit
    // The "detour" concept only makes sense when there are existing passengers
    if (formattedExistingDestinations.length > 0 && additionalTimeMinutes > maxDetour) {
      console.log(`        ❌ Additional detour time exceeds maximum!`);
      return {
        suitable: false,
        reason: `Additional detour time (${additionalTimeMinutes} min) exceeds maximum (${maxDetour} min)`
      };
    } else if (formattedExistingDestinations.length === 0) {
      console.log(`        ✅ First passenger on route - no detour limit applied`);
    } else {
      console.log(`        ✅ Additional detour time within limits`);
    }
    
    console.log(`        ✅ All timing constraints satisfied!`);

    console.log(`     ✅ Bus service evaluation PASSED!`);
    return {
      suitable: true,
      reason: "Schedule suitable within timing constraints",
      routingDetails: routingResult,
      newRouteOrder: routingResult.routeOrder,
      timingAnalysis: {
        additionalTime: additionalTimeMinutes,
        totalTime: totalTimeMinutes,
        withinConstraints: true
      }
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
 * Update route order based on routing algorithm results
 * @param {number} schedule_id - Schedule ID
 * @param {Array} newRouteOrder - New route order from routing algorithm
 */
async function updateRouteOrder(schedule_id, newRouteOrder) {
  try {
    if (!newRouteOrder || newRouteOrder.length === 0) {
      console.log(`No route order updates needed for schedule ${schedule_id}`);
      return; // No changes needed
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
    
    if (scheduleInfo.length === 0) {
      throw new Error(`Schedule ${schedule_id} not found`);
    }
    
    const departureTime = scheduleInfo[0].departure_time;
    console.log(`📅 Using scheduled departure time: ${departureTime}`);
    
    // Insert new routes in optimal order with cumulative ETA calculation from departure time
    let currentTime = new Date(departureTime); // Start from scheduled departure time
    
    for (let i = 0; i < newRouteOrder.length; i++) {
      const stop = newRouteOrder[i];
      const segmentTimeMinutes = Math.ceil(stop.distance / 750); // Time from previous location to this destination
      
      // Add travel time from previous location to current stop
      currentTime.setMinutes(currentTime.getMinutes() + segmentTimeMinutes);
      
      // Add boarding/alighting time (5 minutes per stop)
      if (i > 0) { // Don't add boarding time for first stop (passengers already on bus from pickup)
        currentTime.setMinutes(currentTime.getMinutes() + 5);
      }
      
      console.log(`Processing stop ${i + 1}: ${stop.location.name} (location_id: ${stop.location.location_id})`);
      console.log(`  Travel time from ${i === 0 ? 'pickup' : 'previous stop'}: ${segmentTimeMinutes} min`);
      console.log(`  ETA: ${currentTime.toLocaleTimeString('en-SG', { timeZone: 'Asia/Singapore' })}`);
      
      // Find corresponding request for this location
      const [matchingRequests] = await pool.query(
        `SELECT request_id, user_id FROM passenger_requests 
         WHERE schedule_id = ? AND location_id = ? AND request_status = true
         LIMIT 1`,
        [schedule_id, stop.location.location_id]
      );

      if (matchingRequests.length > 0) {
        const request = matchingRequests[0];
        
        await pool.query(
          `INSERT INTO routes (schedule_id, request_id, tier_id, stop_order, eta)
           VALUES (?, ?, ?, ?, ?)`,
          [schedule_id, request.request_id, 1, i + 1, currentTime]
        );
        
        console.log(`Created route entry: stop_order=${i + 1}, request_id=${request.request_id}, ETA=${currentTime.toLocaleTimeString('en-SG', { timeZone: 'Asia/Singapore' })}`);
      } else {
        console.warn(`No matching request found for location_id ${stop.location.location_id} in schedule ${schedule_id}`);
        
        // Try to find any request for this location (even if not assigned to this schedule yet)
        const [anyRequests] = await pool.query(
          `SELECT request_id, user_id FROM passenger_requests 
           WHERE location_id = ? AND request_status = true
           ORDER BY request_id DESC LIMIT 1`,
          [stop.location.location_id]
        );
        
        if (anyRequests.length > 0) {
          const request = anyRequests[0];
          
          // Update the request to link it to this schedule
          await pool.query(
            `UPDATE passenger_requests SET schedule_id = ? WHERE request_id = ?`,
            [schedule_id, request.request_id]
          );
          
          // Create the route entry
          await pool.query(
            `INSERT INTO routes (schedule_id, request_id, tier_id, stop_order, eta)
             VALUES (?, ?, ?, ?, ?)`,
            [schedule_id, request.request_id, 1, i + 1, currentTime]
          );
          
          console.log(`Found unlinked request ${request.request_id}, linked to schedule ${schedule_id} and created route entry`);
        } else {
          // Debug: show what requests exist for this schedule
          const [debugRequests] = await pool.query(
            `SELECT request_id, location_id, request_status FROM passenger_requests WHERE schedule_id = ?`,
            [schedule_id]
          );
          console.log(`Debug - Requests for schedule ${schedule_id}:`, debugRequests);
        }
      }
    }

    console.log(`Successfully updated route order for schedule ${schedule_id}`);

  } catch (error) {
    console.error("Error updating route order:", error);
    throw error;
  }
}

/**
 * Calculate distance between two locations using Haversine formula
 * @param {Object} loc1 - First location {lat, lng}
 * @param {Object} loc2 - Second location {lat, lng}
 * @returns {number} - Distance in meters
 */
function calculateDistance(loc1, loc2) {
  const R = 6371000; // Earth's radius in meters
  const lat1Rad = (loc1.lat * Math.PI) / 180;
  const lat2Rad = (loc2.lat * Math.PI) / 180;
  const deltaLatRad = ((loc2.lat - loc1.lat) * Math.PI) / 180;
  const deltaLngRad = ((loc2.lng - loc1.lng) * Math.PI) / 180;

  const a = Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
            Math.cos(lat1Rad) * Math.cos(lat2Rad) *
            Math.sin(deltaLngRad / 2) * Math.sin(deltaLngRad / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Get existing schedule or create new one for a bus service
 * @param {number} service_id - Bus service ID
 * @returns {number} - Schedule ID
 */
async function getOrCreateScheduleForService(service_id) {
  try {
    // Check if schedule already exists for this service
    const [existingSchedules] = await pool.query(
      `SELECT schedule_id FROM schedule WHERE service_id = ? LIMIT 1`,
      [service_id]
    );

    if (existingSchedules.length > 0) {
      return existingSchedules[0].schedule_id;
    }

    // Create new schedule for this service
    const [scheduleResult] = await pool.query(
      `INSERT INTO schedule (service_id, departure_time, arrival_time)
       VALUES (?, NOW() + INTERVAL 1 HOUR, NOW() + INTERVAL 4 HOUR)`,
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