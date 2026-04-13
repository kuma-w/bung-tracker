require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT || '3000');
const SLOT_CAPACITY = parseInt(process.env.SLOT_CAPACITY || '10');

// ─── Supabase 클라이언트 ────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

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
  const { data, error } = await supabase
    .from('attendees')
    .select('time_slot')
    .eq('event_date', eventDate);

  if (error) throw error;

  const filled = {};
  for (const row of data) {
    filled[row.time_slot] = (filled[row.time_slot] || 0) + 1;
  }

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
    const { data: existing, error: selectError } = await supabase
      .from('attendees')
      .select('time_slot')
      .eq('event_date', date)
      .eq('name', String(name).trim())
      .maybeSingle();

    if (selectError) throw selectError;

    if (existing) {
      return res.status(409).json({
        success: false,
        message: `${name}님은 이미 ${date} 벙 ${existing.time_slot} 타임에 등록되어 있습니다.`,
        data: { date, name, time_slot: existing.time_slot },
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

    const { error: insertError } = await supabase
      .from('attendees')
      .insert({ event_date: date, time_slot: slot, name: String(name).trim(), amount: Number(amount) });

    if (insertError) throw insertError;

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
    const { data: rows, error } = await supabase
      .from('attendees')
      .select('name, time_slot, amount, registered_at')
      .eq('event_date', date)
      .order('time_slot')
      .order('registered_at');

    if (error) throw error;

    const bungType = getBungType(date);
    const slot1030 = rows.filter((r) => r.time_slot === '10:30');
    const slot1200 = rows.filter((r) => r.time_slot === '12:00');

    const toKST = (ts) =>
      new Date(ts).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).replace('T', ' ');

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
          attendees: slot1030.map((r) => ({ name: r.name, registered_at: toKST(r.registered_at) })),
        },
        '12:00': {
          count: slot1200.length,
          capacity: SLOT_CAPACITY,
          remaining: Math.max(0, SLOT_CAPACITY - slot1200.length),
          attendees: slot1200.map((r) => ({ name: r.name, registered_at: toKST(r.registered_at) })),
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
    const { data: rows, error, count } = await supabase
      .from('attendees')
      .select('event_date, time_slot, name, amount, registered_at', { count: 'exact' })
      .order('event_date', { ascending: false })
      .order('time_slot')
      .order('registered_at')
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const toKST = (ts) =>
      new Date(ts).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).replace('T', ' ');

    return res.json({
      total: count,
      limit,
      offset,
      attendees: rows.map((r) => ({ ...r, registered_at: toKST(r.registered_at) })),
    });
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
    const { error, count } = await supabase
      .from('attendees')
      .delete({ count: 'exact' })
      .eq('event_date', date)
      .eq('name', decodeURIComponent(name));

    if (error) throw error;

    if (count === 0) {
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
app.listen(PORT, () => {
  console.log(`Bung Tracker 서버 실행 중 → http://localhost:${PORT}`);
  console.log(`슬롯 정원: ${SLOT_CAPACITY}명 / 타임`);
});
