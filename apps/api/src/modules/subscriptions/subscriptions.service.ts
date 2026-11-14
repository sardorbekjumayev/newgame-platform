import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Actor } from '../../common/decorators/actor.decorator';
import { AppException } from '../../common/errors';
import { serialize } from '../../common/serialize';
import { uuidv7 } from '../../common/utils/id';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AssignSubscriptionDto, CreatePlanDto, ExtendSubscriptionDto, UpdatePlanDto } from './subscriptions.dto';

/** Necha kun qolganda "tugayapti" deb ogohlantiramiz. */
export const EXPIRING_DAYS = 3;
const DAY = 24 * 60 * 60 * 1000;

export type SubStatus = 'TRIAL' | 'ACTIVE' | 'EXPIRING' | 'EXPIRED';

const planSelect = { id: true, name: true, price: true, max_zones: true, max_devices: true, is_active: true, created_at: true } as const;
const subSelect = { id: true, club_id: true, trial_days: true, starts_at: true, trial_ends_at: true, ends_at: true, note: true, created_at: true, plan: { select: planSelect } } as const;
type SubRow = Prisma.club_subscriptionsGetPayload<{ select: typeof subSelect }>;

const addMonths = (d: Date, n: number) => {
  const r = new Date(d);
  r.setUTCMonth(r.getUTCMonth() + n);
  return r;
};

export function subStatus(s: { trial_ends_at: Date; ends_at: Date }, now = new Date()): SubStatus {
  if (s.ends_at <= now) return 'EXPIRED';
  if (s.ends_at.getTime() - now.getTime() <= EXPIRING_DAYS * DAY) return 'EXPIRING';
  return s.trial_ends_at > now ? 'TRIAL' : 'ACTIVE';
}

const view = (s: SubRow) => ({ ...s, status: subStatus(s), days_left: Math.ceil((s.ends_at.getTime() - Date.now()) / DAY) });

/**
 * Platforma obunalari (super admin): rejalar, klubga obuna berish/uzaytirish, ogohlantirishlar.
 * Muddat tugasa klub yopilmaydi — faqat super adminga ogohlantirish. Limitlar club-settings da tekshiriladi.
 */
