const request = require('supertest');
const app = require('../../app');

jest.mock('../../lib/supabase');
const supabase = require('../../lib/supabase');

const ADMIN_KEY = process.env.ADMIN_KEY || 'test-admin-key';
process.env.ADMIN_KEY = ADMIN_KEY;

beforeEach(() => jest.clearAllMocks());

// ─── 공통 mock 헬퍼 ─────────────────────────────────────────

/** payments insert → { id } 반환 mock */
function mockSavePayment(id = 1) {
  return {
    data: { id },
    error: null,
  };
}

/**
 * POST /payment 성공 시나리오 전체 mock 설정
 * events → amount_per_person, event_slots 수 조회
 * event_slots → 슬롯 배정용
 * attendees → 기존 참석자 조회 + 삽입
 * payments → 저장·업데이트
 */
function setupPostPaymentMock({ amountPerPerson = 1500, slots = 2, existingAttendees = [] } = {}) {
  const eventSlots = Array.from({ length: slots }, (_, i) => ({
    id: i + 1,
    slot_time: i === 0 ? '10:30' : '12:00',
    capacity: 10,
  }));

  supabase.from.mockImplementation((table) => {
    if (table === 'payments') {
      return {
        insert: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { id: 1 }, error: null }),
      };
    }
    if (table === 'events') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: 1, amount_per_person: amountPerPerson, event_slots: eventSlots },
          error: null,
        }),
      };
    }
    if (table === 'event_slots') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: 1, event_slots: eventSlots },
          error: null,
        }),
      };
    }
    if (table === 'attendees') {
      return {
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockResolvedValue({ data: existingAttendees, error: null }),
        }),
        insert: jest.fn().mockResolvedValue({ error: null }),
      };
    }
    return {};
  });
}

// ─── POST /payment ───────────────────────────────────────────

describe('POST /payment', () => {
  test('201 — 1타임 이벤트, 시간 미지정 → 자동 배정', async () => {
    setupPostPaymentMock({ amountPerPerson: 1500, slots: 1 });
    const res = await request(app)
      .post('/payment')
      .send({ content: '홍길동 0417', amount: 1500 });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  test('201 — 2타임 이벤트, 시간 미지정 → 전체 슬롯 배정', async () => {
    setupPostPaymentMock({ amountPerPerson: 1500, slots: 2 });
    const res = await request(app)
      .post('/payment')
      .send({ content: '홍길동 0417', amount: 3000 }); // 1500 × 2타임
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  test('201 — 2타임 명시', async () => {
    setupPostPaymentMock({ amountPerPerson: 1500, slots: 2 });
    const res = await request(app)
      .post('/payment')
      .send({ content: '홍길동 2타임 0417', amount: 3000 });
    expect(res.status).toBe(201);
  });

  test('201 — 슬롯 지정 (12:00)', async () => {
    setupPostPaymentMock({ amountPerPerson: 1500, slots: 2 });
    const res = await request(app)
      .post('/payment')
      .send({ content: '홍길동 12:00 0417', amount: 1500 });
    expect(res.status).toBe(201);
  });

  test('201 — 이름 여러 명', async () => {
    setupPostPaymentMock({ amountPerPerson: 1500, slots: 1 });
    const res = await request(app)
      .post('/payment')
      .send({ content: '홍길동 김철수 0417', amount: 3000 });
    expect(res.status).toBe(201);
  });

  test('400 — content 누락', async () => {
    const res = await request(app)
      .post('/payment')
      .send({ amount: 1500 });
    expect(res.status).toBe(400);
  });

  test('422 — 날짜 없음 → 파싱 실패', async () => {
    supabase.from.mockReturnValue({
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 1 }, error: null }),
    });

    const res = await request(app)
      .post('/payment')
      .send({ content: '홍길동', amount: 1500 });
    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  test('422 — 이름 없음 → 파싱 실패', async () => {
    supabase.from.mockReturnValue({
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 1 }, error: null }),
    });

    const res = await request(app)
      .post('/payment')
      .send({ content: '0417', amount: 1500 });
    expect(res.status).toBe(422);
  });

  test('400 — 금액 불일치', async () => {
    setupPostPaymentMock({ amountPerPerson: 1500, slots: 1 });
    const res = await request(app)
      .post('/payment')
      .send({ content: '홍길동 0417', amount: 9999 });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('400 — 벙 없는 날짜', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'payments') {
        return {
          insert: jest.fn().mockReturnThis(),
          update: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: { id: 1 }, error: null }),
        };
      }
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      };
    });

    const res = await request(app)
      .post('/payment')
      .send({ content: '홍길동 0101', amount: 1500 });
    expect(res.status).toBe(400);
  });
});

// ─── GET /payments ───────────────────────────────────────────

describe('GET /payments', () => {
  test('200 — 전체 목록 반환', async () => {
    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      then: (resolve) => resolve({
        data: [{ id: 1, raw_content: '홍길동 0417', amount: 1500, status: 'assigned', created_at: '2026-04-14T01:00:00Z' }],
        error: null,
        count: 1,
      }),
    });

    const res = await request(app)
      .get('/payments')
      .set('x-admin-key', ADMIN_KEY);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
  });

  test('403 — 인증 키 없음', async () => {
    const res = await request(app).get('/payments');
    expect(res.status).toBe(403);
  });
});

// ─── POST /payments/:id/assign ───────────────────────────────

describe('POST /payments/:id/assign', () => {
  const body = { names: ['홍길동'], dates: ['2026-04-17'] };

  test('404 — payment 없음', async () => {
    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
    });

    const res = await request(app)
      .post('/payments/999/assign')
      .set('x-admin-key', ADMIN_KEY)
      .send(body);
    expect(res.status).toBe(404);
  });

  test('409 — 이미 assigned 상태', async () => {
    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { id: 1, amount: 1500, status: 'assigned' },
        error: null,
      }),
    });

    const res = await request(app)
      .post('/payments/1/assign')
      .set('x-admin-key', ADMIN_KEY)
      .send(body);
    expect(res.status).toBe(409);
  });

  test('400 — names 누락', async () => {
    const res = await request(app)
      .post('/payments/1/assign')
      .set('x-admin-key', ADMIN_KEY)
      .send({ dates: ['2026-04-17'] });
    expect(res.status).toBe(400);
  });
});
