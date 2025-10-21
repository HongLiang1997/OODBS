const express = require('express');
const router = express.Router();

// POST /auth/login (Admin login)
router.post('/login', async (req, res) => {
  const pool = req.app.get('pool');
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password required.' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE email = ? AND password_hash = ? LIMIT 1',
      [email, password]
    );

    if (rows.length === 1) {
      // Authenticated
      const user = rows[0];
      // Don't send password back!
      delete user.password;
      return res.json({ success: true, user });
    } else {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// POST /auth/passenger-login (Passenger login)
router.post('/passenger-login', async (req, res) => {
  const pool = req.app.get('pool');
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password required.' });
  }

  try {
    // Assuming passengers table exists with similar structure
    const [rows] = await pool.query(
      'SELECT * FROM Users WHERE email = ? AND password_hash = ? LIMIT 1',
      [email, password]
    );

    if (rows.length === 1) {
      // Authenticated
      const passenger = rows[0];
      // Don't send password back!
      delete passenger.password_hash;
      return res.json({ success: true, user: passenger });
    } else {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// POST /auth/driver-login (Driver login using plate number and phone)
router.post('/driver-login', async (req, res) => {
  const pool = req.app.get('pool');
  const { plate_number, phone_number } = req.body;

  if (!plate_number || !phone_number) {
    return res.status(400).json({ message: 'Plate number and phone number required.' });
  }

  try {
    // Query to authenticate driver: find user by phone, then check if they have a bus with the plate number
    const [rows] = await pool.query(
      `SELECT 
         b.bus_id,
         b.plate_number,
         b.capacity,
         b.company,
         b.status,
         b.organization_id,
         b.driver_id,
         u.full_name as driver_name,
         u.phone_num as driver_phone_num,
         u.user_id
       FROM users u
       INNER JOIN bus b ON u.user_id = b.driver_id
       WHERE u.phone_num = ? AND b.plate_number = ? AND b.status = 'active'
       LIMIT 1`,
      [phone_number, plate_number]
    );

    if (rows.length === 1) {
      // Authenticated
      const driver = rows[0];
      return res.json({ 
        success: true, 
        driver: {
          bus_id: driver.bus_id,
          plate_number: driver.plate_number,
          driver_name: driver.driver_name || 'Unknown Driver', // fallback if user not found
          driver_phone_num: driver.driver_phone_num,
          capacity: driver.capacity,
          company: driver.company,
          status: driver.status,
          organization_id: driver.organization_id,
          user_id: driver.user_id
        }
      });
    } else {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid plate number or phone number, or bus is not active.' 
      });
    }
  } catch (err) {
    console.error('Driver login error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;