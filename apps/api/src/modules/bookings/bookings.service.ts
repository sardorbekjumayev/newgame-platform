import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomInt } from 'node:crypto';
import type { Actor } from '../../common/decorators/actor.decorator';
import type { AuthUser } from '../../common/decorators/auth.decorators';
import { AppException } from '../../common/errors';
import { uuidv7 } from '../../common/utils/id';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TelegramService } from '../telegram/telegram.service';
import { DAY_MS, SLOT_MIN, dayStart, fitsHours, localDate, openIntervals } from './booking-time';
import { type TariffRow, hourlyRate, openQuote, quote } from './pricing';

/** Biznes qoidalari (foydalanuvchi bilan kelishilgan). */
export const BOOKING_RULES = {
  advanceDays: 5, // necha kun oldindan
  maxActive: 5, // bir mijozda bir vaqtda faol (kelgusi) bronlar
  cancelMinMinutes: 60, // boshlanishiga kamida shuncha qolganda bekor qilish mumkin
  bufferMinutes: 5, // bronlar orasida tozalash vaqti
  minMinutes: 30,
  maxMinutes: 12 * 60,
  maxWalkInDevices: 20, // operator joyida (guruh kelishi mumkin)
  maxDevices: 5, // bitta bronda ko'pi bilan shuncha o'rindiq
  noShowAfterMinutes: 10, // operator "kelmadi" deb belgilashi uchun boshlanishdan keyin kutish
  maxOpenMinutes: 12 * 60, // ochiq vaqt: eng ko'pi bilan shuncha (klub undan oldin yopilsa — yopilguncha), keyin o'zi yopiladi
  openRoundTiyin: 10_000, // ochiq vaqt summasi 100 so'mgacha yaxlitlanadi
} as const;

const LIVE = ['CONFIRMED', 'CHECKED_IN'];
const WALK_IN_GRACE_MS = 10 * 60_000; // operator "hozir" bronida boshlanish biroz o'tgan bo'lishi mumkin
/** "90 123 45 67" / "998901234567" → "+998901234567" (boshqa formatlar o'zgarishsiz). */
const normPhone = (raw?: string) => {
  const d = raw?.replace(/\D/g, '') ?? '';
  if (!d) return null;
  if (d.length === 9) return `+998${d}`;
  if (d.length === 12 && d.startsWith('998')) return `+${d}`;
  return `+${d}`;
};
const nowMinute = () => new Date(Math.floor(Date.now() / 60_000) * 60_000);
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const EXCLUSION = /booking_items_no_overlap|23P01|exclusion constraint/;

type Ctx = Awaited<ReturnType<BookingsService['context']>>;

/**
 * Bronlar: mijoz sana → davomiylik → vaqt (slots) → zona/qurilma (availability) → bron.
 * To'lov klubda — bron darhol CONFIRMED. Ikki marta band qilish DB EXCLUDE cheklovi bilan to'silgan.
 */
