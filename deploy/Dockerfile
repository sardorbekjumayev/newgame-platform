# Zonup (newgame-platform) — bitta image, uchta servis: api / web / admin (deploy/docker-compose.yml).
# Kontekst — repo ildizi: docker compose -f deploy/docker-compose.yml build
FROM node:26-slim

# postgresql-client-16 (pg_dump, psql) — super admin zaxira nusxasi (apps/api backups moduli). Versiya baza
# (postgis/postgis:16) bilan bir xil bo'lishi kerak: Debian'ning o'z klienti (17) yozgan dump 16 ga xatosiz tiklanmaydi.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates postgresql-common \
 && /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y \
 && apt-get install -y --no-install-recommends postgresql-client-16 \
 && rm -rf /var/lib/apt/lists/* \
 && npm i -g pnpm@12.6.0

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Bog'liqliklar alohida qatlamda — kod o'zgarsa qayta o'rnatilmaydi
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/admin/package.json apps/admin/
COPY packages/types/package.json packages/types/
RUN pnpm install --frozen-lockfile

COPY . .

# Brauzerga chiqadigan (ochiq) qiymatlar — Next build paytida kodga yoziladi, o'zgarsa qayta build kerak.
# API_ORIGIN/WEB_ORIGIN — Next rewrite'lari (build paytida) va server tomondagi so'rovlar uchun.
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_WEB_URL
ARG NEXT_PUBLIC_CLUB_PANEL_URL
ARG NEXT_PUBLIC_YANDEX_MAPS_KEY
ARG NEXT_PUBLIC_GA_ID
ARG API_ORIGIN=http://127.0.0.1:4800
ARG WEB_ORIGIN=http://127.0.0.1:4810
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_WEB_URL=$NEXT_PUBLIC_WEB_URL \
    NEXT_PUBLIC_CLUB_PANEL_URL=$NEXT_PUBLIC_CLUB_PANEL_URL \
    NEXT_PUBLIC_YANDEX_MAPS_KEY=$NEXT_PUBLIC_YANDEX_MAPS_KEY \
    NEXT_PUBLIC_GA_ID=$NEXT_PUBLIC_GA_ID \
    API_ORIGIN=$API_ORIGIN \
    WEB_ORIGIN=$WEB_ORIGIN

RUN cd apps/api && pnpm exec prisma generate && pnpm build
RUN pnpm --filter @ng/web build
RUN pnpm --filter @ng/admin build

# Next runtime keshi (.next/cache) va yuklangan fayllar uchun yozish huquqi — root'siz ishlaydi
RUN mkdir -p /data/storage \
 && chown -R node:node /data apps/web/.next apps/admin/.next
USER node
