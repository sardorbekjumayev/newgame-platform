/**
 * GA4 hodisasi (GA ulanmagan bo'lsa — hech narsa qilmaydi). Parametrlarga shaxsiy ma'lumot
 * (telefon, ism, bron kodi) qo'ymang — faqat ID va sonlar.
 */
export function track(event: string, params?: Record<string, string | number | boolean>) {
  if (typeof window === "undefined") return;
  const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
  if (typeof gtag === "function") gtag("event", event, params);
}
