require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

// Create connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});
const promisePool = pool.promise();

// Make promisePool accessible in routers via app.set
app.set('pool', promisePool);

// Import routes
const organizationsRouter = require('./routes/organizations');

// Use routes with a prefix
app.use('/organizations', organizationsRouter);
// Login
const authRouter = require('./routes/Auth');
app.use('/auth', authRouter);
//bus
const busesRouter = require('./routes/buses');
app.use('/buses', busesRouter);
//Services
const servicesRouter = require('./routes/services');
app.use('/services', servicesRouter);

const pickupRouter = require('./routes/pickuplocation');
app.use('/pickup-locations', pickupRouter);

const destinationRouter = require('./routes/destination');
app.use('/destinations', destinationRouter);

const scheduleRouter = require('./routes/schedule');
app.use('/schedule', scheduleRouter);

const passengerRouter = require('./routes/passenger');
app.use('/passenger', passengerRouter);

const routingRouter = require('./routes/routing');
app.use('/routing', routingRouter);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
