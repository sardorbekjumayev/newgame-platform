-- AlterTable
ALTER TABLE "clubs" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "location_set_at" TIMESTAMPTZ,
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "manager_unlink_requests" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "manager_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "admin_note" TEXT,
    "handled_by" UUID,
    "handled_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "manager_unlink_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "manager_unlink_requests_status_created_at_idx" ON "manager_unlink_requests"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "manager_unlink_requests_club_id_manager_id_idx" ON "manager_unlink_requests"("club_id", "manager_id");

-- AddForeignKey
ALTER TABLE "manager_unlink_requests" ADD CONSTRAINT "manager_unlink_requests_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Bitta klub+menejer uchun faqat bitta kutilayotgan so'rov
CREATE UNIQUE INDEX "manager_unlink_requests_pending_uq" ON "manager_unlink_requests"("club_id", "manager_id") WHERE "status" = 'PENDING';

-- Koordinata chegaralari
ALTER TABLE "clubs" ADD CONSTRAINT "clubs_lat_chk" CHECK ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90);
ALTER TABLE "clubs" ADD CONSTRAINT "clubs_lng_chk" CHECK ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180);
