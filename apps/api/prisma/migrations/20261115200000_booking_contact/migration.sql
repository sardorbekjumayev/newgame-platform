-- Operator mijoz bilan bog'lanish holati: NEW | CONFIRMED | PREPAID | NO_ANSWER
ALTER TABLE "bookings" ADD COLUMN "contact_status" TEXT NOT NULL DEFAULT 'NEW';
ALTER TABLE "bookings" ADD COLUMN "contact_note" TEXT;
ALTER TABLE "bookings" ADD COLUMN "contacted_at" TIMESTAMPTZ;
