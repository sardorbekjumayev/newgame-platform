import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import sharp from 'sharp';
import { AppException } from '../../common/errors';

export type ClubImageKind = 'logo' | 'photo';
export const CLUB_IMAGE_KINDS = { logo: 'logo', photo: 'photo' } as const;

/** Yuklanadigan asl fayl chegarasi (telefon rasmlari 3–8 MB); saqlangani ancha kichik bo'ladi. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Saqlangan klub fayli nomi — media marshruti faqat shunday nomlarni beradi. */
export const CLUB_FILE_RE = /^(logo|photo)-[a-f0-9]{16}\.webp$/;

const ACCEPTED = new Set(['jpeg', 'png', 'webp', 'avif', 'heif', 'gif']);
/** Logotip kesilmaydi (512×512 ichiga sig'adi, shaffoflik saqlanadi); rasm — eng uzun tomoni 1920. */
const SPEC: Record<ClubImageKind, { box: number; quality: number }> = {
  logo: { box: 512, quality: 90 },
  photo: { box: 1920, quality: 82 },
};

/** Ommaviy URL: web va admin `/api/v1/*` ni API'ga proksi qiladi (bir xil origin). */
export const mediaUrl = (path: string | null | undefined) => (path ? `/api/v1/media/${path}` : null);

/**
 * Yuklangan fayllar STORAGE_DIR ichida. Har bir rasm qayta kodlanadi (webp, EXIF/GPS olib tashlanadi),
 * nomi tasodifiy — almashtirilganda URL o'zgaradi, shuning uchun brauzer uni muddatsiz keshlay oladi.
 */
@Injectable()
export class MediaService {
  readonly root: string;

  constructor(config: ConfigService) {
    this.root = resolve(config.get<string>('STORAGE_DIR') ?? './storage');
  }

  /** Rasmni tekshirib, siqib saqlaydi; STORAGE_DIR ga nisbiy yo'lni qaytaradi. */
  async saveClubImage(clubId: string, kind: ClubImageKind, input: Buffer): Promise<string> {
    let out: Buffer;
    try {
      const img = sharp(input, { limitInputPixels: 50_000_000, failOn: 'error' });
      const meta = await img.metadata();
      if (!meta.format || !ACCEPTED.has(meta.format)) throw new Error('unsupported format');
      const { box, quality } = SPEC[kind];
      out = await img.rotate().resize(box, box, { fit: 'inside', withoutEnlargement: true }).webp({ quality }).toBuffer();
    } catch {
      throw new AppException('VALIDATION_ERROR', 'Unsupported or broken image', { field: 'file', reason: 'INVALID_IMAGE' });
    }
    const rel = `clubs/${clubId}/${kind}-${randomBytes(8).toString('hex')}.webp`;
    const abs = this.resolve(rel)!;
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(`${abs}.tmp`, out);
    await rename(`${abs}.tmp`, abs);
    return rel;
  }

  async remove(rel: string | null | undefined) {
    const abs = rel ? this.resolve(rel) : null;
    if (abs) await rm(abs, { force: true }).catch(() => undefined);
  }

  /** Nisbiy yo'l → absolyut; STORAGE_DIR dan tashqariga chiqsa null. */
  resolve(rel: string) {
    const abs = resolve(this.root, rel);
    return abs.startsWith(this.root + sep) ? abs : null;
  }
}
