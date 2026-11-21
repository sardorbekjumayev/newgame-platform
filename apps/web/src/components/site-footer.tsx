"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isImmersive } from "@/components/header";
import { SocialLinks, useSocial } from "@/components/social";
import { useI18n } from "@/i18n/provider";
import { LEGAL_DOCS, LEGAL_LABEL } from "@/lib/legal";

/** Har sahifadagi footer: bo'limlar, ijtimoiy tarmoqlar va huquqiy hujjatlar. */
export function SiteFooter() {
  const { t } = useI18n();
  const social = useSocial();
  // Klub va bron sahifalari mobilda "ilova ekrani" — footer o'rnida pastki BRON paneli
  const immersive = isImmersive(usePathname());
  return (
    <footer className={`mt-auto border-t-2 border-line ${immersive ? "hidden md:block" : ""}`}>
      <div className="mx-auto flex max-w-[1280px] flex-col gap-6 px-5 py-10 text-sm text-muted sm:px-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2">
            <span className="font-display text-2xl leading-none text-fg">ZONUP</span>
            <span>{t("home.footer")}</span>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2 font-semibold text-fg">
            <Link href="/map" className="hover:text-accent">
              {t("nav.map")}
            </Link>
            <Link href="/bookings" className="hover:text-accent">
              {t("nav.bookings")}
            </Link>
            <Link href="/for-clubs" className="hover:text-accent">
              {t("nav.forClubs")}
            </Link>
          </nav>
          <SocialLinks social={social} size="sm" />
        </div>
        <div className="flex flex-col gap-3 border-t-2 border-line pt-5 text-xs sm:flex-row sm:items-center sm:justify-between">
          <span>
            © {new Date().getFullYear()} Zonup · <span className="font-semibold text-fg">zonup.uz</span>
          </span>
          <nav aria-label={t("legal.nav")} className="flex flex-wrap gap-x-5 gap-y-2">
            {LEGAL_DOCS.map((d) => (
              <Link key={d} href={`/legal/${d}`} className="hover:text-fg">
                {t(LEGAL_LABEL[d])}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
