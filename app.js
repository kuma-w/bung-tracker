require('dotenv').config();
const express = require('express');
const eventsRouter   = require('./routes/events');
const paymentsRouter = require('./routes/payments');

const app = express();
app.use(express.json());
app.use(eventsRouter);
app.use(paymentsRouter);

module.exports = app;
