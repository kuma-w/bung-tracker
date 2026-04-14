const app = require('./app');

const PORT = parseInt(process.env.PORT || '3000');
app.listen(PORT, () => {
  console.log(`Bung Tracker 서버 실행 중 → http://localhost:${PORT}`);
});