@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly telegram: TelegramService,
  ) {}

  // ---------- Klub konteksti ----------

  /** Ommaviy klub (ACTIVE, xaritada) + bron qilinadigan zonalar: qurilmalari va tariflari bor. */
  private async context(clubId: string) {
    const club = await this.prisma.clubs.findFirst({
      where: { id: clubId, status: 'ACTIVE', latitude: { not: null } },
      select: {
        id: true, name: true, address: true, working_hours: true,
        zones: {
          where: { deleted_at: null },
          orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
          select: {
            id: true, name: true, color: true, description: true, devices_count: true, layout: true,
            devices: { where: { is_active: true }, orderBy: { seat_no: 'asc' }, select: { id: true, seat_no: true } },
            tariffs: { where: { deleted_at: null, is_active: true }, select: { id: true, name: true, type: true, price: true, duration_minutes: true, valid_from: true, valid_to: true } },
          },
        },
      },
    });
    if (!club) throw new AppException('NOT_FOUND', 'Club not found');
    return club;
  }

  private validatePeriod(ctx: Ctx, start: Date, minutes: number, graceMs = 0) {
    const bad = (reason: string) => new AppException('VALIDATION_ERROR', 'Invalid booking time', { reason });
    if (!Number.isInteger(minutes) || minutes < BOOKING_RULES.minMinutes || minutes > BOOKING_RULES.maxMinutes) throw bad('INVALID_DURATION');
    if (Number.isNaN(start.getTime()) || start.getTime() % 60_000) throw bad('INVALID_START'); // istalgan daqiqa
    if (start.getTime() < Date.now() - graceMs) throw bad('START_IN_PAST');
    if (start.getTime() > Date.now() + BOOKING_RULES.advanceDays * DAY_MS) throw bad('TOO_FAR');
    if (!fitsHours(ctx.working_hours, start, new Date(start.getTime() + minutes * 60_000))) throw bad('OUTSIDE_HOURS');
  }

  /** [from, to) bilan kesishadigan faol band qilishlar (bufer bilan). */
  private busyItems(deviceIds: string[], from: Date, to: Date) {
    return this.prisma.booking_items.findMany({
      where: { device_id: { in: deviceIds }, active: true, start_at: { lt: to }, blocked_until: { gt: from } },
      select: { device_id: true, start_at: true, blocked_until: true },
    });
  }

  // ---------- Mijoz: tanlash ----------

  /**
   * Kun bo'yicha vaqtlar (30 daqiqa qadam): ish vaqtiga sig'adigan va har biri uchun bo'sh qurilmalar soni.
   * To'r vaqtida biror zona faqat tugayotgan bron (+ tozalash buferi) tufayli to'la bo'lsa, shu zonada joy ochiladigan
   * daqiqa ham qo'shiladi (11:00 da to'la → 11:05) — aks holda bronlar orasida bufer emas, butun 30 daqiqa bo'sh qolardi.
   */
  async slots(clubId: string, date: string, minutes: number) {
    const ctx = await this.context(clubId);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new AppException('VALIDATION_ERROR', 'Invalid date', { field: 'date' });
    const day = dayStart(date).getTime();
    const now = Date.now();
    const step = SLOT_MIN * 60_000;
    const span = (minutes + BOOKING_RULES.bufferMinutes) * 60_000; // bron + bufer: qurilma shuncha vaqt band bo'ladi
    const zones = ctx.zones.filter((z) => z.tariffs.length && z.devices.length);
    const devices = zones.flatMap((z) => z.devices.map((d) => d.id));
    const byDevice = new Map<string, { from: number; until: number }[]>();
    for (const i of devices.length ? await this.busyItems(devices, new Date(day), new Date(day + DAY_MS + span)) : []) {
      byDevice.set(i.device_id, [...(byDevice.get(i.device_id) ?? []), { from: i.start_at.getTime(), until: i.blocked_until.getTime() }]);
    }
    /** `t` da boshlanadigan bronga xalaqit beradigan band qilishlar. */
    const clashes = (deviceId: string, t: number) => (byDevice.get(deviceId) ?? []).filter((i) => i.from < t + span && i.until > t);
    const startable = (t: number) => t >= now && t <= now + BOOKING_RULES.advanceDays * DAY_MS && fitsHours(ctx.working_hours, new Date(t), new Date(t + minutes * 60_000));
    /** Zonalar bo'yicha bo'sh qurilmalar; null — shu vaqtga narx chiqmaydi (masalan faqat kunduzgi tarif), bron qilinmaydi. */
    const freeByZone = (t: number) => zones.map((z) => (quote(z.tariffs as TariffRow[], new Date(t), minutes) ? z.devices.filter((d) => !clashes(d.id, t).length).length : null));
    const total = (per: (number | null)[]) => per.reduce<number>((n, x) => n + (x ?? 0), 0);

    const out: { start_at: Date; free: number }[] = [];
    const opening = new Set<number>();
    for (let t = day; t < day + DAY_MS; t += step) {
      if (!startable(t)) continue;
      const per = freeByZone(t);
      out.push({ start_at: new Date(t), free: total(per) });
      // To'la zona: keyingi to'r vaqtigacha (bron + bufer tugab) qurilma ochilsa — eng erta ochilish daqiqasi ham taklif qilinadi
      per.forEach((free, zi) => {
        if (free !== 0) return;
        const z = zones[zi];
        const opens = z.devices
          .map((d) => Math.max(...clashes(d.id, t).map((i) => i.until)))
          .filter((until, k) => until < t + step && startable(until) && !clashes(z.devices[k].id, until).length && !!quote(z.tariffs as TariffRow[], new Date(until), minutes));
        if (opens.length) opening.add(Math.min(...opens));
      });
    }
    for (const t of opening) out.push({ start_at: new Date(t), free: total(freeByZone(t)) });
    out.sort((x, y) => x.start_at.getTime() - y.start_at.getTime());
    // Tanlash mumkin bo'lgan boshlanish oraliqlari (istalgan soat:daqiqa): ish vaqti, hozir va 5 kun chegarasi
    const dayEnd = day + DAY_MS - 60_000;
    const earliest = Math.ceil(now / 60_000) * 60_000;
    const latest = now + BOOKING_RULES.advanceDays * DAY_MS;
    const windows = openIntervals(ctx.working_hours, new Date(day - DAY_MS), new Date(day + 2 * DAY_MS))
      .map(([s, e]) => [Math.max(s, day, earliest), Math.min(e - minutes * 60_000, dayEnd, latest)] as const)
      .filter(([s, e]) => s <= e)
      .map(([s, e]) => ({ from: new Date(s), to: new Date(e) }));
    return { date, duration_minutes: minutes, windows, slots: out, rules: BOOKING_RULES };
  }

  /** Tanlangan vaqt uchun zonalar: narx (bitta qurilma), sxema va har bir qurilma holati. */
  async availability(clubId: string, startIso: string, minutes: number, graceMs = 0) {
    const ctx = await this.context(clubId);
    const start = new Date(startIso);
    this.validatePeriod(ctx, start, minutes, graceMs);
    const end = new Date(start.getTime() + minutes * 60_000);
    const blocked = new Date(end.getTime() + BOOKING_RULES.bufferMinutes * 60_000);
    const ids = ctx.zones.flatMap((z) => z.devices.map((d) => d.id));
    const busy = new Set((ids.length ? await this.busyItems(ids, start, blocked) : []).map((i) => i.device_id));
    return {
      start_at: start,
      end_at: end,
      zones: ctx.zones
        .filter((z) => z.devices.length)
        .map((z) => {
          const q = quote(z.tariffs as TariffRow[], start, minutes);
          return {
            id: z.id, name: z.name, color: z.color, description: z.description, devices_count: z.devices_count, layout: z.layout,
            price: q ? q.amount : null, tariff: q?.tariff ?? null,
            devices: z.devices.map((d) => ({ id: d.id, seat_no: d.seat_no, status: !q ? 'UNAVAILABLE' : busy.has(d.id) ? 'BUSY' : 'FREE' })),
            free: q ? z.devices.filter((d) => !busy.has(d.id)).length : 0,
          };
        }),
    };
  }

  // ---------- Mijoz: bron ----------

  async create(user: AuthUser, dto: { club_id: string; start_at: string; duration_minutes: number; device_ids: string[]; contact_phone?: string }, actor: Actor) {
    if (user.type !== 'CUSTOMER') throw new AppException('FORBIDDEN', 'Only customers can book', { reason: 'CUSTOMER_ONLY' });
    const ctx = await this.context(dto.club_id);
    const start = new Date(dto.start_at);
    const minutes = dto.duration_minutes;
    this.validatePeriod(ctx, start, minutes);
    const ids = [...new Set(dto.device_ids)];
    if (!ids.length || ids.length > BOOKING_RULES.maxDevices) throw new AppException('VALIDATION_ERROR', 'Invalid devices', { field: 'device_ids', reason: 'INVALID_DEVICES' });

    // Qurilma → zona narxi (bron paytidagi narx saqlanadi)
    const lines: { device_id: string; zone: string; seat_no: number; price: bigint; tariff: string }[] = [];
    for (const id of ids) {
      const zone = ctx.zones.find((z) => z.devices.some((d) => d.id === id));
      const q = zone ? quote(zone.tariffs as TariffRow[], start, minutes) : null;
      if (!zone || !q) throw new AppException('VALIDATION_ERROR', 'Device unavailable', { field: 'device_ids', reason: 'DEVICE_UNAVAILABLE' });
      lines.push({ device_id: id, zone: zone.name, seat_no: zone.devices.find((d) => d.id === id)!.seat_no, price: q.amount, tariff: q.tariff });
    }
    const total = lines.reduce((n, l) => n + l.price, 0n);
    const end = new Date(start.getTime() + minutes * 60_000);
    const blocked = new Date(end.getTime() + BOOKING_RULES.bufferMinutes * 60_000);
    const id = uuidv7();
    const code = Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
    // Aloqa raqami: mijoz bron paytida tasdiqlagani; berilmasa — akkaunt raqami (Telegram orqali tasdiqlangan)
    const contactPhone = dto.contact_phone ?? (await this.prisma.users.findUnique({ where: { id: user.id }, select: { phone: true } }))?.phone ?? null;

    try {
      await this.prisma.$transaction(async (tx) => {
        // Mijoz qatori bo'yicha qulf — parallel so'rovlarda faol bronlar limiti aylanib o'tilmasin
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id}::uuid FOR UPDATE`;
        const active = await tx.bookings.count({ where: { customer_id: user.id, status: { in: LIVE }, end_at: { gt: new Date() } } });
        if (active >= BOOKING_RULES.maxActive) throw new AppException('CONFLICT', 'Too many active bookings', { reason: 'MAX_ACTIVE', limit: BOOKING_RULES.maxActive });
        await tx.bookings.create({
          data: {
            id, code, customer_id: user.id, club_id: ctx.id, start_at: start, end_at: end, duration_minutes: minutes, total_amount: total,
            price_snapshot: lines.map((l) => ({ ...l, price: Number(l.price) })),
            contact_phone: contactPhone,
          },
        });
        await tx.booking_items.createMany({ data: lines.map((l) => ({ id: uuidv7(), booking_id: id, device_id: l.device_id, start_at: start, blocked_until: blocked, price: l.price })) });
        await this.audit.log({ actor_id: actor.id, club_id: ctx.id, action: 'customer.booking.create', target_type: 'booking', target_id: id, new_value: { code, start_at: start, minutes, devices: lines.length, total: Number(total) }, ip: actor.ip, user_agent: actor.ua, request_id: actor.request_id }, tx);
      });
    } catch (e) {
      if (e instanceof AppException) throw e;
      if (EXCLUSION.test(String((e as Error)?.message)) || (e as { code?: string }).code === 'P2034') {
        throw new AppException('CONFLICT', 'Device already booked', { reason: 'DEVICE_BUSY' });
      }
      throw e;
    }
    const seats = [...new Set(lines.map((l) => l.zone))].map((z) => `${z}: #${lines.filter((l) => l.zone === z).map((l) => l.seat_no).sort((a, b) => a - b).join(', #')}`);
    void this.notifyCustomer(
      user.id,
      [
        `🎟 <b>Bron chiptasi</b>`,
        `━━━━━━━━━━━━━━`,
        `🎮 <b>${ctx.name}</b>`,
        `📅 ${fmtLocal(start)} – ${fmtLocal(end).slice(-5)}`,
        `💺 ${seats.join('\n💺 ')}`,
        `💰 ${(Number(total) / 100).toLocaleString('ru-RU').replace(/,/g, ' ')} so'm — to'lov klubda`,
        `━━━━━━━━━━━━━━`,
        `🔑 Kod: <code>${code}</code>`,
        `Klubga kelganda shu kodni operatorga ayting.`,
        ...(contactPhone ? [`📞 Operator shu raqamga qo'ng'iroq qilishi mumkin: ${contactPhone}`] : []),
      ].join('\n'),
    );
    return this.get(user, id);
  }

  /** Bron formasi uchun aloqa raqami: mijoz oxirgi bronida ishlatgani (eslab qolinadi), bo'lmasa akkaunt raqami. */
  async contactPhone(user: AuthUser) {
    const [last, account] = await Promise.all([
      this.prisma.bookings.findFirst({
        where: { customer_id: user.id, source: 'ONLINE', contact_phone: { not: null } },
        orderBy: { created_at: 'desc' },
        select: { contact_phone: true },
      }),
      this.prisma.users.findUnique({ where: { id: user.id }, select: { phone: true } }),
    ]);
    return { contact_phone: last?.contact_phone ?? account?.phone ?? null, account_phone: account?.phone ?? null };
  }

  async get(user: AuthUser, id: string) {
    await this.finalizeExpiredOpen({ customer_id: user.id });
    const b = await this.prisma.bookings.findFirst({ where: { id, customer_id: user.id }, select: bookingSelect });
    if (!b) throw new AppException('NOT_FOUND', 'Booking not found');
    return view(b);
  }

  async mine(user: AuthUser) {
    await this.finalizeExpiredOpen({ customer_id: user.id });
    const rows = await this.prisma.bookings.findMany({ where: { customer_id: user.id }, orderBy: { start_at: 'desc' }, take: 50, select: bookingSelect });
    return rows.map(view);
  }

  async cancelByCustomer(user: AuthUser, id: string, actor: Actor) {
    const b = await this.prisma.bookings.findFirst({ where: { id, customer_id: user.id }, select: { id: true, club_id: true, status: true, start_at: true } });
    if (!b) throw new AppException('NOT_FOUND', 'Booking not found');
    if (b.status !== 'CONFIRMED') throw new AppException('CONFLICT', 'Cannot cancel', { reason: 'NOT_CANCELLABLE' });
    if (b.start_at.getTime() - Date.now() < BOOKING_RULES.cancelMinMinutes * 60_000) throw new AppException('CONFLICT', 'Too late to cancel', { reason: 'CANCEL_TOO_LATE' });
    await this.setStatus(b.id, b.club_id, 'CANCELLED', actor, 'customer.booking.cancel');
    return this.get(user, id);
  }


  // ---------- Operator: joyida bron (klubga o'zi kelgan mijoz) ----------

  /** Operator uchun mavjudlik: boshlanish berilmasa — hozir (daqiqaga yaxlitlangan). */
  async operatorAvailability(userId: string, startIso: string | undefined, minutes: number, open = false) {
    const clubId = await this.operatorClub(userId);
    if (open) return this.openAvailability(clubId);
    const start = startIso ? new Date(startIso) : nowMinute();
    return this.availability(clubId, start.toISOString(), minutes, WALK_IN_GRACE_MS);
  }

  // ---------- Ochiq vaqt: operator ochadi (tugashi noma'lum), faqat operator to'xtatadi ----------

  /** Ochiq vaqt eng ko'pi bilan qachongacha: klub yopilishi yoki `maxOpenMinutes` — qaysi biri oldin. Hozir yopiq — null. */
  private openCap(ctx: Ctx, now: Date): number | null {
    const t = now.getTime();
    const iv = openIntervals(ctx.working_hours, new Date(t - DAY_MS), new Date(t + 2 * DAY_MS)).find(([s, e]) => s <= t && t < e);
    return iv ? Math.min(iv[1], t + BOOKING_RULES.maxOpenMinutes * 60_000) : null;
  }

  /**
   * Qurilma ochiq vaqt uchun qachongacha bo'sh: hozir band — null; aks holda `cap` yoki shu joydagi keyingi bron
   * boshlanishidan bufer oldin — qaysi biri oldin (`by` — nima chekladi).
   */
  private async openWindows(deviceIds: string[], now: Date, cap: number) {
    const buffer = BOOKING_RULES.bufferMinutes * 60_000;
    const items = deviceIds.length ? await this.busyItems(deviceIds, now, new Date(cap + buffer)) : [];
    const out = new Map<string, { until: number; by: 'BOOKING' | 'CAP' } | null>();
    for (const id of deviceIds) {
      const mine = items.filter((i) => i.device_id === id);
      if (mine.some((i) => i.start_at.getTime() <= now.getTime())) {
        out.set(id, null);
        continue;
      }
      const next = Math.min(...mine.map((i) => i.start_at.getTime() - buffer));
      out.set(id, next < cap ? { until: next, by: 'BOOKING' } : { until: cap, by: 'CAP' });
    }
    return out;
  }

  /** Operator: ochiq vaqt uchun mavjudlik — narx soatiga, har bir bo'sh joy qachongacha bo'shligi (`free_until`). */
  private async openAvailability(clubId: string) {
    const ctx = await this.context(clubId);
    const now = nowMinute();
    const cap = this.openCap(ctx, now);
    const min = BOOKING_RULES.minMinutes * 60_000;
    const windows = cap ? await this.openWindows(ctx.zones.flatMap((z) => z.devices.map((d) => d.id)), now, cap) : null;
    return {
      start_at: now,
      end_at: new Date(cap ?? now.getTime()),
      open: true,
      zones: ctx.zones
        .filter((z) => z.devices.length)
        .map((z) => {
          const rate = cap ? hourlyRate(z.tariffs as TariffRow[], now) : null;
          const devices = z.devices.map((d) => {
            const w = windows?.get(d.id) ?? null;
            const ok = !!rate && !!w && w.until - now.getTime() >= min;
            return { id: d.id, seat_no: d.seat_no, status: !rate ? 'UNAVAILABLE' : ok ? 'FREE' : 'BUSY', free_until: ok ? new Date(w.until) : null, limited_by: ok ? w.by : null };
          });
          return {
            id: z.id, name: z.name, color: z.color, description: z.description, devices_count: z.devices_count, layout: z.layout,
            price: rate ? rate.price : null, tariff: rate?.tariff ?? null, // narx — soatiga
            devices, free: devices.filter((d) => d.status === 'FREE').length,
          };
        }),
    };
  }

  /** Ochiq sessiyaning shu paytgacha summasi: har bir qurilma zonasining soatlik tarifi bo'yicha. */
  private openAmount(ctx: Ctx | null, start: Date, minutes: number, zoneIds: string[]) {
    const round = BigInt(BOOKING_RULES.openRoundTiyin);
    return zoneIds.reduce((sum, zid) => sum + (openQuote((ctx?.zones.find((z) => z.id === zid)?.tariffs ?? []) as TariffRow[], start, minutes, round)?.amount ?? 0n), 0n);
  }

  /** Ochiq sessiya ko'rinishiga hozirgi holatni qo'shadi: o'tgan vaqt, yig'ilgan summa va chegarasi (`open`). */
  private openView<V extends { is_open: boolean; status: string; start_at: Date; end_at: Date }>(v: V, zoneIds: string[], ctx: Ctx | null) {
    if (!v.is_open || v.status !== 'CHECKED_IN') return v;
    const minutes = Math.max(1, Math.floor((Math.min(Date.now(), v.end_at.getTime()) - v.start_at.getTime()) / 60_000));
    const amount = this.openAmount(ctx, v.start_at, minutes, zoneIds);
    return { ...v, total_amount: amount, open: { elapsed_minutes: minutes, amount, limit_at: v.end_at } };
  }

  /**
   * Ochiq sessiyani yopish: haqiqiy tugash vaqti, davomiylik va summa (soatlik tarif bo'yicha, daqiqasiga) yoziladi,
   * joy `endAt` + buferdan keyin bo'shaydi. `actor` yo'q — chegarasiga yetib o'zi yopilgan.
   */
  private async closeOpen(id: string, clubId: string, endAt: Date, actor: Actor | null) {
    const b = await this.prisma.bookings.findUnique({
      where: { id },
      select: { start_at: true, end_at: true, is_open: true, price_snapshot: true, items: { select: { id: true, device_id: true, device: { select: { zone_id: true } } } } },
    });
    if (!b?.is_open) return false;
    const start = b.start_at.getTime();
    // Daqiqagacha; kamida 1 daqiqa, chegaradan (keyingi bron / yopilish) oshmaydi
    const end = Math.max(start + 60_000, Math.min(Math.floor(endAt.getTime() / 60_000) * 60_000, b.end_at.getTime()));
    const minutes = Math.round((end - start) / 60_000);
    const ctx = await this.context(clubId).catch(() => null);
    const round = BigInt(BOOKING_RULES.openRoundTiyin);
    const snapshot = Array.isArray(b.price_snapshot) ? (b.price_snapshot as Record<string, unknown>[]) : [];
    const prices = new Map<string, bigint>();
    for (const i of b.items) {
      const q = openQuote((ctx?.zones.find((z) => z.id === i.device.zone_id)?.tariffs ?? []) as TariffRow[], b.start_at, minutes, round);
      // Tarif o'chirilgan/o'zgargan bo'lsa — sessiya ochilgan paytdagi soatlik narx bo'yicha
      const rate = BigInt(Math.trunc(Number(snapshot.find((l) => l.device_id === i.device_id)?.rate ?? 0)));
      prices.set(i.device_id, q?.amount ?? (((rate * BigInt(minutes)) / 60n + round / 2n) / round) * round);
    }
    const total = [...prices.values()].reduce((n, x) => n + x, 0n);
    let closed = false;
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.bookings.updateMany({
        where: { id, is_open: true },
        data: {
          is_open: false, end_at: new Date(end), duration_minutes: minutes, total_amount: total,
          price_snapshot: snapshot.map((l) => ({ ...l, price: Number(prices.get(String(l.device_id)) ?? 0n) })) as Prisma.InputJsonValue,
        },
      });
      if (!count) return; // bir vaqtda boshqa so'rov yopib bo'lgan
      closed = true;
      const blocked = new Date(end + BOOKING_RULES.bufferMinutes * 60_000);
      for (const i of b.items) await tx.booking_items.update({ where: { id: i.id }, data: { blocked_until: blocked, price: prices.get(i.device_id) ?? 0n } });
      await this.audit.log(
        { actor_id: actor?.id ?? null, club_id: clubId, action: actor ? 'operator.booking.stop' : 'system.booking.open-expired', target_type: 'booking', target_id: id, new_value: { end_at: new Date(end), minutes, total: Number(total) }, ip: actor?.ip, user_agent: actor?.ua, request_id: actor?.request_id },
        tx,
      );
    });
    return closed;
  }

  /** Chegarasiga yetgan (to'xtatilmagan) ochiq sessiyalarni yopadi — ro'yxatlarni o'qishdan oldin chaqiriladi. */
  private async finalizeExpiredOpen(where: Prisma.bookingsWhereInput) {
    const rows = await this.prisma.bookings.findMany({ where: { ...where, is_open: true, end_at: { lte: new Date() } }, select: { id: true, club_id: true, end_at: true } });
    for (const r of rows) {
      await this.closeOpen(r.id, r.club_id, r.end_at, null).catch((e) => this.logger.warn(`open session auto-close failed: ${(e as Error).message}`));
    }
  }

  /** Operator: ochiq sessiyani to'xtatish — tugash vaqti hozir, summa shu paytgacha hisoblanadi. */
  async operatorStop(userId: string, id: string, actor: Actor) {
    const clubId = await this.operatorClub(userId);
    const b = await this.prisma.bookings.findFirst({ where: { id, club_id: clubId }, select: { status: true, is_open: true } });
    if (!b) throw new AppException('NOT_FOUND', 'Booking not found');
    if (!b.is_open || b.status !== 'CHECKED_IN' || !(await this.closeOpen(id, clubId, new Date(), actor))) throw new AppException('CONFLICT', 'Invalid status', { reason: 'INVALID_STATUS' });
    return operatorView(await this.prisma.bookings.findUniqueOrThrow({ where: { id }, select: operatorSelect }));
  }

  async operatorWalkIn(
    userId: string,
    dto: { start_at?: string; duration_minutes?: number; open?: boolean; device_ids: string[]; guest_name?: string; guest_phone?: string; check_in?: boolean },
    actor: Actor,
  ) {
    const clubId = await this.operatorClub(userId);
    const ctx = await this.context(clubId);
    const open = dto.open === true;
    // Ochiq vaqt har doim hozirdan boshlanadi
    const start = open || !dto.start_at ? nowMinute() : new Date(dto.start_at);
    const ids = [...new Set(dto.device_ids)];
    if (!ids.length || ids.length > BOOKING_RULES.maxWalkInDevices) throw new AppException('VALIDATION_ERROR', 'Invalid devices', { field: 'device_ids', reason: 'INVALID_DEVICES' });
    const lines: { device_id: string; zone: string; seat_no: number; price: bigint; tariff: string; rate?: number }[] = [];
    let minutes: number;
    if (open) {
      // Tugashi noma'lum: end_at — vaqtinchalik chegara (klub yopilishi / 12 soat / shu joylardagi eng yaqin bron).
      // Joy shu chegaragacha band turadi; operator to'xtatganda haqiqiy vaqt va summa yoziladi (`closeOpen`).
      const cap = this.openCap(ctx, start);
      if (!cap) throw new AppException('VALIDATION_ERROR', 'Invalid booking time', { reason: 'OUTSIDE_HOURS' });
      for (const id of ids) {
        const zone = ctx.zones.find((z) => z.devices.some((d) => d.id === id));
        if (!zone) throw new AppException('VALIDATION_ERROR', 'Device unavailable', { field: 'device_ids', reason: 'DEVICE_UNAVAILABLE' });
        const rate = hourlyRate(zone.tariffs as TariffRow[], start);
        if (!rate) throw new AppException('VALIDATION_ERROR', 'No hourly tariff', { field: 'device_ids', reason: 'NO_HOURLY_TARIFF' });
        lines.push({ device_id: id, zone: zone.name, seat_no: zone.devices.find((d) => d.id === id)!.seat_no, price: 0n, tariff: rate.tariff, rate: Number(rate.price) });
      }
      const windows = [...(await this.openWindows(ids, start, cap)).values()];
      if (windows.some((w) => !w)) throw new AppException('CONFLICT', 'Device already booked', { reason: 'DEVICE_BUSY' });
      minutes = Math.floor((Math.min(...windows.map((w) => w!.until)) - start.getTime()) / 60_000);
      if (minutes < BOOKING_RULES.minMinutes) throw new AppException('CONFLICT', 'Free window too short', { reason: 'OPEN_WINDOW_TOO_SHORT' });
    } else {
      minutes = dto.duration_minutes as number;
      this.validatePeriod(ctx, start, minutes, WALK_IN_GRACE_MS);
      for (const id of ids) {
        const zone = ctx.zones.find((z) => z.devices.some((d) => d.id === id));
        const q = zone ? quote(zone.tariffs as TariffRow[], start, minutes) : null;
        if (!zone || !q) throw new AppException('VALIDATION_ERROR', 'Device unavailable', { field: 'device_ids', reason: 'DEVICE_UNAVAILABLE' });
        lines.push({ device_id: id, zone: zone.name, seat_no: zone.devices.find((d) => d.id === id)!.seat_no, price: q.amount, tariff: q.tariff });
      }
    }
    const total = lines.reduce((n, l) => n + l.price, 0n);
    const end = new Date(start.getTime() + minutes * 60_000);
    const blocked = new Date(end.getTime() + BOOKING_RULES.bufferMinutes * 60_000);
    const phone = normPhone(dto.guest_phone);
    // Telefon mavjud mijozniki bo'lsa — bron uning "Mening bronlarim"ida ham ko'rinadi
    const customer = phone ? await this.prisma.users.findFirst({ where: { phone, type: 'CUSTOMER', deleted_at: null }, select: { id: true } }) : null;
    const startsNow = start.getTime() <= Date.now() + 5 * 60_000;
    const checkIn = open || ((dto.check_in ?? true) && startsNow);
    const id = uuidv7();
    const code = Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.bookings.create({
          data: {
            id, code, customer_id: customer?.id ?? null, club_id: clubId, start_at: start, end_at: end, duration_minutes: minutes, total_amount: total,
            price_snapshot: lines.map((l) => ({ ...l, price: Number(l.price) })),
            source: 'WALK_IN', is_open: open, guest_name: dto.guest_name?.trim() || null, guest_phone: phone, created_by: userId,
            status: checkIn ? 'CHECKED_IN' : 'CONFIRMED', checked_in_at: checkIn ? new Date() : null,
            contact_status: 'CONFIRMED', contacted_at: new Date(),
          },
        });
        await tx.booking_items.createMany({ data: lines.map((l) => ({ id: uuidv7(), booking_id: id, device_id: l.device_id, start_at: start, blocked_until: blocked, price: l.price })) });
        await this.audit.log({ actor_id: actor.id, club_id: clubId, action: open ? 'operator.booking.open' : 'operator.booking.walk-in', target_type: 'booking', target_id: id, new_value: open ? { code, start_at: start, limit_minutes: minutes, devices: lines.length } : { code, start_at: start, minutes, devices: lines.length, total: Number(total), check_in: checkIn }, ip: actor.ip, user_agent: actor.ua, request_id: actor.request_id }, tx);
      });
    } catch (e) {
      if (e instanceof AppException) throw e;
      if (EXCLUSION.test(String((e as Error)?.message)) || (e as { code?: string }).code === 'P2034') throw new AppException('CONFLICT', 'Device already booked', { reason: 'DEVICE_BUSY' });
      throw e;
    }
    const b = await this.prisma.bookings.findUniqueOrThrow({ where: { id }, select: operatorSelect });
    return this.openView(operatorView(b), b.items.map((i) => i.device.zone.id), ctx);
  }

  // ---------- Operator ----------

  async operatorClub(userId: string) {
    const r = await this.prisma.user_roles.findFirst({ where: { user_id: userId, role: { code: 'OPERATOR' }, club_id: { not: null } }, select: { club_id: true } });
    if (!r) throw new AppException('NOT_FOUND', 'Club not found');
    return r.club_id!;
  }

  /** Operator: tanlangan kun (Toshkent) bronlari — mijoz telefoni bilan. */
  async operatorList(userId: string, date?: string) {
    const clubId = await this.operatorClub(userId);
    const d = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : localDate(new Date());
    const from = dayStart(d);
    await this.finalizeExpiredOpen({ club_id: clubId });
    const rows = await this.prisma.bookings.findMany({
      where: { club_id: clubId, start_at: { lt: new Date(from.getTime() + DAY_MS) }, end_at: { gt: from } },
      orderBy: { start_at: 'asc' },
      select: {
        ...bookingSelect, source: true, guest_name: true, guest_phone: true, customer: { select: { id: true, first_name: true, last_name: true, phone: true } },
        items: { select: { device: { select: { seat_no: true, zone: { select: { id: true, name: true, color: true } } } } } },
      },
    });
    const ctx = rows.some((b) => b.is_open) ? await this.context(clubId).catch(() => null) : null;
    return { date: d, bookings: rows.map((b) => this.openView({ ...view(b), customer: guestCustomer(b) }, b.items.map((i) => i.device.zone.id), ctx)) };
  }

  /** Operator bosh sahifasi: kutilayotgan bronlar (yangisi tepada) + bugungi statistika. */
  async operatorUpcoming(userId: string) {
    const clubId = await this.operatorClub(userId);
    const now = new Date();
    const from = dayStart(localDate(now));
    const to = new Date(from.getTime() + DAY_MS);
    await this.finalizeExpiredOpen({ club_id: clubId });
    const openRows = await this.prisma.bookings.findMany({ where: { club_id: clubId, is_open: true, status: 'CHECKED_IN' }, orderBy: { start_at: 'asc' }, select: operatorSelect });
    const ctx = openRows.length ? await this.context(clubId).catch(() => null) : null;
    const [rows, today, checkedIn, cancelled] = await Promise.all([
      this.prisma.bookings.findMany({
        where: { club_id: clubId, status: 'CONFIRMED', end_at: { gt: now } },
        orderBy: { created_at: 'desc' },
        take: 100,
        select: operatorSelect,
      }),
      this.prisma.bookings.count({ where: { club_id: clubId, start_at: { gte: from, lt: to }, status: { not: 'CANCELLED' } } }),
      this.prisma.bookings.count({ where: { club_id: clubId, checked_in_at: { gte: from, lt: to } } }),
      this.prisma.bookings.count({ where: { club_id: clubId, start_at: { gte: from, lt: to }, status: { in: ['CANCELLED', 'NO_SHOW'] } } }),
    ]);
    const bookings = rows.map(operatorView);
    return {
      bookings,
      // Hozir davom etayotgan ochiq sessiyalar (to'xtatishni operator bosadi)
      open_sessions: openRows.map((b) => this.openView(operatorView(b), b.items.map((i) => i.device.zone.id), ctx)),
      no_show_after_minutes: BOOKING_RULES.noShowAfterMinutes,
      stats: {
        today,
        checked_in_today: checkedIn,
        cancelled_today: cancelled,
        late: bookings.filter((b) => b.start_at.getTime() <= now.getTime()).length,
        uncontacted: bookings.filter((b) => b.contact_status === 'NEW').length,
      },
    };
  }

  /** Operator: kod bo'yicha bron (mijoz kelganda aytadi). */
  async operatorByCode(userId: string, code: string) {
    const clubId = await this.operatorClub(userId);
    await this.finalizeExpiredOpen({ club_id: clubId });
    const b = await this.prisma.bookings.findFirst({ where: { club_id: clubId, code: code.trim().toUpperCase().replace(/^#/, '') }, select: operatorSelect });
    if (!b) throw new AppException('NOT_FOUND', 'Booking not found');
    return this.openView(operatorView(b), b.items.map((i) => i.device.zone.id), b.is_open ? await this.context(clubId).catch(() => null) : null);
  }

  /** Operator: mijozga qo'ng'iroq natijasi. */
  async operatorContact(userId: string, id: string, contactStatus: string, note: string | undefined, actor: Actor) {
    const clubId = await this.operatorClub(userId);
    const b = await this.prisma.bookings.findFirst({ where: { id, club_id: clubId }, select: { id: true, status: true } });
    if (!b) throw new AppException('NOT_FOUND', 'Booking not found');
    if (b.status !== 'CONFIRMED') throw new AppException('CONFLICT', 'Invalid status', { reason: 'INVALID_STATUS' });
    await this.prisma.$transaction(async (tx) => {
      await tx.bookings.update({ where: { id }, data: { contact_status: contactStatus, contact_note: note?.trim() || null, contacted_at: new Date() } });
      await this.audit.log({ actor_id: actor.id, club_id: clubId, action: 'operator.booking.contact', target_type: 'booking', target_id: id, new_value: { contact_status: contactStatus }, ip: actor.ip, user_agent: actor.ua, request_id: actor.request_id }, tx);
    });
    return this.operatorByCode(userId, (await this.prisma.bookings.findUniqueOrThrow({ where: { id }, select: { code: true } })).code);
  }

  /** Operator: xato bosilgan "Keldi"ni qaytarish (bron tugamaguncha) — yana CONFIRMED. */
  async operatorUndoCheckIn(userId: string, id: string, actor: Actor) {
    const clubId = await this.operatorClub(userId);
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.bookings.updateMany({
        where: { id, club_id: clubId, status: 'CHECKED_IN', is_open: false, end_at: { gt: new Date() } },
        data: { status: 'CONFIRMED', checked_in_at: null },
      });
      if (!count) throw new AppException('CONFLICT', 'Invalid status', { reason: 'INVALID_STATUS' });
      await this.audit.log({ actor_id: actor.id, club_id: clubId, action: 'operator.booking.undo-check-in', target_type: 'booking', target_id: id, new_value: { status: 'CONFIRMED' }, ip: actor.ip, user_agent: actor.ua, request_id: actor.request_id }, tx);
    });
    return { id, status: 'CONFIRMED' };
  }

  async operatorAction(userId: string, id: string, action: 'check-in' | 'no-show' | 'cancel', actor: Actor) {
    const clubId = await this.operatorClub(userId);
    const b = await this.prisma.bookings.findFirst({ where: { id, club_id: clubId }, select: { id: true, status: true, start_at: true, end_at: true, is_open: true } });
    if (!b) throw new AppException('NOT_FOUND', 'Booking not found');
    // Xato ochilgan ochiq sessiyani ham bekor qilish mumkin (summa hisoblanmaydi, joy bo'shaydi)
    const openLive = action === 'cancel' && b.status === 'CHECKED_IN' && b.is_open;
    if (b.status !== 'CONFIRMED' && !openLive) throw new AppException('CONFLICT', 'Invalid status', { reason: 'INVALID_STATUS' });
    if (action === 'no-show' && b.start_at.getTime() + BOOKING_RULES.noShowAfterMinutes * 60_000 > Date.now()) throw new AppException('CONFLICT', 'Not started yet', { reason: 'NOT_STARTED' });
    if (action === 'check-in' && Date.now() >= b.end_at.getTime()) throw new AppException('CONFLICT', 'Booking ended', { reason: 'ENDED' });
    const status = action === 'check-in' ? 'CHECKED_IN' : action === 'no-show' ? 'NO_SHOW' : 'CANCELLED';
    await this.setStatus(b.id, clubId, status, actor, `operator.booking.${action}`, openLive ? 'CHECKED_IN' : 'CONFIRMED');
    return { id, status };
  }

  private async setStatus(id: string, clubId: string, status: string, actor: Actor, action: string, from: 'CONFIRMED' | 'CHECKED_IN' = 'CONFIRMED') {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.bookings.updateMany({
        where: { id, status: from },
        data: { status, ...(status === 'CANCELLED' ? { cancelled_at: new Date(), cancelled_by: actor.id, is_open: false } : {}), ...(status === 'CHECKED_IN' ? { checked_in_at: new Date() } : {}) },
      });
      if (!count) throw new AppException('CONFLICT', 'Invalid status', { reason: 'INVALID_STATUS' });
      // Bekor/kelmadi — qurilmalar bo'shaydi
      if (status === 'CANCELLED' || status === 'NO_SHOW') await tx.booking_items.updateMany({ where: { booking_id: id }, data: { active: false } });
      await this.audit.log({ actor_id: actor.id, club_id: clubId, action, target_type: 'booking', target_id: id, new_value: { status }, ip: actor.ip, user_agent: actor.ua, request_id: actor.request_id }, tx);
    });
  }

  /** Telegram orqali mijozga xabar (bog'langan bo'lsa). Xato bronni buzmaydi. */
  private async notifyCustomer(userId: string, text: string) {
    try {
      const u = await this.prisma.users.findUnique({ where: { id: userId }, select: { phone: true } });
      if (!u?.phone) return;
      const link = await this.prisma.telegram_links.findUnique({ where: { phone: u.phone }, select: { chat_id: true } });
      if (link) await this.telegram.sendMessage(link.chat_id, text);
    } catch (e) {
      this.logger.warn(`booking notify failed: ${(e as Error).message}`);
    }
  }
}

