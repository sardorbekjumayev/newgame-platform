const LOCALE_TAG = { uz: "uz-UZ", ru: "ru-RU", en: "en-GB" } as const;

/** Sana/vaqt — Asia/Tashkent da ko'rsatiladi (DB va API UTC). */
export const fmtDateTime = (iso: string | null | undefined, locale: keyof typeof LOCALE_TAG) =>
  iso ? new Intl.DateTimeFormat(LOCALE_TAG[locale], { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tashkent" }).format(new Date(iso)) : "—";

/** 7 xonali User ID ni o'qish oson ko'rinishda: 482 71 93 */
export const fmtPublicId = (id: string | null | undefined) => (id && id.length === 7 ? `${id.slice(0, 3)} ${id.slice(3, 5)} ${id.slice(5)}` : (id ?? "—"));
