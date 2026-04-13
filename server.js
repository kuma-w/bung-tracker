require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT || '3000');
const SLOT_CAPACITY = parseInt(process.env.SLOT_CAPACITY || '10');

// ─── DB 초기화 ──────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS attendees (
      id            SERIAL PRIMARY KEY,
      event_date    DATE        NOT NULL,
      time_slot     VARCHAR(5)  NOT NULL,
      name          TEXT        NOT NULL,
      amount        INTEGER     NOT NULL,
      registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(event_date, name)
    )
  `);
  console.log('DB 테이블 준비 완료');
}

// ─── 헬퍼 함수 ─────────────────────────────────────────────

function getBungType(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const dow = date.getDay(); // 0=일, 4=목
  if (dow === 4) return 'thursday';
  if (dow === 0) return 'sunday';
  return null;
}

function getExpectedAmount(bungType) {
  if (bungType === 'thursday') return 1500;
  if (bungType === 'sunday')   return 2000;
  return null;
}

function getBungTypeLabel(bungType) {
  if (bungType === 'thursday') return '목요일(평일)';
  if (bungType === 'sunday')   return '일요일(주말)';
  return '미정';
}

async function assignSlot(eventDate) {
  const { rows } = await pool.query(
    `SELECT time_slot, COUNT(*) AS cnt
     FROM attendees
     WHERE event_date = $1
     GROUP BY time_slot`,
    [eventDate]
  );

  const filled = {};
  for (const row of rows) filled[row.time_slot] = parseInt(row.cnt);

  if ((filled['10:30'] || 0) < SLOT_CAPACITY) return '10:30';
  if ((filled['12:00'] || 0) < SLOT_CAPACITY) return '12:00';
  return null;
}

// ─── API ───────────────────────────────────────────────────

/**
 * POST /payment
 * Tasker → 서버로 입금 알림 전송
 *
 * Body: { "date": "2026-04-16", "name": "홍길동", "amount": 1500 }
 */
app.post('/payment', async (req, res) => {
  const { date, name, amount } = req.body;

  if (!date || !name || amount === undefined) {
    return res.status(400).json({
      success: false,
      message: 'date, name, amount 필드가 모두 필요합니다.',
    });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({
      success: false,
      message: 'date 형식은 YYYY-MM-DD 이어야 합니다.',
    });
  }

  const bungType = getBungType(date);
  if (!bungType) {
    return res.status(400).json({
      success: false,
      message: `${date}은 벙 개설 요일(목요일/일요일)이 아닙니다.`,
    });
  }

  const expected = getExpectedAmount(bungType);
  if (Number(amount) !== expected) {
    return res.status(400).json({
      success: false,
      message: `금액 불일치. ${getBungTypeLabel(bungType)} 벙 참가비는 ${expected}원입니다. (받은 금액: ${amount}원)`,
    });
  }

  try {
    // 중복 등록 확인
    const { rows: existing } = await pool.query(
      'SELECT time_slot FROM attendees WHERE event_date = $1 AND name = $2',
      [date, name]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: `${name}님은 이미 ${date} 벙 ${existing[0].time_slot} 타임에 등록되어 있습니다.`,
        data: { date, name, time_slot: existing[0].time_slot },
      });
    }

    // 슬롯 배정
    const slot = await assignSlot(date);
    if (!slot) {
      return res.status(409).json({
        success: false,
        message: `${date} 벙이 모든 타임 만석입니다. (10:30 / 12:00 각 ${SLOT_CAPACITY}명)`,
      });
    }

    await pool.query(
      'INSERT INTO attendees (event_date, time_slot, name, amount) VALUES ($1, $2, $3, $4)',
      [date, slot, String(name).trim(), Number(amount)]
    );

    return res.status(201).json({
      success: true,
      message: `${name}님 ${date} ${slot} 타임 벙 등록 완료!`,
      data: { date, name, time_slot: slot, amount: Number(amount) },
    });
  } catch (err) {
    console.error('POST /payment 오류:', err.message);
    return res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

/**
 * GET /attendance/:date
 * 특정 날짜 벙 참석자 조회
 */
app.get('/attendance/:date', async (req, res) => {
  const { date } = req.params;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ success: false, message: 'date 형식은 YYYY-MM-DD 이어야 합니다.' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT name, time_slot, amount,
              TO_CHAR(registered_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI:SS') AS registered_at
       FROM attendees
       WHERE event_date = $1
       ORDER BY time_slot, registered_at`,
      [date]
    );

    const bungType = getBungType(date);
    const slot1030 = rows.filter((r) => r.time_slot === '10:30');
    const slot1200 = rows.filter((r) => r.time_slot === '12:00');

    return res.json({
      date,
      bung_type: bungType,
      bung_type_label: getBungTypeLabel(bungType),
      expected_amount: bungType ? getExpectedAmount(bungType) : null,
      total: rows.length,
      slots: {
        '10:30': {
          count: slot1030.length,
          capacity: SLOT_CAPACITY,
          remaining: Math.max(0, SLOT_CAPACITY - slot1030.length),
          attendees: slot1030.map((r) => ({ name: r.name, registered_at: r.registered_at })),
        },
        '12:00': {
          count: slot1200.length,
          capacity: SLOT_CAPACITY,
          remaining: Math.max(0, SLOT_CAPACITY - slot1200.length),
          attendees: slot1200.map((r) => ({ name: r.name, registered_at: r.registered_at })),
        },
      },
    });
  } catch (err) {
    console.error('GET /attendance/:date 오류:', err.message);
    return res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

/**
 * GET /attendance
 * 전체 참석자 조회
 *
 * Query: ?limit=100&offset=0
 */
app.get('/attendance', async (req, res) => {
  const limit  = parseInt(req.query.limit  || '100');
  const offset = parseInt(req.query.offset || '0');

  try {
    const { rows } = await pool.query(
      `SELECT event_date, time_slot, name, amount,
              TO_CHAR(registered_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI:SS') AS registered_at
       FROM attendees
       ORDER BY event_date DESC, time_slot, registered_at
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const { rows: countRows } = await pool.query('SELECT COUNT(*) AS cnt FROM attendees');
    const total = parseInt(countRows[0].cnt);

    return res.json({ total, limit, offset, attendees: rows });
  } catch (err) {
    console.error('GET /attendance 오류:', err.message);
    return res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

/**
 * DELETE /attendance/:date/:name
 * 특정 등록 취소
 */
app.delete('/attendance/:date/:name', async (req, res) => {
  const { date, name } = req.params;

  try {
    const { rowCount } = await pool.query(
      'DELETE FROM attendees WHERE event_date = $1 AND name = $2',
      [date, decodeURIComponent(name)]
    );

    if (rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: `${name}님의 ${date} 벙 등록 정보를 찾을 수 없습니다.`,
      });
    }

    return res.json({
      success: true,
      message: `${name}님의 ${date} 벙 등록이 취소되었습니다.`,
    });
  } catch (err) {
    console.error('DELETE /attendance 오류:', err.message);
    return res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// ─── 서버 시작 ─────────────────────────────────────────────
initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Bung Tracker 서버 실행 중 → http://localhost:${PORT}`);
      console.log(`슬롯 정원: ${SLOT_CAPACITY}명 / 타임`);
    });
  })
  .catch((err) => {
    console.error('DB 초기화 실패:', err.message);
    process.exit(1);
  });
