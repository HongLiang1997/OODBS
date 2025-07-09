const express = require("express");
const router = express.Router();

let pool;

// Middleware to inject the DB pool into router (optional, same as buses.js)
router.use((req, res, next) => {
  if (!pool) pool = req.app.get("pool");
  next();
});

// GET /services/bus/:bus_id
router.get("/bus/:bus_id", async (req, res) => {
  const { bus_id } = req.params;
  try {
    const [rows] = await pool.query(
      `SELECT 
         s.service_date, 
         s.isAmShift, 
         s.isPmShift, 
         p.name AS location_name 
       FROM Bus_Services s
       JOIN Pickup_Location p ON s.pickup_id = p.pickup_id
       WHERE s.bus_id = ?
       ORDER BY s.service_date DESC`,
      [bus_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
