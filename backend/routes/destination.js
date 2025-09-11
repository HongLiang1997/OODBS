const express = require("express");
const router = express.Router();

let pool;

// Middleware to inject the DB pool into router
router.use((req, res, next) => {
  if (!pool) pool = req.app.get("pool");
  next();
});

// GET /destinations/organization/:organization_id - Get all destinations for an organization
router.get("/organization/:organization_id", async (req, res) => {
  const { organization_id } = req.params;
  try {
    const [rows] = await pool.query(
      `SELECT 
         location_id,
         organization_id,
         name,
         latitude,
         longitude
       FROM Organization_Locations
       WHERE organization_id = ?
       ORDER BY name ASC`,
      [organization_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /destinations/check-duplicate - Check if destination with same coordinates exists
router.get("/check-duplicate", async (req, res) => {
  const { latitude, longitude, organization_id } = req.query;
  
  if (!latitude || !longitude || !organization_id) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  try {
    const [rows] = await pool.query(
      `SELECT location_id, name 
       FROM Organization_Locations 
       WHERE organization_id = ? AND latitude = ? AND longitude = ?
       LIMIT 1`,
      [organization_id, parseFloat(latitude), parseFloat(longitude)]
    );
    
    res.json({ 
      exists: rows.length > 0,
      existingLocation: rows.length > 0 ? rows[0] : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /destinations/:location_id - Get a specific destination
router.get("/:location_id", async (req, res) => {
  const { location_id } = req.params;
  try {
    const [rows] = await pool.query(
      `SELECT 
         location_id,
         organization_id,
         name,
         latitude,
         longitude
       FROM Organization_Locations
       WHERE location_id = ?`,
      [location_id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: "Destination not found" });
    }
    
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /destinations - Create a new destination
router.post("/", async (req, res) => {
  const { organization_id, name, latitude, longitude } = req.body;

  if (!organization_id || !name || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: "Missing required fields: organization_id, name, latitude, longitude" });
  }

  try {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    
    console.log(`Checking for duplicates: org=${organization_id}, lat=${lat}, lng=${lng}`);
    
    // Check if destination with same coordinates already exists (with tolerance for float precision)
    const [existingRows] = await pool.query(
      `SELECT location_id, name, latitude, longitude
       FROM Organization_Locations 
       WHERE organization_id = ? 
       AND ABS(latitude - ?) < 0.00001 
       AND ABS(longitude - ?) < 0.00001
       LIMIT 1`,
      [organization_id, lat, lng]
    );
    
    console.log(`Found ${existingRows.length} existing entries`);
    if (existingRows.length > 0) {
      console.log(`Duplicate found: ${existingRows[0].name} at ${existingRows[0].latitude}, ${existingRows[0].longitude}`);
    }
    
    if (existingRows.length > 0) {
      return res.status(409).json({ 
        error: `Destination with these coordinates already exists: "${existingRows[0].name}"` 
      });
    }

    console.log(`Inserting new destination: ${name}`);
    const [result] = await pool.query(
      `INSERT INTO Organization_Locations (organization_id, name, latitude, longitude)
       VALUES (?, ?, ?, ?)`,
      [organization_id, name, lat, lng]
    );

    console.log(`Successfully inserted with ID: ${result.insertId}`);
    res.status(201).json({ 
      message: "Destination created successfully",
      location_id: result.insertId 
    });
  } catch (err) {
    console.error("Error in POST /destinations:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /destinations/:location_id - Update a destination
router.put("/:location_id", async (req, res) => {
  const { location_id } = req.params;
  const { name, latitude, longitude } = req.body;

  if (!name || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: "Missing required fields: name, latitude, longitude" });
  }

  try {
    const [result] = await pool.query(
      `UPDATE Organization_Locations SET
        name = ?,
        latitude = ?,
        longitude = ?
      WHERE location_id = ?`,
      [name, latitude, longitude, location_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Destination not found" });
    }

    res.json({ message: "Destination updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /destinations/:location_id - Delete a destination
router.delete("/:location_id", async (req, res) => {
  const { location_id } = req.params;

  try {
    // Start a transaction to handle foreign key constraints
    await pool.query("START TRANSACTION");

    // Check if destination exists first
    const [existingDestination] = await pool.query(
      "SELECT location_id FROM Organization_Locations WHERE location_id = ?",
      [location_id]
    );

    if (existingDestination.length === 0) {
      await pool.query("ROLLBACK");
      return res.status(404).json({ error: "Destination not found" });
    }

    // Check if destination is being used in passenger_requests
    const [passengerRequests] = await pool.query(
      "SELECT COUNT(*) as count FROM passenger_requests WHERE location_id = ?",
      [location_id]
    );

    if (passengerRequests[0].count > 0) {
      await pool.query("ROLLBACK");
      return res.status(400).json({ 
        error: "Cannot delete destination", 
        message: `This destination is currently being used in ${passengerRequests[0].count} passenger request(s). Please remove or reassign these requests before deleting the destination.`
      });
    }

    // Check if destination is being used in other tables that might reference it
    // Add more checks here if there are other tables with foreign key references
    
    // If no foreign key references, proceed with deletion
    const [result] = await pool.query(
      "DELETE FROM Organization_Locations WHERE location_id = ?",
      [location_id]
    );

    if (result.affectedRows === 0) {
      await pool.query("ROLLBACK");
      return res.status(404).json({ error: "Destination not found" });
    }

    await pool.query("COMMIT");
    res.json({ message: "Destination deleted successfully" });

  } catch (err) {
    await pool.query("ROLLBACK");
    console.error("Error deleting destination:", err);
    
    // Handle specific foreign key constraint errors
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      res.status(400).json({ 
        error: "Cannot delete destination", 
        message: "This destination is currently being referenced by other records. Please remove or reassign these references before deleting."
      });
    } else {
      res.status(500).json({ 
        error: "Failed to delete destination", 
        details: err.message 
      });
    }
  }
});

// DELETE /destinations/:location_id/force - Force delete a destination and all related records
router.delete("/:location_id/force", async (req, res) => {
  const { location_id } = req.params;

  try {
    // Start a transaction to handle cascading deletes
    await pool.query("START TRANSACTION");

    // Check if destination exists first
    const [existingDestination] = await pool.query(
      "SELECT location_id, name FROM Organization_Locations WHERE location_id = ?",
      [location_id]
    );

    if (existingDestination.length === 0) {
      await pool.query("ROLLBACK");
      return res.status(404).json({ error: "Destination not found" });
    }

    // Delete related records first (in correct order to avoid foreign key constraints)
    
    // 1. Delete passenger requests that reference this location
    const [passengerRequestsResult] = await pool.query(
      "DELETE FROM passenger_requests WHERE location_id = ?",
      [location_id]
    );

    // Add more cascading deletes here if there are other tables that reference this location
    // Example:
    // const [servicesResult] = await pool.query(
    //   "DELETE FROM services WHERE pickup_location_id = ? OR destination_location_id = ?",
    //   [location_id, location_id]
    // );

    // 2. Finally delete the destination itself
    const [result] = await pool.query(
      "DELETE FROM Organization_Locations WHERE location_id = ?",
      [location_id]
    );

    await pool.query("COMMIT");

    res.json({ 
      message: "Destination and all related records deleted successfully",
      deletedRecords: {
        destination: existingDestination[0].name,
        passengerRequests: passengerRequestsResult.affectedRows,
        // Add more counts here as needed
      }
    });

  } catch (err) {
    await pool.query("ROLLBACK");
    console.error("Error force deleting destination:", err);
    res.status(500).json({ 
      error: "Failed to delete destination and related records", 
      details: err.message 
    });
  }
});

module.exports = router;