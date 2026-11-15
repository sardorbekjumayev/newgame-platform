# CLAUDE.md — NewGame Platform

`gameclub-platform` (Zonup) asosida qurilayotgan yangi loyiha. Modullar eski loyihadan bosqichma-bosqich ko'chiriladi.

## Hozir bor
- `apps/api` (NestJS + Prisma + Redis): config, common (xatolar, response, rate-limit), audit, rbac, auth (OTP + parol + refresh rotation), telegram (OTP bot, polling/webhook), health.
- `apps/api` qo'shimcha: `club-applications` (landing ariza), `accounts` (super admin: klub+operator, menejer, parol tiklash, bloklash), `panels` (operator/menejer dashboard).
- `apps/web` (Next.js): landing (`/`), xarita (`/map`, geolokatsiya bo'yicha yaqin klublar), klub sahifasi (`/clubs/[id]`), klub arizasi (`/for-clubs`), mijoz login (`/login`, Telegram bot orqali kod). Ommaviy API: `catalog` moduli (`GET /clubs/map|latest|stats|:id`) — faqat ACTIVE va joyi belgilangan klublar. Xarita kaliti `apps/web/.env.local` → `NEXT_PUBLIC_YANDEX_MAPS_KEY`.
- Klubni ulashish: `apps/web/src/lib/share-card.tsx` (next/og ImageResponse, Zonup uslubi, QR) → `GET /clubs/:id/share?format=story|post|og&lang=` va `opengraph-image.tsx`. Shriftlar `src/assets/fonts` (statik TTF; Satori variable shriftni qo'llamaydi). QR va og:url `NEXT_PUBLIC_SITE_URL` dan. Admin panel (operator/menejer) shu rasmni `/share-card/:id` rewrite orqali oladi (`apps/admin/.env.local` → `WEB_ORIGIN`, `NEXT_PUBLIC_WEB_URL`).
- `apps/admin` (Next.js, :4920): bitta login (username + parol), rolga qarab panel: `/platform` (SUPER_ADMIN), `/operator`, `/manager`.
- `packages/types` (`@ng/types`): API/session klienti, pul/vaqt helperlari.
- Operator zal sxemasi: `/operator/layout` — `zones.layout` JSON `{cols, rows, seats:[{n,x,y}], decor:[{kind,x,y}]}`, o'rindiqlar 1..`zones.devices_count`, `PUT /operator/zones/:id/layout` (`normalizeLayout`). Muharrir `apps/admin/src/components/zone-layout.tsx` (eski `room-editor.tsx` dan).
- Operator: zonalar (`zones`) va tariflar (`tariffs`, HOURLY/PACKAGE, narx tiyinda, ixtiyoriy vaqt oralig'i), ish vaqti (`clubs.working_hours` JSON) — `club-settings` moduli, soft delete.
- Obunalar (`subscriptions` moduli): super admin `/platform/plans` da rejalar (`plans`: narx tiyinda/oy, `max_zones`, `max_devices`) va `/platform/subscriptions` da klubga obuna (`club_subscriptions`: sinov kunlari + to'langan oylar, uzaytirish, amaldagisi `cancelled_at IS NULL`). Muddat tugasa klub yopilmaydi — faqat super adminga ogohlantirish (dashboard, menyu badge, 3 kun oldin). Limit operator zona qo'shish/qurilma sonini oshirishda tekshiriladi (`assertWithinLimits`); obuna bo'lmasa — cheklov yo'q.
- Bron (`bookings` moduli): `devices` (zona o'rindig'i, `seat_no` 1..`devices_count`, `syncDevices`), `bookings` + `booking_items` (EXCLUDE gist — bitta qurilma ikki marta band qilinmaydi, bufer 10 daq). Mijoz: klub sahifasida sana → soat → kelish vaqti → zona/qurilma (zal sxemasi) → bron; `/bookings` — mening bronlarim. Qoidalar `BOOKING_RULES`: to'lov klubda (darhol CONFIRMED), 5 kun oldin, ≤5 faol bron, bitta bronda ≤5 o'rindiq (`maxDevices`), bekor qilish ≥1 soat oldin, faqat CUSTOMER. Narx `pricing.ts` (HOURLY har 30 daq eng arzon mos tarif yoki PACKAGE). Operator `/operator/bookings`: keldi/kelmadi/bekor (kelmadi — boshlanishdan `noShowAfterMinutes`=10 daq keyin). Operator bosh sahifasi (`components/new-bookings.tsx`): kod bo'yicha qidirish (`GET /operator/bookings/by-code/:code`), statistika kartalari va kutilayotgan bronlar (`GET /operator/bookings/upcoming`, 10 s), bron oynasida zal sxemasi + qo'ng'iroq natijasi (`bookings.contact_status` NEW|CONFIRMED|PREPAID|NO_ANSWER, `PUT /operator/bookings/:id/contact`).
- Joyida bron (walk-in): operator `/operator/walk-in` — vaqt ("hozir" yoki soat) → davomiylik → o'rindiqlar (zal sxemasi), ism/telefon ixtiyoriy. `GET /operator/bookings/availability`, `POST /operator/bookings/walk-in`: `bookings.source=WALK_IN`, `customer_id` ixtiyoriy (telefon mavjud mijozniki bo'lsa bog'lanadi), `guest_name/guest_phone`, hozir boshlansa darhol CHECKED_IN; ≤20 o'rindiq, mijoz limitlari qo'llanmaydi.
- Telegram Mini App: `apps/web` ning o'zi Telegram ichida ochiladi (`/tg` kirish sahifasi, `lib/telegram.tsx` — SDK, avtomatik kirish, BackButton, `html[data-tg]` da footer yashirin). Backend `POST /auth/telegram-webapp` (`auth/telegram-webapp.service.ts`: initData HMAC tekshiruvi, `telegram_links.tg_user_id` → `loginWithPhone`; raqam yo'q bo'lsa `need_contact` → Mini App `requestContact()`, kontakt botga keladi va `OtpService.onContact` bog'laydi). Bot menyu tugmasi va raqam bog'langach "Bron qilish" web_app tugmasi — `TELEGRAM_WEBAPP_URL` (faqat https) bo'lsa.
- Hali yo'q (eski loyihada bor): sessiya, onlayn to'lov, Telegram bot menyusi (`telegram-bot.service.ts` — bronlarga bog'liq), mobile.

## Akkaunt modeli
- Klub egasi landing'da ariza qoldiradi → super admin `/platform/applications` da ko'radi → "Klub + operator yaratish".
- Har bir filial = alohida `clubs` qatori + o'z OPERATOR akkaunti (`user_roles.club_id`). 2 filial — 2 klub, 2 operator.
- Super admin MANAGER akkauntlarini ham yaratadi. Parol berilmasa vaqtinchalik parol (faqat javobda), birinchi kirishda almashtiriladi.
- Har bir xodimda 7 xonali `users.public_id` (User ID). Operator uni menejerga aytadi → menejer `/manager` da kiritadi → `manager_link_requests` da 6 xonali kod yaratiladi va operator panelida ko'rinadi (10 daqiqa, 5 urinish) → operator kodni menejerga aytadi → menejer kodni kiritsa `manager_clubs` ga bog'lanadi. Operator ulanish so'rovini rad etishi mumkin. Menejerni olib tashlash — operator `manager_unlink_requests` so'rovi → super admin `/platform/removals` da ikkala tomon bilan bog'lanib tasdiqlaydi.
- Operator birinchi kirishda klub joyini Yandex xaritada belgilaydi (`clubs.latitude/longitude`), belgilanmaguncha operator paneli ochilmaydi (`app/(panel)/operator/layout.tsx`). Xarita: `apps/admin/.env.local` → `NEXT_PUBLIC_YANDEX_MAPS_KEY` (JS API 2.1). Qidiruv/teskari geokodlash — API proksisi `GET /geo/search|reverse` (`apps/api/.env` → `YANDEX_GEOCODER_KEY`, HTTP Geocoder, faqat serverda, Redis kesh 24 soat). Kalitlar git'ga tushmaydi.

## Komandalar
```text
docker compose -p newgame up -d   # postgres :55444, redis :56390
pnpm install
pnpm db:migrate && pnpm db:seed
pnpm dev:api    # :4900 (Swagger /api/docs)
pnpm dev:web    # :4910 (/api/v1 → API_ORIGIN rewrite)
pnpm dev:admin  # :4920 (super admin / operator / menejer)
```
Dev kirish (admin panel): super admin `admin` (yoki `admin@newgame.local`) / `ChangeMe123!`; customer kodi Telegram bot orqali (`TELEGRAM_BOT_TOKEN`), token bo'lmasa dev'da `000000`.

## Qoidalar
Eski loyiha `gameclub-platform/CLAUDE.md` dagi qat'iy qoidalar amal qiladi (pul tiyinda BIGINT, UTC, scope tekshiruvi, i18n, sezgir ma'lumot log'ga tushmaydi, migratsiyalar faqat oldinga).
