import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Redis from 'ioredis';
import type { Actor } from '../../common/decorators/actor.decorator';
import { pageArgs } from '../../common/dto/pagination.dto';
import { AppException } from '../../common/errors';
import { Paginated } from '../../common/interceptors/response.interceptor';
import { publicIdCandidate } from '../../common/utils/codes';
import { uuidv7 } from '../../common/utils/id';
import { isOpenNow } from '../catalog/open-now';
import { PrismaService } from '../../database/prisma.service';
import { REDIS } from '../../infra/redis/redis.module';
import { AuditService } from '../audit/audit.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { accessCutoffKey, assertStrongPassword, generateTempPassword, hashPassword } from '../auth/password';
import { ACCESS_TTL_S } from '../auth/token.service';
import type { RoleCode } from '../rbac/catalog';
import { RbacService } from '../rbac/rbac.service';
import { CreateClubDto, CreateManagerDto, ListQuery, RemovalListQuery, UpdateClubDto } from './accounts.dto';

type Tx = Prisma.TransactionClient;
type NewStaff = { username: string; first_name: string; last_name?: string; phone?: string; password?: string };

const userPublic = { id: true, username: true, public_id: true, first_name: true, last_name: true, phone: true, status: true, last_login_at: true, must_change_password: true, created_at: true } as const;

/**
 * Super admin akkaunt boshqaruvi:
 *  - klub (filial) + operator — operator o'z klubini boshqaradi (user_roles OPERATOR, club_id);
 *  - menejer — klublarni operator User ID si orqali o'zi biriktiradi (PanelsService).
 * Parol berilmasa vaqtinchalik parol yaratiladi va FAQAT shu javobda qaytariladi; birinchi kirishda almashtiriladi.
 */
