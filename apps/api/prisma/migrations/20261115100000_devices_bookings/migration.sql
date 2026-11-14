-- Qurilmalar (zona o'rindiqlari 1..devices_count) va bronlar
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE "devices" (
  "id" UUID NOT NULL,
  "club_id" UUID NOT NULL,
  "zone_id" UUID NOT NULL,
  "seat_no" INTEGER NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "devices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "devices_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devices_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "devices_zone_id_seat_no_key" ON "devices" ("zone_id", "seat_no");
CREATE INDEX "devices_club_id_idx" ON "devices" ("club_id");

-- Mavjud zonalar uchun qurilmalarni yaratish (uuid: gen_random_uuid — PG13+)
INSERT INTO "devices" ("id", "club_id", "zone_id", "seat_no", "updated_at")
SELECT gen_random_uuid(), z."club_id", z."id", s.n, CURRENT_TIMESTAMP
FROM "zones" z CROSS JOIN LATERAL generate_series(1, COALESCE(z."devices_count", 0)) AS s(n)
WHERE z."deleted_at" IS NULL;

CREATE TABLE "bookings" (
  "id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "customer_id" UUID NOT NULL,
  "club_id" UUID NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CONFIRMED', -- CONFIRMED | CHECKED_IN | COMPLETED | CANCELLED | NO_SHOW
  "start_at" TIMESTAMPTZ NOT NULL,
  "end_at" TIMESTAMPTZ NOT NULL,
  "duration_minutes" INTEGER NOT NULL,
  "total_amount" BIGINT NOT NULL,
  "price_snapshot" JSONB,
  "cancelled_at" TIMESTAMPTZ,
  "cancelled_by" UUID,
  "checked_in_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "bookings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bookings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "bookings_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "bookings_code_key" ON "bookings" ("code");
CREATE INDEX "bookings_club_id_start_at_idx" ON "bookings" ("club_id", "start_at");
CREATE INDEX "bookings_customer_id_start_at_idx" ON "bookings" ("customer_id", "start_at" DESC);

CREATE TABLE "booking_items" (
  "id" UUID NOT NULL,
  "booking_id" UUID NOT NULL,
  "device_id" UUID NOT NULL,
  "start_at" TIMESTAMPTZ NOT NULL,
  "blocked_until" TIMESTAMPTZ NOT NULL, -- end_at + bufer (tozalash)
  "price" BIGINT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "booking_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "booking_items_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "booking_items_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "booking_items_booking_id_idx" ON "booking_items" ("booking_id");
CREATE INDEX "booking_items_device_id_start_at_idx" ON "booking_items" ("device_id", "start_at");
-- Bitta qurilma bir vaqtda ikki faol bronga tushmaydi (parallel so'rovlarda ham)
ALTER TABLE "booking_items" ADD COLUMN "time_range" tstzrange GENERATED ALWAYS AS (tstzrange("start_at", "blocked_until", '[)')) STORED;
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_no_overlap" EXCLUDE USING gist ("device_id" WITH =, "time_range" WITH &&) WHERE ("active");
