/** Ish vaqti bo'yicha "hozir ochiqmi" (Asia/Tashkent). Format: club-settings WorkingHours. */
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
type Win = { open: string; close: string };
type WH = { always_open?: boolean } & Partial<Record<(typeof DAYS)[number], Win[]>>;

const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

function localNow(tz: string, now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { day, minute: Number(get('hour')) * 60 + Number(get('minute')) };
}

/** null — ish vaqti kiritilmagan (noma'lum). close <= open — tun bo'yi (ertasi kunga o'tadi). */
export function isOpenNow(raw: unknown, tz = 'Asia/Tashkent', now = new Date()): boolean | null {
  if (!raw || typeof raw !== 'object') return null;
  const wh = raw as WH;
  if (wh.always_open) return true;
  const { day, minute } = localNow(tz, now);
  const today = wh[DAYS[day]] ?? [];
  const yesterday = wh[DAYS[(day + 6) % 7]] ?? [];
  const inToday = today.some((w) => {
    const o = mins(w.open);
    const c = mins(w.close);
    return c > o ? minute >= o && minute < c : minute >= o;
  });
  const fromYesterday = yesterday.some((w) => mins(w.close) <= mins(w.open) && minute < mins(w.close));
  return inToday || fromYesterday;
}
