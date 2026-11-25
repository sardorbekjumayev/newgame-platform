import { AppException } from '../../common/errors';

export type Period = { from: string; to: string; start: Date; end: Date };

const invalid = () => new AppException('VALIDATION_ERROR', 'Invalid period', { reason: 'INVALID_PERIOD' });

/** `YYYY-MM-DD` → UTC yarim tun (kalendar hisobi uchun); mavjud bo'lmagan sana (2026-02-30) — null. */
function utcDay(date: string): number | null {
  const [y, m, d] = date.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d);
  return new Date(t).toISOString().slice(0, 10) === date ? t : null;
}

/** `tz` dagi devor soati va UTC orasidagi farq (ms) — berilgan lahzada. */
function tzOffset(t: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(t));
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - t;
}

/** `tz` bo'yicha shu kunning 00:00 lahzasi (UTC). Ikki marta yaqinlashtiriladi — yozgi vaqtga o'tish kuni ham to'g'ri chiqadi. */
function zonedDayStart(day: number, tz: string): Date {
  const first = day - tzOffset(day, tz);
  return new Date(day - tzOffset(first, tz));
}

/**
 * Davr chegaralari: `from` kuni 00:00 dan `to` kunidan keyingi kun 00:00 gacha (tz bo'yicha), UTC'da.
 * Ikkalasi ham berilmasa — null (butun davr).
 */
export function parsePeriod(from: string | undefined, to: string | undefined, tz: string): Period | null {
  if (!from && !to) return null;
  if (!from || !to) throw invalid();
  const a = utcDay(from);
  const b = utcDay(to);
  if (a === null || b === null || a > b) throw invalid();
  return { from, to, start: zonedDayStart(a, tz), end: zonedDayStart(b + 86_400_000, tz) };
}
