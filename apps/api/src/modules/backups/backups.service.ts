import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ZipFile } from 'yazl';
import type { Actor } from '../../common/decorators/actor.decorator';
import { AppException } from '../../common/errors';
import { PrismaService } from '../../database/prisma.service';
import { REDIS } from '../../infra/redis/redis.module';
import { AuditService } from '../audit/audit.service';
import { MediaService } from '../media/media.service';
import { CreateBackupDto } from './backups.dto';
import { parsePeriod, type Period } from './period';

/** Tayyor zip va ish papkalari — konteyner ichida, STORAGE_DIR dan tashqarida (ommaga ochiq emas). */
const DIR = join(tmpdir(), 'zonup-backups');
/** Tayyor zip shuncha vaqt yuklab olinishi mumkin, keyin o'chiriladi. */
const DOWNLOAD_TTL_MS = 10 * 60_000;
/** Bir vaqtda bitta nusxa: ikkinchisi diskni va bazani ortiqcha yuklamasin. */
const LOCK_KEY = 'backup:lock';
const LOCK_TTL_S = 30 * 60;
const TOOL_TIMEOUT_MS = 10 * 60_000;
const ID_RE = /^[a-f0-9]{48}$/;
const AUDIT_ACTION = 'admin.backup.create';

/** Davr bo'yicha nusxada qator shu ustunlardan biri davrga tushsa olinadi (yaratilgan yoki o'zgargan). */
const TIME_COLUMNS = ['created_at', 'updated_at', 'at', 'linked_at'];
/** Bron boshlanishi davrga tushsa ham olinadi (oldinroq yaratilgan bo'lsa ham). */
const EXTRA_TIME_COLUMNS: Record<string, string[]> = { bookings: ['start_at'] };
/** O'z vaqt ustuni yo'q bola jadval — ota qatori davrga tushsa olinadi. Ro'yxatda yo'q jadvallar to'liq olinadi. */
const CHILD_OF: Record<string, { fk: string; parent: string }> = { booking_items: { fk: 'booking_id', parent: 'bookings' } };

type Table = { name: string; columns: string[]; time_columns: string[] };
type TableResult = { name: string; rows: number; filter: string };
type ZipEntry = { path: string; name: string; compress: boolean };
type StoredFile = { abs: string; rel: string; size: number };

export type BackupSummary = {
  id: string;
  file_name: string;
  size: number;
  kind: 'full' | 'period';
  from: string | null;
  to: string | null;
  tables: number;
  rows: number;
  files: number;
  files_bytes: number;
  /** Yuklab olish havolasi shuncha soniya amal qiladi. */
  expires_in: number;
};

const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;
const fileSafe = (name: string) => name.replace(/[^A-Za-z0-9_]/g, '_');
const failed = () => new AppException('INTERNAL_ERROR', 'Backup failed', { reason: 'BACKUP_FAILED' });

/**
 * Super admin zaxira nusxasi: baza + yuklangan fayllar bitta zip'da.
 *  - butun davr: `pg_dump` (oddiy SQL, bo'sh bazaga `psql` bilan to'liq tiklanadi) + barcha fayllar;
 *  - davr: shu davrda yaratilgan/o'zgargan qatorlar jadval bo'yicha CSV + tuzilma (`schema.sql`) + shu davrda
 *    yuklangan fayllar. Bu qisman nusxa — to'liq tiklash uchun emas.
 * Zip serverda saqlanmaydi: vaqtinchalik papkada yasaladi, bir martalik havola bilan beriladi va 10 daqiqada o'chadi.
 */
