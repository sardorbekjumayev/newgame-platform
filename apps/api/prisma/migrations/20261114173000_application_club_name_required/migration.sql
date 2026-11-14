-- Klub nomisiz eski arizalar: vaqtincha ariza beruvchi ismi (super admin keyin tuzatadi)
UPDATE "club_applications" SET "club_name" = "full_name" WHERE "club_name" IS NULL;

-- AlterTable
ALTER TABLE "club_applications" ALTER COLUMN "club_name" SET NOT NULL;
