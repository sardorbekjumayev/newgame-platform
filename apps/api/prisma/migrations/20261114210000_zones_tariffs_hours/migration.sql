-- AlterTable
ALTER TABLE "clubs" ADD COLUMN     "working_hours" JSONB;

-- CreateTable
CREATE TABLE "zones" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tariffs" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "zone_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "price" BIGINT NOT NULL,
    "duration_minutes" INTEGER,
    "valid_from" TEXT,
    "valid_to" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "tariffs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "zones_club_id_idx" ON "zones"("club_id");

-- CreateIndex
CREATE INDEX "tariffs_club_id_idx" ON "tariffs"("club_id");

-- CreateIndex
CREATE INDEX "tariffs_zone_id_idx" ON "tariffs"("zone_id");

-- AddForeignKey
ALTER TABLE "zones" ADD CONSTRAINT "zones_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tariffs" ADD CONSTRAINT "tariffs_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tariffs" ADD CONSTRAINT "tariffs_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Bitta klubda zona nomi takrorlanmaydi (o'chirilganlardan tashqari)
CREATE UNIQUE INDEX "zones_club_name_uq" ON "zones"("club_id", lower("name")) WHERE "deleted_at" IS NULL;

-- Tarif yaxlitligi
ALTER TABLE "tariffs" ADD CONSTRAINT "tariffs_type_chk" CHECK ("type" IN ('HOURLY', 'PACKAGE'));
ALTER TABLE "tariffs" ADD CONSTRAINT "tariffs_price_chk" CHECK ("price" >= 0);
ALTER TABLE "tariffs" ADD CONSTRAINT "tariffs_package_duration_chk" CHECK ("type" <> 'PACKAGE' OR ("duration_minutes" IS NOT NULL AND "duration_minutes" > 0));
ALTER TABLE "tariffs" ADD CONSTRAINT "tariffs_window_chk" CHECK (("valid_from" IS NULL) = ("valid_to" IS NULL));
