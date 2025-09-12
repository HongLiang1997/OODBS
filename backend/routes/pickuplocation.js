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

// Check for duplicate pickup location
router.get("/check-duplicate", async (req, res) => {
  const { latitude, longitude, organization_id, exclude_id } = req.query;
  
  if (!latitude || !longitude || !organization_id) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  try {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const tolerance = 0.0001; // About 11 meters

    let query = `
      SELECT pickup_id, name, latitude, longitude 
      FROM Pickup_Location 
      WHERE organization_id = ? 
      AND ABS(latitude - ?) < ? 
      AND ABS(longitude - ?) < ?
    `;
    let params = [organization_id, lat, tolerance, lng, tolerance];

    if (exclude_id) {
      query += " AND pickup_id != ?";
      params.push(exclude_id);
    }

    const [rows] = await pool.query(query, params);
    
    if (rows.length > 0) {
      return res.json({ 
        exists: true, 
        location: rows[0],
        message: `A pickup location already exists nearby: ${rows[0].name}` 
      });
    }
    
    res.json({ exists: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST - Create new pickup location
router.post("/", async (req, res) => {
  const { organization_id, type, name, latitude, longitude } = req.body;

  if (!organization_id || !name || !latitude || !longitude) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // Check for duplicates
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const tolerance = 0.0001;

    const [duplicates] = await pool.query(
      `SELECT pickup_id, name FROM Pickup_Location 
       WHERE organization_id = ? 
       AND ABS(latitude - ?) < ? 
       AND ABS(longitude - ?) < ?`,
      [organization_id, lat, tolerance, lng, tolerance]
    );

    if (duplicates.length > 0) {
      return res.status(200).json({ 
        error: `Pickup location already exists nearby: ${duplicates[0].name}`,
        duplicate: true 
      });
    }

    const [result] = await pool.query(
      "INSERT INTO Pickup_Location (organization_id, type, name, latitude, longitude) VALUES (?, ?, ?, ?, ?)",
      [organization_id, type || 'Public', name, lat, lng]
    );

    res.status(201).json({ 
      message: "Pickup location created successfully", 
      pickup_id: result.insertId 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT - Update pickup location
router.put("/:pickup_id", async (req, res) => {
  const { pickup_id } = req.params;
  const { type, name, latitude, longitude } = req.body;

  if (!name || !latitude || !longitude) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const [result] = await pool.query(
      "UPDATE Pickup_Location SET type = ?, name = ?, latitude = ?, longitude = ? WHERE pickup_id = ?",
      [type || 'Public', name, parseFloat(latitude), parseFloat(longitude), pickup_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Pickup location not found" });
    }

    res.json({ message: "Pickup location updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE - Delete pickup location
router.delete("/:pickup_id", async (req, res) => {
  const { pickup_id } = req.params;
  const { force } = req.query;

  try {
    // Check if pickup location is being used in services
    const [serviceRows] = await pool.query(
      "SELECT COUNT(*) as count FROM Bus_Services WHERE pickup_id = ?",
      [pickup_id]
    );

    if (serviceRows[0].count > 0 && force !== 'true') {
      return res.status(400).json({
        error: "Cannot delete pickup location: it is being used in bus services",
        canForceDelete: true,
        usageCount: serviceRows[0].count
      });
    }

    if (force === 'true') {
      // Start transaction
      await pool.query('START TRANSACTION');

      try {
        // Delete related bus services
        await pool.query("DELETE FROM Bus_Services WHERE pickup_id = ?", [pickup_id]);
        
        // Delete the pickup location
        const [result] = await pool.query("DELETE FROM Pickup_Location WHERE pickup_id = ?", [pickup_id]);
        
        await pool.query('COMMIT');

        if (result.affectedRows === 0) {
          return res.status(404).json({ error: "Pickup location not found" });
        }

        res.json({ message: "Pickup location and related services deleted successfully" });
      } catch (err) {
        await pool.query('ROLLBACK');
        throw err;
      }
    } else {
      const [result] = await pool.query("DELETE FROM Pickup_Location WHERE pickup_id = ?", [pickup_id]);
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "Pickup location not found" });
      }

      res.json({ message: "Pickup location deleted successfully" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk upload endpoint
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

router.post("/bulk-upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const { organization_id } = req.body;
  if (!organization_id) {
    return res.status(400).json({ error: "Organization ID is required" });
  }

  try {
    // Process Excel file here (similar to destinations)
    // This would require XLSX library integration
    res.json({ message: "Bulk upload functionality ready for Excel processing" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;