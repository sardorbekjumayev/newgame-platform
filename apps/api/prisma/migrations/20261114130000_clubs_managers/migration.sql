-- AlterTable
ALTER TABLE "users" ADD COLUMN     "public_id" TEXT,
ADD COLUMN     "username" CITEXT;

-- CreateTable
CREATE TABLE "club_applications" (
    "id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "club_name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT,
    "devices_count" INTEGER,
    "branches_count" INTEGER,
    "telegram" TEXT,
    "comment" TEXT,
    "language" TEXT NOT NULL DEFAULT 'uz',
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "admin_note" TEXT,
    "handled_by" UUID,
    "handled_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "club_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clubs" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "application_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "clubs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manager_clubs" (
    "manager_id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "linked_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manager_clubs_pkey" PRIMARY KEY ("manager_id","club_id")
);

-- CreateIndex
CREATE INDEX "club_applications_status_created_at_idx" ON "club_applications"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "club_applications_phone_idx" ON "club_applications"("phone");

-- CreateIndex
CREATE INDEX "clubs_application_id_idx" ON "clubs"("application_id");

-- CreateIndex
CREATE INDEX "manager_clubs_club_id_idx" ON "manager_clubs"("club_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_public_id_key" ON "users"("public_id");

-- AddForeignKey
ALTER TABLE "clubs" ADD CONSTRAINT "clubs_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "club_applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manager_clubs" ADD CONSTRAINT "manager_clubs_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manager_clubs" ADD CONSTRAINT "manager_clubs_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

