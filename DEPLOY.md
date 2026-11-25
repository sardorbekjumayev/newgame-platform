# Zonup (newgame-platform) — production'ga chiqarish qo'llanmasi

Bu qo'llanma boshidan oxirigacha **qo'lda** bajarish uchun yozilgan: kodni GitHub'ga yuklashdan tortib, serverda sayt `https` bilan ochilguncha.
Buyruqlarni ketma-ket nusxalab bajaring. `<...>` ichidagi joylarni o'zingizniki bilan almashtiring.

> **Hozirgi server (zonup.uz) Docker bilan ishlaydi — `deploy/README.md`.** Bu qo'llanma — PM2 bilan qo'lda o'rnatish varianti.

---

## 0. Umumiy tasavvur

Loyiha 3 ta dastur + 2 ta xizmatdan iborat:

| Qism | Papka | Port (server ichida) | Vazifasi |
|---|---|---|---|
| API (NestJS) | `apps/api` | `4900` | Biznes logika, baza, Telegram bot |
| Mijoz sayti (Next.js) | `apps/web` | `4910` | Landing, xarita, klub sahifalari, ariza formasi, share rasm |
| Panel (Next.js) | `apps/admin` | `4920` | Super admin, operator, menejer panellari |
| PostgreSQL 16 + PostGIS | Docker | `127.0.0.1:55444` | Ma'lumotlar bazasi |
| Redis 7 | Docker | `127.0.0.1:56390` | OTP, kesh, rate limit |

Tashqariga faqat **Nginx** (80/443) ochiladi. Domenlar (misol uchun — o'zingiznikini qo'ying):

| Domen | Nima ochiladi |
|---|---|
| `zonup.uz` | Mijoz sayti (4910) |
| `panel.zonup.uz` | Panel (4920) |

Ikkala domenda ham `/api/v1/...` so'rovlari Nginx orqali to'g'ridan-to'g'ri API'ga (4900) boradi. Alohida API domeni shart emas.

---

## 1. Oldindan tayyorlab qo'yish kerak bo'lgan narsalar

