# Zonup production — Docker (hozir zonup.uz shu usulda ishlaydi)

Bitta image `zonup-ng:latest` (api + web + admin), o'z Postgres va Redis'i bilan. Compose loyihasi: `zonup-prod`.
Qo'lda (Docker'siz) o'rnatish — `../DEPLOY.md` / `../DOCKERLESS.md`.

| Servis | Konteyner | Manzil (server ichida) | Domen |
|---|---|---|---|
| API (NestJS) | `zonup-prod-api-1` | `127.0.0.1:4800` | har bir domenda `/api/v1/*`, `api.zonup.uz` |
| Mijoz sayti | `zonup-prod-web-1` | `127.0.0.1:4810` | `zonup.uz` (`www` → 301) |
| Panel (super admin / operator / menejer) | `zonup-prod-admin-1` | `127.0.0.1:4820` | `admin.zonup.uz` (`operator.`, `club.` → 301) |
| PostgreSQL 16 + PostGIS | `zonup-prod-postgres-1` | `127.0.0.1:55445` | — |
| Redis 7 (parolli) | `zonup-prod-redis-1` | `127.0.0.1:56391` | — |

- api/web/admin — `network_mode: host`, faqat `127.0.0.1` da tinglaydi; API `trust proxy: loopback` Nginx yuborgan haqiqiy IP'ni oladi.
- Dev serverlar (`pnpm dev:*`, 4900/4910/4920, baza :55444) bilan to'qnashmaydi.
- Sozlamalar: `deploy/.env` (namuna `.env.example`, git'da yo'q, `chmod 600`). `SITE_URL`, `PANEL_URL`, `YANDEX_MAPS_KEY`, `GA_ID` image build paytida yoziladi.
- Klub rasmlari: `STORAGE_PATH` (`/var/lib/zonup/storage`, egasi uid 1000).
- Nginx: `/etc/nginx/sites-available/{zonup.uz,admin.zonup.uz,api.zonup.uz,operator.zonup.uz,club.zonup.uz}.conf`, sertifikat `/etc/letsencrypt/live/zonup.uz` (certbot).

## Birinchi o'rnatish

```bash
cd deploy
cp .env.example .env && chmod 600 .env    # qiymatlarni to'ldiring
mkdir -p /var/lib/zonup/storage && chown 1000:1000 /var/lib/zonup/storage
docker compose build
docker compose up -d postgres redis
docker compose run --rm --no-deps api sh -c 'node_modules/.bin/prisma migrate deploy && node_modules/.bin/ts-node prisma/seed/index.ts'
docker compose up -d
```

## Yangilash (har safar)

```bash
cd deploy
git pull
docker compose build            # ~5 daqiqa, eski versiya shu vaqt ishlab turadi
docker compose up -d            # api ishga tushishda migratsiyani o'zi qo'llaydi
docker image prune -f           # eski image qatlamlari
```

Faqat `.env` dagi API sozlamasi o'zgarsa (masalan Telegram token) build shart emas: `docker compose up -d api`.

## Kundalik

```bash
docker compose ps
docker compose logs -f --tail=100 api      # web / admin
docker exec -it zonup-prod-postgres-1 psql -U zonup -d zonup
```

## Zaxira nusxa

**Paneldan:** `admin.zonup.uz` → **Backup** (faqat super admin). «Butun davr» — bazaning to'liq nusxasi (`db/zonup.sql`, pg_dump) va
barcha rasmlar (`storage/`) bitta zip'da; davr tanlansa — shu kunlarda yaratilgan/o'zgargan qatorlar jadval bo'yicha CSV va shu
kunlarda yuklangan rasmlar (qisman nusxa, to'liq tiklash uchun emas). Zip serverda saqlanmaydi: API konteynerida vaqtinchalik
yasaladi, havola 10 daqiqa amal qiladi. `pg_dump`/`psql` image ichida (`postgresql-client-16`, Dockerfile) — versiyasi baza bilan bir xil bo'lsin.

Panel zip'idan tiklash (joriy baza `zonup_old` nomi bilan qoladi):

```bash
unzip zonup-backup-full_YYYYMMDD-HHMM.zip -d /root/restore
cd deploy && docker compose stop api web admin
docker exec zonup-prod-postgres-1 psql -U zonup -d postgres -c 'ALTER DATABASE zonup RENAME TO zonup_old' -c 'CREATE DATABASE zonup'
# psql — ilova image'idagisi (dump'ni yozgan pg_dump bilan bir xil versiya). Baza konteyneridagi psql 16.4 eski:
# dump boshidagi \restrict buyrug'ini tushunmaydi ("invalid command \restrict").
docker run --rm -i --network host --env-file .env zonup-ng:latest sh -c 'psql "${DATABASE_URL%%\?*}" -q -v ON_ERROR_STOP=1' < /root/restore/db/zonup.sql
cp -a /root/restore/storage/. /var/lib/zonup/storage/ && chown -R 1000:1000 /var/lib/zonup/storage
docker compose up -d
```

**Serverda (qo'lda yoki cron):**

```bash
mkdir -p /root/backups/zonup
docker exec zonup-prod-postgres-1 pg_dump -U zonup -Fc zonup > /root/backups/zonup/zonup-$(date +%F).dump
tar czf /root/backups/zonup/storage-$(date +%F).tgz -C /var/lib/zonup storage
```

Tiklash: `docker exec -i zonup-prod-postgres-1 pg_restore -U zonup -d zonup --clean --if-exists < fayl.dump`
