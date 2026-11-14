import { SLOT_MIN, inWindow, localMinute } from './booking-time';

export type TariffRow = { id: string; name: string; type: string; price: bigint; duration_minutes: number | null; valid_from: string | null; valid_to: string | null };
export type Quote = { amount: bigint; tariff: string; kind: 'HOURLY' | 'PACKAGE' };

/**
 * Bitta qurilma narxi (tiyin). Soatlik: har 30 daqiqa uchun shu vaqtga mos eng arzon HOURLY tarif (price — soatiga).
 * Paket: davomiyligi teng va boshlanish vaqti oralig'iga tushsa. Ikkalasidan arzoni. Mos tarif yo'q — null (zona bron qilinmaydi).
 */
export function quote(tariffs: TariffRow[], start: Date, minutes: number): Quote | null {
  const hourly = tariffs.filter((t) => t.type === 'HOURLY');
  let sum = 0n;
  const names = new Set<string>();
  let ok = hourly.length > 0;
  for (let m = 0; ok && m < minutes; m += SLOT_MIN) {
    const minute = localMinute(new Date(start.getTime() + m * 60_000));
    const best = hourly.filter((t) => inWindow(minute, t.valid_from, t.valid_to)).sort((a, b) => (a.price < b.price ? -1 : 1))[0];
    if (!best) ok = false;
    else {
      sum += (best.price * BigInt(Math.min(SLOT_MIN, minutes - m))) / 60n;
      names.add(best.name);
    }
  }
  let res: Quote | null = ok ? { amount: sum, tariff: [...names].join(' + '), kind: 'HOURLY' } : null;
  const startMin = localMinute(start);
  for (const p of tariffs) {
    if (p.type !== 'PACKAGE' || p.duration_minutes !== minutes || !inWindow(startMin, p.valid_from, p.valid_to)) continue;
    if (!res || p.price < res.amount) res = { amount: p.price, tariff: p.name, kind: 'PACKAGE' };
  }
  return res;
}
