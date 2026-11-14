/**
 * Bron vaqt hisoblari. Klublar Asia/Tashkent (UTC+5, DST yo'q) — sobit offset.
 * Ish vaqti formati: club-settings WorkingHours ({mon:[{open,close}]...}, close <= open — ertasiga o'tadi).
 */
export const TZ_OFFSET_MS = 5 * 60 * 60 * 1000;
export const SLOT_MIN = 30;
export const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
type Win = { open: string; close: string };
type WH = { always_open?: boolean } & Partial<Record<(typeof DAYS)[number], Win[]>>;

const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** "YYYY-MM-DD" (Toshkent) → shu kun 00:00 (UTC Date). */
export function dayStart(date: string): Date {
  return new Date(`${date}T00:00:00+05:00`);
}

/** UTC Date → Toshkent kuni "YYYY-MM-DD". */
export function localDate(d: Date): string {
  return new Date(d.getTime() + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

/** Kun ichidagi daqiqa (Toshkent). */
export function localMinute(d: Date): number {
  const l = new Date(d.getTime() + TZ_OFFSET_MS);
  return l.getUTCHours() * 60 + l.getUTCMinutes();
}

/** [from, to) oralig'idagi ochiq vaqt intervallari (qo'shnilari birlashtirilgan). Ish vaqti kiritilmagan — doim ochiq. */
export function openIntervals(raw: unknown, from: Date, to: Date): [number, number][] {
  const wh = raw && typeof raw === 'object' ? (raw as WH) : null;
  if (!wh || wh.always_open) return [[from.getTime(), to.getTime()]];
  const out: [number, number][] = [];
  // Bir kun oldindan boshlaymiz — tungi oynalar (22:00–04:00) uchun
  for (let d = dayStart(localDate(from)).getTime() - DAY_MS; d < to.getTime(); d += DAY_MS) {
    const dow = new Date(d + TZ_OFFSET_MS).getUTCDay();
    for (const w of wh[DAYS[dow]] ?? []) {
      const o = mins(w.open);
      const c = mins(w.close);
      out.push([d + o * 60_000, d + (c > o ? c : c + 24 * 60) * 60_000]);
    }
  }
  out.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const iv of out) {
    const last = merged[merged.length - 1];
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
    else merged.push([...iv]);
  }
  return merged;
}

export function fitsHours(raw: unknown, start: Date, end: Date): boolean {
  return openIntervals(raw, new Date(start.getTime() - DAY_MS), new Date(end.getTime() + DAY_MS)).some(([s, e]) => s <= start.getTime() && end.getTime() <= e);
}

/** Tarif vaqt oralig'i (valid_from..valid_to, tungi bo'lishi mumkin) daqiqani o'z ichiga oladimi. Oraliq yo'q — doim. */
export function inWindow(minute: number, from: string | null, to: string | null): boolean {
  if (!from || !to) return true;
  const f = mins(from);
  const t = mins(to);
  return t > f ? minute >= f && minute < t : minute >= f || minute < t;
}
