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

module.exports = router;