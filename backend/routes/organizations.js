const express = require('express');
const router = express.Router();

// Pass in your MySQL promisePool from index.js
let pool;

// Middleware to inject the DB pool into router (optional)
router.use((req, res, next) => {
  if (!pool) pool = req.app.get('pool');
  next();
});

// GET all organizations
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM Organization');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST new organization
router.post('/', async (req, res) => {
  const { organization_id, name, type, contact_email } = req.body;
  if (!organization_id || !name || !type || !contact_email) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    await pool.query(
      'INSERT INTO Organization (organization_id, name, type, contact_email) VALUES (?, ?, ?, ?)',
      [organization_id, name, type, contact_email]
    );
    res.status(201).json({ message: 'Organization added', id: organization_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
