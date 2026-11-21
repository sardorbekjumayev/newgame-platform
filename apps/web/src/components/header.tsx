"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Logo, cx } from "@/components/ui";
import { useI18n } from "@/i18n/provider";
import { useAuth } from "@/lib/session";

/** Klub va bron sahifalari mobilda "ilova ekrani": o'z "orqaga" tugmasi va pastki BRON paneli bor. */
export const isImmersive = (pathname: string) => /^\/clubs\/[^/]+(\/book)?\/?$/.test(pathname);

const subscribeScroll = (cb: () => void) => {
  window.addEventListener("scroll", cb, { passive: true });
  return () => window.removeEventListener("scroll", cb);
};

export function Header() {
  const { t } = useI18n();
  // Tepada shaffof — fon (setka, nur) uzilmasdan ko'rinadi; surilganda kontent ustida o'qilishi uchun qorayadi
  const scrolled = useSyncExternalStore(subscribeScroll, () => window.scrollY > 8, () => false);
  const { me, loading } = useAuth();
  const pathname = usePathname();
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const immersive = isImmersive(pathname);

  const links = [
    { href: "/map", label: t("nav.map") },
    { href: "/bookings", label: t("nav.bookings") },
    { href: "/for-clubs", label: t("nav.forClubs") },
  ];

  // Pastki menyu (dizayn: faqat matn, faoli lime)
  const tabs = [
    { href: "/", label: t("nav.homeShort") },
    { href: "/map", label: t("nav.map") },
    { href: "/bookings", label: t("nav.bookings") },
    me ? { href: "/profile", label: t("nav.profile") } : { href: "/login", label: t("nav.login") },
  ];

  return (
    <>
      <header className={cx("sticky top-0 z-30 transition-colors duration-300", scrolled && "bg-bg/85 backdrop-blur-md", immersive && "hidden md:block")}>
        <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between gap-3 px-5 sm:h-[76px] sm:px-8">
          <Link href="/" aria-label={t("app.title")} className="shrink-0">
            <Logo />
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
            <nav className="hidden items-center md:flex">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={active(l.href) ? "page" : undefined}
                  className={cx("rounded-[10px] px-4 py-3 font-semibold transition hover:text-accent", active(l.href) && "text-accent")}
                >
                  {l.label}
                </Link>
              ))}
            </nav>
            <LocaleSwitcher />
            {!loading &&
              (me ? (
                <Link
                  href="/profile"
                  className="hidden min-h-12 items-center gap-2 rounded-[10px] border-2 border-fg py-1 pr-4 pl-1.5 font-bold transition hover:bg-fg hover:text-ink md:inline-flex"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-md bg-accent text-on-accent">{(me.first_name || "?").slice(0, 1).toUpperCase()}</span>
                  <span className="max-w-32 truncate">{me.first_name || t("nav.profile")}</span>
                </Link>
              ) : pathname === "/login" ? null : (
                <Link
                  href="/login"
                  data-hide-in-tg
                  className="hidden min-h-12 items-center rounded-[10px] bg-accent px-6 font-bold text-on-accent transition hover:bg-accent-hover active:translate-y-px md:inline-flex"
                >
                  {t("nav.login")}
                </Link>
              ))}
          </div>
        </div>
      </header>

      {/* Mobil pastki navigatsiya */}
      {!immersive && (
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-line bg-nav pb-[env(safe-area-inset-bottom)] md:hidden">
          <div className="flex justify-around px-1 pt-2 pb-2">
            {tabs.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active(tab.href) ? "page" : undefined}
                className={cx("flex min-h-11 min-w-0 items-center px-3 text-[13px] font-bold", active(tab.href) ? "text-accent" : "text-fg")}
              >
                <span className="truncate">{tab.label}</span>
              </Link>
            ))}
          </div>
        </nav>
      )}
    </>
  );
}
