require('dotenv').config();
const express = require('express');
const cors = require('cors');
const eventsRouter   = require('./routes/events');
const paymentsRouter = require('./routes/payments');

const app = express();
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
}));
app.use(express.json());

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
  });
  next();
});
app.use(eventsRouter);
app.use(paymentsRouter);

module.exports = app;