const bookingSelect = {
  id: true, code: true, status: true, start_at: true, end_at: true, duration_minutes: true, total_amount: true, price_snapshot: true, created_at: true, cancelled_at: true, checked_in_at: true,
  contact_phone: true, is_open: true,
  club: { select: { id: true, name: true, address: true, phone: true, latitude: true, longitude: true } },
  items: { select: { device: { select: { seat_no: true, zone: { select: { name: true, color: true } } } } } },
} satisfies Prisma.bookingsSelect;

const operatorSelect = {
  ...bookingSelect,
  contact_status: true, contact_note: true, contacted_at: true, source: true, guest_name: true, guest_phone: true,
  customer: { select: { id: true, first_name: true, last_name: true, phone: true } },
  items: { select: { device: { select: { seat_no: true, zone: { select: { id: true, name: true, color: true, layout: true, devices_count: true } } } } } },
} satisfies Prisma.bookingsSelect;

/** Akkauntsiz (WALK_IN) bronda mijoz o'rniga operator kiritgan ism/telefon. */
function guestCustomer(b: { customer: { id: string; first_name: string | null; last_name: string | null; phone: string | null } | null; guest_name?: string | null; guest_phone?: string | null }) {
  return b.customer ?? { id: null, first_name: b.guest_name ?? null, last_name: null, phone: b.guest_phone ?? null };
}

