-- Klub logotipi va rasmi: operator klub sozlamalarida yuklaydi (bittadan). Fayl STORAGE_DIR ichida,
-- bu yerda nisbiy yo'l saqlanadi (masalan clubs/<club_id>/logo-<tasodifiy>.webp). null — yuklanmagan.
ALTER TABLE "clubs" ADD COLUMN "logo_path" TEXT,
                    ADD COLUMN "photo_path" TEXT;