@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rbac: RbacService,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly subs: SubscriptionsService,
  ) {}

  // ---------- Klublar (filiallar) + operator ----------

  async createClub(dto: CreateClubDto, actor: Actor) {
    let appRow: { club_name: string; full_name: string } | null = null;
    if (dto.application_id) {
      const app = await this.prisma.club_applications.findUnique({ where: { id: dto.application_id }, select: { id: true, club_name: true, full_name: true } });
      if (!app) throw new AppException('NOT_FOUND', 'Application not found');
      appRow = app;
    }
    return this.prisma.$transaction(async (tx) => {
      const clubId = uuidv7();
      await tx.clubs.create({
        data: { id: clubId, name: dto.name, city: dto.city, address: dto.address ?? null, phone: dto.phone ?? null, application_id: dto.application_id ?? null, created_by: actor.id },
      });
      const creds = await this.createStaff(tx, 'OPERATOR', clubId, {
        username: dto.operator_username, first_name: dto.operator_first_name, last_name: dto.operator_last_name, password: dto.operator_password,
      });
      if (dto.application_id) {
        // Arizadagi nom noto'g'ri bo'lgan (masalan ism yozilgan) — super admin tuzatgan nom arizaga ham.
        // Bir arizadan bir nechta filial ochilganda arizaning asl nomi saqlanadi.
        const fixName = !!appRow && (appRow.club_name === appRow.full_name || appRow.club_name.trim().length < 2);
        await tx.club_applications.update({
          where: { id: dto.application_id },
          data: { status: 'APPROVED', handled_by: actor.id, handled_at: new Date(), ...(fixName ? { club_name: dto.name } : {}) },
        });
      }
      await this.audit.log(
        { actor_id: actor.id, club_id: clubId, action: 'admin.club.create', target_type: 'club', target_id: clubId, new_value: { name: dto.name, city: dto.city, operator: creds.username, application_id: dto.application_id ?? null }, ip: actor.ip, user_agent: actor.ua, request_id: actor.request_id },
        tx,
      );
      return { club_id: clubId, operator: creds };
    });
  }

  async listClubs(q: ListQuery) {
    const s = q.q?.trim();
    const where: Prisma.clubsWhereInput = s
      ? { OR: [{ name: { contains: s, mode: 'insensitive' } }, { city: { contains: s, mode: 'insensitive' } }, { address: { contains: s, mode: 'insensitive' } }] }
      : {};
    const [rows, total] = await Promise.all([
      this.prisma.clubs.findMany({ where, orderBy: { created_at: 'desc' }, ...pageArgs(q), include: { _count: { select: { managers: true } } } }),
      this.prisma.clubs.count({ where }),
    ]);
    const operators = await this.operatorsOf(rows.map((r) => r.id));
    return new Paginated(
      rows.map(({ _count, ...c }) => ({ ...c, managers_count: _count.managers, operator: operators.get(c.id) ?? null })),
      { page: q.page, limit: q.limit, total },
    );
  }

  async getClub(id: string) {
    const c = await this.prisma.clubs.findUnique({
      where: { id },
      include: {
        managers: { include: { manager: { select: userPublic } }, orderBy: { linked_at: 'desc' } },
        application: { select: { id: true, club_name: true, full_name: true, phone: true } },
        // Super admin: zonalar va tariflar (nofaollari ham), ish vaqti — faqat ko'rish
        zones: {
          where: { deleted_at: null },
          orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
          select: {
            id: true, name: true, description: true, color: true, devices_count: true, layout: true,
            tariffs: {
              where: { deleted_at: null },
              orderBy: [{ sort_order: 'asc' }, { price: 'asc' }],
              select: { id: true, name: true, type: true, price: true, duration_minutes: true, valid_from: true, valid_to: true, is_active: true },
            },
          },
        },
      },
    });
    if (!c) throw new AppException('NOT_FOUND', 'Club not found');
    const { managers, ...club } = c;
    return { ...club, is_open_now: isOpenNow(club.working_hours), operator: (await this.operatorsOf([id])).get(id) ?? null, managers: managers.map((m) => ({ ...m.manager, linked_at: m.linked_at })) };
  }

  async updateClub(id: string, dto: UpdateClubDto, actor: Actor) {
    const old = await this.prisma.clubs.findUnique({ where: { id } });
    if (!old) throw new AppException('NOT_FOUND', 'Club not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.clubs.update({ where: { id }, data: { ...dto, ...(dto.address !== undefined ? { address: dto.address || null } : {}) } });
      await this.audit.log(
        { actor_id: actor.id, club_id: id, action: 'admin.club.update', target_type: 'club', target_id: id, old_value: { name: old.name, city: old.city, address: old.address, phone: old.phone, status: old.status }, new_value: dto, ip: actor.ip, user_agent: actor.ua, request_id: actor.request_id },
        tx,
      );
    });
    return this.getClub(id);
  }

  // ---------- Menejerlar ----------

  async createManager(dto: CreateManagerDto, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const creds = await this.createStaff(tx, 'MANAGER', null, dto);
      await this.audit.log(
        { actor_id: actor.id, action: 'admin.manager.create', target_type: 'user', target_id: creds.user_id, new_value: { username: creds.username }, ip: actor.ip, user_agent: actor.ua, request_id: actor.request_id },
        tx,
      );
      return creds;
    });
  }

  async listManagers(q: ListQuery) {
    const s = q.q?.trim();
    const where: Prisma.usersWhereInput = {
      deleted_at: null,
      user_roles: { some: { role: { code: 'MANAGER' } } },
      ...(s ? { OR: [{ username: { contains: s, mode: 'insensitive' } }, { first_name: { contains: s, mode: 'insensitive' } }, { last_name: { contains: s, mode: 'insensitive' } }, { public_id: s }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.users.findMany({ where, orderBy: { created_at: 'desc' }, ...pageArgs(q), select: { ...userPublic, managed_clubs: { select: { club: { select: { id: true, name: true, city: true } } } } } }),
      this.prisma.users.count({ where }),
    ]);
    return new Paginated(
      rows.map(({ managed_clubs, ...u }) => ({ ...u, clubs: managed_clubs.map((m) => m.club) })),
      { page: q.page, limit: q.limit, total },
    );
  }

  // ---------- Xodim akkaunti amallari (operator va menejer) ----------

  /** Vaqtinchalik parol: barcha sessiyalar bekor, birinchi kirishda yangi parol. */
  async resetPassword(userId: string, actor: Actor) {
    const user = await this.staffUser(userId);
    const password = generateTempPassword();
    await this.prisma.$transaction(async (tx) => {
      await tx.users.update({ where: { id: user.id }, data: { password_hash: await hashPassword(password), must_change_password: true } });
      await tx.refresh_tokens.updateMany({ where: { user_id: user.id, revoked_at: null }, data: { revoked_at: new Date() } });
      await this.audit.log({ actor_id: actor.id, action: 'admin.user.reset_password', target_type: 'user', target_id: user.id, ip: actor.ip, user_agent: actor.ua, request_id: actor.request_id }, tx);
    });
    await this.cutAccess(user.id);
    return { user_id: user.id, public_id: user.public_id, username: user.username, password, must_change_password: true };
  }

  async setStatus(userId: string, status: string, actor: Actor) {
    const user = await this.staffUser(userId);
    await this.prisma.$transaction(async (tx) => {
      await tx.users.update({ where: { id: user.id }, data: { status } });
      if (status === 'BLOCKED') await tx.refresh_tokens.updateMany({ where: { user_id: user.id, revoked_at: null }, data: { revoked_at: new Date() } });
      await this.audit.log({ actor_id: actor.id, action: 'admin.user.status', target_type: 'user', target_id: user.id, old_value: { status: user.status }, new_value: { status }, ip: actor.ip, user_agent: actor.ua, request_id: actor.request_id }, tx);
    });
    if (status === 'BLOCKED') await this.cutAccess(user.id);
    return { id: user.id, status };
  }

  /** Platforma umumiy ko'rsatkichlari (super admin dashboard). */
  async stats() {
    const [applicationsNew, applicationsOpen, clubs, clubsActive, managers, operators, removalsPending, subscriptionAlerts, clubsNoLocation] = await Promise.all([
      this.prisma.club_applications.count({ where: { status: 'NEW' } }),
      this.prisma.club_applications.count({ where: { status: { in: ['NEW', 'CONTACTED'] } } }),
      this.prisma.clubs.count(),
      this.prisma.clubs.count({ where: { status: 'ACTIVE' } }),
      this.prisma.user_roles.count({ where: { role: { code: 'MANAGER' } } }),
      this.prisma.user_roles.count({ where: { role: { code: 'OPERATOR' } } }),
      this.prisma.manager_unlink_requests.count({ where: { status: 'PENDING' } }),
      this.subs.alertsCount(),
      this.prisma.clubs.count({ where: { latitude: null } }),
    ]);
    return { applications_new: applicationsNew, applications_open: applicationsOpen, clubs, clubs_active: clubsActive, managers, operators, removals_pending: removalsPending, subscription_alerts: subscriptionAlerts, clubs_no_location: clubsNoLocation };
  }

  // ---------- Menejerni klubdan olib tashlash so'rovlari (operatordan) ----------

  async listRemovals(q: RemovalListQuery) {
    const where: Prisma.manager_unlink_requestsWhereInput = q.status ? { status: q.status } : {};
    const [rows, total] = await Promise.all([
      this.prisma.manager_unlink_requests.findMany({
        where, orderBy: { created_at: 'desc' }, ...pageArgs(q),
        include: { club: { select: { id: true, name: true, city: true, address: true, phone: true, application: { select: { phone: true, telegram: true } } } } },
      }),
      this.prisma.manager_unlink_requests.count({ where }),
    ]);
    // Super admin ikkala tomon bilan bog'lanadi — aloqa ma'lumotlari bilan
    const ids = [...new Set(rows.flatMap((r) => [r.manager_id, r.requested_by, ...(r.handled_by ? [r.handled_by] : [])]))];
    const people = new Map(
      (await this.prisma.users.findMany({ where: { id: { in: ids } }, select: { ...userPublic, email: true } })).map((u) => [u.id, u]),
    );
    // Menejer o'zi so'ragan bo'lsa — klub operatori kontakti alohida olinadi
    const byManager = rows.filter((r) => r.requested_by === r.manager_id).map((r) => r.club_id);
    const clubOps = new Map(
      (byManager.length
        ? await this.prisma.user_roles.findMany({ where: { club_id: { in: byManager }, role: { code: 'OPERATOR' } }, select: { club_id: true, user: { select: { ...userPublic, email: true } } } })
        : []
      ).map((o) => [o.club_id, o.user]),
    );
    return new Paginated(
      rows.map(({ club: { application, ...club }, ...r }) => ({
        ...r,
        club: { ...club, application_phone: application?.phone ?? null, application_telegram: application?.telegram ?? null },
        by_manager: r.requested_by === r.manager_id,
        manager: people.get(r.manager_id) ?? null,
        operator: r.requested_by === r.manager_id ? (clubOps.get(r.club_id) ?? null) : (people.get(r.requested_by) ?? null), handler: r.handled_by ? (people.get(r.handled_by) ?? null) : null })),
      { page: q.page, limit: q.limit, total },
    );
  }

  /** Tasdiq: menejer klubdan olib tashlanadi. Rad: bog'lanish qoladi. */
  async decideRemoval(id: string, approve: boolean, note: string | undefined, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.manager_unlink_requests.findUnique({ where: { id } });
      if (!r) throw new AppException('NOT_FOUND', 'Request not found');
      const { count } = await tx.manager_unlink_requests.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: approve ? 'APPROVED' : 'REJECTED', admin_note: note ?? null, handled_by: actor.id, handled_at: new Date() },
      });
      if (!count) throw new AppException('CONFLICT', 'Request already handled', { reason: 'ALREADY_HANDLED' });
      if (approve) await tx.manager_clubs.deleteMany({ where: { manager_id: r.manager_id, club_id: r.club_id } });
      await this.audit.log(
        { actor_id: actor.id, club_id: r.club_id, action: approve ? 'admin.manager_removal.approve' : 'admin.manager_removal.reject', target_type: 'manager_unlink_request', target_id: id, new_value: { manager_id: r.manager_id, admin_note: note ?? null }, ip: actor.ip, user_agent: actor.ua, request_id: actor.request_id },
        tx,
      );
      return { id, status: approve ? 'APPROVED' : 'REJECTED' };
    });
  }

  // ---------- ichki ----------

  private async createStaff(tx: Tx, role: Extract<RoleCode, 'OPERATOR' | 'MANAGER'>, clubId: string | null, s: NewStaff) {
    if (await tx.users.findUnique({ where: { username: s.username }, select: { id: true } })) {
      throw new AppException('CONFLICT', 'Username already taken', { field: 'username', reason: 'USERNAME_TAKEN' });
    }
    if (s.phone && (await tx.users.findUnique({ where: { phone: s.phone }, select: { id: true } }))) {
      throw new AppException('CONFLICT', 'Phone already used', { field: 'phone', reason: 'PHONE_TAKEN' });
    }
    if (s.password) assertStrongPassword(s.password);
    const temp = s.password ? null : generateTempPassword();
    const roleRow = await tx.roles.findUniqueOrThrow({ where: { code: role } });
    const id = uuidv7();
    const publicId = await this.freePublicId(tx);
    await tx.users.create({
      data: {
        id, type: 'STAFF', username: s.username, public_id: publicId, first_name: s.first_name, last_name: s.last_name ?? null,
        phone: s.phone ?? null, password_hash: await hashPassword(s.password ?? temp!), must_change_password: !!temp,
      },
    });
    await tx.user_roles.create({ data: { id: uuidv7(), user_id: id, role_id: roleRow.id, club_id: clubId } });
    return { user_id: id, public_id: publicId, username: s.username, ...(temp ? { password: temp } : {}), must_change_password: !!temp };
  }

  private async freePublicId(tx: Tx) {
    for (let i = 0; i < 20; i++) {
      const c = publicIdCandidate();
      if (!(await tx.users.findUnique({ where: { public_id: c }, select: { id: true } }))) return c;
    }
    throw new AppException('INTERNAL_ERROR', 'Could not allocate user id');
  }

  /** Faqat operator/menejer akkauntlari (super admin o'zini yoki boshqa adminni bu yerdan o'zgartirmaydi). */
  private async staffUser(id: string) {
    const u = await this.prisma.users.findFirst({
      where: { id, deleted_at: null, user_roles: { some: { role: { code: { in: ['OPERATOR', 'MANAGER'] } } } } },
      select: { id: true, username: true, public_id: true, status: true },
    });
    if (!u) throw new AppException('NOT_FOUND', 'User not found');
    return u;
  }

  private async cutAccess(userId: string) {
    await this.redis.set(accessCutoffKey(userId), String(Math.floor(Date.now() / 1000)), 'EX', ACCESS_TTL_S + 60);
    await this.rbac.invalidate(userId);
  }

  private async operatorsOf(clubIds: string[]) {
    if (!clubIds.length) return new Map<string, unknown>();
    const rows = await this.prisma.user_roles.findMany({
      where: { club_id: { in: clubIds }, role: { code: 'OPERATOR' } },
      select: { club_id: true, user: { select: userPublic } },
    });
    return new Map(rows.map((r) => [r.club_id!, r.user]));
  }
}
