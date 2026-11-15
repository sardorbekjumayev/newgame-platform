-- Klubga o'zi kelgan mijoz (operator joyida bron qiladi): akkaunt ixtiyoriy
ALTER TABLE "bookings" ALTER COLUMN "customer_id" DROP NOT NULL;
ALTER TABLE "bookings" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'ONLINE'; -- ONLINE | WALK_IN
ALTER TABLE "bookings" ADD COLUMN "guest_name" TEXT;
ALTER TABLE "bookings" ADD COLUMN "guest_phone" TEXT;
ALTER TABLE "bookings" ADD COLUMN "created_by" UUID;
