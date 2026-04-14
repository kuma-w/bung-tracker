const supabase = require('./supabase');

const toKST = (ts) =>
  new Date(ts).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).replace('T', ' ');

/**
 * names × dates 조합을 슬롯에 배정한다.
 * 각 date에 대해 빈 슬롯을 slot_time 순으로 자동 배정하며,
 * 이미 등록된 경우 'duplicate', 만석이면 'full', 벙이 없으면 'no_event'를 반환한다.
 */
async function assignToSlots(names, dates, paymentId = null) {
  const results = [];

  for (const date of dates) {
    const { data: event, error } = await supabase
      .from('events')
      .select('id, event_slots(id, slot_time, capacity)')
      .eq('event_date', date)
      .single();

    if (error && error.code === 'PGRST116') {
      for (const name of names) results.push({ name, date, status: 'no_event' });
      continue;
    }
    if (error) throw error;

    const slotIds = event.event_slots.map((s) => s.id);
    const { data: attendeeRows, error: aErr } = await supabase
      .from('attendees')
      .select('event_slot_id, name')
      .in('event_slot_id', slotIds);
    if (aErr) throw aErr;

    const slotCounts = {};
    for (const row of attendeeRows) {
      slotCounts[row.event_slot_id] = (slotCounts[row.event_slot_id] || 0) + 1;
    }

    const sortedSlots = [...event.event_slots].sort((a, b) => a.slot_time.localeCompare(b.slot_time));

    for (const name of names) {
      const existing = attendeeRows.find((r) => r.name === name);
      if (existing) {
        const slot = event.event_slots.find((s) => s.id === existing.event_slot_id);
        results.push({ name, date, status: 'duplicate', slot_time: slot?.slot_time });
        continue;
      }

      const availableSlot = sortedSlots.find((s) => (slotCounts[s.id] || 0) < s.capacity);
      if (!availableSlot) {
        results.push({ name, date, status: 'full' });
        continue;
      }

      const { error: insertError } = await supabase
        .from('attendees')
        .insert({ event_slot_id: availableSlot.id, name, payment_id: paymentId });
      if (insertError) throw insertError;

      slotCounts[availableSlot.id] = (slotCounts[availableSlot.id] || 0) + 1;
      results.push({ name, date, status: 'ok', slot_time: availableSlot.slot_time });
    }
  }

  return results;
}

/**
 * results 배열로 payment_status를 결정한다.
 * 'duplicate'는 이미 배정 완료 상태이므로 'ok'와 동일하게 처리한다.
 * 덕분에 partial 재시도 시 기존 배정분이 duplicate로 돌아와도
 * 전체가 assigned로 올바르게 판정된다.
 */
function derivePaymentStatus(results) {
  const handled = results.filter((r) => r.status === 'ok' || r.status === 'duplicate').length;
  const failed  = results.filter((r) => r.status === 'full' || r.status === 'no_event').length;
  if (handled === 0) return 'failed';
  if (failed  === 0) return 'assigned';
  return 'partial';
}

/** results 배열을 사람이 읽기 쉬운 메시지 배열로 변환한다. */
function buildResultMessages(results) {
  return results.map((r) => {
    const loc = [r.date, r.slot_time].filter(Boolean).join(' ');
    switch (r.status) {
      case 'ok':        return `✅ ${r.name} ${loc} 등록 완료`;
      case 'duplicate': return `⚠️ ${r.name} ${loc} 이미 등록됨`;
      case 'full':      return `❌ ${r.name} ${loc} 만석`;
      case 'no_event':  return `❌ ${r.name} ${r.date} 벙 없음`;
      default:          return `? ${r.name} ${r.status}`;
    }
  });
}

module.exports = { assignToSlots, derivePaymentStatus, buildResultMessages, toKST };
