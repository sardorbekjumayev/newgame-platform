"use client";

import { Building2, CalendarDays, CalendarPlus, Clock, CreditCard, Package, Eye, Handshake, LayoutDashboard, LayoutGrid, Layers, LogOut, type LucideIcon, MapPinned, Menu, UserMinus, Users, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ForcePasswordChange } from "@/components/force-password";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Alert, Button, Logo, Spinner, cx } from "@/components/ui";
import { type MessageKey, useI18n } from "@/i18n/provider";
import { fmtPublicId } from "@/lib/format";
import { HOME, type PanelKind, panelOf, panelOfPath } from "@/lib/roles";
import { useAuth } from "@/lib/session";
import { useApi } from "@/lib/use-api";

type NavItem = { href: string; label: MessageKey; icon: LucideIcon; exact?: boolean; badge?: number };

const NAV: Record<PanelKind, NavItem[]> = {
  platform: [
    { href: "/platform", label: "nav.dashboard", icon: LayoutDashboard, exact: true },
    { href: "/platform/applications", label: "nav.applications", icon: Handshake },
    { href: "/platform/clubs", label: "nav.clubs", icon: Building2 },
    { href: "/platform/subscriptions", label: "nav.subscriptions", icon: CreditCard },
    { href: "/platform/plans", label: "nav.plans", icon: Package },
    { href: "/platform/managers", label: "nav.managers", icon: Users },
    { href: "/platform/removals", label: "nav.removals", icon: UserMinus },
  ],
  operator: [
    { href: "/operator", label: "nav.myClub", icon: Building2, exact: true },
    { href: "/operator/walk-in", label: "nav.walkIn", icon: CalendarPlus },
    { href: "/operator/bookings", label: "nav.bookings", icon: CalendarDays },
    { href: "/operator/zones", label: "nav.zones", icon: Layers },
    { href: "/operator/layout", label: "nav.layout", icon: LayoutGrid },
    { href: "/operator/hours", label: "nav.hours", icon: Clock },
    { href: "/operator/managers", label: "nav.managers", icon: Eye },
    { href: "/operator/location", label: "nav.clubSettings", icon: MapPinned },
  ],
  manager: [{ href: "/manager", label: "nav.myClubs", icon: Eye, exact: true }],
};

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const { me, loading, signOut } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panel = panelOf(me);
  // Super admin: yangi arizalar badge'i (har sahifa o'tishida yangilanadi)
  const stats = useApi<{ applications_new: number; removals_pending: number; subscription_alerts: number }>(panel === "platform" && !me?.must_change_password ? `/admin/stats?_=${pathname}` : null);

  useEffect(() => {
    if (!loading && !me) router.replace("/login");
  }, [loading, me, router]);

  useEffect(() => {
    // Boshqa rol paneli yo'li ochilsa — o'z bosh sahifasiga
    const owner = panelOfPath(pathname);
    if (panel && owner && owner !== panel) router.replace(HOME[panel]);
  }, [panel, pathname, router]);

  if (loading || !me) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (me.must_change_password) return <ForcePasswordChange />;
  if (!panel) {
    return (
      <main className="mx-auto flex max-w-md flex-1 flex-col justify-center gap-4 px-4">
        <Alert tone="info">{t("auth.noAccess")}</Alert>
        <Button variant="secondary" onClick={signOut}>
          {t("auth.logout")}
        </Button>
      </main>
    );
  }

  const badges: Record<string, number | undefined> = { "/platform/applications": stats.data?.applications_new, "/platform/removals": stats.data?.removals_pending, "/platform/subscriptions": stats.data?.subscription_alerts };
  const items = NAV[panel].map((i) => (badges[i.href] ? { ...i, badge: badges[i.href] } : i));
  const name = [me.first_name, me.last_name].filter(Boolean).join(" ") || me.username || me.email;
  const isActive = (i: NavItem) => (i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(`${i.href}/`));
  const logout = async () => {
    await signOut();
    router.replace("/login");
  };

  return (
    <div className="flex min-h-screen flex-1">
      <aside
        className={cx(
          "fixed inset-y-0 left-0 z-30 flex w-[248px] flex-col border-r border-line-soft bg-bg px-3 py-5 transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-3 pb-2">
          <Logo className="text-xl" />
          <button className="text-muted hover:text-fg md:hidden" onClick={() => setOpen(false)} aria-label={t("common.close")}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mx-3 mb-4 inline-flex w-fit items-center rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest text-accent">
          {t(`role.${panel === "platform" ? "SUPER_ADMIN" : panel === "operator" ? "OPERATOR" : "MANAGER"}` as MessageKey)}
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto">
          {items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              onClick={() => setOpen(false)}
              className={cx(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] transition",
                isActive(i) ? "bg-accent/10 font-bold text-accent" : "font-semibold text-muted hover:bg-surface hover:text-fg",
              )}
            >
              <i.icon className="h-[18px] w-[18px] shrink-0" />
              <span className="min-w-0 flex-1 truncate">{t(i.label)}</span>
              {(i.badge ?? 0) > 0 && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-on-accent">{i.badge! > 99 ? "99+" : i.badge}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-line-soft bg-surface px-3 py-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-3 font-bold text-accent">{(name ?? "?").slice(0, 1).toUpperCase()}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold">{name}</div>
            <div className="truncate text-xs text-muted">
              {me.public_id ? `ID ${fmtPublicId(me.public_id)}` : me.username}
            </div>
          </div>
          <button className="text-muted transition hover:text-danger-soft" title={t("auth.logout")} aria-label={t("auth.logout")} onClick={logout}>
            <LogOut className="h-[18px] w-[18px]" />
          </button>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-20 bg-black/60 md:hidden" onClick={() => setOpen(false)} />}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-3 border-b border-line-soft bg-bg/85 px-4 backdrop-blur md:px-8">
          <button className="rounded-lg p-2 text-muted hover:text-fg md:hidden" onClick={() => setOpen(true)} aria-label={t("common.menu")}>
            <Menu className="h-5 w-5" />
          </button>
          <div className="ml-auto flex items-center gap-3">
            <LocaleSwitcher />
          </div>
        </header>
        <main className="flex-1 px-4 py-6 md:px-8 md:py-7">{children}</main>
      </div>
    </div>
  );
}
