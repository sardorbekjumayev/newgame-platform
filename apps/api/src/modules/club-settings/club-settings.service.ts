import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Actor } from '../../common/decorators/actor.decorator';
import { AppException } from '../../common/errors';
import { serialize } from '../../common/serialize';
import { uuidv7 } from '../../common/utils/id';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateTariffDto, CreateZoneDto, UpdateTariffDto, UpdateZoneDto } from './club-settings.dto';

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
type Window = { open: string; close: string };
export type WorkingHours = { always_open: boolean } & Record<(typeof DAY_KEYS)[number], Window[]>;

const zoneSelect = { id: true, name: true, description: true, color: true, sort_order: true, created_at: true } as const;
const tariffSelect = { id: true, zone_id: true, name: true, type: true, price: true, duration_minutes: true, valid_from: true, valid_to: true, is_active: true, sort_order: true, created_at: true } as const;

/** Ish vaqtini tekshirish va normallashtirish: kuniga ko'pi bilan 3 oraliq, open != close. */
export function normalizeWorkingHours(raw: Record<string, unknown>): WorkingHours {
  const bad = (reason: string) => new AppException('VALIDATION_ERROR', 'Invalid working hours', { field: 'working_hours', reason });
  const out = { always_open: raw.always_open === true } as WorkingHours;
  for (const d of DAY_KEYS) {
    const v = raw[d] ?? [];
    if (!Array.isArray(v) || v.length > 3) throw bad('INVALID_DAY');
    out[d] = v.map((w) => {
      const { open, close } = (w ?? {}) as Partial<Window>;
      if (!TIME.test(open ?? '') || !TIME.test(close ?? '') || open === close) throw bad('INVALID_TIME');
      return { open: open!, close: close! };
    });
  }
  return out;
}

/**
 * Operator: o'z klubining zonalari, tariflari va ish vaqti. Scope — operatorning klubi (user_roles OPERATOR).
 * Boshqa klub resursi "topilmadi" (404).
 */
