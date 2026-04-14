function parseContent(content) {
  const year = new Date().getFullYear();
  const tokens = content.trim().split(/\s+/);
  const dates = [];
  const names = [];
  let slotsPerPerson = null; // null = 해당 날짜 슬롯 수 자동 적용
  let slotTime = null;

  for (const token of tokens) {
    // N타임 패턴 (예: 2타임, 1타임)
    const slotMatch = token.match(/^(\d+)타임$/);
    if (slotMatch) {
      slotsPerPerson = parseInt(slotMatch[1], 10);
      continue;
    }

    // HH:MM 슬롯 지정 (예: 10:30, 12:00)
    if (/^\d{1,2}:\d{2}$/.test(token)) {
      slotTime = token;
      continue;
    }

    let date = null;

    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(token)) {
      date = token;
    }
    // M/DD, MM/DD, M-DD, MM-DD, M.DD, MM.DD
    else if (/^\d{1,2}[\/\-\.]\d{1,2}$/.test(token)) {
      const [m, d] = token.split(/[\/\-\.]/).map(Number);
      date = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    // MMDD (4자리) 또는 MDD (3자리)
    else if (/^\d{3,4}$/.test(token)) {
      const s = token.padStart(4, '0');
      date = `${year}-${s.slice(0, 2)}-${s.slice(2, 4)}`;
    }

    if (date) {
      dates.push(date);
    } else {
      names.push(token);
    }
  }

  return { names, dates, slotsPerPerson, slotTime };
}

module.exports = { parseContent };