@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private log(actor: Actor, action: string, target: string, id: string, clubId: string | null, oldV?: unknown, newV?: unknown, tx?: Prisma.TransactionClient) {
    return this.audit.log({ actor_id: actor.id, club_id: clubId, action, target_type: target, target_id: id, old_value: serialize(oldV), new_value: serialize(newV), ip: actor.ip, user_agent: actor.ua, request_id: actor.request_id }, tx);
  }

  // ---------- Rejalar ----------

  async plans() {
    const rows = await this.prisma.plans.findMany({
      orderBy: [{ is_active: 'desc' }, { price: 'asc' }],
      select: { ...planSelect, _count: { select: { subscriptions: { where: { cancelled_at: null } } } } },
    });
    return rows.map(({ _count, ...p }) => ({ ...p, clubs_count: _count.subscriptions }));
  }

  async createPlan(dto: CreatePlanDto, actor: Actor) {
    const id = uuidv7();
    await this.unique(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.plans.create({ data: { id, name: dto.name, price: BigInt(dto.price), max_zones: dto.max_zones, max_devices: dto.max_devices, is_active: dto.is_active ?? true } });
        await this.log(actor, 'admin.plan.create', 'plan', id, null, undefined, dto, tx);
      }),
    );
    return this.prisma.plans.findUniqueOrThrow({ where: { id }, select: planSelect });
  }

  async updatePlan(id: string, dto: UpdatePlanDto, actor: Actor) {
    const old = await this.prisma.plans.findUnique({ where: { id }, select: planSelect });
    if (!old) throw new AppException('NOT_FOUND', 'Plan not found');
    await this.unique(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.plans.update({ where: { id }, data: { ...dto, ...(dto.price !== undefined ? { price: BigInt(dto.price) } : {}) } });
        await this.log(actor, 'admin.plan.update', 'plan', id, null, old, dto, tx);
      }),
    );
    return this.prisma.plans.findUniqueOrThrow({ where: { id }, select: planSelect });
  }

  private async unique(fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') throw new AppException('CONFLICT', 'Plan name taken', { field: 'name', reason: 'PLAN_NAME_TAKEN' });
      throw e;
    }
  }

  // ---------- Klub obunalari ----------

  current(clubId: string) {
    return this.prisma.club_subscriptions.findFirst({ where: { club_id: clubId, cancelled_at: null }, select: subSelect });
  }

  async clubSubscription(clubId: string) {
    const s = await this.current(clubId);
    return s ? view(s) : null;
  }

  async assign(clubId: string, dto: AssignSubscriptionDto, actor: Actor) {
    if (!(await this.prisma.clubs.findUnique({ where: { id: clubId }, select: { id: true } }))) throw new AppException('NOT_FOUND', 'Club not found');
    const plan = await this.prisma.plans.findUnique({ where: { id: dto.plan_id }, select: { is_active: true } });
    if (!plan) throw new AppException('NOT_FOUND', 'Plan not found');
    if (!plan.is_active) throw new AppException('CONFLICT', 'Plan inactive', { field: 'plan_id', reason: 'PLAN_INACTIVE' });
    if (dto.trial_days + dto.months === 0) throw new AppException('VALIDATION_ERROR', 'Empty period', { field: 'months', reason: 'EMPTY_PERIOD' });
    const now = new Date();
    const trialEnds = new Date(now.getTime() + dto.trial_days * DAY);
    const ends = addMonths(trialEnds, dto.months);
    const id = uuidv7();
    const old = await this.current(clubId);
    await this.prisma.$transaction(async (tx) => {
      await tx.club_subscriptions.updateMany({ where: { club_id: clubId, cancelled_at: null }, data: { cancelled_at: now } });
      await tx.club_subscriptions.create({ data: { id, club_id: clubId, plan_id: dto.plan_id, trial_days: dto.trial_days, starts_at: now, trial_ends_at: trialEnds, ends_at: ends, note: dto.note ?? null, created_by: actor.id } });
      await this.log(actor, 'admin.subscription.assign', 'club_subscription', id, clubId, old ? { plan_id: old.plan.id, ends_at: old.ends_at } : undefined, { ...dto, ends_at: ends }, tx);
    });
    return this.clubSubscription(clubId);
  }

  async extend(clubId: string, dto: ExtendSubscriptionDto, actor: Actor) {
    const s = await this.current(clubId);
    if (!s) throw new AppException('NOT_FOUND', 'Subscription not found');
    const now = new Date();
    const ends = addMonths(s.ends_at > now ? s.ends_at : now, dto.months);
    await this.prisma.$transaction(async (tx) => {
      await tx.club_subscriptions.update({ where: { id: s.id }, data: { ends_at: ends, ...(dto.note !== undefined ? { note: dto.note } : {}) } });
      await this.log(actor, 'admin.subscription.extend', 'club_subscription', s.id, clubId, { ends_at: s.ends_at }, { ...dto, ends_at: ends }, tx);
    });
    return this.clubSubscription(clubId);
  }

  async cancel(clubId: string, actor: Actor) {
    const s = await this.current(clubId);
    if (!s) throw new AppException('NOT_FOUND', 'Subscription not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.club_subscriptions.update({ where: { id: s.id }, data: { cancelled_at: new Date() } });
      await this.log(actor, 'admin.subscription.cancel', 'club_subscription', s.id, clubId, { plan_id: s.plan.id, ends_at: s.ends_at }, undefined, tx);
    });
    return { ok: true };
  }

  /** Barcha klublar obuna holati bilan — eng shoshilinchlari birinchi (tugagan, tugayapti, obunasiz, qolganlar). */
  async overview() {
    const clubs = await this.prisma.clubs.findMany({
      orderBy: { created_at: 'asc' },
      select: {
        id: true, name: true, city: true, address: true, status: true,
        subscriptions: { where: { cancelled_at: null }, select: subSelect, take: 1 },
        zones: { where: { deleted_at: null }, select: { devices_count: true } },
      },
    });
    const rank: Record<string, number> = { EXPIRED: 0, EXPIRING: 1, NONE: 2, TRIAL: 3, ACTIVE: 4 };
    return clubs
      .map(({ subscriptions, zones, ...c }) => {
        const sub = subscriptions[0] ? view(subscriptions[0]) : null;
        return { ...c, subscription: sub, usage: { zones: zones.length, devices: zones.reduce((n, z) => n + (z.devices_count ?? 0), 0) } };
      })
      .sort((a, b) => rank[a.subscription?.status ?? 'NONE'] - rank[b.subscription?.status ?? 'NONE'] || (a.subscription?.ends_at.getTime() ?? 0) - (b.subscription?.ends_at.getTime() ?? 0));
  }

  /** Ogohlantirish soni (menyu badge'i, dashboard): tugagan + tugashiga EXPIRING_DAYS kun qolgan. */
  alertsCount() {
    return this.prisma.club_subscriptions.count({ where: { cancelled_at: null, ends_at: { lte: new Date(Date.now() + EXPIRING_DAYS * DAY) } } });
  }

  /** Klublar obunasi (menejer paneli uchun): club_id → reja, holat, tugash sanasi. */
  async summaries(clubIds: string[]) {
    const rows = await this.prisma.club_subscriptions.findMany({ where: { club_id: { in: clubIds }, cancelled_at: null }, select: subSelect });
    return new Map(
      rows.map((s) => {
        const v = view(s);
        return [s.club_id, { plan: { name: s.plan.name, price: s.plan.price, max_zones: s.plan.max_zones, max_devices: s.plan.max_devices }, status: v.status, days_left: v.days_left, trial_ends_at: s.trial_ends_at, ends_at: s.ends_at }];
      }),
    );
  }

  // ---------- Limitlar (operator) ----------

  /** Klub rejasi limitlari. Obuna bo'lmasa — cheklov yo'q (null). Muddati tugagan bo'lsa ham oxirgi reja limitlari amal qiladi. */
  async limits(clubId: string) {
    const s = await this.current(clubId);
    return s ? { plan: s.plan.name, max_zones: s.plan.max_zones, max_devices: s.plan.max_devices } : null;
  }

  /** Zona qo'shish/tahrirlashdan oldin: zallar soni va jami qurilmalar limitdan oshmasin. */
  async assertWithinLimits(clubId: string, change: { addZone?: boolean; zoneId?: string; devices?: number }) {
    const lim = await this.limits(clubId);
    if (!lim) return;
    const zones = await this.prisma.zones.findMany({ where: { club_id: clubId, deleted_at: null }, select: { id: true, devices_count: true } });
    if (change.addZone && zones.length + 1 > lim.max_zones) {
      throw new AppException('CONFLICT', 'Plan zone limit', { field: 'name', reason: 'PLAN_ZONES_LIMIT', limit: lim.max_zones, plan: lim.plan });
    }
    if (change.devices !== undefined) {
      const others = zones.filter((z) => z.id !== change.zoneId).reduce((n, z) => n + (z.devices_count ?? 0), 0);
      if (others + change.devices > lim.max_devices) {
        throw new AppException('CONFLICT', 'Plan device limit', { field: 'devices_count', reason: 'PLAN_DEVICES_LIMIT', limit: lim.max_devices, available: Math.max(0, lim.max_devices - others), plan: lim.plan });
      }
    }
  }
}
