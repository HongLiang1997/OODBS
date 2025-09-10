const express = require("express");
const router = express.Router();

let pool;

// Middleware to inject the DB pool into router
router.use((req, res, next) => {
  if (!pool) pool = req.app.get("pool");
  next();
});

// GET /services/bus/:bus_id (existing)
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

// GET /services/organization/:organization_id - NEW ROUTE
router.get("/organization/:organization_id", async (req, res) => {
  const { organization_id } = req.params;
  try {
    const [rows] = await pool.query(
      `SELECT 
         s.service_id,
         s.service_date, 
         s.isAmShift, 
         s.isPmShift, 
         b.plate_number,
         b.bus_id,
         p.name AS location_name,
         p.pickup_id
       FROM Bus_Services s
       JOIN Bus b ON s.bus_id = b.bus_id
       JOIN Pickup_Location p ON s.pickup_id = p.pickup_id
       WHERE b.organization_id = ?
       ORDER BY s.service_date DESC`,
      [organization_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /services - CREATE SERVICE
router.post("/", async (req, res) => {
  const { bus_id, pickup_id, service_date, isAmShift, isPmShift } = req.body;

  try {
    const [result] = await pool.query(
      `INSERT INTO Bus_Services (bus_id, pickup_id, service_date, isAmShift, isPmShift)
       VALUES (?, ?, ?, ?, ?)`,
      [bus_id, pickup_id, service_date, isAmShift, isPmShift]
    );

    res.status(201).json({ 
      message: "Service created successfully",
      service_id: result.insertId 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /services/:service_id - UPDATE SERVICE
router.put("/:service_id", async (req, res) => {
  const { service_id } = req.params;
  const { bus_id, pickup_id, service_date, isAmShift, isPmShift } = req.body;

  try {
    const [result] = await pool.query(
      `UPDATE Bus_Services SET
        bus_id = ?,
        pickup_id = ?,
        service_date = ?,
        isAmShift = ?,
        isPmShift = ?
      WHERE service_id = ?`,
      [bus_id, pickup_id, service_date, isAmShift, isPmShift, service_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Service not found" });
    }

    res.json({ message: "Service updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /services/:service_id - DELETE SERVICE
router.delete("/:service_id", async (req, res) => {
  const { service_id } = req.params;

  try {
    // Check if service exists first
    const [existingService] = await pool.query(
      "SELECT service_id FROM Bus_Services WHERE service_id = ?",
      [service_id]
    );

    if (existingService.length === 0) {
      return res.status(404).json({ error: "Service not found" });
    }

    // Start a transaction to ensure data consistency
    await pool.query("START TRANSACTION");

    try {
      // First, get all schedule_ids that will be affected
      const [scheduleIds] = await pool.query(
        "SELECT schedule_id FROM Schedule WHERE service_id = ?",
        [service_id]
      );

      // Delete any routes that reference these schedules
      if (scheduleIds.length > 0) {
        const scheduleIdList = scheduleIds.map(row => row.schedule_id);
        await pool.query(
          `DELETE FROM Routes WHERE schedule_id IN (${scheduleIdList.map(() => '?').join(',')})`,
          scheduleIdList
        );
      }

      // Then delete the schedules that reference this service
      await pool.query(
        "DELETE FROM Schedule WHERE service_id = ?",
        [service_id]
      );

      // Finally, delete the service itself
      const [result] = await pool.query(
        "DELETE FROM Bus_Services WHERE service_id = ?",
        [service_id]
      );

      if (result.affectedRows === 0) {
        await pool.query("ROLLBACK");
        return res.status(404).json({ error: "Service not found" });
      }

      // Commit the transaction
      await pool.query("COMMIT");

      res.json({ message: "Service and associated schedules deleted successfully" });
    } catch (err) {
      // Rollback transaction on error
      await pool.query("ROLLBACK");
      throw err;
    }

  } catch (err) {
    console.error("Error deleting service:", err);
    res.status(500).json({ 
      error: "Failed to delete service", 
      details: err.message 
    });
  }
});

module.exports = router;