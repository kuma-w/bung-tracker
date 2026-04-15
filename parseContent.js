/**
 * 은행 송금 메시지 파서 (최대 7자 제한)
 *
 * 형식 A — 이름과 일자가 붙어있는 경우: {이름}{DD} {슬롯번호}
 * 형식 B — 이름과 일자가 띄어진 경우:  {이름} {DD} {슬롯번호}
 *
 *   - 이름: 한국어 이름 (2~3자, 비숫자 포함 필수)
 *   - DD: 이번 달 일자 (1~2자리 숫자, 1~31)
 *   - 슬롯번호: (선택) 1-based 슬롯 순서. 생략하면 해당 날짜 모든 슬롯 참여.
 *
 * 예시:
 *   "길동16 1"   → { names: ["길동"], dates: ["2026-04-16"], slotIndex: 1 }
 *   "길동16"     → { names: ["길동"], dates: ["2026-04-16"], slotIndex: null }
 *   "길동 16 1"  → { names: ["길동"], dates: ["2026-04-16"], slotIndex: 1 }
 *   "길동 16"    → { names: ["길동"], dates: ["2026-04-16"], slotIndex: null }
 *   "홍길동16 2" → { names: ["홍길동"], dates: ["2026-04-16"], slotIndex: 2 }
 */
function parseContent(content) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const parts = content.trim().split(/\s+/);

  let name, day, slotIndex;

  // 형식 A: 첫 토큰에 이름+일자가 붙어있는 경우 (길동16)
  const attached = parts[0].match(/^(.+?)(\d{1,2})$/);
  if (attached && /\D/.test(attached[1])) {
    name = attached[1];
    day = parseInt(attached[2], 10);
    const slotPart = parts[1];
    const n = slotPart !== undefined ? parseInt(slotPart, 10) : NaN;
    slotIndex = !isNaN(n) && n >= 1 ? n : null;
  } else {
    // 형식 B: 이름과 일자가 띄어진 경우 (길동 16 1)
    const candidate = parts[1];
    if (!candidate) return { names: [], dates: [], slotIndex: null };

    const dayNum = parseInt(candidate, 10);
    const isDay = /^\d{1,2}$/.test(candidate) && dayNum >= 1 && dayNum <= 31;
    if (!isDay) return { names: [], dates: [], slotIndex: null };

    name = parts[0];
    day = dayNum;
    const slotPart = parts[2];
    const n = slotPart !== undefined ? parseInt(slotPart, 10) : NaN;
    slotIndex = !isNaN(n) && n >= 1 ? n : null;
  }

  if (!name || !/\D/.test(name) || day < 1 || day > 31) return { names: [], dates: [], slotIndex: null };

  const fullDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { names: [name], dates: [fullDate], slotIndex };
}

module.exports = { parseContent };
