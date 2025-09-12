const express = require("express");
const router = express.Router();

let pool;

// Middleware to inject the DB pool into router
router.use((req, res, next) => {
  if (!pool) pool = req.app.get("pool");
  next();
});

// GET /schedule/bus/:bus_id - Get all schedules for a specific bus
router.get("/bus/:bus_id", async (req, res) => {
  const { bus_id } = req.params;
  try {
    const [rows] = await pool.query(
      `SELECT 
         sch.schedule_id,
         sch.service_id,
         sch.departure_time,
         sch.arrival_time,
         s.service_date,
         s.isAmShift,
         s.isPmShift,
         p.name AS pickup_location_name,
         p.pickup_id
       FROM Schedule sch
       JOIN Bus_Services s ON sch.service_id = s.service_id
       JOIN Pickup_Location p ON s.pickup_id = p.pickup_id
       WHERE s.bus_id = ?
       ORDER BY sch.departure_time DESC`,
      [bus_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /schedule/:schedule_id/routes - Get routes for a specific schedule
router.get("/:schedule_id/routes", async (req, res) => {
  const { schedule_id } = req.params;
  try {
    const [rows] = await pool.query(
      `SELECT 
         r.route_id,
         r.schedule_id,
         r.request_id,
         r.tier_id,
         r.stop_order,
         r.eta,
         t.name AS tier_name,
         ol.name AS destination_name,
         ol.latitude AS destination_lat,
         ol.longitude AS destination_lng,
         pr.passenger_count,
         u.full_name AS passenger_name
       FROM Routes r
       LEFT JOIN Tier t ON r.tier_id = t.tier_id
       LEFT JOIN Passenger_Requests pr ON r.request_id = pr.request_id
       LEFT JOIN Organization_Locations ol ON pr.location_id = ol.location_id
       LEFT JOIN Users u ON pr.user_id = u.user_id
       WHERE r.schedule_id = ?
       ORDER BY r.stop_order ASC`,
      [schedule_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /schedule/service/:service_id - Get schedules for a specific service
router.get("/service/:service_id", async (req, res) => {
  const { service_id } = req.params;
  try {
    const [rows] = await pool.query(
      `SELECT 
         schedule_id,
         service_id,
         departure_time,
         arrival_time
       FROM Schedule
       WHERE service_id = ?
       ORDER BY departure_time ASC`,
      [service_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
