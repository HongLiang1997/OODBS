const express = require('express');
const router = express.Router();

let pool;

// Middleware to inject the DB pool into router (optional)
router.use((req, res, next) => {
  if (!pool) pool = req.app.get('pool');
  next();
});

// GET all buses
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM bus');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET bus by bus_id
router.get('/:bus_id', async (req, res) => {
  const { bus_id } = req.params;
  try {
    const [rows] = await pool.query(
      'SELECT * FROM bus WHERE bus_id = ?',
      [bus_id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Bus not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/organization/:organization_id', async (req, res) => {
  const { organization_id } = req.params;
  try {
    const [rows] = await pool.query(
      'SELECT * FROM bus WHERE organization_id = ?',
      [organization_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;