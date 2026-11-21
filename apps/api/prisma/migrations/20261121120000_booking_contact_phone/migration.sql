-- Mijoz bron paytida ko'rsatgan aloqa raqami: operator shu raqamga qo'ng'iroq qiladi.
-- Akkaunt raqami Telegram orqali tasdiqlanadi va qo'ng'iroq qabul qilmasligi mumkin; NULL — akkaunt raqami ishlatiladi.
ALTER TABLE "bookings" ADD COLUMN "contact_phone" TEXT;
