const express = require('express');
const router = express.Router();

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

// GET organization by organization_id
router.get('/:organization_id', async (req, res) => {
  const { organization_id } = req.params;
  try {
    const [rows] = await pool.query(
      'SELECT * FROM Organization WHERE organization_id = ?',
      [organization_id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;