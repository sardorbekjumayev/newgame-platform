import { z } from 'zod';

/** `.env` dagi bo'sh qiymat (`KEY=`) — berilmagan deb hisoblanadi. */
const optional = <T extends z.ZodTypeAny>(schema: T) => z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

/** Rate limit qoidasi `<limit>/<oyna_soniya>` (masalan `300/60`); bo'sh — standart qiymat. */
const rateLimit = (fallback: string) =>
  z.preprocess(
    (v) => (v === '' || v === undefined ? fallback : v),
    z
      .string()
      .regex(/^[1-9]\d*\/[1-9]\d*$/)
      .transform((v) => {
        const [limit, window_s] = v.split('/').map(Number);
        return { limit, window_s };
      }),
  );
export type RateLimitRule = { limit: number; window_s: number };

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4900),
  // Tinglanadigan manzil (prod: 127.0.0.1 — faqat Nginx orqali). Bo'sh — barcha interfeyslar.
  HOST: optional(z.string()),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),
  APP_TIMEZONE_DEFAULT: z.string().default('Asia/Tashkent'),
  // Mijoz sayti (Telegram botdagi "Saytda ochish" tugmasi; faqat https bo'lsa ko'rsatiladi)
  PUBLIC_WEB_URL: optional(z.string().url()),
  // Yuklangan fayllar (klub logotipi/rasmi) papkasi; nisbiy bo'lsa API ishga tushgan papkaga nisbatan
  STORAGE_DIR: z.preprocess((v) => (v === '' ? undefined : v), z.string().default('./storage')),
  // Yandex HTTP Geocoder (manzil qidiruvi / teskari geokodlash) — kalit faqat serverda, brauzerga chiqmaydi
  YANDEX_GEOCODER_KEY: optional(z.string()),
  // Telegram bot — login kodi (OTP) shu bot orqali yuboriladi. Token bo'lmasa dev'da qat'iy kod 000000.
  TELEGRAM_BOT_TOKEN: optional(z.string()),
  TELEGRAM_BOT_USERNAME: optional(z.string()),
  TELEGRAM_MODE: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['polling', 'webhook']).default('polling')),
  TELEGRAM_WEBHOOK_URL: optional(z.string().url()),
  TELEGRAM_WEBHOOK_SECRET: optional(z.string().min(16)),
  TELEGRAM_WEBAPP_URL: optional(z.string().url()), // Mini App (https, masalan https://zonup.uz) — bot menyu tugmasi /tg ga ochadi
  // Rate limit (docs/01-API.md §Rate limit): kalit — user id yoki IP, Redis'da (barcha instansiyalar uchun umumiy)
  RATE_LIMIT_GLOBAL: rateLimit('300/60'),
  RATE_LIMIT_PUBLIC: rateLimit('120/60'),
  RATE_LIMIT_WRITE: rateLimit('30/60'),
  RATE_LIMIT_SENSITIVE: rateLimit('20/300'),
  RATE_LIMIT_PROMO: rateLimit('10/600'),
  SUPER_ADMIN_EMAIL: z.string().email().optional(),
  SUPER_ADMIN_PASSWORD: z.string().min(8).optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    // Faqat kalit nomlari chiqariladi — qiymatlar (sirlar) log'ga tushmaydi.
    const keys = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid environment variables: ${keys}`);
  }
  return parsed.data;
}
