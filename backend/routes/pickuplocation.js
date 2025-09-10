const express = require("express");
const router = express.Router();

let pool;

// Middleware to inject the DB pool into router
router.use((req, res, next) => {
  if (!pool) pool = req.app.get("pool");
  next();
});

// GET all pickup locations by organization
router.get("/organization/:organization_id", async (req, res) => {
  const { organization_id } = req.params;
  try {
    const [rows] = await pool.query(
      `SELECT 
         pickup_id,
         name,
         type,
         latitude,
         longitude
       FROM Pickup_Location 
       WHERE organization_id = ?
       ORDER BY name ASC`,
      [organization_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all pickup locations (for cross-org services if needed)
router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT 
         pickup_id,
         name,
         type,
         latitude,
         longitude,
         organization_id
       FROM Pickup_Location 
       ORDER BY name ASC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET pickup location by ID
router.get("/:pickup_id", async (req, res) => {
  const { pickup_id } = req.params;
  try {
    const [rows] = await pool.query(
      "SELECT * FROM Pickup_Location WHERE pickup_id = ?",
      [pickup_id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: "Pickup location not found" });
    }
    
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;