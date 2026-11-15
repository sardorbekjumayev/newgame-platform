"use client";

import { ArrowRight, Building2, CalendarCheck, CalendarClock, ChevronDown, Clock, LayoutGrid, Undo2, Gamepad2, Layers, LocateFixed, MapPin, Navigation, Radar, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { OpenBadge, PriceFrom } from "@/components/club-badges";
import { MapView } from "@/components/map/map-view";
import type { MapMarker } from "@/components/map/provider";
import { SocialPromoBanner } from "@/components/social";
import { useI18n } from "@/i18n/provider";
import type { CatalogStats, ClubCard } from "@/lib/types";
import { useApi } from "@/lib/use-api";

export default function Home() {
  const { t } = useI18n();
  const router = useRouter();
  const [q, setQ] = useState("");
  const latest = useApi<ClubCard[]>("/clubs/latest?limit=6");
  const all = useApi<ClubCard[]>("/clubs/map");
  const stats = useApi<CatalogStats>("/clubs/stats");
  const clubs = latest.data ?? [];

  const markers = useMemo<MapMarker[]>(() => (all.data ?? []).map((c) => ({ id: c.id, position: { lat: c.latitude, lng: c.longitude }, label: c.name })), [all.data]);
  const fit = useMemo(() => (all.data?.length ? all.data.map((c) => ({ lat: c.latitude, lng: c.longitude })) : undefined), [all.data]);

  return (
    <main className="flex-1">
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute -top-48 left-1/2 h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-accent/15 blur-[120px]" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-50 [background-image:linear-gradient(#1e212b_1px,transparent_1px),linear-gradient(90deg,#1e212b_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]"
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-14 pb-16 sm:px-8 lg:grid-cols-[1.15fr_1fr] lg:pt-20 lg:pb-24">
          <div className="space-y-7">
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3.5 py-1.5 text-[13px] font-bold text-accent">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
              </span>
              {t("landing.badge")}
            </span>
            <h1 className="font-display text-[40px] font-bold leading-[1.05] tracking-tight sm:text-6xl">
              {t("landing.title")} <span className="bg-gradient-to-r from-accent to-[#7dffb3] bg-clip-text text-transparent">{t("landing.titleAccent")}</span>
            </h1>
            <p className="max-w-xl text-lg text-muted">{t("landing.subtitle")}</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                router.push(q.trim() ? `/map?q=${encodeURIComponent(q.trim())}` : "/map");
              }}
              className="flex max-w-xl items-center gap-2 rounded-2xl border border-line bg-surface p-2 shadow-[0_20px_60px_-20px_rgba(198,255,61,0.25)] focus-within:border-accent"
            >
              <Search className="ml-2 h-5 w-5 shrink-0 text-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("home.searchPlaceholder")} className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted" />
              <button type="submit" className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-bold text-on-accent transition hover:bg-accent-hover">
                <span className="hidden sm:inline">{t("home.cta")}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
            <div className="flex flex-wrap gap-2">
              <Link href="/map" className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-3.5 py-2 text-sm font-bold text-accent transition hover:bg-accent/20">
                <LocateFixed className="h-4 w-4" />
                {t("map.nearMe")}
              </Link>
              <a href="#clubs" className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/60 px-3.5 py-2 text-sm font-semibold transition hover:border-accent/60 hover:text-accent">
                <Gamepad2 className="h-4 w-4" />
                {t("landing.newClubs")}
              </a>
              <a href="#how" className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/60 px-3.5 py-2 text-sm font-semibold transition hover:border-accent/60 hover:text-accent">
                {t("home.how.title")}
              </a>
            </div>
          </div>

          {/* Jonli karta — haqiqiy klublar */}
          <div className="relative hidden lg:block">
            <div aria-hidden className="absolute -inset-6 rounded-[32px] bg-gradient-to-br from-accent/20 to-transparent blur-2xl" />
            <div className="relative space-y-3 rounded-[28px] border border-line bg-surface/90 p-5 backdrop-blur">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold">
                  <Radar className="h-5 w-5 text-accent" />
                  {t("landing.liveTitle")}
                </div>
                <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-bold text-accent">LIVE</span>
              </div>
              {latest.loading
                ? [0, 1, 2].map((i) => <div key={i} className="h-[68px] animate-pulse rounded-2xl bg-surface-2" />)
                : clubs.slice(0, 3).map((b) => (
                    <Link key={b.id} href={`/clubs/${b.id}`} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3 transition hover:bg-surface-3">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-3 text-accent">
                        <Gamepad2 className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-bold">{b.name}</div>
                        <div className="truncate text-xs text-muted">{b.address ?? b.city}</div>
                      </div>
                      <OpenBadge open={b.is_open_now} />
                    </Link>
                  ))}
              {!latest.loading && clubs.length === 0 && <p className="py-6 text-center text-sm text-muted">{t("catalog.noneYet")}</p>}
              <Link href="/map" className="flex items-center justify-center gap-1.5 pt-1 text-sm font-bold text-accent hover:underline">
                {t("landing.openMap")}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 sm:px-8">
        <SocialPromoBanner />

        {/* STATISTIKA */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { icon: Building2, value: stats.data ? stats.data.clubs : "—", label: t("landing.stat.clubs") },
            { icon: Clock, value: stats.data ? stats.data.open_now : "—", label: t("home.stat.open") },
            { icon: MapPin, value: stats.data ? stats.data.cities : "—", label: t("landing.stat.cities") },
            { icon: Layers, value: t("landing.stat.freeValue"), label: t("landing.stat.free") },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-line-soft bg-surface p-5">
              <s.icon className="h-5 w-5 text-accent" />
              <div className="mt-3 font-display text-3xl font-bold tabular-nums">{s.value}</div>
              <div className="text-sm text-muted">{s.label}</div>
            </div>
          ))}
        </section>

        {/* XARITA */}
        <section className="mt-20 grid items-center gap-8 lg:grid-cols-[1fr_1.3fr]">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 text-sm font-bold text-accent">
              <Navigation className="h-4 w-4" />
              {t("landing.map.kicker")}
            </div>
            <h2 className="font-display text-3xl font-bold sm:text-4xl">{t("landing.map.title")}</h2>
            <p className="text-muted">{t("landing.map.text")}</p>
            <ul className="space-y-2 text-sm">
              {(["landing.map.f1", "landing.map.f2", "landing.map.f3"] as const).map((k) => (
                <li key={k} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  {t(k)}
                </li>
              ))}
            </ul>
            <Link href="/map" className="inline-flex h-12 items-center gap-2 rounded-xl bg-accent px-6 font-bold text-on-accent transition hover:bg-accent-hover">
              <LocateFixed className="h-5 w-5" />
              {t("landing.map.cta")}
            </Link>
          </div>
          <Link href="/map" className="group relative block overflow-hidden rounded-[24px] border border-line-soft" aria-label={t("landing.map.cta")}>
            <MapView className="pointer-events-none h-[360px]" markers={markers} fit={fit} zoom={11} />
            <span className="absolute inset-0 bg-gradient-to-t from-bg/70 via-transparent to-transparent" />
            <span className="absolute bottom-4 left-4 inline-flex items-center gap-2 rounded-full bg-bg/90 px-4 py-2 text-sm font-bold backdrop-blur transition group-hover:text-accent">
              <MapPin className="h-4 w-4 text-accent" />
              {t("map.found", { n: all.data?.length ?? 0 })}
            </span>
          </Link>
        </section>

        {/* YANGI KLUBLAR */}
        <section id="clubs" className="mt-24 scroll-mt-24 space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 text-sm font-bold text-accent">
                <Sparkles className="h-4 w-4" />
                {t("landing.newClubs")}
              </div>
              <h2 className="font-display text-3xl font-bold sm:text-4xl">{t("landing.clubs.title")}</h2>
            </div>
            <Link href="/map" className="inline-flex items-center gap-1.5 text-sm font-bold text-accent hover:underline">
              {t("home.top.all")} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {latest.loading && [0, 1, 2].map((i) => <div key={i} className="h-48 animate-pulse rounded-[20px] bg-surface" />)}
            {!latest.loading && clubs.length === 0 && <div className="col-span-full rounded-2xl border border-dashed border-line py-12 text-center text-muted">{t("catalog.noneYet")}</div>}
            {clubs.map((b) => (
              <Link key={b.id} href={`/clubs/${b.id}`} className="group flex flex-col gap-3 rounded-[20px] border border-line-soft bg-surface p-5 transition hover:-translate-y-1 hover:border-accent/40">
                <div className="flex items-start justify-between gap-2">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-surface-3 to-accent/25 text-accent">
                    <Gamepad2 className="h-6 w-6" />
                  </span>
                  <OpenBadge open={b.is_open_now} />
                </div>
                <div>
                  <div className="font-display text-lg font-bold">{b.name}</div>
                  <div className="flex items-center gap-1.5 text-sm text-muted">
                    <MapPin className="h-4 w-4 shrink-0" />
                    <span className="truncate">{b.address ?? b.city}</span>
                  </div>
                </div>
                {b.zones.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {b.zones.map((z) => (
                      <span key={z.name} className="rounded-lg bg-surface-2 px-2 py-0.5 text-xs font-semibold" style={{ color: z.color ?? undefined }}>
                        {z.name}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-auto border-t border-line-soft pt-3 text-sm">
                  <PriceFrom club={b} />
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* ONLAYN BRON */}
        <section className="mt-24 grid items-center gap-8 overflow-hidden rounded-[28px] border border-line-soft bg-surface p-6 sm:p-10 lg:grid-cols-[1.1fr_1fr]">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 text-sm font-bold text-accent">
              <CalendarCheck className="h-4 w-4" />
              {t("landing.book.kicker")}
            </div>
            <h2 className="font-display text-3xl font-bold sm:text-4xl">{t("landing.book.title")}</h2>
            <p className="text-muted">{t("landing.book.text")}</p>
            <div className="flex flex-wrap gap-3 pt-2">
              <a href="#clubs" className="inline-flex h-12 items-center gap-2 rounded-xl bg-accent px-6 font-bold text-on-accent transition hover:bg-accent-hover">
                <Gamepad2 className="h-5 w-5" />
                {t("landing.book.cta")}
              </a>
              <Link href="/bookings" className="inline-flex h-12 items-center gap-2 rounded-xl border border-line px-6 font-bold transition hover:border-accent/60 hover:text-accent">
                {t("landing.book.mine")}
              </Link>
            </div>
          </div>
          <ul className="grid gap-3">
            {[
              { icon: CalendarClock, text: t("landing.book.f1") },
              { icon: LayoutGrid, text: t("landing.book.f2") },
              { icon: Undo2, text: t("landing.book.f3") },
            ].map((f) => (
              <li key={f.text} className="flex items-center gap-4 rounded-2xl bg-surface-2 p-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
                  <f.icon className="h-5 w-5" />
                </span>
                <span className="font-semibold">{f.text}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* QANDAY ISHLAYDI */}
        <section id="how" className="mt-24 scroll-mt-24 space-y-8">
          <div className="text-center">
            <h2 className="font-display text-3xl font-bold sm:text-4xl">{t("home.how.title")}</h2>
            <p className="mx-auto mt-2 max-w-lg text-muted">{t("landing.how.subtitle")}</p>
          </div>
          <ol className="grid gap-4 md:grid-cols-3">
            {[
              { icon: LocateFixed, title: t("landing.step1"), text: t("landing.step1.text") },
              { icon: Layers, title: t("landing.step2"), text: t("landing.step2.text") },
              { icon: CalendarCheck, title: t("landing.step3"), text: t("landing.step3.text") },
            ].map((s, i) => (
              <li key={s.title} className="relative overflow-hidden rounded-[20px] border border-line-soft bg-surface p-6">
                <span className="absolute right-4 top-2 font-display text-7xl font-bold text-surface-3">{i + 1}</span>
                <span className="relative grid h-12 w-12 place-items-center rounded-2xl bg-accent text-on-accent">
                  <s.icon className="h-6 w-6" />
                </span>
                <div className="relative mt-5 text-lg font-bold">{s.title}</div>
                <p className="relative mt-1.5 text-sm text-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* FAQ */}
        <section id="faq" className="mt-24 scroll-mt-24 space-y-6">
          <h2 className="text-center font-display text-3xl font-bold sm:text-4xl">{t("landing.faq.title")}</h2>
          <div className="mx-auto max-w-3xl space-y-3">
            {([1, 2, 3, 4] as const).map((n) => (
              <details key={n} className="group rounded-2xl border border-line-soft bg-surface px-5 open:border-accent/40">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-bold [&::-webkit-details-marker]:hidden">
                  {t(`landing.faq.q${n}`)}
                  <ChevronDown className="h-5 w-5 shrink-0 text-muted transition group-open:rotate-180 group-open:text-accent" />
                </summary>
                <p className="pb-4 text-sm text-muted">{t(`landing.faq.a${n}`)}</p>
              </details>
            ))}
          </div>
        </section>

        {/* KLUB EGALARI UCHUN */}
        <section className="relative mt-24 mb-20 overflow-hidden rounded-[28px] bg-accent p-8 text-on-accent sm:p-12">
          <div aria-hidden className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/25 blur-3xl" />
          <div className="relative grid items-center gap-8 md:grid-cols-[1.5fr_1fr]">
            <div className="space-y-4">
              <span className="inline-flex items-center gap-2 rounded-full bg-on-accent/10 px-3 py-1 text-sm font-bold">
                <Sparkles className="h-4 w-4" />
                {t("home.owner.kicker")}
              </span>
              <h2 className="font-display text-3xl font-bold leading-tight sm:text-4xl">{t("landing.owner.title")}</h2>
              <p className="max-w-lg font-semibold opacity-75">{t("landing.owner.text")}</p>
            </div>
            <div className="flex flex-col gap-3 md:items-end">
              <Link href="/for-clubs" className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-on-accent px-7 font-bold text-accent transition hover:scale-[1.02]">
                <Building2 className="h-5 w-5" />
                {t("home.owner.cta")}
              </Link>
              <span className="text-sm font-semibold opacity-70">{t("home.owner.note")}</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
