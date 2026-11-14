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
import { type TariffRow, quote } from './pricing';

/** Biznes qoidalari (foydalanuvchi bilan kelishilgan). */
export const BOOKING_RULES = {
  advanceDays: 5, // necha kun oldindan
  maxActive: 5, // bir mijozda bir vaqtda faol (kelgusi) bronlar
  cancelMinMinutes: 60, // boshlanishiga kamida shuncha qolganda bekor qilish mumkin
  bufferMinutes: 10, // bronlar orasida tozalash vaqti
  minMinutes: 30,
  maxMinutes: 12 * 60,
  maxDevices: 10,
} as const;

const LIVE = ['CONFIRMED', 'CHECKED_IN'];
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

  private validatePeriod(ctx: Ctx, start: Date, minutes: number) {
    const bad = (reason: string) => new AppException('VALIDATION_ERROR', 'Invalid booking time', { reason });
    if (!Number.isInteger(minutes) || minutes < BOOKING_RULES.minMinutes || minutes > BOOKING_RULES.maxMinutes) throw bad('INVALID_DURATION');
    if (Number.isNaN(start.getTime()) || start.getTime() % 60_000) throw bad('INVALID_START'); // istalgan daqiqa
    if (start.getTime() < Date.now()) throw bad('START_IN_PAST');
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

  /** Kun bo'yicha vaqtlar (30 daqiqa qadam): ish vaqtiga sig'adigan va har biri uchun bo'sh qurilmalar soni. */
  async slots(clubId: string, date: string, minutes: number) {
    const ctx = await this.context(clubId);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new AppException('VALIDATION_ERROR', 'Invalid date', { field: 'date' });
    const day = dayStart(date).getTime();
    const now = Date.now();
    const devices = ctx.zones.flatMap((z) => (z.tariffs.length ? z.devices.map((d) => d.id) : []));
    const items = devices.length ? await this.busyItems(devices, new Date(day), new Date(day + DAY_MS + (minutes + BOOKING_RULES.bufferMinutes) * 60_000)) : [];
    const out: { start_at: Date; free: number }[] = [];
    for (let t = day; t < day + DAY_MS; t += SLOT_MIN * 60_000) {
      if (t < now || t > now + BOOKING_RULES.advanceDays * DAY_MS) continue;
      const start = new Date(t);
      const end = new Date(t + minutes * 60_000);
      if (!fitsHours(ctx.working_hours, start, end)) continue;
      const blocked = end.getTime() + BOOKING_RULES.bufferMinutes * 60_000;
      // Narxi chiqmaydigan zona (masalan faqat kunduzgi tarif) — shu vaqtda bron qilinmaydi
      const priced = new Set(ctx.zones.filter((z) => quote(z.tariffs as TariffRow[], start, minutes)).flatMap((z) => z.devices.map((d) => d.id)));
      const busy = new Set(items.filter((i) => i.start_at.getTime() < blocked && i.blocked_until.getTime() > t).map((i) => i.device_id));
      out.push({ start_at: start, free: [...priced].filter((id) => !busy.has(id)).length });
    }
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
  async availability(clubId: string, startIso: string, minutes: number) {
    const ctx = await this.context(clubId);
    const start = new Date(startIso);
    this.validatePeriod(ctx, start, minutes);
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

  async create(user: AuthUser, dto: { club_id: string; start_at: string; duration_minutes: number; device_ids: string[] }, actor: Actor) {
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
    void this.notifyCustomer(user.id, `✅ <b>Bron tasdiqlandi</b> — ${ctx.name}\nKod: <b>${code}</b>\n${fmtLocal(start)}–${fmtLocal(end).slice(-5)}\nJoylar: ${lines.map((l) => `${l.zone} #${l.seat_no}`).join(', ')}\nTo'lov klubda.`);
    return this.get(user, id);
  }

  async get(user: AuthUser, id: string) {
    const b = await this.prisma.bookings.findFirst({ where: { id, customer_id: user.id }, select: bookingSelect });
    if (!b) throw new AppException('NOT_FOUND', 'Booking not found');
    return view(b);
  }

  async mine(user: AuthUser) {
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
    const rows = await this.prisma.bookings.findMany({
      where: { club_id: clubId, start_at: { lt: new Date(from.getTime() + DAY_MS) }, end_at: { gt: from } },
      orderBy: { start_at: 'asc' },
      select: { ...bookingSelect, customer: { select: { id: true, first_name: true, last_name: true, phone: true } } },
    });
    return { date: d, bookings: rows.map(view) };
  }

  async operatorAction(userId: string, id: string, action: 'check-in' | 'no-show' | 'cancel', actor: Actor) {
    const clubId = await this.operatorClub(userId);
    const b = await this.prisma.bookings.findFirst({ where: { id, club_id: clubId }, select: { id: true, status: true, start_at: true, end_at: true } });
    if (!b) throw new AppException('NOT_FOUND', 'Booking not found');
    if (b.status !== 'CONFIRMED') throw new AppException('CONFLICT', 'Invalid status', { reason: 'INVALID_STATUS' });
    if (action === 'no-show' && b.start_at.getTime() > Date.now()) throw new AppException('CONFLICT', 'Not started yet', { reason: 'NOT_STARTED' });
    if (action === 'check-in' && Date.now() >= b.end_at.getTime()) throw new AppException('CONFLICT', 'Booking ended', { reason: 'ENDED' });
    const status = action === 'check-in' ? 'CHECKED_IN' : action === 'no-show' ? 'NO_SHOW' : 'CANCELLED';
    await this.setStatus(b.id, clubId, status, actor, `operator.booking.${action}`);
    return { id, status };
  }

  private async setStatus(id: string, clubId: string, status: string, actor: Actor, action: string) {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.bookings.updateMany({
        where: { id, status: 'CONFIRMED' },
        data: { status, ...(status === 'CANCELLED' ? { cancelled_at: new Date(), cancelled_by: actor.id } : {}), ...(status === 'CHECKED_IN' ? { checked_in_at: new Date() } : {}) },
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
  club: { select: { id: true, name: true, address: true, phone: true } },
  items: { select: { device: { select: { seat_no: true, zone: { select: { name: true, color: true } } } } } },
} satisfies Prisma.bookingsSelect;

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
