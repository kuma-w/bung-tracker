const { parseContent } = require('../parseContent');

const YEAR = new Date().getFullYear();
const y = (m, d) => `${YEAR}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

describe('parseContent', () => {
  // ─── 이름 파싱 ───────────────────────────────────────────
  test('이름 1명 + 날짜', () => {
    const r = parseContent('홍길동 0417');
    expect(r.names).toEqual(['홍길동']);
    expect(r.dates).toEqual([y(4, 17)]);
  });

  test('이름 여러 명', () => {
    const r = parseContent('홍길동 김철수 이영희 0417');
    expect(r.names).toEqual(['홍길동', '김철수', '이영희']);
  });

  // ─── 날짜 형식 ───────────────────────────────────────────
  test('MMDD 4자리', () => {
    expect(parseContent('홍길동 0417').dates).toEqual([y(4, 17)]);
  });

  test('MDD 3자리', () => {
    expect(parseContent('홍길동 417').dates).toEqual([y(4, 17)]);
  });

  test('M/DD 슬래시', () => {
    expect(parseContent('홍길동 4/17').dates).toEqual([y(4, 17)]);
  });

  test('MM/DD 슬래시', () => {
    expect(parseContent('홍길동 04/17').dates).toEqual([y(4, 17)]);
  });

  test('M-DD 하이픈', () => {
    expect(parseContent('홍길동 4-17').dates).toEqual([y(4, 17)]);
  });

  test('M.DD 점', () => {
    expect(parseContent('홍길동 4.17').dates).toEqual([y(4, 17)]);
  });

  test('YYYY-MM-DD 전체 형식', () => {
    expect(parseContent('홍길동 2026-04-17').dates).toEqual(['2026-04-17']);
  });

  test('날짜 여러 개', () => {
    const r = parseContent('홍길동 0417 0424');
    expect(r.dates).toEqual([y(4, 17), y(4, 24)]);
  });

  // ─── 슬롯 시간 ───────────────────────────────────────────
  test('슬롯 미지정 시 slotTime = null', () => {
    expect(parseContent('홍길동 0417').slotTime).toBeNull();
  });

  test('슬롯 지정 10:30', () => {
    expect(parseContent('홍길동 10:30 0417').slotTime).toBe('10:30');
  });

  test('슬롯 지정 12:00', () => {
    expect(parseContent('홍길동 12:00 0417').slotTime).toBe('12:00');
  });

  test('슬롯 지정은 이름·날짜에 포함되지 않음', () => {
    const r = parseContent('홍길동 12:00 0417');
    expect(r.names).toEqual(['홍길동']);
    expect(r.dates).toEqual([y(4, 17)]);
  });

  // ─── N타임 ───────────────────────────────────────────────
  test('타임 미지정 시 slotsPerPerson = null', () => {
    expect(parseContent('홍길동 0417').slotsPerPerson).toBeNull();
  });

  test('2타임 지정', () => {
    expect(parseContent('홍길동 2타임 0417').slotsPerPerson).toBe(2);
  });

  test('1타임 명시', () => {
    expect(parseContent('홍길동 1타임 0417').slotsPerPerson).toBe(1);
  });

  test('N타임은 이름·날짜에 포함되지 않음', () => {
    const r = parseContent('홍길동 2타임 0417');
    expect(r.names).toEqual(['홍길동']);
    expect(r.dates).toEqual([y(4, 17)]);
  });

  // ─── 복합 ────────────────────────────────────────────────
  test('이름 2명 + 2타임 + 날짜 2개', () => {
    const r = parseContent('홍길동 김철수 2타임 0417 0424');
    expect(r.names).toEqual(['홍길동', '김철수']);
    expect(r.dates).toEqual([y(4, 17), y(4, 24)]);
    expect(r.slotsPerPerson).toBe(2);
    expect(r.slotTime).toBeNull();
  });

  test('슬롯 지정 + 날짜', () => {
    const r = parseContent('홍길동 12:00 0417');
    expect(r.names).toEqual(['홍길동']);
    expect(r.dates).toEqual([y(4, 17)]);
    expect(r.slotTime).toBe('12:00');
    expect(r.slotsPerPerson).toBeNull();
  });

  // ─── 파싱 실패 케이스 ────────────────────────────────────
  test('날짜 없음 → dates 빈 배열', () => {
    expect(parseContent('홍길동 김철수').dates).toEqual([]);
  });

  test('이름 없음 → names 빈 배열', () => {
    expect(parseContent('0417').names).toEqual([]);
  });
});
