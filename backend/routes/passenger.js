const express = require("express");
const router = express.Router();

let pool;

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
       FROM Pickup_Location 
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
       FROM Organization_Locations
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
       FROM Passenger_Requests pr
       LEFT JOIN Pickup_Location pl ON pr.pickup_id = pl.pickup_id
       LEFT JOIN Organization_Locations ol ON pr.location_id = ol.location_id
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

// POST /passenger/requests - Create new passenger request
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
    // Set default values - the backend system will later process this to find optimal bus and route
    const [result] = await pool.query(
      `INSERT INTO Passenger_Requests (
         user_id, 
         bus_id,
         pickup_id, 
         location_id, 
         tier_id,
         passenger_count, 
         request_status
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [user_id, 1, pickup_id, location_id, 1, passenger_count, false] // Default: bus_id=1, tier_id=1, status=pending
    );

    res.status(201).json({ 
      message: "Booking request submitted successfully! Our system will find the best bus and route for you.",
      request_id: result.insertId 
    });
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
    // Update user information in Users table
    const [userResult] = await pool.query(
      `UPDATE Users 
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
       FROM Passenger_Requests pr
       LEFT JOIN Pickup_Location pl ON pr.pickup_id = pl.pickup_id
       LEFT JOIN Organization_Locations ol ON pr.location_id = ol.location_id
       LEFT JOIN Users u ON pr.user_id = u.user_id
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
        `SELECT * FROM Bus WHERE bus_id = ?`,
        [request.bus_id]
      );
      bus = busRows.length > 0 ? busRows[0] : null;
    }

    // Get schedule details if assigned
    if (request.schedule_id) {
      const [scheduleRows] = await pool.query(
        `SELECT * FROM Schedule WHERE schedule_id = ?`,
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
           FROM Routes r
           LEFT JOIN Passenger_Requests pr ON r.request_id = pr.request_id
           LEFT JOIN Organization_Locations ol ON pr.location_id = ol.location_id
           LEFT JOIN Users u ON pr.user_id = u.user_id
           LEFT JOIN Tier t ON r.tier_id = t.tier_id
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

module.exports = router;