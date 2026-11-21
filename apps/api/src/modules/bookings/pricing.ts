import { SLOT_MIN, inWindow, localMinute } from './booking-time';

export type TariffRow = { id: string; name: string; type: string; price: bigint; duration_minutes: number | null; valid_from: string | null; valid_to: string | null };
export type Quote = { amount: bigint; tariff: string; kind: 'HOURLY' | 'PACKAGE' };

/** Soatlik qism: har 30 daqiqa uchun shu vaqtga mos eng arzon HOURLY tarif (oxirgi bo'lak — daqiqasiga). Mos tarif yo'q — null. */
function hourlySum(tariffs: TariffRow[], start: Date, minutes: number): { sum: bigint; names: string[] } | null {
  const hourly = tariffs.filter((t) => t.type === 'HOURLY');
  if (!hourly.length) return null;
  let sum = 0n;
  const names = new Set<string>();
  for (let m = 0; m < minutes; m += SLOT_MIN) {
    const minute = localMinute(new Date(start.getTime() + m * 60_000));
    const best = hourly.filter((t) => inWindow(minute, t.valid_from, t.valid_to)).sort((a, b) => (a.price < b.price ? -1 : 1))[0];
    if (!best) return null;
    sum += (best.price * BigInt(Math.min(SLOT_MIN, minutes - m))) / 60n;
    names.add(best.name);
  }
  return { sum, names: [...names] };
}

/**
 * Bitta qurilma narxi (tiyin). Soatlik: har 30 daqiqa uchun shu vaqtga mos eng arzon HOURLY tarif (price — soatiga).
 * Paket: davomiyligi teng va boshlanish vaqti oralig'iga tushsa. Ikkalasidan arzoni. Mos tarif yo'q — null (zona bron qilinmaydi).
 */
export function quote(tariffs: TariffRow[], start: Date, minutes: number): Quote | null {
  const h = hourlySum(tariffs, start, minutes);
  let res: Quote | null = h ? { amount: h.sum, tariff: h.names.join(' + '), kind: 'HOURLY' } : null;
  const startMin = localMinute(start);
  for (const p of tariffs) {
    if (p.type !== 'PACKAGE' || p.duration_minutes !== minutes || !inWindow(startMin, p.valid_from, p.valid_to)) continue;
    if (!res || p.price < res.amount) res = { amount: p.price, tariff: p.name, kind: 'PACKAGE' };
  }
  return res;
}

/** Shu daqiqada amal qiladigan eng arzon soatlik tarif — ochiq vaqt ochishda ko'rsatiladigan narx (soatiga). */
export function hourlyRate(tariffs: TariffRow[], at: Date): { price: bigint; tariff: string } | null {
  const minute = localMinute(at);
  const best = tariffs.filter((t) => t.type === 'HOURLY' && inWindow(minute, t.valid_from, t.valid_to)).sort((a, b) => (a.price < b.price ? -1 : 1))[0];
  return best ? { price: best.price, tariff: best.name } : null;
}

/**
 * Ochiq vaqt summasi (bitta qurilma): o'tgan daqiqalar uchun faqat soatlik tariflar bo'yicha (paketlar qo'llanmaydi —
 * davomiylik oldindan noma'lum), `round` tiyingacha yaxlitlanadi. Mos soatlik tarif yo'q — null.
 */
export function openQuote(tariffs: TariffRow[], start: Date, minutes: number, round: bigint): { amount: bigint; tariff: string } | null {
  const h = hourlySum(tariffs, start, minutes);
  return h ? { amount: ((h.sum + round / 2n) / round) * round, tariff: h.names.join(' + ') } : null;
}
