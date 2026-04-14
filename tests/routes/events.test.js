const request = require('supertest');
const app = require('../../app');

jest.mock('../../lib/supabase');
const supabase = require('../../lib/supabase');

const ADMIN_KEY = process.env.ADMIN_KEY || 'test-admin-key';
process.env.ADMIN_KEY = ADMIN_KEY;

// Supabase 체이닝 헬퍼
function mockChain(result) {
  const chain = {};
  const methods = ['select', 'insert', 'update', 'delete', 'eq', 'in', 'order',
                   'range', 'single', 'maybeSingle'];
  methods.forEach((m) => {
    chain[m] = jest.fn().mockReturnValue(
      m === 'single' || m === 'maybeSingle'
        ? Promise.resolve(result)
        : chain
    );
  });
  // 마지막 체인이 await될 수 있도록 thenable 처리
  chain.then = (resolve) => resolve(result);
  return chain;
}

beforeEach(() => jest.clearAllMocks());

// ─── GET /events ────────────────────────────────────────────

describe('GET /events', () => {
  test('200 — 전체 벙 목록 반환', async () => {
    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        order: jest.fn().mockResolvedValue({
          data: [
            {
              id: 1,
              event_date: '2026-04-17',
              amount_per_person: 1500,
              created_at: '2026-04-14T01:00:00Z',
              event_slots: [
                { id: 1, slot_time: '10:30', capacity: 10, attendees: [{ id: 1 }, { id: 2 }] },
                { id: 2, slot_time: '12:00', capacity: 10, attendees: [] },
              ],
            },
          ],
          error: null,
        }),
      }),
    });

    const res = await request(app).get('/events');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.events[0].slots[0].count).toBe(2);
    expect(res.body.events[0].slots[0].remaining).toBe(8);
  });
});

// ─── GET /events/:date ──────────────────────────────────────

describe('GET /events/:date', () => {
  test('200 — 특정 날짜 벙 상세 반환', async () => {
    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: {
              id: 1,
              event_date: '2026-04-17',
              amount_per_person: 1500,
              created_at: '2026-04-14T01:00:00Z',
              event_slots: [
                {
                  id: 1, slot_time: '10:30', capacity: 10,
                  attendees: [{ name: '홍길동', registered_at: '2026-04-14T01:00:00Z' }],
                },
              ],
            },
            error: null,
          }),
        }),
      }),
    });

    const res = await request(app).get('/events/2026-04-17');
    expect(res.status).toBe(200);
    expect(res.body.event_date).toBe('2026-04-17');
    expect(res.body.slots[0].attendees[0].name).toBe('홍길동');
  });

  test('400 — 날짜 형식 오류', async () => {
    const res = await request(app).get('/events/20260417');
    expect(res.status).toBe(400);
  });

  test('404 — 벙 없음', async () => {
    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST116' },
          }),
        }),
      }),
    });

    const res = await request(app).get('/events/2026-01-01');
    expect(res.status).toBe(404);
  });
});

// ─── POST /events ───────────────────────────────────────────

describe('POST /events', () => {
  const body = {
    event_date: '2026-04-17',
    amount_per_person: 1500,
    slots: [{ slot_time: '10:30', capacity: 10 }, { slot_time: '12:00', capacity: 10 }],
  };

  test('201 — 벙 생성 성공', async () => {
    const chain = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { id: 1, event_date: '2026-04-17', amount_per_person: 1500 },
        error: null,
      }),
    };
    supabase.from.mockImplementation((table) => {
      if (table === 'events') return chain;
      return {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue({
          data: [{ id: 1, slot_time: '10:30', capacity: 10 }, { id: 2, slot_time: '12:00', capacity: 10 }],
          error: null,
        }),
      };
    });

    const res = await request(app)
      .post('/events')
      .set('x-admin-key', ADMIN_KEY)
      .send(body);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  test('400 — 필드 누락', async () => {
    const res = await request(app)
      .post('/events')
      .set('x-admin-key', ADMIN_KEY)
      .send({ event_date: '2026-04-17' });
    expect(res.status).toBe(400);
  });

  test('403 — 인증 키 없음', async () => {
    const res = await request(app).post('/events').send(body);
    expect(res.status).toBe(403);
  });

  test('409 — 날짜 중복', async () => {
    const chain = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: null,
        error: { code: '23505' },
      }),
    };
    supabase.from.mockReturnValue(chain);

    const res = await request(app)
      .post('/events')
      .set('x-admin-key', ADMIN_KEY)
      .send(body);
    expect(res.status).toBe(409);
  });
});

// ─── PATCH /events/:date ────────────────────────────────────

describe('PATCH /events/:date', () => {
  const mockEvent = {
    id: 1,
    event_slots: [
      { id: 1, slot_time: '10:30', capacity: 10, attendees: [] },
      { id: 2, slot_time: '12:00', capacity: 10, attendees: [{ id: 1 }] },
    ],
  };
  const updatedEvent = {
    id: 1, event_date: '2026-04-17', amount_per_person: 2000,
    event_slots: [{ id: 1, slot_time: '10:30', capacity: 12, attendees: [] }],
  };

  function setupMock() {
    let callCount = 0;
    supabase.from.mockImplementation(() => ({
      select: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockImplementation(() =>
        Promise.resolve(callCount++ === 0
          ? { data: mockEvent, error: null }
          : { data: updatedEvent, error: null })
      ),
    }));
  }

  test('200 — 참가비 변경', async () => {
    setupMock();
    const res = await request(app)
      .patch('/events/2026-04-17')
      .set('x-admin-key', ADMIN_KEY)
      .send({ amount_per_person: 2000 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('400 — 수정 필드 없음', async () => {
    const res = await request(app)
      .patch('/events/2026-04-17')
      .set('x-admin-key', ADMIN_KEY)
      .send({});
    expect(res.status).toBe(400);
  });

  test('409 — 참석자 있는 슬롯 삭제 시도', async () => {
    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: mockEvent, error: null }),
    });

    const res = await request(app)
      .patch('/events/2026-04-17')
      .set('x-admin-key', ADMIN_KEY)
      .send({ delete_slots: ['12:00'] });
    expect(res.status).toBe(409);
  });
});

// ─── DELETE /events/:date ───────────────────────────────────

describe('DELETE /events/:date', () => {
  test('200 — 벙 삭제 성공', async () => {
    supabase.from.mockReturnValue({
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ error: null, count: 1 }),
    });

    const res = await request(app)
      .delete('/events/2026-04-17')
      .set('x-admin-key', ADMIN_KEY);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('404 — 존재하지 않는 벙 삭제', async () => {
    supabase.from.mockReturnValue({
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ error: null, count: 0 }),
    });

    const res = await request(app)
      .delete('/events/2026-01-01')
      .set('x-admin-key', ADMIN_KEY);
    expect(res.status).toBe(404);
  });
});
