const express = require("express");
const router = express.Router();
const RoutingService = require("../services/routingService");

let pool;

// Middleware to inject the DB pool into router
router.use((req, res, next) => {
  if (!pool) pool = req.app.get("pool");
  next();
});

// Initialize routing service
const routingService = new RoutingService();

// POST /routing/optimize - Run route optimization
router.post("/optimize", async (req, res) => {
  try {
    const { algorithm, schedule_id } = req.body;

    if (!schedule_id) {
      return res.status(400).json({ 
        error: "Missing required field: schedule_id" 
      });
    }

    // Get schedule information including bus pickup location
    const [scheduleData] = await pool.query(
      `SELECT s.schedule_id, s.bus_id, s.route_id, 
              pl.name as bus_pickup_name, pl.latitude as bus_pickup_lat, pl.longitude as bus_pickup_lng,
              r.route_name
       FROM Schedule s
       LEFT JOIN Routes r ON s.route_id = r.route_id
       LEFT JOIN Pickup_Location pl ON r.pickup_id = pl.pickup_id
       WHERE s.schedule_id = ?`,
      [schedule_id]
    );

    if (scheduleData.length === 0) {
      return res.status(404).json({ 
        error: "Schedule not found" 
      });
    }

    const schedule = scheduleData[0];
    const pickupLocation = {
      name: schedule.bus_pickup_name,
      latitude: schedule.bus_pickup_lat,
      longitude: schedule.bus_pickup_lng
    };

    // Get all destinations for this route
    const [destinations] = await pool.query(
      `SELECT DISTINCT ol.location_id, ol.name, ol.latitude, ol.longitude
       FROM Organization_Locations ol
       INNER JOIN Passenger_Requests pr ON ol.location_id = pr.location_id
       WHERE pr.schedule_id = ?
       ORDER BY ol.name`,
      [schedule_id]
    );

    if (destinations.length === 0) {
      return res.status(404).json({ 
        error: "No destination requests found for this schedule" 
      });
    }

    let results;

    switch (algorithm) {
      case 'dijkstra':
        results = routingService.runDijkstra(pickupLocation, destinations);
        break;
      case 'bellman_ford':
        results = routingService.runBellmanFord(pickupLocation, destinations);
        break;
      case 'comparison':
      case 'both':
        results = routingService.compareAlgorithms(pickupLocation, destinations);
        break;
      default:
        return res.status(400).json({ 
          error: "Invalid algorithm. Use 'dijkstra', 'bellman_ford', or 'comparison'" 
        });
    }

    res.json({
      success: true,
      schedule_id: schedule_id,
      algorithm: algorithm,
      pickup_location: pickupLocation,
      destination_count: destinations.length,
      results: results
    });

  } catch (error) {
    console.error("Error running route optimization:", error);
    res.status(500).json({ 
      error: "Failed to run route optimization",
      details: error.message 
    });
  }
});

// GET /routing/algorithms - Get available algorithms
router.get("/algorithms", (req, res) => {
  res.json({
    available_algorithms: [
      {
        name: "dijkstra",
        description: "Dijkstra's shortest path algorithm",
        time_complexity: "O(V²)"
      },
      {
        name: "bellman_ford", 
        description: "Bellman-Ford algorithm for shortest paths",
        time_complexity: "O(VE)"
      },
      {
        name: "comparison",
        description: "Run both algorithms and compare results",
        time_complexity: "O(V²) + O(VE)"
      }
    ]
  });
});

// POST /routing/process-requests - Process pending requests and create optimal routes
router.post("/process-requests", async (req, res) => {
  try {
    const { schedule_id, algorithm = 'dijkstra' } = req.body;

    if (!schedule_id) {
      return res.status(400).json({ 
        error: "Missing required field: schedule_id" 
      });
    }

    // Get schedule and bus pickup location
    const [scheduleData] = await pool.query(
      `SELECT s.schedule_id, s.bus_id, s.route_id, 
              pl.name as bus_pickup_name, pl.latitude as bus_pickup_lat, pl.longitude as bus_pickup_lng
       FROM Schedule s
       LEFT JOIN Routes r ON s.route_id = r.route_id
       LEFT JOIN Pickup_Location pl ON r.pickup_id = pl.pickup_id
       WHERE s.schedule_id = ?`,
      [schedule_id]
    );

    if (scheduleData.length === 0) {
      return res.status(404).json({ 
        error: "Schedule not found" 
      });
    }

    const schedule = scheduleData[0];
    const pickupLocation = {
      name: schedule.bus_pickup_name,
      latitude: schedule.bus_pickup_lat,
      longitude: schedule.bus_pickup_lng
    };

    // Get all destinations for pending requests
    const [destinations] = await pool.query(
      `SELECT DISTINCT pr.request_id, ol.location_id, ol.name, ol.latitude, ol.longitude
       FROM Passenger_Requests pr
       INNER JOIN Organization_Locations ol ON pr.location_id = ol.location_id
       WHERE pr.schedule_id = ? AND pr.request_status = false
       ORDER BY ol.name`,
      [schedule_id]
    );

    if (destinations.length === 0) {
      return res.status(404).json({ 
        error: "No pending requests found for this schedule" 
      });
    }

    // Run the routing algorithm
    let routingResults;
    if (algorithm === 'dijkstra') {
      routingResults = routingService.runDijkstra(pickupLocation, destinations);
    } else if (algorithm === 'bellman_ford') {
      routingResults = routingService.runBellmanFord(pickupLocation, destinations);
    } else {
      return res.status(400).json({ 
        error: "Invalid algorithm. Use 'dijkstra' or 'bellman_ford'" 
      });
    }

    // Update requests to approved status
    await pool.query(
      `UPDATE Passenger_Requests 
       SET request_status = true
       WHERE schedule_id = ? AND request_status = false`,
      [schedule_id]
    );

    // Create route entries based on optimal order from algorithm
    if (routingResults.success && routingResults.routeOrder) {
      for (let i = 0; i < routingResults.routeOrder.length; i++) {
        const stop = routingResults.routeOrder[i];
        const estimatedTime = Math.ceil(stop.distance / 500); // Convert meters to minutes at 30km/h
        
        await pool.query(
          `INSERT INTO Routes (schedule_id, location_id, tier_id, stop_order, eta)
           VALUES (?, ?, ?, ?, NOW() + INTERVAL ? MINUTE)`,
          [schedule_id, stop.location.location_id, 1, i + 1, estimatedTime]
        );
      }
    }

    res.json({
      success: true,
      message: "Requests processed and routes optimized",
      schedule_id: schedule_id,
      algorithm: algorithm,
      processed_requests: destinations.length,
      routing_results: routingResults
    });

  } catch (error) {
    console.error("Error processing requests:", error);
    res.status(500).json({ 
      error: "Failed to process requests",
      details: error.message 
    });
  }
});

module.exports = router;