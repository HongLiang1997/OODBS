const express = require("express");
const router = express.Router();

let pool;

// Middleware to inject the DB pool into router
router.use((req, res, next) => {
  if (!pool) pool = req.app.get("pool");
  next();
});

// GET driver information by user_id
router.get("/info/:user_id", async (req, res) => {
  const { user_id } = req.params;
  
  try {
    const [rows] = await pool.query(`
      SELECT 
        b.*,
        u.full_name as driver_name,
        u.phone_num as driver_phone_num,
        u.email as driver_email
      FROM bus b
      JOIN users u ON b.driver_id = u.user_id
      WHERE u.user_id = ? AND u.role = 'driver'
    `, [user_id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: "Driver not found or no bus assigned" });
    }
    
    res.json({ bus: rows[0] });
  } catch (err) {
    console.error('Error fetching driver info:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET driver schedules by user_id
router.get("/schedules/:user_id", async (req, res) => {
  const { user_id } = req.params;
  
  try {
    const [rows] = await pool.query(`
      SELECT 
        s.*,
        bs.service_date,
        bs.isAmShift,
        bs.isPmShift,
        b.plate_number,
        b.status as bus_status
      FROM schedule s
      JOIN bus_services bs ON s.service_id = bs.service_id
      JOIN bus b ON bs.bus_id = b.bus_id
      WHERE b.driver_id = ?
      ORDER BY s.departure_time DESC
    `, [user_id]);
    
    res.json(rows);
  } catch (err) {
    console.error('Error fetching driver schedules:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET route data for a specific schedule
router.get("/route/:schedule_id", async (req, res) => {
  const { schedule_id } = req.params;
  
  try {
    // Get pickup location information
    const [pickupInfo] = await pool.query(`
      SELECT DISTINCT
        pl.pickup_id,
        pl.name,
        pl.latitude,
        pl.longitude
      FROM schedule s
      JOIN bus_services bs ON s.service_id = bs.service_id
      JOIN pickup_location pl ON bs.pickup_id = pl.pickup_id
      WHERE s.schedule_id = ?
    `, [schedule_id]);
    
    // Get unique routes by schedule_id - prevent duplicate request_ids
    const [routes] = await pool.query(`
      SELECT 
        MIN(r.route_id) as route_id,
        r.schedule_id,
        r.request_id,
        r.stop_order,
        r.eta,
        pr.passenger_count,
        u.full_name as passenger_name,
        u.phone_num as passenger_phone,
        ol.name as location_name,
        ol.latitude,
        ol.longitude,
        t.name as tier_name
      FROM routes r
      LEFT JOIN passenger_requests pr ON r.request_id = pr.request_id
      LEFT JOIN users u ON pr.user_id = u.user_id
      LEFT JOIN organization_locations ol ON pr.location_id = ol.location_id
      LEFT JOIN tier t ON r.tier_id = t.tier_id
      WHERE r.schedule_id = ?
      GROUP BY r.request_id, r.stop_order, r.schedule_id, r.eta, pr.passenger_count, 
               u.full_name, u.phone_num, ol.name, ol.latitude, ol.longitude, t.name
      ORDER BY r.stop_order
    `, [schedule_id]);
    
    const pickup_location = pickupInfo.length > 0 ? pickupInfo[0] : null;
    
    res.json({ 
      routes,
      pickup_location 
    });
  } catch (err) {
    console.error('Error fetching route data:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT update driver/bus status
router.put("/status/:user_id", async (req, res) => {
  const { user_id } = req.params;
  const { status } = req.body;
  
  if (!status) {
    return res.status(400).json({ error: "Status is required" });
  }
  
  try {
    // Update bus status for the driver
    const [result] = await pool.query(`
      UPDATE bus 
      SET status = ? 
      WHERE driver_id = ?
    `, [status, user_id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Driver not found or no bus assigned" });
    }
    
    res.json({ message: "Status updated successfully", status });
  } catch (err) {
    console.error('Error updating driver status:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT update pickup status for a route
router.put("/pickup/:route_id", async (req, res) => {
  const { route_id } = req.params;
  const { picked_up } = req.body;
  
  try {
    // Update route pickup status (you may need to add this field to your database)
    const [result] = await pool.query(`
      UPDATE routes 
      SET picked_up = ? 
      WHERE route_id = ?
    `, [picked_up, route_id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Route not found" });
    }
    
    res.json({ message: "Pickup status updated successfully" });
  } catch (err) {
    console.error('Error updating pickup status:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT complete a schedule (mark as completed)
router.put("/schedule/complete/:schedule_id", async (req, res) => {
  const { schedule_id } = req.params;
  
  try {
    // Simply update schedule status to completed - no time constraint checks
    const [result] = await pool.query(`
      UPDATE schedule 
      SET status = 'completed'
      WHERE schedule_id = ?
    `, [schedule_id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Schedule not found" });
    }
    
    // Log the completion
    console.log(`Schedule ${schedule_id} marked as completed`);
    
    res.json({ 
      message: "Schedule completed successfully", 
      schedule_id: schedule_id,
      status: 'completed'
    });
  } catch (err) {
    console.error('Error completing schedule:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT update schedule status (for on-route, ongoing, etc.)
router.put("/schedule/status/:schedule_id", async (req, res) => {
  const { schedule_id } = req.params;
  const { status } = req.body;
  
  if (!status) {
    return res.status(400).json({ error: "Status is required" });
  }
  
  try {
    // Update schedule status
    const [result] = await pool.query(`
      UPDATE schedule 
      SET status = ?
      WHERE schedule_id = ?
    `, [status, schedule_id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Schedule not found" });
    }
    
    // Log the status update
    console.log(`Schedule ${schedule_id} status updated to: ${status}`);
    
    res.json({ 
      message: "Schedule status updated successfully", 
      schedule_id: schedule_id,
      status: status
    });
  } catch (err) {
    console.error('Error updating schedule status:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;