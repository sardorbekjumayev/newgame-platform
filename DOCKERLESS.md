# Zonup (newgame-platform) — Docker'siz ishga tushirish

Bu qo'llanma loyihani **Docker'siz** serverga o'rnatish uchun: PostgreSQL va Redis to'g'ridan-to'g'ri Ubuntu'ga `apt` orqali o'rnatiladi,
API / sayt / panel esa PM2 ostida ishlaydi. Docker bilan o'rnatish — `DEPLOY.md`.

`<...>` ichidagi joylarni o'zingizniki bilan almashtiring. Misollarda domenlar `zonup.uz` (mijoz sayti) va `panel.zonup.uz` (panel).

---

## 0. Umumiy tasavvur

| Qism | Qanday ishlaydi | Port | Tashqaridan ochiqmi |
|---|---|---|---|
| PostgreSQL 16 | `apt`, systemd xizmati | `127.0.0.1:5432` | Yo'q |
| Redis 7 | `apt`, systemd xizmati | `127.0.0.1:6379` | Yo'q |
| API (NestJS) — `apps/api` | PM2 | `127.0.0.1:4900` | Yo'q (Nginx orqali `/api/v1/`) |
| Mijoz sayti (Next.js) — `apps/web` | PM2 | `127.0.0.1:4910` | Yo'q (Nginx orqali) |
| Panel (Next.js) — `apps/admin` | PM2 | `127.0.0.1:4920` | Yo'q (Nginx orqali) |
| Nginx + HTTPS | systemd | `80`, `443` | **Ha** — faqat shu |

Ikkala domenda ham `/api/v1/...` so'rovlari Nginx orqali API'ga boradi — alohida API domeni shart emas.

---

## 1. Oldindan tayyorlab qo'yish

1. **Server**: Ubuntu 22.04 yoki 24.04, kamida 2 GB RAM (build uchun 4 GB tavsiya), `root` yoki `sudo`.
2. **Domenlar**: `zonup.uz` va `panel.zonup.uz` ning **A yozuvi** server IP manziliga yo'naltirilgan.
3. **Telegram bot** (`@BotFather` → `/newbot`): token va username. Production uchun **alohida bot** oching — dev botini ishlatmang (ikki server bitta botdan update ololmaydi).
4. **Yandex kalitlari**: JavaScript API (xarita) va HTTP Geocoder (manzil qidiruvi). Kabinetda "HTTP Referer" cheklovlariga `zonup.uz`, `*.zonup.uz` ni qo'shing.

---

## 2. Serverni tayyorlash (root)

```bash
apt update && apt upgrade -y
apt install -y git curl ca-certificates gnupg nginx ufw build-essential

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

> 4900/4910/4920/5432/6379 portlarini **ochmang** — ular faqat server ichida ishlaydi.

Dasturni root ostida yuritmaslik uchun alohida foydalanuvchi:

```bash
adduser --disabled-password --gecos "" deploy
```

---

## 3. PostgreSQL 16 (root)

Ubuntu 24.04 da `postgresql-16` standart omborda bor. Ubuntu 22.04 da avval rasmiy PostgreSQL omborini qo'shing:

```bash
# Faqat Ubuntu 22.04 uchun
install -d /usr/share/postgresql-common/pgdg
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list
apt update
```

O'rnatish (`contrib` — `citext`, `btree_gist` kengaytmalari uchun kerak):

```bash
apt install -y postgresql-16 postgresql-contrib
systemctl enable --now postgresql
```

Baza, foydalanuvchi va kengaytmalar (parolni o'zingiz o'ylab toping va saqlang):

```bash
sudo -u postgres psql <<'SQL'
CREATE USER zonup WITH PASSWORD '<BAZA_PAROLI>';
CREATE DATABASE zonup OWNER zonup;
\c zonup
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
SQL
```

> Kengaytmalarni oldindan `postgres` (superuser) bilan yaratamiz — migratsiyalar ularni ishlatadi, oddiy foydalanuvchi esa
> ba'zi kengaytmalarni o'zi yarata olmasligi mumkin.

Tekshirish:

```bash
psql "postgresql://zonup:<BAZA_PAROLI>@127.0.0.1:5432/zonup" -c "select 1"
```

PostgreSQL standart holatda faqat `localhost` ni tinglaydi — shunday qoldiring.

---

## 4. Redis 7 (root)

```bash
apt install -y redis-server
```

`/etc/redis/redis.conf` da quyidagilarni tekshiring (standart qiymatlar odatda shunday):

```conf
bind 127.0.0.1 ::1
protected-mode yes
supervised systemd
```

Xohlasangiz parol qo'ying (`requirepass <REDIS_PAROLI>`) — unda `REDIS_URL` ham parolli bo'ladi (6-qadam).

```bash
systemctl enable --now redis-server
systemctl restart redis-server
redis-cli ping            # PONG
```

---

## 5. Node.js, pnpm, PM2 va kod (`deploy` foydalanuvchisi)

```bash
su - deploy
```

Loyiha Node **26** va pnpm **12.6.0** bilan ishlab chiqilgan — serverda ham shu versiyalar bo'lsin:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install 26
nvm alias default 26

corepack enable
corepack prepare pnpm@12.6.0 --activate
npm install -g pm2

node -v && pnpm -v
```

