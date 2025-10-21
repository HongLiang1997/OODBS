const express = require("express");
const router = express.Router();
const multer = require("multer");
const xlsx = require("xlsx");

let pool;
const upload = multer({ dest: "uploads/" });

// Middleware to inject the DB pool into router (optional)
router.use((req, res, next) => {
  if (!pool) pool = req.app.get("pool");
  next();
});

// GET all buses
router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        b.*,
        u.full_name as driver_name,
        u.phone_num as driver_phone_num,
        u.email as driver_email
      FROM bus b
      LEFT JOIN users u ON b.driver_id = u.user_id AND u.role = 'driver'
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET bus by bus_id
router.get("/:bus_id", async (req, res) => {
  const { bus_id } = req.params;
  try {
    const [rows] = await pool.query(`
      SELECT 
        b.*,
        u.full_name as driver_name,
        u.phone_num as driver_phone_num,
        u.email as driver_email
      FROM bus b
      LEFT JOIN users u ON b.driver_id = u.user_id AND u.role = 'driver'
      WHERE b.bus_id = ?
    `, [bus_id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: "Bus not found" });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET bus by organization_id
router.get("/organization/:organization_id", async (req, res) => {
  const { organization_id } = req.params;
  try {
    const [rows] = await pool.query(`
      SELECT 
        b.*,
        u.full_name as driver_name,
        u.phone_num as driver_phone_num,
        u.email as driver_email
      FROM bus b
      LEFT JOIN users u ON b.driver_id = u.user_id AND u.role = 'driver'
      WHERE b.organization_id = ?
    `, [organization_id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST: Insert a new bus
router.post("/", async (req, res) => {
  const {
    organization_id,
    plate_number,
    driver_name,
    driver_phone_num,
    driver_email,
    driver_password,
    capacity,
    company
  } = req.body;

  if (
    !organization_id ||
    !plate_number ||
    !driver_name ||
    !driver_phone_num ||
    !driver_email ||
    !driver_password ||
    !capacity ||
    !company
  ) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    console.log(`Checking for duplicate plate number: org=${organization_id}, plate=${plate_number}`);
    
    // Check if bus with same plate number already exists in the organization
    const [existingBuses] = await pool.query(
      `SELECT bus_id, plate_number
       FROM bus 
       WHERE organization_id = ? AND plate_number = ?
       LIMIT 1`,
      [organization_id, plate_number.trim()]
    );
    
    console.log(`Found ${existingBuses.length} existing buses with plate number ${plate_number}`);
    
    if (existingBuses.length > 0) {
      return res.status(200).json({ 
        error: "Buses with these Plate Number already exists" 
      });
    }

    console.log(`Inserting new bus with plate number: ${plate_number}`);
    const [result] = await pool.query(
      `INSERT INTO Bus (
        organization_id,
        plate_number,
        driver_name,
        driver_phone_num,
        capacity,
        company,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, 'inactive')`, // status hardcoded
      [
        organization_id,
        plate_number,
        driver_name,
        driver_phone_num,
        capacity,
        company
      ]
    );
    
    console.log(`Successfully inserted bus with ID: ${result.insertId}`);
    res.status(201).json({ message: "Bus created successfully" });
  } catch (err) {
    console.error("Error in POST /buses:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Bulk upload endpoint
router.post("/bulk-upload", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;

    if (!file) return res.status(400).json({ error: "No file uploaded" });

    const workbook = xlsx.readFile(file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);

    const busesToInsert = [];

    for (const row of data) {
      const {
        plate_number,
        driver_name,
        driver_phone_num,
        capacity,
        company,
        status,
        organization_id,
      } = row;

      if (
        plate_number &&
        driver_name &&
        driver_phone_num &&
        capacity &&
        company &&
        status &&
        organization_id
      ) {
        busesToInsert.push([
          organization_id,
          plate_number,
          driver_name,
          driver_phone_num,
          capacity,
          company,
          status.toLowerCase(),
        ]);
      }
    }

    if (busesToInsert.length === 0) {
      return res.status(400).json({ error: "No valid rows to insert" });
    }

    await pool.query(
      `INSERT INTO Bus (
        organization_id,
        plate_number,
        driver_name,
        driver_phone_num,
        capacity,
        company,
        status
      ) VALUES ?`,
      [busesToInsert]
    );

    res.status(200).json({ message: "Bulk upload successful" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Bulk upload failed" });
  }
});

// PUT: Update an existing bus by ID
router.put("/:bus_id", async (req, res) => {
  const { bus_id } = req.params;
  const {
    plate_number,
    driver_name,
    driver_phone_num,
    driver_email,
    driver_password,
    capacity,
    company,
    status
  } = req.body;

  console.log("=== BUS UPDATE DEBUG ===");
  console.log("Bus ID:", bus_id);
  console.log("Update data:", {
    plate_number,
    driver_name,
    driver_phone_num,
    driver_email,
    driver_password: driver_password ? "***PROVIDED***" : "EMPTY",
    capacity,
    company,
    status
  });

  if (!plate_number || !driver_name || !driver_phone_num || !capacity || !company || !status) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // Get the current bus to find organization_id and existing driver_id
    const [busInfo] = await pool.query(
      `SELECT organization_id, driver_id FROM bus WHERE bus_id = ?`,
      [bus_id]
    );

    if (busInfo.length === 0) {
      return res.status(404).json({ error: "Bus not found" });
    }

    const organizationId = busInfo[0].organization_id;
    const existingDriverId = busInfo[0].driver_id;

    console.log(`Updating bus ${bus_id}: org=${organizationId}, existing driver_id=${existingDriverId}`);
    let userId = existingDriverId;
    
    if (existingDriverId) {
      // Update the existing user linked to this bus
      let updateQuery = `UPDATE users SET full_name = ?, phone_num = ?, organization_id = ?, role = 'driver'`;
      let updateParams = [driver_name, driver_phone_num, organizationId];
      
      // Add email if provided
      if (driver_email && driver_email.trim() !== '') {
        updateQuery += `, email = ?`;
        updateParams.push(driver_email.trim());
      }
      
      // Add password if provided
      if (driver_password && driver_password.trim() !== '') {
        updateQuery += `, password_hash = ?`;
        updateParams.push(driver_password.trim());
      }
      
      updateQuery += ` WHERE user_id = ?`;
      updateParams.push(existingDriverId);
      
      await pool.query(updateQuery, updateParams);
      console.log(`✅ Updated existing user ${existingDriverId} with email: ${driver_email || 'NO EMAIL'}, password: ${driver_password ? 'YES' : 'NO'}`);
    } else {
      // No existing driver linked - create new user if driver info provided
      if (driver_name && driver_phone_num) {
        const [userResult] = await pool.query(
          `INSERT INTO users (organization_id, full_name, phone_num, email, password_hash, role) 
           VALUES (?, ?, ?, ?, ?, 'driver')`,
          [organizationId, driver_name, driver_phone_num, driver_email || null, driver_password || 'defaultpass123']
        );
        userId = userResult.insertId;
        console.log(`✅ Created new user ${userId} with email: ${driver_email || 'NULL'}`);
      }
    }

    // Update the bus
    await pool.query(
      `UPDATE bus SET 
        plate_number = ?, 
        driver_id = ?, 
        capacity = ?, 
        company = ?, 
        status = ?
       WHERE bus_id = ?`,
      [plate_number, userId, capacity, company, status, bus_id]
    );

    console.log("✅ Bus update completed successfully");
    res.json({ 
      message: "Bus updated successfully",
      bus_id: bus_id,
      user_id: userId
    });
  } catch (err) {
    console.error("❌ Error updating bus:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE: Remove a bus by ID
router.delete("/:bus_id", async (req, res) => {
  const { bus_id } = req.params;

  try {
    const [result] = await pool.query("DELETE FROM Bus WHERE bus_id = ?", [
      bus_id,
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Bus not found" });
    }

    res.json({ message: "Bus deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
