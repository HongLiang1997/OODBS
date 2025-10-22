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

// POST /auth/driver-login (Driver login using email and password with role check)
router.post('/driver-login', async (req, res) => {
  const pool = req.app.get('pool');
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password required.' });
  }

  try {
    // Query to authenticate driver: check email, password, and role = 'driver'
    const [rows] = await pool.query(
      `SELECT 
         u.user_id,
         u.full_name,
         u.email,
         u.phone_num,
         u.role,
         u.organization_id,
         b.bus_id,
         b.plate_number,
         b.capacity,
         b.company,
         b.status as bus_status
       FROM users u
       LEFT JOIN bus b ON u.user_id = b.driver_id
       WHERE u.email = ? AND u.password_hash = ? AND u.role = 'driver'
       LIMIT 1`,
      [email, password]
    );

    if (rows.length === 1) {
      // Authenticated
      const driver = rows[0];
      return res.json({ 
        success: true, 
        driver: {
          user_id: driver.user_id,
          full_name: driver.full_name,
          email: driver.email,
          phone_num: driver.phone_num,
          role: driver.role,
          organization_id: driver.organization_id,
          bus_id: driver.bus_id,
          plate_number: driver.plate_number,
          capacity: driver.capacity,
          company: driver.company,
          bus_status: driver.bus_status
        }
      });
    } else {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password, or user is not a driver.' 
      });
    }
  } catch (err) {
    console.error('Driver login error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;