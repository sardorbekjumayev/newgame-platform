-- "Ochiq vaqt": operator joyida ochadi, tugash vaqti oldindan noma'lum — operator to'xtatguncha davom etadi.
-- is_open = true bo'lganda end_at vaqtinchalik chegara (klub yopilishi / 12 soat / shu joydagi keyingi bron),
-- total_amount esa 0 — to'xtatilganda haqiqiy tugash vaqti va summa yoziladi, is_open false bo'ladi.
ALTER TABLE "bookings" ADD COLUMN "is_open" BOOLEAN NOT NULL DEFAULT false;
