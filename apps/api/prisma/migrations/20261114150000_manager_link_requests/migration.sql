-- CreateTable
CREATE TABLE "manager_link_requests" (
    "id" UUID NOT NULL,
    "manager_id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "operator_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "manager_link_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "manager_link_requests_club_id_status_idx" ON "manager_link_requests"("club_id", "status");

-- CreateIndex
CREATE INDEX "manager_link_requests_manager_id_status_idx" ON "manager_link_requests"("manager_id", "status");

-- AddForeignKey
ALTER TABLE "manager_link_requests" ADD CONSTRAINT "manager_link_requests_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manager_link_requests" ADD CONSTRAINT "manager_link_requests_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

