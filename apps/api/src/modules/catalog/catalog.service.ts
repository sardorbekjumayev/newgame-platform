import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../../common/errors';
import { PrismaService } from '../../database/prisma.service';
import { mediaUrl } from '../media/media.service';
import { isOpenNow } from './open-now';

const MAP_LIMIT = 500;

/** Faqat faol va xaritada belgilangan klublar ommaga ko'rinadi. */
const visible: Prisma.clubsWhereInput = { status: 'ACTIVE', latitude: { not: null }, longitude: { not: null } };

const cardSelect = {
  id: true, name: true, city: true, address: true, phone: true, latitude: true, longitude: true, working_hours: true, logo_path: true, photo_path: true,
  zones: { where: { deleted_at: null }, orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }], select: { name: true, color: true } },
  tariffs: { where: { deleted_at: null, is_active: true, zone: { deleted_at: null } }, select: { type: true, price: true } },
} satisfies Prisma.clubsSelect;

type CardRow = Prisma.clubsGetPayload<{ select: typeof cardSelect }>;

/** Karta: soatbay tariflarning eng arzoni ("... dan / soat"); soatbay bo'lmasa — eng arzon paket. */
function toCard({ tariffs, working_hours, logo_path, photo_path, ...c }: CardRow) {
  const hourly = tariffs.filter((t) => t.type === 'HOURLY');
  const pool = hourly.length ? hourly : tariffs;
  const min = pool.length ? pool.reduce((a, b) => (b.price < a.price ? b : a)) : null;
  return {
    ...c,
    logo_url: mediaUrl(logo_path),
    photo_url: mediaUrl(photo_path),
    zones: c.zones,
    price_from: min ? min.price : null,
    price_unit: min ? (min.type === 'HOURLY' ? 'HOUR' : 'PACKAGE') : null,
    is_open_now: isOpenNow(working_hours),
  };
}

/** Mijozlar uchun ommaviy katalog: xarita, landing ro'yxati, klub sahifasi. */
@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async map(bbox: [number, number, number, number] | null) {
    const where: Prisma.clubsWhereInput = bbox
      ? { ...visible, latitude: { gte: bbox[1], lte: bbox[3] }, longitude: { gte: bbox[0], lte: bbox[2] } }
      : visible;
    const rows = await this.prisma.clubs.findMany({ where, take: MAP_LIMIT, orderBy: { created_at: 'asc' }, select: cardSelect });
    return rows.map(toCard);
  }

  async latest(limit: number) {
    const rows = await this.prisma.clubs.findMany({ where: visible, take: limit, orderBy: { created_at: 'desc' }, select: cardSelect });
    return rows.map(toCard);
  }

  async stats() {
    const rows = await this.prisma.clubs.findMany({ where: visible, select: { working_hours: true, city: true } });
    return {
      clubs: rows.length,
      open_now: rows.filter((r) => isOpenNow(r.working_hours) === true).length,
      cities: new Set(rows.map((r) => r.city.trim().toLowerCase())).size,
    };
  }

  async club(id: string) {
    const c = await this.prisma.clubs.findFirst({
      where: { id, ...visible },
      select: {
        ...cardSelect,
        zones: {
          where: { deleted_at: null },
          orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
          select: {
            id: true, name: true, description: true, color: true, devices_count: true, layout: true,
            tariffs: {
              where: { deleted_at: null, is_active: true },
              orderBy: [{ sort_order: 'asc' }, { price: 'asc' }],
              select: { id: true, name: true, type: true, price: true, duration_minutes: true, valid_from: true, valid_to: true },
            },
          },
        },
      },
    });
    if (!c) throw new AppException('NOT_FOUND', 'Club not found');
    const card = toCard({ ...c, zones: c.zones.map((z) => ({ name: z.name, color: z.color })) } as CardRow);
    return { ...card, zones: c.zones, working_hours: c.working_hours };
  }
}
