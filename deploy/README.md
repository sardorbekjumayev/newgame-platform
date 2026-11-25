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

```bash
mkdir -p /root/backups/zonup
docker exec zonup-prod-postgres-1 pg_dump -U zonup -Fc zonup > /root/backups/zonup/zonup-$(date +%F).dump
tar czf /root/backups/zonup/storage-$(date +%F).tgz -C /var/lib/zonup storage
```

Tiklash: `docker exec -i zonup-prod-postgres-1 pg_restore -U zonup -d zonup --clean --if-exists < fayl.dump`