Serverga kirishdan oldin quyidagilarni tayyorlang (qog'ozga yoki parol menejeriga yozing):

1. **Server**: Ubuntu 22.04/24.04, kamida 2 GB RAM (build uchun 4 GB tavsiya), root yoki `sudo` huquqi.
2. **Domenlar**: `zonup.uz` va `panel.zonup.uz` — ikkalasining **A yozuvi** server IP manziliga yo'naltirilgan bo'lsin (DNS tarqalishi 5 daqiqadan bir necha soatgacha).
3. **Telegram bot** (mijozlar login kodi shu botga keladi):
   - Telegram'da `@BotFather` → `/newbot` → bot nomi va username.
   - Bergan **token**ni saqlang (`123456:ABC...`) va bot **username**ini (`zonup_bot`).
   - ⚠️ Development'da ishlatgan botingizni production'da ishlatmang (ikkita server bitta botdan update ololmaydi). Production uchun alohida bot oching.
4. **Yandex kalitlari** (developer.tech.yandex.ru kabinetidan):
   - **JavaScript API** kaliti — xarita uchun (sayt va panel).
     Kabinetda shu kalit uchun **"HTTP Referer" cheklovlariga** domenlaringizni qo'shing: `zonup.uz`, `*.zonup.uz`. Aks holda xarita ochilmaydi.
   - **HTTP Geocoder** kaliti — operator klub manzilini qidirishi uchun (faqat serverda ishlatiladi).
5. **Super admin** uchun email va kuchli parol (kamida 8 belgi).

---

## 2. Kodni GitHub'ga yuklash (o'z kompyuteringizda / dev serverda)

Loyiha papkasida hali git yo'q. Bir marta:

```bash
cd newgame-platform
git init -b main
git add .
git commit -m "feat: initial Zonup platform"
```

GitHub'da **private** repository oching (masalan `zonup-platform`), keyin:

```bash
git remote add origin git@github.com:<github-login>/zonup-platform.git
git push -u origin main
```

> ✅ Tekshirilgan: `.env`, `.env.local` fayllari (barcha kalitlar va parollar) `.gitignore` da — GitHub'ga **tushmaydi**.
> Shuning uchun ularni serverda qo'lda yaratasiz (4–6-qadamlar).

Keyingi yangilanishlar uchun: `git add . && git commit -m "..." && git push`.

---

## 3. Serverni tayyorlash

Serverga SSH orqali kiring: `ssh root@<server-ip>`

### 3.1. Tizimni yangilash va kerakli paketlar

```bash
apt update && apt upgrade -y
apt install -y git curl ca-certificates nginx ufw
```

### 3.2. Firewall

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ufw status
```

> 4900/4910/4920/55444/56390 portlarini **ochmang** — ular faqat server ichida ishlaydi.

### 3.3. Docker (PostgreSQL va Redis uchun)

```bash
curl -fsSL https://get.docker.com | sh
docker --version
docker compose version
```

### 3.4. Alohida foydalanuvchi (root ostida dastur yuritmaslik uchun)

```bash
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
su - deploy
```

Bundan keyingi buyruqlar (alohida aytilmagan bo'lsa) **`deploy` foydalanuvchisi** ostida bajariladi.

### 3.5. Node.js va pnpm

Loyiha Node **26** va pnpm **12.6.0** bilan ishlab chiqilgan va tekshirilgan — serverda ham shu versiyalar bo'lsin.

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install 26
nvm alias default 26
node -v            # v26.x bo'lishi kerak

corepack enable
corepack prepare pnpm@12.6.0 --activate
pnpm -v            # 12.6.0

npm install -g pm2
```

---

## 4. Kodni serverga olish

GitHub repo private bo'lgani uchun serverga **deploy key** kerak:

```bash
ssh-keygen -t ed25519 -C "zonup-server" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

Chiqqan qatorni GitHub → repo → **Settings → Deploy keys → Add deploy key** ga qo'ying (Allow write access — **belgilamang**).

```bash
ssh -T git@github.com          # "successfully authenticated" chiqishi kerak
git clone git@github.com:<github-login>/zonup-platform.git ~/zonup
cd ~/zonup
```

---

## 5. Baza va Redis (Docker)

Repo'dagi `docker-compose.yml` development uchun (oddiy parol, barcha interfeyslarda ochiq port). Production uchun alohida fayl yarating:

```bash
nano ~/zonup/docker-compose.prod.yml
```

Ichiga (parolni **o'zingiz o'ylab toping**, faqat harf va raqam — URL'da muammo bo'lmasin):

```yaml
services:
  postgres:
    image: postgis/postgis:16-3.4
    restart: unless-stopped
    environment:
      POSTGRES_USER: zonup
      POSTGRES_PASSWORD: <BAZA_PAROLI>
      POSTGRES_DB: zonup
    ports: ["127.0.0.1:55444:5432"]
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./infrastructure/postgres/init.sql:/docker-entrypoint-initdb.d/01-init.sql:ro
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: ["redis-server", "--appendonly", "yes"]
    ports: ["127.0.0.1:56390:6379"]
    volumes:
      - redisdata:/data
volumes:
  pgdata: {}
  redisdata: {}
```

Ishga tushirish:

```bash
cd ~/zonup
docker compose -p zonup -f docker-compose.prod.yml up -d
docker compose -p zonup -f docker-compose.prod.yml ps     # ikkalasi "running"
```

> `init.sql` birinchi ishga tushishda kerakli kengaytmalarni (postgis, citext, ...) yaratadi.

---

## 6. Sozlama fayllari (.env)

Avval maxfiy kalitlar yarating (har birini alohida, 2 marta ishga tushiring va natijalarni saqlang):

```bash
openssl rand -base64 48 | tr -d '\n=/+' ; echo     # JWT_ACCESS_SECRET uchun
openssl rand -base64 48 | tr -d '\n=/+' ; echo     # JWT_REFRESH_SECRET uchun
openssl rand -hex 24                                # TELEGRAM_WEBHOOK_SECRET uchun
```

### 6.1. API — `apps/api/.env`

```bash
nano ~/zonup/apps/api/.env
```

```dotenv
NODE_ENV=production
PORT=4900
DATABASE_URL=postgresql://zonup:<BAZA_PAROLI>@127.0.0.1:55444/zonup?schema=public
REDIS_URL=redis://127.0.0.1:56390

# 6-qadam boshida yaratgan kalitlar (kamida 32 belgi)
JWT_ACCESS_SECRET=<birinchi_kalit>
JWT_REFRESH_SECRET=<ikkinchi_kalit>

CORS_ORIGINS=https://zonup.uz,https://panel.zonup.uz
APP_TIMEZONE_DEFAULT=Asia/Tashkent
PUBLIC_WEB_URL=https://zonup.uz

# Faqat birinchi seed uchun: super admin (login: "admin" yoki shu email)
SUPER_ADMIN_EMAIL=<sizning-email>
SUPER_ADMIN_PASSWORD=<kuchli-parol>

# Telegram bot (production'da MAJBURIY — tokensiz mijozlar login qila olmaydi)
TELEGRAM_BOT_TOKEN=<BotFather bergan token>
TELEGRAM_BOT_USERNAME=<bot_username, @ siz>
TELEGRAM_MODE=webhook
TELEGRAM_WEBHOOK_URL=https://zonup.uz/api/v1/telegram/webhook
TELEGRAM_WEBHOOK_SECRET=<uchinchi_kalit>

# Rate limit (so'rovlar/soniya oynasi) — standart qiymatlar
RATE_LIMIT_GLOBAL=300/60
RATE_LIMIT_PUBLIC=120/60
RATE_LIMIT_WRITE=30/60
RATE_LIMIT_SENSITIVE=20/300

# Yandex HTTP Geocoder (operator klub manzilini qidirishi uchun)
YANDEX_GEOCODER_KEY=<geocoder kaliti>

# Operator yuklagan klub logotipi va rasmi. Bo'sh — apps/api/storage (git'da yo'q, `git pull` o'chirmaydi)
STORAGE_DIR=
```

### 6.2. Mijoz sayti — `apps/web/.env.local`

```bash
nano ~/zonup/apps/web/.env.local
```

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

```bash
nano ~/zonup/apps/admin/.env.local
```

```dotenv
API_ORIGIN=http://127.0.0.1:4900
WEB_ORIGIN=http://127.0.0.1:4910
NEXT_PUBLIC_WEB_URL=https://zonup.uz
NEXT_PUBLIC_TOKEN_KEY=ng.admin.tokens
NEXT_PUBLIC_YANDEX_MAPS_KEY=<JavaScript API kaliti>
```

> ⚠️ **Muhim:** `NEXT_PUBLIC_...` qiymatlari va `API_ORIGIN`/`WEB_ORIGIN` **build paytida** dasturga "yozib qo'yiladi".
> Ularni o'zgartirsangiz — 7-qadamdagi `pnpm build` ni qayta bajarib, keyin `pm2 restart all` qiling.

Fayllarni boshqalar o'qiy olmasin:

```bash
chmod 600 ~/zonup/apps/api/.env ~/zonup/apps/web/.env.local ~/zonup/apps/admin/.env.local
```

---

## 7. O'rnatish, baza, build

```bash
cd ~/zonup
pnpm install --frozen-lockfile
```

Baza jadvallarini yaratish (migratsiyalar) va super admin:

```bash
pnpm db:migrate        # "All migrations have been successfully applied"
pnpm db:seed           # "Super admin: <email>" va "Seed done"
```

> `db:seed` qayta ishga tushirilsa ham xavfsiz: rollarni yangilaydi, mavjud super adminni o'zgartirmaydi.
> Seed'dan keyin xohlasangiz `SUPER_ADMIN_PASSWORD` qatorini `.env` dan o'chirib qo'yishingiz mumkin.

Production build (2–5 daqiqa):

```bash
pnpm build
```

Oxirida `apps/api build: Done`, `apps/web build: Done`, `apps/admin build: Done` chiqishi kerak.

---

## 8. Dasturlarni doimiy ishga tushirish (PM2)

```bash
nano ~/zonup/ecosystem.config.cjs
```

```js
module.exports = {
  apps: [
    { name: "zonup-api",   cwd: "./apps/api",   script: "dist/main.js", env: { NODE_ENV: "production" } },
    { name: "zonup-web",   cwd: "./apps/web",   script: "node_modules/next/dist/bin/next", args: "start -p 4910 -H 127.0.0.1", env: { NODE_ENV: "production" } },
    { name: "zonup-admin", cwd: "./apps/admin", script: "node_modules/next/dist/bin/next", args: "start -p 4920 -H 127.0.0.1", env: { NODE_ENV: "production" } },
  ],
};
```

> `cwd` muhim: API `.env` ni, sayt esa share rasm shriftlarini (`src/assets/fonts`) shu papkadan o'qiydi.

```bash
cd ~/zonup
pm2 start ecosystem.config.cjs
pm2 status                       # uchalasi "online"
pm2 logs zonup-api --lines 30    # "Telegram bot @... (webhook)" ko'rinsa — bot ulandi
```

Server qayta yonganda avtomatik ko'tarilishi uchun:

```bash
pm2 save
pm2 startup systemd -u deploy --hp /home/deploy
```

Oxirgi buyruq bitta `sudo env PATH=...` qatorini chiqaradi — uni **root** sifatida (yoki `sudo` bilan) bajaring.

Tekshirish (server ichida):

```bash
curl -s http://127.0.0.1:4900/api/v1/health/ready      # "status":"ok", db va redis "ok"
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4910/      # 200
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4920/login # 200
```

---

## 9. Nginx (domenlar) va HTTPS

**root** sifatida:

```bash
nano /etc/nginx/sites-available/zonup
```

```nginx
# API (ikkala domen uchun umumiy)
upstream zonup_api   { server 127.0.0.1:4900; keepalive 16; }
upstream zonup_web   { server 127.0.0.1:4910; keepalive 16; }
upstream zonup_admin { server 127.0.0.1:4920; keepalive 16; }

map $http_upgrade $connection_upgrade { default upgrade; '' close; }

server {
    listen 80;
    server_name zonup.uz www.zonup.uz;
    client_max_body_size 12m;

    location /api/v1/ {
        proxy_pass http://zonup_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location / {
        proxy_pass http://zonup_web;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
    }
}

server {
    listen 80;
    server_name panel.zonup.uz;
    client_max_body_size 12m;

    location /api/v1/ {
        proxy_pass http://zonup_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location / {
        proxy_pass http://zonup_admin;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
    }
}
```

Yoqish:

```bash
ln -s /etc/nginx/sites-available/zonup /etc/nginx/sites-enabled/zonup
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

HTTPS sertifikat (Let's Encrypt, bepul, avtomatik yangilanadi):

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d zonup.uz -d www.zonup.uz -d panel.zonup.uz
```

Savollarga: email kiriting, shartlarga rozilik, "redirect HTTP → HTTPS" ni tanlang.

```bash
certbot renew --dry-run      # avtomatik yangilanish ishlashini tekshirish
```

---

## 10. Telegram webhook'ni tekshirish

API ishga tushganda webhook'ni o'zi o'rnatadi. Tekshirish (tokenni qo'ying):

```bash
curl -s "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

`"url":"https://zonup.uz/api/v1/telegram/webhook"` va `"last_error_message"` **yo'q** bo'lishi kerak.
Agar url bo'sh bo'lsa (masalan HTTPS sertifikat API'dan keyin o'rnatilgan bo'lsa): `pm2 restart zonup-api`.

---

## 11. Birinchi ishga tushirishdan keyingi tekshiruv (brauzerda)

1. `https://zonup.uz` — landing ochiladi, xarita bo'limi ko'rinadi.
2. `https://zonup.uz/login` — telefon kiriting → bot havolasi → botda "Raqamni ulashish" → kod botga keladi → kirish ishlaydi.
3. `https://zonup.uz/for-clubs` — sinov ariza yuboring.
4. `https://panel.zonup.uz/login` — login `admin` (yoki seed'dagi email) + parol.
   - **Super admin** → Arizalar → sinov arizasi ko'rinadi → "Klub + operator yaratish".
   - Chiqqan login/parol bilan **operator** sifatida kiring → xaritada klub joyini belgilang (xarita va qidiruv ishlashi shu yerda tekshiriladi) → zona, tarif, ish vaqti qo'shing.
   - `https://zonup.uz/map` — klub xaritada chiqadi; klub sahifasida **Ulashish** → rasm ochiladi.
5. Klub havolasini Telegram'ga tashlang — chiroyli rasmli preview chiqishi kerak.

Agar xarita ochilmasa — 1-bo'limdagi Yandex "HTTP Referer" cheklovini tekshiring. Manzil qidiruvi ishlamasa — `YANDEX_GEOCODER_KEY`.

---

## 12. Zaxira nusxa (backup) — majburiy

> Klub logotiplari va rasmlari bazada emas, `STORAGE_DIR` papkasida (standart `~/zonup/apps/api/storage`) — uni ham zaxiralang (masalan `tar czf ~/backups/storage-$(date +%F).tgz -C ~/zonup/apps/api storage`).

Har kuni tunda bazaning nusxasi, 14 kun saqlanadi. `deploy` foydalanuvchisi ostida:

```bash
mkdir -p ~/backups
crontab -e
```

Oxiriga qo'shing (bir qator):

```cron
30 3 * * * docker exec zonup-postgres-1 pg_dump -U zonup -Fc zonup > /home/deploy/backups/zonup-$(date +\%F).dump && find /home/deploy/backups -name '*.dump' -mtime +14 -delete
```

> Konteyner nomini `docker ps` bilan tekshiring (odatda `zonup-postgres-1`).
> Nusxalarni vaqti-vaqti bilan boshqa joyga ham ko'chiring (server yo'qolsa, nusxa ham yo'qolmasin).

Nusxadan tiklash (ehtiyot bo'ling — joriy ma'lumotlar ustiga yoziladi):

```bash
docker exec -i zonup-postgres-1 pg_restore -U zonup -d zonup --clean --if-exists < ~/backups/zonup-YYYY-MM-DD.dump
```

---

## 13. Yangilanishni serverga chiqarish (har safar)

Kompyuteringizda: `git push`. Keyin serverda (`deploy` ostida):

```bash
cd ~/zonup
git pull
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm build
pm2 restart all
pm2 status
```

> Migratsiyalar faqat oldinga yuradi va ma'lumotni saqlab qoladi. Shunga qaramay, katta yangilanishdan oldin 12-bo'limdagi `pg_dump` ni qo'lda ishga tushirib qo'ying.

---

## 14. Foydali buyruqlar va muammolar

| Vaziyat | Buyruq / yechim |
|---|---|
| Loglar | `pm2 logs zonup-api` (yoki `zonup-web`, `zonup-admin`) |
| Holat | `pm2 status`, `curl -s http://127.0.0.1:4900/api/v1/health/ready` |
| Qayta ishga tushirish | `pm2 restart zonup-api` |
| Baza/Redis holati | `docker compose -p zonup -f docker-compose.prod.yml ps` |
| `Invalid environment variables: ...` (API) | Xabarda nomi chiqqan qatorni `apps/api/.env` da to'g'rilang (JWT kalitlari ≥ 32 belgi, URL'lar to'g'ri) |
| Mijoz login: "OTP channel is not configured" | `TELEGRAM_BOT_TOKEN` bo'sh — 6.1 ni to'ldiring, `pm2 restart zonup-api` |
| Kod botga kelmayapti | 10-bo'lim (`getWebhookInfo`); botni boshqa server polling qilmayotganini tekshiring |
| Sayt `502 Bad Gateway` | `pm2 status` — tegishli dastur o'chgan; `pm2 logs` dan sababini ko'ring |
| Xarita "sozlanmagan" deydi | `NEXT_PUBLIC_YANDEX_MAPS_KEY` bo'sh edi build paytida → to'ldirib `pnpm build && pm2 restart all` |
| Share rasm / QR'da `localhost` | `NEXT_PUBLIC_SITE_URL` (web) va `NEXT_PUBLIC_WEB_URL` (admin) → build + restart |
| `.env.local` o'zgardi, lekin effekt yo'q | `NEXT_PUBLIC_*` build paytida yoziladi → `pnpm build && pm2 restart all` |
| Super admin parolini unutdim | `apps/api/.env` da `SUPER_ADMIN_EMAIL` ni **yangi** email, `SUPER_ADMIN_PASSWORD` ni yangi parol bilan qo'ying va `pnpm db:seed` — yangi super admin yaratiladi, u **shu email** bilan kiradi (eskisi qoladi) |

---

## 15. Xavfsizlik bo'yicha qisqa eslatma

- `.env` fayllarini hech kimga yubormang, GitHub'ga qo'shmang (`.gitignore` buni oldini oladi).
- Super admin parolini birinchi kirishdan keyin almashtirish tavsiya qilinadi.
- Server portlari: faqat 22, 80, 443 ochiq (3.2-bo'lim). Baza va Redis faqat `127.0.0.1` da.
- Telegram bot tokenini oshkor qilib qo'ysangiz — `@BotFather` → `/revoke`, yangi tokenni `.env` ga yozib `pm2 restart zonup-api`.