@Injectable()
export class BackupsService implements OnModuleInit {
  private readonly logger = new Logger('Backups');
  private readonly tz: string;
  private readonly db: URL;
  private readonly schema: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
    @Inject(REDIS) private readonly redis: Redis,
    config: ConfigService,
  ) {
    this.tz = config.get<string>('APP_TIMEZONE_DEFAULT') ?? 'Asia/Tashkent';
    this.db = new URL(config.getOrThrow<string>('DATABASE_URL'));
    this.schema = this.db.searchParams.get('schema') ?? 'public';
  }

  async onModuleInit() {
    // Qayta ishga tushishdan oldin qolib ketgan fayllar
    await this.sweep().catch(() => undefined);
  }

  /** Sahifa uchun: hozirgi hajmlar va oxirgi nusxalar (audit jurnalidan — fayllarning o'zi saqlanmaydi). */
  async info() {
    const [db, files, logs] = await Promise.all([
      this.prisma.$queryRaw<{ size: bigint }[]>`SELECT pg_database_size(current_database()) AS size`,
      this.storageFiles(null),
      this.prisma.audit_logs.findMany({
        where: { target_type: 'backup', action: AUDIT_ACTION },
        orderBy: { at: 'desc' },
        take: 10,
        select: { id: true, at: true, actor_id: true, new_value: true },
      }),
    ]);
    const actorIds = [...new Set(logs.map((l) => l.actor_id).filter((v): v is string => !!v))];
    const actors = actorIds.length
      ? await this.prisma.users.findMany({ where: { id: { in: actorIds } }, select: { id: true, username: true, first_name: true, last_name: true } })
      : [];
    const names = new Map(actors.map((u) => [u.id, [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username]));
    return {
      database_bytes: Number(db[0]?.size ?? 0),
      storage_files: files.length,
      storage_bytes: files.reduce((sum, f) => sum + f.size, 0),
      timezone: this.tz,
      history: logs.map((l) => {
        const v = (l.new_value ?? {}) as Partial<BackupSummary>;
        return {
          id: l.id, at: l.at, actor: (l.actor_id && names.get(l.actor_id)) || null,
          kind: v.kind ?? 'full', from: v.from ?? null, to: v.to ?? null, size: v.size ?? 0, rows: v.rows ?? 0, files: v.files ?? 0,
        };
      }),
    };
  }

  async create(dto: CreateBackupDto, actor: Actor): Promise<BackupSummary> {
    const period = parsePeriod(dto.from, dto.to, this.tz);
    const id = randomBytes(24).toString('hex');
    if ((await this.redis.set(LOCK_KEY, id, 'EX', LOCK_TTL_S, 'NX')) !== 'OK') {
      throw new AppException('CONFLICT', 'Another backup is in progress', { reason: 'BACKUP_IN_PROGRESS' });
    }
    const work = join(DIR, `w-${id}`);
    try {
      await this.sweep();
      await mkdir(join(work, 'db', 'data'), { recursive: true, mode: 0o700 });
      const createdAt = new Date();
      const [tables, version] = await Promise.all([this.tables(), this.prisma.$queryRaw<{ server_version: string }[]>`SHOW server_version`]);

      const entries: ZipEntry[] = [];
      let results: TableResult[];
      if (period) {
        await this.exec('pg_dump', ['--schema-only', '--no-owner', '--no-privileges', '--encoding=UTF8', '--file=db/schema.sql'], work);
        results = await this.exportTables(tables, period, work);
        entries.push({ path: join(work, 'db', 'schema.sql'), name: 'db/schema.sql', compress: true });
        for (const t of tables) entries.push({ path: join(work, 'db', 'data', `${fileSafe(t.name)}.csv`), name: `db/data/${fileSafe(t.name)}.csv`, compress: true });
      } else {
        results = await this.countTables(tables, work);
        await this.exec('pg_dump', ['--format=plain', '--no-owner', '--no-privileges', '--encoding=UTF8', '--file=db/zonup.sql'], work);
        entries.push({ path: join(work, 'db', 'zonup.sql'), name: 'db/zonup.sql', compress: true });
      }

      const files = await this.storageFiles(period);
      // Rasmlar allaqachon siqilgan (webp) — qayta siqish faqat vaqt oladi
      for (const f of files) entries.push({ path: f.abs, name: `storage/${f.rel}`, compress: false });

      const filesBytes = files.reduce((sum, f) => sum + f.size, 0);
      const rows = results.reduce((sum, t) => sum + t.rows, 0);
      const manifest = {
        app: 'zonup', format: 1, kind: period ? 'period' : 'full', created_at: createdAt.toISOString(), timezone: this.tz,
        period: period ? { from: period.from, to: period.to, start: period.start.toISOString(), end: period.end.toISOString() } : null,
        database: { server_version: version[0]?.server_version ?? null, dump: period ? 'db/data/*.csv' : 'db/zonup.sql', rows, tables: results },
        storage: { files: files.length, bytes: filesBytes },
      };
      await writeFile(join(work, 'manifest.json'), JSON.stringify(manifest, null, 2));
      await writeFile(join(work, 'README.txt'), readme(period, this.localStamp(createdAt, true), this.tz));
      entries.unshift({ path: join(work, 'README.txt'), name: 'README.txt', compress: true }, { path: join(work, 'manifest.json'), name: 'manifest.json', compress: true });

      await this.zip(join(work, 'backup.zip'), entries);
      const stamp = this.localStamp(createdAt, false);
      const fileName = period ? `zonup-backup-${period.from.replace(/-/g, '')}-${period.to.replace(/-/g, '')}_${stamp}.zip` : `zonup-backup-full_${stamp}.zip`;
      const { size } = await stat(join(work, 'backup.zip'));
      // Meta avval, zip oxirida va atomik: havola faqat to'liq yozilgan faylni ko'radi
      await writeFile(join(DIR, `${id}.json`), JSON.stringify({ file_name: fileName }), { mode: 0o600 });
      await rename(join(work, 'backup.zip'), join(DIR, `${id}.zip`));

      const result = {
        file_name: fileName, size, kind: period ? ('period' as const) : ('full' as const), from: period?.from ?? null, to: period?.to ?? null,
        tables: results.length, rows, files: files.length, files_bytes: filesBytes,
      };
      // Jurnalga havola kaliti (id) yozilmaydi
      await this.audit.log({ actor_id: actor.id, action: AUDIT_ACTION, target_type: 'backup', new_value: result, ip: actor.ip, user_agent: actor.ua, request_id: actor.request_id });
      setTimeout(() => void this.sweep().catch(() => undefined), DOWNLOAD_TTL_MS + 5_000).unref();
      return { id, ...result, expires_in: DOWNLOAD_TTL_MS / 1000 };
    } catch (e) {
      await Promise.all([rm(join(DIR, `${id}.zip`), { force: true }), rm(join(DIR, `${id}.json`), { force: true })]).catch(() => undefined);
      if (e instanceof AppException) throw e;
      this.logger.error(e instanceof Error ? e.stack : String(e), actor.request_id ?? undefined);
      throw failed();
    } finally {
      await rm(work, { recursive: true, force: true }).catch(() => undefined);
      // Faqat o'z qulfimiz (muddati o'tib, boshqa nusxa boshlangan bo'lishi mumkin)
      if ((await this.redis.get(LOCK_KEY).catch(() => null)) === id) await this.redis.del(LOCK_KEY).catch(() => undefined);
    }
  }

  /** Yuklab olish havolasi uchun: `id` — taxmin qilib bo'lmaydigan kalit, fayl 10 daqiqadan keyin yo'q. */
  async file(id: string) {
    if (ID_RE.test(id)) {
      const path = join(DIR, `${id}.zip`);
      const [st, meta] = await Promise.all([
        stat(path).catch(() => null),
        readFile(join(DIR, `${id}.json`), 'utf8').then((s) => JSON.parse(s) as { file_name: string }, () => null),
      ]);
      if (st?.isFile() && meta && Date.now() - st.mtimeMs <= DOWNLOAD_TTL_MS) return { path, size: st.size, name: meta.file_name };
    }
    throw new AppException('NOT_FOUND', 'Backup not found or expired', { reason: 'BACKUP_EXPIRED' });
  }

  // ---------- baza ----------

  /** Ilova jadvallari (kengaytmalarniki, masalan PostGIS `spatial_ref_sys`, kirmaydi); hosil qilinadigan ustunlarsiz. */
  private tables() {
    return this.prisma.$queryRaw<Table[]>`
      SELECT c.relname::text AS name,
             ARRAY(SELECT a.attname::text FROM pg_attribute a
                    WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
                    ORDER BY a.attnum) AS columns,
             ARRAY(SELECT a.attname::text FROM pg_attribute a
                    WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
                      AND a.atttypid IN ('timestamptz'::regtype, 'timestamp'::regtype)
                    ORDER BY a.attnum) AS time_columns
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = ${this.schema} AND c.relkind IN ('r', 'p') AND NOT c.relispartition
         AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e')
       ORDER BY c.relname`;
  }

  private rel = (table: string) => `${ident(this.schema)}.${ident(table)}`;

  /** Davr sharti; null — jadval to'liq olinadi. `label` — manifest uchun izoh. */
  private filter(table: Table, period: Period, all: Map<string, Table>): { sql: string; label: string } | null {
    const own = [...TIME_COLUMNS, ...(EXTRA_TIME_COLUMNS[table.name] ?? [])].filter((c) => table.time_columns.includes(c));
    if (own.length) {
      const [from, to] = [`'${period.start.toISOString()}'::timestamptz`, `'${period.end.toISOString()}'::timestamptz`];
      return { sql: own.map((c) => `(${ident(c)} >= ${from} AND ${ident(c)} < ${to})`).join(' OR '), label: own.join(', ') };
    }
    const link = CHILD_OF[table.name];
    const parent = link && all.get(link.parent);
    const parentFilter = parent && table.columns.includes(link.fk) && parent.columns.includes('id') ? this.filter(parent, period, all) : null;
    if (!parent || !parentFilter) return null;
    return { sql: `${ident(link.fk)} IN (SELECT "id" FROM ${this.rel(parent.name)} WHERE ${parentFilter.sql})`, label: `${link.fk} -> ${parent.name} (${parentFilter.label})` };
  }

  /** Davr: har bir jadval CSV'ga (bitta o'qish tranzaksiyasida — jadvallar bir-biriga mos). */
  private async exportTables(tables: Table[], period: Period, work: string): Promise<TableResult[]> {
    const all = new Map(tables.map((t) => [t.name, t]));
    const filters = tables.map((t) => this.filter(t, period, all));
    const lines = ['BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY;'];
    tables.forEach((t, i) => {
      const where = filters[i] ? ` WHERE ${filters[i]!.sql}` : '';
      const cols = t.columns.map(ident).join(', ');
      // \copy bitta qatorda bo'lishi shart; fayl yo'li ish papkasiga nisbiy (cwd)
      lines.push(`\\copy (SELECT ${cols} FROM ${this.rel(t.name)}${where}) TO 'db/data/${fileSafe(t.name)}.csv' WITH (FORMAT csv, HEADER true)`);
      lines.push(`SELECT 'ROWS', ${i}, count(*) FROM ${this.rel(t.name)}${where};`);
    });
    lines.push('COMMIT;');
    const counts = parseCounts(await this.psql(lines.join('\n'), work), tables.length);
    return tables.map((t, i) => ({ name: t.name, rows: counts[i], filter: filters[i]?.label ?? 'all' }));
  }

  private async countTables(tables: Table[], work: string): Promise<TableResult[]> {
    const script = tables.map((t, i) => `SELECT 'ROWS', ${i}, count(*) FROM ${this.rel(t.name)};`).join('\n');
    const counts = parseCounts(await this.psql(script, work), tables.length);
    return tables.map((t, i) => ({ name: t.name, rows: counts[i], filter: 'all' }));
  }

  private psql(script: string, cwd: string) {
    return this.exec('psql', ['-X', '-q', '-A', '-t', '-F', '|', '-v', 'ON_ERROR_STOP=1'], cwd, script);
  }

  /** Ulanish ma'lumotlari faqat muhit o'zgaruvchilarida (parol buyruq qatorida ko'rinmaydi); ilova sirlari uzatilmaydi. */
  private pgEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      PGHOST: this.db.hostname,
      PGPORT: this.db.port || '5432',
      PGUSER: decodeURIComponent(this.db.username),
      PGPASSWORD: decodeURIComponent(this.db.password),
      PGDATABASE: decodeURIComponent(this.db.pathname.slice(1)),
      PGCONNECT_TIMEOUT: '10',
      PGCLIENTENCODING: 'UTF8',
      PGAPPNAME: 'zonup-backup',
    };
    const ssl = this.db.searchParams.get('sslmode');
    if (ssl) env.PGSSLMODE = ssl;
    return env;
  }

  private exec(cmd: 'pg_dump' | 'psql', args: string[], cwd: string, stdin = ''): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, { cwd, env: this.pgEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
      let out = '';
      let err = '';
      let done = false;
      const finish = (fn: () => void) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        fn();
      };
      const timer = setTimeout(() => child.kill('SIGKILL'), TOOL_TIMEOUT_MS);
      child.stdout.on('data', (d: Buffer) => (out.length < 1_000_000 ? (out += d.toString()) : undefined));
      child.stderr.on('data', (d: Buffer) => (err.length < 4_000 ? (err += d.toString()) : undefined));
      child.stdin.on('error', () => undefined); // jarayon erta tugasa (EPIPE) — natijani `close` beradi
      child.on('error', (e: NodeJS.ErrnoException) =>
        finish(() => {
          if (e.code === 'ENOENT') {
            this.logger.error(`${cmd} topilmadi — serverga PostgreSQL klienti (postgresql-client) o'rnatilmagan`);
            reject(new AppException('INTERNAL_ERROR', `${cmd} is not installed`, { reason: 'PG_TOOLS_MISSING' }));
          } else reject(e);
        }),
      );
      child.on('close', (code, signal) =>
        finish(() => {
          if (code === 0) return resolve(out);
          this.logger.error(`${cmd} ${signal ? `to'xtatildi (${signal})` : `xato bilan tugadi (${code})`}: ${err.trim().slice(0, 2_000)}`);
          reject(failed());
        }),
      );
      child.stdin.end(stdin);
    });
  }

  // ---------- fayllar ----------

  /** STORAGE_DIR dagi fayllar; davr berilsa — shu davrda yuklanganlari (nom tasodifiy va o'zgarmas, mtime = yuklangan vaqt). */
  private async storageFiles(period: Period | null): Promise<StoredFile[]> {
    const root = this.media.root;
    const out: StoredFile[] = [];
    const walk = async (dir: string): Promise<void> => {
      const entries = await readdir(dir, { withFileTypes: true }).catch((e: NodeJS.ErrnoException) => {
        if (e.code === 'ENOENT') return [];
        throw e;
      });
      for (const e of entries) {
        const abs = join(dir, e.name);
        if (e.isDirectory()) await walk(abs);
        // Faqat oddiy fayllar (symlink emas); `.tmp` — yozilayotgan yuklama
        else if (e.isFile() && !e.name.endsWith('.tmp')) {
          const st = await stat(abs).catch(() => null);
          if (!st || (period && (st.mtime < period.start || st.mtime >= period.end))) continue;
          out.push({ abs, rel: relative(root, abs).split(sep).join('/'), size: st.size });
        }
      }
    };
    await walk(root);
    return out.sort((a, b) => a.rel.localeCompare(b.rel));
  }

  private zip(target: string, entries: ZipEntry[]) {
    const zip = new ZipFile();
    // Fayl o'qish xatosi (masalan nusxa paytida rasm almashtirilib, eskisi o'chgan) zip obyektida chiqadi —
    // oqimga uzatiladi, shunda pipeline to'xtaydi va yarim yozilgan fayl yopiladi
    zip.once('error', (e: Error) => (zip.outputStream as Readable).destroy(e));
    for (const e of entries) zip.addFile(e.path, e.name, { compress: e.compress });
    zip.end();
    return pipeline(zip.outputStream, createWriteStream(target, { mode: 0o600 }));
  }

  /** Muddati o'tgan zip'lar va qolib ketgan ish papkalari. */
  private async sweep() {
    await mkdir(DIR, { recursive: true, mode: 0o700 });
    const now = Date.now();
    for (const name of await readdir(DIR)) {
      const path = join(DIR, name);
      const st = await stat(path).catch(() => null);
      // Ish papkasiga qulf muddati o'tgachgina tegiladi — ishlayotgan nusxa buzilmasin
      const ttl = name.startsWith('w-') ? LOCK_TTL_S * 1000 : DOWNLOAD_TTL_MS;
      if (st && now - st.mtimeMs > ttl) await rm(path, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /** Mahalliy vaqt: fayl nomi uchun `20261125-1712`, matn uchun `2026-11-25 17:12`. */
  private localStamp(at: Date, pretty: boolean) {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: this.tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(at);
    const get = (type: string) => p.find((x) => x.type === type)!.value;
    return pretty ? `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}` : `${get('year')}${get('month')}${get('day')}-${get('hour')}${get('minute')}`;
  }
}

/** psql chiqishi: `ROWS|<jadval tartib raqami>|<son>`. */
function parseCounts(out: string, expected: number): number[] {
  const counts = new Array<number>(expected).fill(-1);
  for (const line of out.split('\n')) {
    const [tag, index, count] = line.trim().split('|');
    if (tag === 'ROWS') counts[Number(index)] = Number(count);
  }
  if (counts.some((c) => !Number.isSafeInteger(c) || c < 0)) throw failed();
  return counts;
}

function readme(period: Period | null, createdAt: string, tz: string) {
  const head = period
    ? [`ZONUP — ZAXIRA NUSXA (davr: ${period.from} — ${period.to})`]
    : ['ZONUP — ZAXIRA NUSXA (butun davr, to\'liq)'];
  head.push(`Yaratilgan: ${createdAt} (${tz})`, '');
  const body = period
    ? [
        'TARKIBI',
        '  db/data/<jadval>.csv  shu davrda yaratilgan yoki o\'zgargan qatorlar (sarlavhali CSV, Excel\'da ham ochiladi).',
        '                        Bronlar — boshlanishi shu davrga tushganlari ham. Vaqt ustuni yo\'q kichik jadvallar to\'liq.',
        '  db/schema.sql         baza tuzilmasi (ma\'lumotsiz)',
        '  storage/              shu davrda yuklangan fayllar (klub logotiplari va rasmlari)',
        '  manifest.json         har bir jadvaldan nechta qator va qaysi shart bilan olingani',
        '',
        'MUHIM',
        '  Bu qisman nusxa: undan butun tizimni tiklab bo\'lmaydi. To\'liq tiklash uchun «Butun davr» nusxasini oling.',
        '',
        'CSV\'ni jadvalga yuklash (psql ichida, ustunlar ro\'yxati — CSV\'ning birinchi qatori):',
        '  \\copy <jadval> (<ustunlar>) FROM \'db/data/<jadval>.csv\' WITH (FORMAT csv, HEADER true)',
      ]
    : [
        'TARKIBI',
        '  db/zonup.sql    PostgreSQL bazasining to\'liq nusxasi (pg_dump, oddiy SQL)',
        '  storage/        barcha yuklangan fayllar (klub logotiplari va rasmlari)',
        '  manifest.json   jadvallar, qatorlar va fayllar soni',
        '',
        'TIKLASH',
        '  1. PostGIS o\'rnatilgan PostgreSQL 16 da (masalan postgis/postgis:16-3.4) BO\'SH baza yarating:',
        '       createdb -U <foydalanuvchi> zonup_restore',
        '  2. Nusxani yuklang. psql 16.10 yoki undan yangi bo\'lishi kerak — eskisi fayl boshidagi \\restrict buyrug\'ini tushunmaydi:',
        '       psql -U <foydalanuvchi> -d zonup_restore -v ON_ERROR_STOP=1 -f db/zonup.sql',
        '  3. storage/ ichidagilarni API\'ning STORAGE_DIR papkasiga ko\'chiring.',
        '  4. API\'ni shu bazaga ulang (DATABASE_URL) va qayta ishga tushiring.',
        '  Docker (zonup-prod) uchun aniq buyruqlar: deploy/README.md → «Zaxira nusxa».',
      ];
  const tail = ['', 'DIQQAT', '  Faylda mijozlarning telefon raqamlari va parol xeshlari bor. Uni xavfsiz joyda saqlang, begonalarga bermang.', ''];
  return [...head, ...body, ...tail].join('\r\n');
}