Kodni olish (repo private bo'lsa — deploy key yoki token kerak):

```bash
git clone https://github.com/<owner>/newgame-platform.git ~/zonup
cd ~/zonup
```

---

## 6. Sozlama fayllari (.env)

Maxfiy kalitlar yarating va saqlang:

```bash
openssl rand -base64 48 | tr -d '\n=/+' ; echo     # JWT_ACCESS_SECRET
openssl rand -base64 48 | tr -d '\n=/+' ; echo     # JWT_REFRESH_SECRET
openssl rand -hex 24                                # TELEGRAM_WEBHOOK_SECRET
```

### 6.1. API — `apps/api/.env`

```dotenv
NODE_ENV=production
PORT=4900
DATABASE_URL=postgresql://zonup:<BAZA_PAROLI>@127.0.0.1:5432/zonup?schema=public
REDIS_URL=redis://127.0.0.1:6379
# Redis'ga parol qo'ygan bo'lsangiz: REDIS_URL=redis://:<REDIS_PAROLI>@127.0.0.1:6379

JWT_ACCESS_SECRET=<birinchi_kalit>
JWT_REFRESH_SECRET=<ikkinchi_kalit>

CORS_ORIGINS=https://zonup.uz,https://panel.zonup.uz
APP_TIMEZONE_DEFAULT=Asia/Tashkent
PUBLIC_WEB_URL=https://zonup.uz

# Faqat birinchi seed uchun: super admin (login: "admin" yoki shu email)
SUPER_ADMIN_EMAIL=<sizning-email>
SUPER_ADMIN_PASSWORD=<kuchli-parol>

# Telegram bot (production'da majburiy — tokensiz mijozlar login qila olmaydi)
TELEGRAM_BOT_TOKEN=<BotFather token>
TELEGRAM_BOT_USERNAME=<bot_username, @ siz>
TELEGRAM_MODE=webhook
TELEGRAM_WEBHOOK_URL=https://zonup.uz/api/v1/telegram/webhook
TELEGRAM_WEBHOOK_SECRET=<uchinchi_kalit>
# Telegram Mini App (bot ichida bron): bot menyusi → https://zonup.uz/tg. Faqat https.
TELEGRAM_WEBAPP_URL=https://zonup.uz

RATE_LIMIT_GLOBAL=300/60
RATE_LIMIT_PUBLIC=120/60
RATE_LIMIT_WRITE=30/60
RATE_LIMIT_SENSITIVE=20/300

YANDEX_GEOCODER_KEY=<geocoder kaliti>

# Operator yuklagan klub logotipi va rasmi. Bo'sh — apps/api/storage (git'da yo'q, `git pull` o'chirmaydi)
STORAGE_DIR=
```

### 6.2. Mijoz sayti — `apps/web/.env.local`

```dotenv
API_ORIGIN=http://127.0.0.1:4900
NEXT_PUBLIC_SITE_URL=https://zonup.uz
NEXT_PUBLIC_TOKEN_KEY=ng.tokens
NEXT_PUBLIC_CLUB_PANEL_URL=https://panel.zonup.uz/login
NEXT_PUBLIC_YANDEX_MAPS_KEY=<JavaScript API kaliti>
# Google Analytics 4 o'lchov ID (G-XXXXXXX). Bo'sh — GA yuklanmaydi
NEXT_PUBLIC_GA_ID=
```

### 6.3. Panel — `apps/admin/.env.local`

```dotenv
API_ORIGIN=http://127.0.0.1:4900
WEB_ORIGIN=http://127.0.0.1:4910
NEXT_PUBLIC_WEB_URL=https://zonup.uz
NEXT_PUBLIC_TOKEN_KEY=ng.admin.tokens
NEXT_PUBLIC_YANDEX_MAPS_KEY=<JavaScript API kaliti>
```

```bash
chmod 600 apps/api/.env apps/web/.env.local apps/admin/.env.local
```

> ⚠️ `NEXT_PUBLIC_*`, `API_ORIGIN`, `WEB_ORIGIN` **build paytida** yoziladi. O'zgartirsangiz — `pnpm build` va `pm2 restart all`.

---

## 7. O'rnatish, migratsiya, build

```bash
cd ~/zonup
pnpm install --frozen-lockfile
pnpm db:migrate        # "All migrations have been successfully applied"
pnpm db:seed           # super admin va rollar
pnpm build             # api, web, admin — 2–5 daqiqa
```

> Production'da faqat `pnpm db:migrate` (`prisma migrate deploy`). **`prisma migrate dev` ishlatmang** — u bazani tozalashi mumkin.

---

## 8. PM2 bilan doimiy ishga tushirish

`~/zonup/ecosystem.config.cjs`:

```js
module.exports = {
  apps: [
    { name: "zonup-api",   cwd: "./apps/api",   script: "dist/main.js", env: { NODE_ENV: "production" } },
    { name: "zonup-web",   cwd: "./apps/web",   script: "node_modules/next/dist/bin/next", args: "start -p 4910 -H 127.0.0.1", env: { NODE_ENV: "production" } },
    { name: "zonup-admin", cwd: "./apps/admin", script: "node_modules/next/dist/bin/next", args: "start -p 4920 -H 127.0.0.1", env: { NODE_ENV: "production" } },
  ],
};
```

```bash
pm2 start ecosystem.config.cjs
pm2 status                         # uchalasi "online"
pm2 save
pm2 startup systemd -u deploy --hp /home/deploy
```

Oxirgi buyruq chiqargan `sudo env PATH=...` qatorini **root** sifatida bajaring — server qayta yonganda dasturlar o'zi ko'tariladi.

Tekshirish:

```bash
curl -s http://127.0.0.1:4900/api/v1/health/ready                      # db va redis "ok"
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4910/        # 200
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4920/login   # 200
```

---

## 9. Nginx va HTTPS (root)

`/etc/nginx/sites-available/zonup`:

```nginx
upstream zonup_api   { server 127.0.0.1:4900; keepalive 16; }
upstream zonup_web   { server 127.0.0.1:4910; keepalive 16; }
upstream zonup_admin { server 127.0.0.1:4920; keepalive 16; }

map $http_upgrade $connection_upgrade { default upgrade; '' close; }

server {
    listen 80;
    server_name zonup.uz www.zonup.uz;
    client_max_body_size 12m;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    location /api/v1/ { proxy_pass http://zonup_api; }
    location / {
        proxy_pass http://zonup_web;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
    }
}

server {
    listen 80;
    server_name panel.zonup.uz;
    client_max_body_size 12m;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    location /api/v1/ { proxy_pass http://zonup_api; }
    location / {
        proxy_pass http://zonup_admin;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/zonup /etc/nginx/sites-enabled/zonup
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

apt install -y certbot python3-certbot-nginx
certbot --nginx -d zonup.uz -d www.zonup.uz -d panel.zonup.uz     # "redirect HTTP → HTTPS" ni tanlang
certbot renew --dry-run
```

HTTPS yoqilgandan keyin API'ni qayta ishga tushiring — Telegram webhook va Mini App tugmasi https manzil bilan o'rnatiladi:

```bash
su - deploy -c "pm2 restart zonup-api"
curl -s "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"     # url to'g'ri, last_error_message yo'q
```

---

## 10. Tekshiruv (brauzerda)

1. `https://zonup.uz` — landing; `/map` — xarita.
2. `https://zonup.uz/login` — telefon → bot → "Raqamni ulashish" → kod keladi → kirish.
3. Botda **🎮 Bron** menyu tugmasi → Mini App ochiladi, avtomatik kiradi.
4. `https://panel.zonup.uz/login` — `admin` + parol → arizadan klub + operator yaratish → operator sifatida klub joyi, zona, tarif, ish vaqti.
5. Mijoz sifatida bron qiling → operator panelida "Yangi bronlar"da chiqadi; "Joyida bron" bo'limini sinab ko'ring.

---

## 11. Zaxira nusxa (backup)

> Klub logotiplari va rasmlari bazada emas, `STORAGE_DIR` papkasida (standart `apps/api/storage`) — uni ham zaxiralang.

> Super admin panelidagi **Backup** bo'limi baza + rasmlarni bitta zip qilib beradi. U API serverida `pg_dump` va `psql` ni
> ishga tushiradi — PostgreSQL klienti (baza bilan bir xil versiya) API ishlayotgan mashinada o'rnatilgan bo'lishi kerak.

`deploy` foydalanuvchisida parolsiz `pg_dump` uchun `~/.pgpass`:

```bash
echo "127.0.0.1:5432:zonup:zonup:<BAZA_PAROLI>" > ~/.pgpass && chmod 600 ~/.pgpass
mkdir -p ~/backups
crontab -e
```

```cron
30 3 * * * pg_dump -h 127.0.0.1 -U zonup -Fc zonup > /home/deploy/backups/zonup-$(date +\%F).dump && find /home/deploy/backups -name '*.dump' -mtime +14 -delete
```

Tiklash (joriy ma'lumot ustiga yoziladi — ehtiyot bo'ling):

```bash
pg_restore -h 127.0.0.1 -U zonup -d zonup --clean --if-exists ~/backups/zonup-YYYY-MM-DD.dump
```

Nusxalarni vaqti-vaqti bilan boshqa joyga ham ko'chiring.

### Eski serverdagi ma'lumotlarni ko'chirish

Eski serverda (Docker'dagi baza bo'lsa):

```bash
docker exec newgame-postgres-1 pg_dump -U ng -Fc newgame > newgame.dump
```

Yangi serverga ko'chirib (`scp`), **migratsiyalardan oldin** bo'sh bazaga tiklang:

```bash
pg_restore -h 127.0.0.1 -U zonup -d zonup --no-owner --role=zonup newgame.dump
pnpm db:migrate        # yetishmayotgan yangi migratsiyalar bo'lsa qo'llanadi
```

---

## 12. Yangilanishni chiqarish (har safar)

```bash
cd ~/zonup
git pull
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm build
pm2 restart all
```

Katta yangilanishdan oldin qo'lda `pg_dump` qilib qo'ying.

---

## 13. Muammolar

| Vaziyat | Yechim |
|---|---|
| Loglar | `pm2 logs zonup-api` (yoki `zonup-web`, `zonup-admin`) |
| Baza ishlayaptimi | `systemctl status postgresql`, `psql "postgresql://zonup:...@127.0.0.1:5432/zonup" -c "select 1"` |
| Redis ishlayaptimi | `systemctl status redis-server`, `redis-cli ping` |
| Migratsiyada `permission denied to create extension` | 3-qadamdagi `CREATE EXTENSION` larni `postgres` bilan bajaring |
| `Invalid environment variables` (API) | Xabardagi qatorni `apps/api/.env` da tuzating (JWT ≥ 32 belgi, URL'lar to'g'ri) |
| Sayt `502 Bad Gateway` | `pm2 status` — dastur o'chgan; `pm2 logs` dan sababi |
| Kod botga kelmayapti | `getWebhookInfo`; boshqa server shu botni polling qilmayotganini tekshiring |
| Botda Mini App tugmasi yo'q | `TELEGRAM_WEBAPP_URL` https bilan to'ldirilganmi → `pm2 restart zonup-api` |
| `.env.local` o'zgardi, effekt yo'q | `pnpm build && pm2 restart all` |
| Server qayta yongach dasturlar yo'q | `pm2 startup` qatori root'da bajarilganmi; `pm2 save` |

---

## 14. Xavfsizlik

- `.env` fayllarini git'ga qo'shmang, hech kimga yubormang.
- PostgreSQL va Redis faqat `127.0.0.1` da tinglasin; firewall'da faqat 22, 80, 443 ochiq.
- Super admin parolini kuchli qiling; seed'dan keyin `SUPER_ADMIN_PASSWORD` ni `.env` dan o'chirib qo'yish mumkin.
- Kunlik backup ishlayotganini vaqti-vaqti bilan tekshiring.