@Injectable()
export class ClubSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async clubOf(userId: string) {
    const r = await this.prisma.user_roles.findFirst({ where: { user_id: userId, role: { code: 'OPERATOR' }, club_id: { not: null } }, select: { club_id: true } });
    if (!r) throw new AppException('NOT_FOUND', 'Club not found');
    return r.club_id!;
  }

  private log(actor: Actor, clubId: string, action: string, target: string, id: string, oldV?: unknown, newV?: unknown, tx?: Prisma.TransactionClient) {
    return this.audit.log({ actor_id: actor.id, club_id: clubId, action, target_type: target, target_id: id, old_value: serialize(oldV), new_value: serialize(newV), ip: actor.ip, user_agent: actor.ua, request_id: actor.request_id }, tx);
  }

  // ---------- Zonalar ----------

  async zones(userId: string) {
    const clubId = await this.clubOf(userId);
    const rows = await this.prisma.zones.findMany({
      where: { club_id: clubId, deleted_at: null },
      orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
      select: { ...zoneSelect, _count: { select: { tariffs: { where: { deleted_at: null } } } } },
    });
    return rows.map(({ _count, ...z }) => ({ ...z, tariffs_count: _count.tariffs }));
  }

  async createZone(userId: string, dto: CreateZoneDto, actor: Actor) {
    const clubId = await this.clubOf(userId);
    await this.assertZoneNameFree(clubId, dto.name);
    const id = uuidv7();
    await this.prisma.$transaction(async (tx) => {
      await tx.zones.create({ data: { id, club_id: clubId, name: dto.name, description: dto.description ?? null, color: dto.color ?? null, sort_order: dto.sort_order ?? 0 } });
      await this.log(actor, clubId, 'operator.zone.create', 'zone', id, undefined, dto, tx);
    });
    return this.prisma.zones.findUniqueOrThrow({ where: { id }, select: zoneSelect });
  }

  async updateZone(userId: string, id: string, dto: UpdateZoneDto, actor: Actor) {
    const clubId = await this.clubOf(userId);
    const old = await this.zoneOf(clubId, id);
    if (dto.name && dto.name.toLowerCase() !== old.name.toLowerCase()) await this.assertZoneNameFree(clubId, dto.name);
    await this.prisma.$transaction(async (tx) => {
      await tx.zones.update({ where: { id }, data: dto });
      await this.log(actor, clubId, 'operator.zone.update', 'zone', id, old, dto, tx);
    });
    return this.prisma.zones.findUniqueOrThrow({ where: { id }, select: zoneSelect });
  }

  /** Zona o'chirilsa, uning tariflari ham o'chadi (soft). */
  async deleteZone(userId: string, id: string, actor: Actor) {
    const clubId = await this.clubOf(userId);
    const old = await this.zoneOf(clubId, id);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.tariffs.updateMany({ where: { zone_id: id, deleted_at: null }, data: { deleted_at: now } });
      await tx.zones.update({ where: { id }, data: { deleted_at: now } });
      await this.log(actor, clubId, 'operator.zone.delete', 'zone', id, old, undefined, tx);
    });
    return { ok: true };
  }

  private async zoneOf(clubId: string, id: string) {
    const z = await this.prisma.zones.findFirst({ where: { id, club_id: clubId, deleted_at: null }, select: zoneSelect });
    if (!z) throw new AppException('NOT_FOUND', 'Zone not found');
    return z;
  }

  private async assertZoneNameFree(clubId: string, name: string) {
    const dup = await this.prisma.zones.findFirst({ where: { club_id: clubId, deleted_at: null, name: { equals: name, mode: 'insensitive' } }, select: { id: true } });
    if (dup) throw new AppException('CONFLICT', 'Zone name taken', { field: 'name', reason: 'ZONE_NAME_TAKEN' });
  }

  // ---------- Tariflar ----------

  async tariffs(userId: string) {
    const clubId = await this.clubOf(userId);
    return this.prisma.tariffs.findMany({
      where: { club_id: clubId, deleted_at: null, zone: { deleted_at: null } },
      orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
      select: tariffSelect,
    });
  }

  async createTariff(userId: string, dto: CreateTariffDto, actor: Actor) {
    const clubId = await this.clubOf(userId);
    await this.zoneOf(clubId, dto.zone_id);
    const data = this.tariffData(dto);
    const id = uuidv7();
    await this.prisma.$transaction(async (tx) => {
      await tx.tariffs.create({ data: { id, club_id: clubId, zone_id: dto.zone_id, name: dto.name, type: dto.type, price: BigInt(dto.price), is_active: dto.is_active ?? true, sort_order: dto.sort_order ?? 0, ...data } });
      await this.log(actor, clubId, 'operator.tariff.create', 'tariff', id, undefined, dto, tx);
    });
    return this.prisma.tariffs.findUniqueOrThrow({ where: { id }, select: tariffSelect });
  }

  async updateTariff(userId: string, id: string, dto: UpdateTariffDto, actor: Actor) {
    const clubId = await this.clubOf(userId);
    const old = await this.prisma.tariffs.findFirst({ where: { id, club_id: clubId, deleted_at: null }, select: tariffSelect });
    if (!old) throw new AppException('NOT_FOUND', 'Tariff not found');
    if (dto.zone_id) await this.zoneOf(clubId, dto.zone_id);
    // Birlashtirilgan holat bo'yicha tekshiruv (masalan HOURLY → PACKAGE bo'lsa davomiylik kerak)
    const merged = {
      type: dto.type ?? (old.type as 'HOURLY' | 'PACKAGE'),
      duration_minutes: dto.duration_minutes !== undefined ? dto.duration_minutes : old.duration_minutes,
      valid_from: dto.valid_from !== undefined ? dto.valid_from : old.valid_from,
      valid_to: dto.valid_to !== undefined ? dto.valid_to : old.valid_to,
    };
    const data = this.tariffData(merged);
    await this.prisma.$transaction(async (tx) => {
      await tx.tariffs.update({
        where: { id },
        data: {
          ...(dto.zone_id ? { zone_id: dto.zone_id } : {}),
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.type ? { type: dto.type } : {}),
          ...(dto.price !== undefined ? { price: BigInt(dto.price) } : {}),
          ...(dto.is_active !== undefined ? { is_active: dto.is_active } : {}),
          ...(dto.sort_order !== undefined ? { sort_order: dto.sort_order } : {}),
          ...data,
        },
      });
      await this.log(actor, clubId, 'operator.tariff.update', 'tariff', id, old, dto, tx);
    });
    return this.prisma.tariffs.findUniqueOrThrow({ where: { id }, select: tariffSelect });
  }

  async deleteTariff(userId: string, id: string, actor: Actor) {
    const clubId = await this.clubOf(userId);
    const old = await this.prisma.tariffs.findFirst({ where: { id, club_id: clubId, deleted_at: null }, select: tariffSelect });
    if (!old) throw new AppException('NOT_FOUND', 'Tariff not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.tariffs.update({ where: { id }, data: { deleted_at: new Date() } });
      await this.log(actor, clubId, 'operator.tariff.delete', 'tariff', id, old, undefined, tx);
    });
    return { ok: true };
  }

  /** Turga bog'liq maydonlar: HOURLY — davomiylik yo'q; PACKAGE — majburiy. Vaqt oralig'i — ikkalasi yoki hech biri. */
  private tariffData(t: { type: 'HOURLY' | 'PACKAGE'; duration_minutes?: number | null; valid_from?: string | null; valid_to?: string | null }) {
    if (t.type === 'PACKAGE' && !t.duration_minutes) {
      throw new AppException('VALIDATION_ERROR', 'Package needs duration', { field: 'duration_minutes', reason: 'DURATION_REQUIRED' });
    }
    const from = t.valid_from ?? null;
    const to = t.valid_to ?? null;
    if ((from === null) !== (to === null) || (from !== null && from === to)) {
      throw new AppException('VALIDATION_ERROR', 'Invalid time window', { field: 'valid_from', reason: 'INVALID_WINDOW' });
    }
    return { duration_minutes: t.type === 'PACKAGE' ? t.duration_minutes! : null, valid_from: from, valid_to: to };
  }

  // ---------- Ish vaqti ----------

  async workingHours(userId: string) {
    const clubId = await this.clubOf(userId);
    const c = await this.prisma.clubs.findUniqueOrThrow({ where: { id: clubId }, select: { working_hours: true } });
    return { working_hours: c.working_hours as WorkingHours | null };
  }

  async setWorkingHours(userId: string, raw: Record<string, unknown>, actor: Actor) {
    const clubId = await this.clubOf(userId);
    const wh = normalizeWorkingHours(raw);
    const old = await this.prisma.clubs.findUniqueOrThrow({ where: { id: clubId }, select: { working_hours: true } });
    await this.prisma.$transaction(async (tx) => {
      await tx.clubs.update({ where: { id: clubId }, data: { working_hours: wh } });
      await this.log(actor, clubId, 'operator.club.working_hours', 'club', clubId, old.working_hours, wh, tx);
    });
    return { working_hours: wh };
  }
}
