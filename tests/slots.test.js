jest.mock('../lib/supabase');
const { derivePaymentStatus, buildResultMessages } = require('../lib/slots');

describe('derivePaymentStatus', () => {
  test('전원 ok → assigned', () => {
    const results = [
      { status: 'ok' }, { status: 'ok' },
    ];
    expect(derivePaymentStatus(results)).toBe('assigned');
  });

  test('전원 duplicate → assigned', () => {
    const results = [
      { status: 'duplicate' }, { status: 'duplicate' },
    ];
    expect(derivePaymentStatus(results)).toBe('assigned');
  });

  test('ok + duplicate 혼합 → assigned', () => {
    const results = [
      { status: 'ok' }, { status: 'duplicate' },
    ];
    expect(derivePaymentStatus(results)).toBe('assigned');
  });

  test('ok + full 혼합 → partial', () => {
    const results = [
      { status: 'ok' }, { status: 'full' },
    ];
    expect(derivePaymentStatus(results)).toBe('partial');
  });

  test('ok + no_event 혼합 → partial', () => {
    const results = [
      { status: 'ok' }, { status: 'no_event' },
    ];
    expect(derivePaymentStatus(results)).toBe('partial');
  });

  test('전원 full → failed', () => {
    const results = [
      { status: 'full' }, { status: 'full' },
    ];
    expect(derivePaymentStatus(results)).toBe('failed');
  });

  test('전원 no_event → failed', () => {
    const results = [{ status: 'no_event' }];
    expect(derivePaymentStatus(results)).toBe('failed');
  });
});

describe('buildResultMessages', () => {
  test('ok 메시지', () => {
    const msgs = buildResultMessages([
      { name: '홍길동', date: '2026-04-17', status: 'ok', slot_time: '10:30' },
    ]);
    expect(msgs[0]).toBe('✅ 홍길동 2026-04-17 10:30 등록 완료');
  });

  test('duplicate 메시지', () => {
    const msgs = buildResultMessages([
      { name: '홍길동', date: '2026-04-17', status: 'duplicate', slot_time: '10:30' },
    ]);
    expect(msgs[0]).toBe('⚠️ 홍길동 2026-04-17 10:30 이미 등록됨');
  });

  test('full 메시지', () => {
    const msgs = buildResultMessages([
      { name: '홍길동', date: '2026-04-17', status: 'full' },
    ]);
    expect(msgs[0]).toBe('❌ 홍길동 2026-04-17 만석');
  });

  test('no_event 메시지', () => {
    const msgs = buildResultMessages([
      { name: '홍길동', date: '2026-04-17', status: 'no_event' },
    ]);
    expect(msgs[0]).toBe('❌ 홍길동 2026-04-17 벙 없음');
  });
});
