require('dotenv').config();
const express = require('express');
const eventsRouter   = require('./routes/events');
const paymentsRouter = require('./routes/payments');

const app = express();
app.use(express.json());
app.use(eventsRouter);
app.use(paymentsRouter);

const PORT = parseInt(process.env.PORT || '3000');
app.listen(PORT, () => {
  console.log(`Bung Tracker 서버 실행 중 → http://localhost:${PORT}`);
});
