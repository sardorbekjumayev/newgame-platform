import { Injectable } from '@nestjs/common';
import type { Actor } from '../../common/decorators/actor.decorator';
import { AppException } from '../../common/errors';
import { randomDigits, safeEqual } from '../../common/utils/crypto';
import { uuidv7 } from '../../common/utils/id';
import { isOpenNow } from '../catalog/open-now';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';

/** Kod amal qilish muddati va xato urinishlar chegarasi. */
const LINK_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const clubPublic = { id: true, name: true, city: true, address: true, phone: true, status: true, created_at: true } as const;
const personPublic = { id: true, public_id: true, username: true, first_name: true, last_name: true } as const;

/**
 * Operator va menejer panellari. Scope: operator — faqat o'z klubi (user_roles OPERATOR club_id);
 * menejer — faqat manager_clubs orqali biriktirilgan klublar. Boshqa klub "topilmadi" (404).
 */
@Injectable()
export class PanelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------- Operator ----------

  async operatorDashboard(userId: string) {
    const role = await this.prisma.user_roles.findFirst({ where: { user_id: userId, role: { code: 'OPERATOR' }, club_id: { not: null } }, select: { club_id: true } });
    if (!role) throw new AppException('NOT_FOUND', 'Club not found');
    const [me, club] = await Promise.all([
      this.prisma.users.findUniqueOrThrow({ where: { id: userId }, select: personPublic }),
      this.prisma.clubs.findUniqueOrThrow({
        where: { id: role.club_id! },
        select: {
          ...clubPublic, latitude: true, longitude: true, location_set_at: true,
          managers: { select: { linked_at: true, manager: { select: personPublic } }, orderBy: { linked_at: 'desc' } },
          unlink_requests: { where: { status: 'PENDING' }, select: { id: true, manager_id: true, reason: true, created_at: true } },
        },
      }),
    ]);
    const { managers, unlink_requests, ...rest } = club;
    const pendingRemoval = new Map(unlink_requests.map((r) => [r.manager_id, r]));
    // Operator User ID sini menejerga aytadi → menejer so'rov yuboradi → kod shu yerda ko'rinadi
    return {
      me,
      // Klub joyi xaritada belgilanmagan — operator panelida birinchi qadam
      club: { ...rest, needs_location: rest.latitude === null || rest.longitude === null },
      managers: managers.map((m) => ({ ...m.manager, linked_at: m.linked_at, removal_request: pendingRemoval.get(m.manager.id) ?? null })),
      link_requests: await this.operatorRequests(role.club_id!),
    };
  }

  private operatorRequests(clubId: string) {
    return this.prisma.manager_link_requests.findMany({
      where: { club_id: clubId, status: 'PENDING', expires_at: { gt: new Date() } },
      orderBy: { created_at: 'desc' },
      select: { id: true, code: true, expires_at: true, created_at: true, manager: { select: personPublic } },
    });
  }

  /** Operator so'rovni rad etadi (kodni bermaydi). */
  async operatorReject(userId: string, requestId: string, actor: Actor) {
    const role = await this.prisma.user_roles.findFirst({ where: { user_id: userId, role: { code: 'OPERATOR' } }, select: { club_id: true } });
    const { count } = await this.prisma.manager_link_requests.updateMany({
      where: { id: requestId, club_id: role?.club_id ?? '00000000-0000-0000-0000-000000000000', status: 'PENDING' },
      data: { status: 'REJECTED' },
    });
    if (!count) throw new AppException('NOT_FOUND', 'Request not found');
    await this.audit.log({ actor_id: actor.id, club_id: role!.club_id, action: 'operator.link_request.reject', target_type: 'manager_link_request', target_id: requestId, ip: actor.ip, user_agent: actor.ua, request_id: actor.request_id });
    return { ok: true };
  }

  private async operatorClubId(userId: string) {
    const role = await this.prisma.user_roles.findFirst({ where: { user_id: userId, role: { code: 'OPERATOR' }, club_id: { not: null } }, select: { club_id: true } });
    if (!role) throw new AppException('NOT_FOUND', 'Club not found');
    return role.club_id!;
  }

  /** Klub joyini xaritada belgilash (operator; keyin ham o'zgartirishi mumkin). */
  async setLocation(userId: string, loc: { latitude: number; longitude: number; address?: string }, actor: Actor) {
    const clubId = await this.operatorClubId(userId);
    const old = await this.prisma.clubs.findUniqueOrThrow({ where: { id: clubId }, select: { latitude: true, longitude: true, address: true } });
    await this.prisma.$transaction(async (tx) => {
      await tx.clubs.update({
        where: { id: clubId },
        data: { latitude: loc.latitude, longitude: loc.longitude, location_set_at: new Date(), ...(loc.address ? { address: loc.address } : {}) },
      });
      await this.audit.log({ actor_id: actor.id, club_id: clubId, action: 'operator.club.location', target_type: 'club', target_id: clubId, old_value: old, new_value: loc, ip: actor.ip, user_agent: actor.ua, request_id: actor.request_id }, tx);
    });
    return this.operatorDashboard(userId);
  }

  /**
   * Operator menejerni o'zi olib tashlay olmaydi: so'rov super adminga boradi,
   * super admin ikkala tomon bilan bog'lanib tasdiqlasa olib tashlanadi.
   */
  async requestRemoval(userId: string, managerId: string, reason: string | undefined, actor: Actor) {
    const clubId = await this.operatorClubId(userId);
    const link = await this.prisma.manager_clubs.findUnique({ where: { manager_id_club_id: { manager_id: managerId, club_id: clubId } } });
    if (!link) throw new AppException('NOT_FOUND', 'Manager not found');
    const id = uuidv7();
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.manager_unlink_requests.create({ data: { id, club_id: clubId, manager_id: managerId, requested_by: userId, reason: reason?.trim() || null } });
        await this.audit.log({ actor_id: actor.id, club_id: clubId, action: 'operator.manager.removal_request', target_type: 'manager_unlink_request', target_id: id, new_value: { manager_id: managerId, reason: reason ?? null }, ip: actor.ip, user_agent: actor.ua, request_id: actor.request_id }, tx);
      });
    } catch (e) {
      // partial unique: shu menejer uchun kutilayotgan so'rov bor
      if ((e as { code?: string }).code === 'P2002') throw new AppException('CONFLICT', 'Request already pending', { reason: 'REMOVAL_PENDING' });
      throw e;
    }
    return { id, status: 'PENDING' };
  }

  async cancelRemoval(userId: string, requestId: string) {
    const clubId = await this.operatorClubId(userId);
    const { count } = await this.prisma.manager_unlink_requests.updateMany({ where: { id: requestId, club_id: clubId, status: 'PENDING' }, data: { status: 'CANCELLED' } });
    if (!count) throw new AppException('NOT_FOUND', 'Request not found');
    return { ok: true };
  }

  // ---------- Menejer ----------

  async managerClubs(managerId: string) {
    const rows = await this.prisma.manager_clubs.findMany({
      where: { manager_id: managerId },
      orderBy: { linked_at: 'desc' },
      select: {
        linked_at: true,
        club: {
          select: {
            ...clubPublic,
            working_hours: true,
            zones: { where: { deleted_at: null }, orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }], select: { id: true, name: true, color: true } },
            _count: { select: { tariffs: { where: { deleted_at: null, is_active: true, zone: { deleted_at: null } } } } },
          },
        },
      },
    });
    const ops = await this.prisma.user_roles.findMany({
      where: { club_id: { in: rows.map((r) => r.club.id) }, role: { code: 'OPERATOR' } },
      select: { club_id: true, user: { select: { ...personPublic, status: true, last_login_at: true } } },
    });
    const byClub = new Map(ops.map((o) => [o.club_id, o.user]));
    return rows.map(({ club: { _count, working_hours, ...c }, linked_at }) => ({
      ...c,
      linked_at,
      tariffs_count: _count.tariffs,
      is_open_now: isOpenNow(working_hours),
      operator: byClub.get(c.id) ?? null,
    }));
  }

  /** Menejer: biriktirilgan bitta klub — zonalar va tariflar (nofaollari ham), ish vaqti, joy. Biriktirilmagan — 404. */
  async managerClub(managerId: string, clubId: string) {
    const link = await this.prisma.manager_clubs.findUnique({ where: { manager_id_club_id: { manager_id: managerId, club_id: clubId } }, select: { linked_at: true } });
    if (!link) throw new AppException('NOT_FOUND', 'Club not found');
    const c = await this.prisma.clubs.findUniqueOrThrow({
      where: { id: clubId },
      select: {
        ...clubPublic, latitude: true, longitude: true, working_hours: true,
        zones: {
          where: { deleted_at: null },
          orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
          select: {
            id: true, name: true, description: true, color: true,
            tariffs: {
              where: { deleted_at: null },
              orderBy: [{ sort_order: 'asc' }, { price: 'asc' }],
              select: { id: true, name: true, type: true, price: true, duration_minutes: true, valid_from: true, valid_to: true, is_active: true },
            },
          },
        },
      },
    });
    const op = await this.prisma.user_roles.findFirst({
      where: { club_id: clubId, role: { code: 'OPERATOR' } },
      select: { user: { select: { ...personPublic, status: true, last_login_at: true } } },
    });
    return { ...c, linked_at: link.linked_at, is_open_now: isOpenNow(c.working_hours), operator: op?.user ?? null };
  }

  /**
   * 1-qadam: menejer operator User ID sini kiritadi → so'rov va 6 xonali kod (operator panelida ko'rinadi).
   * Javobda klub nomi yo'q — kod tasdiqlanmaguncha qaysi klub ekanini oshkor qilmaymiz.
   */
  async requestLink(managerId: string, publicId: string, actor: Actor) {
    const op = await this.prisma.users.findFirst({
      where: { public_id: publicId, deleted_at: null, status: 'ACTIVE' },
      select: { id: true, user_roles: { where: { role: { code: 'OPERATOR' }, club_id: { not: null } }, select: { club_id: true } } },
    });
    const clubId = op?.user_roles[0]?.club_id;
    if (!op || !clubId) throw new AppException('NOT_FOUND', 'Operator not found', { field: 'public_id', reason: 'OPERATOR_NOT_FOUND' });
    if (await this.prisma.manager_clubs.findUnique({ where: { manager_id_club_id: { manager_id: managerId, club_id: clubId } } })) {
      throw new AppException('CONFLICT', 'Already linked', { reason: 'ALREADY_LINKED' });
    }
    const id = uuidv7();
    const expires = new Date(Date.now() + LINK_TTL_MS);
    await this.prisma.$transaction(async (tx) => {
      // Shu klubga avvalgi kutilayotgan so'rov bekor — operator panelida bittasi ko'rinadi
      await tx.manager_link_requests.updateMany({ where: { manager_id: managerId, club_id: clubId, status: 'PENDING' }, data: { status: 'CANCELLED' } });
      await tx.manager_link_requests.create({ data: { id, manager_id: managerId, club_id: clubId, operator_id: op.id, code: randomDigits(6), expires_at: expires } });
      await this.audit.log({ actor_id: actor.id, club_id: clubId, action: 'manager.link_request.create', target_type: 'manager_link_request', target_id: id, new_value: { via_public_id: publicId }, ip: actor.ip, user_agent: actor.ua, request_id: actor.request_id }, tx);
    });
    return { request_id: id, expires_at: expires, expires_in: LINK_TTL_MS / 1000 };
  }

  /** Menejerning kutilayotgan so'rovlari (kodni kiritishni davom ettirish uchun). Kod qaytarilmaydi. */
  managerRequests(managerId: string) {
    return this.prisma.manager_link_requests.findMany({
      where: { manager_id: managerId, status: 'PENDING', expires_at: { gt: new Date() } },
      orderBy: { created_at: 'desc' },
      select: { id: true, expires_at: true, created_at: true, attempts: true },
    });
  }

  /** 2-qadam: operator aytgan kodni kiritish → klub bog'lanadi. */
  async confirmLink(managerId: string, requestId: string, code: string, actor: Actor) {
    const r = await this.prisma.manager_link_requests.findFirst({ where: { id: requestId, manager_id: managerId } });
    if (!r) throw new AppException('NOT_FOUND', 'Request not found');
    if (r.status === 'REJECTED') throw new AppException('FORBIDDEN', 'Request rejected', { reason: 'LINK_REJECTED' });
    if (r.status !== 'PENDING' || r.expires_at <= new Date()) throw new AppException('OTP_EXPIRED', 'Code expired');
    if (!safeEqual(r.code, code)) {
      const attempts = r.attempts + 1;
      await this.prisma.manager_link_requests.update({ where: { id: r.id }, data: { attempts, ...(attempts >= MAX_ATTEMPTS ? { status: 'FAILED' } : {}) } });
      if (attempts >= MAX_ATTEMPTS) throw new AppException('OTP_TOO_MANY_ATTEMPTS', 'Too many attempts');
      throw new AppException('OTP_INVALID', 'Invalid code', { attempts_left: MAX_ATTEMPTS - attempts });
    }
    await this.prisma.$transaction(async (tx) => {
      // Shartli: parallel ikki tasdiqdan faqat bittasi o'tadi
      const { count } = await tx.manager_link_requests.updateMany({ where: { id: r.id, status: 'PENDING' }, data: { status: 'CONFIRMED' } });
      if (!count) throw new AppException('OTP_EXPIRED', 'Code expired');
      await tx.manager_clubs.createMany({ data: [{ manager_id: managerId, club_id: r.club_id }], skipDuplicates: true });
      await this.audit.log({ actor_id: actor.id, club_id: r.club_id, action: 'manager.club.link', target_type: 'club', target_id: r.club_id, new_value: { request_id: r.id, operator_id: r.operator_id }, ip: actor.ip, user_agent: actor.ua, request_id: actor.request_id }, tx);
    });
    return { clubs: await this.managerClubs(managerId) };
  }

  async cancelRequest(managerId: string, requestId: string) {
    const { count } = await this.prisma.manager_link_requests.updateMany({ where: { id: requestId, manager_id: managerId, status: 'PENDING' }, data: { status: 'CANCELLED' } });
    if (!count) throw new AppException('NOT_FOUND', 'Request not found');
    return { ok: true };
  }

  async unlink(managerId: string, clubId: string, actor: Actor) {
    const { count } = await this.prisma.manager_clubs.deleteMany({ where: { manager_id: managerId, club_id: clubId } });
    if (!count) throw new AppException('NOT_FOUND', 'Club not found');
    await this.audit.log({ actor_id: actor.id, club_id: clubId, action: 'manager.club.unlink', target_type: 'club', target_id: clubId, ip: actor.ip, user_agent: actor.ua, request_id: actor.request_id });
    return { ok: true };
  }
}
