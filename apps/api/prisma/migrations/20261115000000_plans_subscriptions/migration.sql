-- Platforma obuna rejalari (super admin) va klub obunalari
CREATE TABLE "plans" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "price" BIGINT NOT NULL,
  "max_zones" INTEGER NOT NULL,
  "max_devices" INTEGER NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "plans_name_lower_key" ON "plans" (lower("name"));

CREATE TABLE "club_subscriptions" (
  "id" UUID NOT NULL,
  "club_id" UUID NOT NULL,
  "plan_id" UUID NOT NULL,
  "trial_days" INTEGER NOT NULL DEFAULT 0,
  "starts_at" TIMESTAMPTZ NOT NULL,
  "trial_ends_at" TIMESTAMPTZ NOT NULL,
  "ends_at" TIMESTAMPTZ NOT NULL,
  "note" TEXT,
  "created_by" UUID,
  "cancelled_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "club_subscriptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "club_subscriptions_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "club_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "club_subscriptions_club_id_created_at_idx" ON "club_subscriptions" ("club_id", "created_at" DESC);
CREATE INDEX "club_subscriptions_ends_at_idx" ON "club_subscriptions" ("ends_at");
-- Bitta klubda bittadan ortiq amaldagi obuna bo'lmaydi
CREATE UNIQUE INDEX "club_subscriptions_one_current" ON "club_subscriptions" ("club_id") WHERE "cancelled_at" IS NULL;
