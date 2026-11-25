import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Anton, Inter, Oswald } from "next/font/google";
import "./globals.css";
import { GoogleAnalytics } from "@/components/analytics";
import { Header } from "@/components/header";
import { SiteFooter } from "@/components/site-footer";
import { Providers } from "./providers";

// Shriftlar — template/design.html: Anton (sarlavhalar, faqat 400) + Inter (matn).
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "cyrillic"],
});

// adjustFontFallback o'chirilgan: aks holda avtomatik "Arial fallback" kirill harflarni Oswald'dan oldin ushlab qoladi
const anton = Anton({
  variable: "--font-anton",
  subsets: ["latin", "latin-ext"],
  weight: "400",
  adjustFontFallback: false,
});

// Anton'da kirill yo'q — ruscha sarlavhalar uchun (faqat kerak bo'lganda yuklanadi)
const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["cyrillic"],
  weight: "700",
  preload: false,
  adjustFontFallback: false,
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:4910";
const DESCRIPTION =
  "Toshkent va butun O'zbekiston bo'ylab kompyuter klublari, PlayStation va VR zallarini toping: bo'sh joylar, narxlar, reyting va onlayn bron bir joyda.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Zonup — kompyuter klub va PlayStation zallarini onlayn bron qiling", template: "%s · Zonup" },
  description: DESCRIPTION,
  keywords: ["Zonup", "zonup.uz", "kompyuter klub", "game club", "PlayStation", "PS5", "VR", "kiberklub", "bron", "Toshkent", "компьютерный клуб", "игровой клуб", "бронирование"],
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: "Zonup", locale: "uz_UZ", url: "/", title: "Zonup", description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: "Zonup", description: DESCRIPTION },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0A0A0A",
  colorScheme: "dark",
};

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Zonup",
  url: SITE_URL,
  description: DESCRIPTION,
  potentialAction: { "@type": "SearchAction", target: `${SITE_URL}/clubs?q={query}`, "query-input": "required name=query" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // Telegram Mini App SDK hydration'dan oldin <html> ga --tg-viewport-* style qo'yadi
    <html
      suppressHydrationWarning
      lang="uz"
      className={`${inter.variable} ${anton.variable} ${oswald.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col pb-20 text-fg md:pb-0">
        {/* Sayt foni: setka + lime nur + don (uslublari globals.css → .gc-backdrop) */}
        <div aria-hidden className="gc-backdrop">
          <div className="gc-backdrop-grid" />
          <div className="gc-backdrop-glow gc-backdrop-glow--a" />
          <div className="gc-backdrop-glow gc-backdrop-glow--b" />
          <div className="gc-backdrop-grain" />
        </div>
        {/* Telegram Mini App SDK (oddiy brauzerda hech narsa qilmaydi) */}
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
        <GoogleAnalytics />
        <Providers>
          <Header />
          {children}
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
