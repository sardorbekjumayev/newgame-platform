import Script from "next/script";

/** GA4 o'lchov ID (G-XXXXXXX). `.env.local` → NEXT_PUBLIC_GA_ID; bo'sh bo'lsa hech narsa yuklanmaydi. Build paytida yoziladi. */
const GA_ID = process.env.NEXT_PUBLIC_GA_ID?.trim();

/**
 * Google Analytics 4 (gtag.js). Skript sahifa interaktiv bo'lgach Google serveridan yuklanadi va hodisalar
 * brauzerdan to'g'ridan-to'g'ri Google'ga ketadi — bizning API/serverga qo'shimcha so'rov yo'q.
 * Sahifalararo o'tishlarni GA4 o'zi kuzatadi: GA → Data streams → Enhanced measurement → "Page changes based on
 * browser history events" yoqilgan bo'lsin (standart). `page_location` ni config'da qotirmang — keyingi o'tishlar ham
 * shu manzil bilan yozilib qoladi. GA4 URL'ning `#` qismini o'zi tashlaydi (Telegram `#tgWebAppData=...` ketmaydi).
 */
export function GoogleAnalytics() {
  if (!GA_ID || !/^G-[A-Z0-9]+$/.test(GA_ID)) return null;
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
      <Script id="ga-init" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${GA_ID}');`}
      </Script>
    </>
  );
}