/** Operator ko'rinishi: zonalar bo'yicha guruhlangan o'rindiqlar (zal sxemasi uchun). */
function operatorView(b: Prisma.bookingsGetPayload<{ select: typeof operatorSelect }>) {
  const zones = new Map<string, { id: string; name: string; color: string | null; layout: unknown; devices_count: number | null; seats: number[] }>();
  for (const i of b.items) {
    const z = i.device.zone;
    if (!zones.has(z.id)) zones.set(z.id, { id: z.id, name: z.name, color: z.color, layout: z.layout, devices_count: z.devices_count, seats: [] });
    zones.get(z.id)!.seats.push(i.device.seat_no);
  }
  for (const z of zones.values()) z.seats.sort((x, y) => x - y);
  return { ...view(b), customer: guestCustomer(b), zones: [...zones.values()] };
}

type BookingRow = Prisma.bookingsGetPayload<{ select: typeof bookingSelect }>;

function view<T extends BookingRow>(b: T) {
  const { items, ...rest } = b;
  const now = Date.now();
  // CHECKED_IN va vaqti tugagan — ko'rinishda "yakunlangan"
  const status = b.status === 'CHECKED_IN' && b.end_at.getTime() <= now ? 'COMPLETED' : b.status;
  return {
    ...rest,
    status,
    devices: items.map((i) => ({ zone: i.device.zone.name, color: i.device.zone.color, seat_no: i.device.seat_no })),
    can_cancel: b.status === 'CONFIRMED' && b.start_at.getTime() - now >= BOOKING_RULES.cancelMinMinutes * 60_000,
  };
}

function fmtLocal(d: Date) {
  const l = new Date(d.getTime() + 5 * 3600_000).toISOString();
  return `${l.slice(8, 10)}.${l.slice(5, 7)} ${l.slice(11, 16)}`;
}
