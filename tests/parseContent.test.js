const { parseContent } = require('../parseContent');

const now = new Date();
const YEAR = now.getFullYear();
const MONTH = now.getMonth() + 1;
const y = (d) => `${YEAR}-${String(MONTH).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

describe('parseContent — 새 형식 ({이름}{DD} {슬롯번호})', () => {
  // ─── 기본 파싱 ───────────────────────────────────────────
  test('이름 + 일자 → 이름·날짜 추출, slotIndex null', () => {
    const r = parseContent('길동17');
    expect(r.names).toEqual(['길동']);
    expect(r.dates).toEqual([y(17)]);
    expect(r.slotIndex).toBeNull();
  });

  test('3글자 이름 + 일자', () => {
    const r = parseContent('홍길동16');
    expect(r.names).toEqual(['홍길동']);
    expect(r.dates).toEqual([y(16)]);
    expect(r.slotIndex).toBeNull();
  });

  test('1자리 일자 (말일 아닌 경우)', () => {
    const r = parseContent('길동5');
    expect(r.names).toEqual(['길동']);
    expect(r.dates).toEqual([y(5)]);
  });

  // ─── 슬롯 번호 ───────────────────────────────────────────
  test('슬롯 1 지정', () => {
    const r = parseContent('길동17 1');
    expect(r.names).toEqual(['길동']);
    expect(r.dates).toEqual([y(17)]);
    expect(r.slotIndex).toBe(1);
  });

  test('슬롯 2 지정', () => {
    const r = parseContent('홍길동16 2');
    expect(r.slotIndex).toBe(2);
  });

  test('슬롯 생략 시 null', () => {
    expect(parseContent('길동17').slotIndex).toBeNull();
  });

  // ─── 파싱 실패 ───────────────────────────────────────────
  test('날짜 없음 (숫자 미포함) → 빈 배열', () => {
    const r = parseContent('홍길동');
    expect(r.names).toEqual([]);
    expect(r.dates).toEqual([]);
  });

  test('숫자만 → 이름 없음 → 빈 배열', () => {
    const r = parseContent('17');
    expect(r.names).toEqual([]);
    expect(r.dates).toEqual([]);
  });

  test('빈 문자열 → 빈 배열', () => {
    const r = parseContent('');
    expect(r.names).toEqual([]);
    expect(r.dates).toEqual([]);
  });

  // ─── 형식 B: 이름과 일자 띄어쓰기 ──────────────────────────
  test('띄어쓰기: 이름 + 일자', () => {
    const r = parseContent('길동 16');
    expect(r.names).toEqual(['길동']);
    expect(r.dates).toEqual([y(16)]);
    expect(r.slotIndex).toBeNull();
  });

  test('띄어쓰기: 이름 + 일자 + 슬롯', () => {
    const r = parseContent('길동 16 1');
    expect(r.names).toEqual(['길동']);
    expect(r.dates).toEqual([y(16)]);
    expect(r.slotIndex).toBe(1);
  });

  test('띄어쓰기: 3글자 이름 + 일자 + 슬롯2', () => {
    const r = parseContent('홍길동 17 2');
    expect(r.names).toEqual(['홍길동']);
    expect(r.dates).toEqual([y(17)]);
    expect(r.slotIndex).toBe(2);
  });

  test('띄어쓰기: 두 번째 토큰이 날짜 범위 밖 → 실패', () => {
    const r = parseContent('홍길동 99');
    expect(r.names).toEqual([]);
    expect(r.dates).toEqual([]);
  });

  // ─── 7자 제한 실사용 예 ──────────────────────────────────
  test('길동16 1 (6자) — 2글자 이름 + 2자리 일 + 슬롯1', () => {
    const r = parseContent('길동16 1');
    expect(r.names).toEqual(['길동']);
    expect(r.dates).toEqual([y(16)]);
    expect(r.slotIndex).toBe(1);
  });

  test('홍길동16 1 (7자) — 3글자 이름 + 2자리 일 + 슬롯1', () => {
    const r = parseContent('홍길동16 1');
    expect(r.names).toEqual(['홍길동']);
    expect(r.dates).toEqual([y(16)]);
    expect(r.slotIndex).toBe(1);
  });
});
