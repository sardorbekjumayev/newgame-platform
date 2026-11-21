/** Ko'rsatish: filial vaqti Asia/Tashkent (docs: API UTC, UI filial timezone). */
const TZ = "Asia/Tashkent";

export const fmtTime = (iso: string, tz = TZ) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

type T = (k: never, v?: Record<string, string | number>) => string;

/**
 * "Pa, 1-okt" — hafta kuni va oy nomi i18n kalitlaridan (`wd.0..6`, `mon.1..12`):
 * brauzerda `uz` locale ma'lumoti bo'lmasligi mumkin.
 */
export function fmtDate(iso: string, t: T, tz = TZ) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "numeric" }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]),
  );
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return t("date.short" as never, { wd: t(`wd.${wd}` as never), d: p.day, mon: t(`mon.${p.month}` as never) });
}

/** Toshkent bo'yicha bugungi sana (YYYY-MM-DD) + n kun. */
export function tzDate(offsetDays = 0, tz = TZ) {
  const d = new Date(Date.now() + offsetDays * 86400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** ISO vaqtning Toshkent bo'yicha sanasi (YYYY-MM-DD). */
export const tzDateOf = (iso: string, tz = TZ) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

/** "Bugun" / "Ertaga" / "Pa, 1-okt". */
export function fmtDay(iso: string, t: T, tz = TZ) {
  const d = tzDateOf(iso, tz);
  return d === tzDate(0, tz) ? t("book.today" as never) : d === tzDate(1, tz) ? t("book.tomorrow" as never) : fmtDate(iso, t, tz);
}

/** "+998901234567" → "+998 90 123 45 67" (boshqa formatlar o'zgarishsiz). */
export const fmtPhone = (p: string) => p.replace(/^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/, "+998 $1 $2 $3 $4");

export const fmtDistance = (m: number | null, locale: string) =>
  m == null ? null : m < 1000 ? `${Math.round(m)} ${locale === "ru" ? "м" : "m"}` : `${(m / 1000).toFixed(1)} ${locale === "ru" ? "км" : "km"}`;

export const durationLabel = (min: number, t: (k: never, v?: Record<string, string | number>) => string) =>
  min % 60 === 0 ? t("book.hoursN" as never, { n: min / 60 }) : min < 60 ? t("book.minN" as never, { n: min }) : t("book.hMin" as never, { h: Math.floor(min / 60), m: min % 60 });

const LOCALE_TAG = { uz: "uz-UZ", ru: "ru-RU", en: "en-GB" } as const;
/** Sana va vaqt (Asia/Tashkent). */
export const fmtDateTimeTz = (iso: string, locale: keyof typeof LOCALE_TAG, tz = TZ) =>
  new Intl.DateTimeFormat(LOCALE_TAG[locale], { dateStyle: "medium", timeStyle: "short", timeZone: tz }).format(new Date(iso));
