"use client";

import { ArrowUpRight, Check, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { OpenBadge, PriceFrom } from "@/components/club-badges";
import { HeroArt } from "@/components/hero-art";
import { MapArt } from "@/components/map/map-art";
import { MapView } from "@/components/map/map-view";
import type { MapMarker } from "@/components/map/provider";
import { SocialPromoBanner } from "@/components/social";
import { Hl, TwoTone, buttonClass, cx } from "@/components/ui";
import { useI18n } from "@/i18n/provider";
import type { CatalogStats, ClubCard } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const WRAP = "mx-auto w-full max-w-[1280px] px-5 sm:px-8";
const H2 = "font-display text-[44px] uppercase leading-none sm:text-7xl lg:text-[96px]";
const PILL =
  "inline-flex min-h-11 shrink-0 items-center rounded-full border-2 px-3.5 text-sm font-bold whitespace-nowrap transition sm:min-h-[46px] sm:px-5 sm:text-base";
const PILL_OUTLINE = "border-fg text-fg hover:bg-fg hover:text-ink";

/** Klub kartalari navbat bilan: lime → oq → qora (lime hoshiya) — dizayndagi zona kartalari kabi. */
const TONES = [
  { card: "bg-accent text-on-accent", on: "accent" },
  { card: "bg-paper text-ink", on: "paper" },
  { card: "border-2 border-accent bg-surface text-fg", on: "dark" },
] as const;

/** Bosh sahifa — template/design.html: mobilda "ilova" ko'rinishi (qidiruv, xarita, klublar), desktopda landing. */
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
  // Lenta uzluksiz aylanishi uchun so'zlar bir necha marta takrorlanadi
  const words = useMemo(() => {
    const w = t("landing.marquee").split("|");
    return [...w, ...w, ...w];
  }, [t]);

  return (
    <main className="flex-1 overflow-x-clip">
      {/* HERO */}
      <section className={cx(WRAP, "pt-3 pb-8 sm:pt-10 sm:pb-[72px]")}>
        <p className="mb-6 hidden rounded-full border-2 border-accent px-[18px] py-2 text-sm font-bold tracking-[0.08em] text-accent uppercase sm:inline-block">{t("landing.badge")}</p>
        <div className="lg:flex lg:items-center lg:gap-8">
          <h1 className="font-display text-[clamp(64px,13.5vw,176px)] uppercase leading-[0.95] sm:leading-[0.92] lg:shrink-0">
            {/* Mobil: qisqa shior; desktop: to'liq sarlavha (ikkalasi ham dizayndan) */}
            <span className="sm:hidden">
              {t("landing.h1.m1")}
              <br />
              {t("landing.h1.m2")}
              <br />
              <Hl>{t("landing.h1.m3")}</Hl>
            </span>
            <span className="hidden sm:inline">
              {t("landing.h1.d1")}
              <br />
              {t("landing.h1.d2")}
              <br />
              <Hl>{t("landing.h1.d3")}</Hl>
            </span>
          </h1>
          {/* O'ng tomon: bron chiptasi kompozitsiyasi — sarlavhadan ortgan joy yetarli bo'lsagina (≥448px) */}
          <div className="@container hidden min-w-0 flex-1 lg:block">
            <HeroArt className="hidden @md:block" />
          </div>
        </div>

        <div className="mt-[18px] flex flex-wrap items-end gap-x-10 gap-y-6 sm:mt-12">
          <p className="hidden max-w-[520px] flex-[1_1_360px] text-[22px] leading-normal font-medium sm:block">{t("landing.subtitle")}</p>
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              router.push(q.trim() ? `/map?q=${encodeURIComponent(q.trim())}` : "/map");
            }}
            className="flex max-w-[640px] flex-[1_1_480px] items-center rounded-[14px] bg-paper p-1.5 focus-within:ring-4 focus-within:ring-accent/70 sm:p-2"
          >
            <label htmlFor="q" className="sr-only">
              {t("clubs.searchPlaceholder")}
            </label>
            <input
              id="q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("clubs.searchPlaceholder")}
              className="min-h-12 min-w-0 flex-1 bg-transparent px-3 text-[15px] font-semibold text-ink outline-none placeholder:text-ink-soft sm:min-h-14 sm:px-4 sm:text-lg"
            />
            <button type="submit" className="min-h-12 shrink-0 rounded-[10px] bg-accent px-4 font-bold text-on-accent uppercase transition hover:bg-accent-hover sm:min-h-14 sm:px-7 sm:text-[17px]">
              <span className="sm:hidden">{t("landing.searchShort")}</span>
              <span className="hidden sm:inline">{t("home.cta")}</span>
            </button>
          </form>
        </div>

        <div className="gc-noscroll -mx-5 mt-3.5 flex gap-2 overflow-x-auto px-5 sm:mx-0 sm:mt-7 sm:flex-wrap sm:gap-3 sm:px-0">
          <Link href="/map" className={cx(PILL, "border-accent bg-accent text-on-accent sm:border-fg sm:bg-transparent sm:text-fg sm:hover:bg-fg sm:hover:text-ink")}>
            {t("map.nearMe")}
          </Link>
          <a href="#clubs" className={cx(PILL, PILL_OUTLINE)}>
            {t("landing.newClubs")}
          </a>
          <a href="#zones" className={cx(PILL, PILL_OUTLINE)}>
            {t("landing.zones.short")}
          </a>
          <a href="#how" className={cx(PILL, PILL_OUTLINE)}>
            {t("home.how.title")}
          </a>
        </div>
      </section>

      {/* LENTA (desktop dizayn) */}
      <div aria-hidden className="hidden overflow-hidden py-9 sm:block">
        <div className="-mx-5 -rotate-[1.5deg] bg-accent py-3.5 font-display text-[32px] tracking-[0.04em] whitespace-nowrap text-on-accent uppercase">
          <div className="flex w-max animate-marquee">
            {[0, 1].map((half) => (
              <div key={half} className="flex shrink-0">
                {words.map((w, i) => (
                  <span key={i} className="flex items-center">
                    <span className="px-4">{w}</span>
                    <span>✦</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* XARITA */}
      <section id="map" className={cx(WRAP, "scroll-mt-24 sm:pt-12")}>
        <Link href="/map" aria-label={t("landing.openMap")} className="group relative block h-[150px] overflow-hidden rounded-[20px] bg-surface sm:h-[440px] sm:rounded-[32px]">
          <MapView className="pointer-events-none h-full" markers={markers} fit={fit} zoom={11} fallback={<MapArt />} />
          {!!all.data?.length && (
            <span className="absolute top-2.5 left-2.5 rounded-full bg-ink px-3 py-1.5 text-[13px] font-bold sm:top-5 sm:left-5 sm:px-4 sm:py-2 sm:text-base">{t("map.found", { n: all.data.length })}</span>
          )}
          <span className="absolute right-2.5 bottom-2.5 inline-flex min-h-11 items-center gap-1.5 rounded-[10px] bg-paper px-3.5 font-bold text-ink transition group-hover:bg-accent sm:right-5 sm:bottom-5 sm:min-h-14 sm:rounded-[14px] sm:px-7 sm:text-[17px] sm:uppercase">
            {t("landing.onMap")}
            <ArrowUpRight className="hidden h-5 w-5 sm:block" strokeWidth={2.6} />
          </span>
        </Link>
      </section>

      {/* KLUBLAR */}
      <section id="clubs" className={cx(WRAP, "scroll-mt-24 pt-4 sm:pt-24")}>
        <div className="mb-2.5 flex items-end justify-between gap-4 sm:mb-10">
          <h2 className="font-display text-[22px] uppercase leading-none sm:text-7xl lg:text-[96px]">
            <TwoTone text={t("landing.newClubs")} />
          </h2>
          <Link href="/map" className="shrink-0 text-[13px] font-bold text-accent hover:underline sm:text-lg">
            {t("home.top.all")} →
          </Link>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
          {latest.loading && [0, 1, 2].map((i) => <div key={i} className="h-[72px] animate-pulse rounded-[18px] bg-surface sm:h-[260px] sm:rounded-[24px]" />)}
          {!latest.loading && clubs.length === 0 && (
            <div className="col-span-full rounded-[18px] border-2 border-dashed border-line-strong px-5 py-10 text-center font-semibold text-muted sm:rounded-[24px] sm:py-16">{t("catalog.noneYet")}</div>
          )}
          {clubs.map((b, i) => (
            <ClubTile key={b.id} club={b} tone={TONES[i % TONES.length]} />
          ))}
        </div>
      </section>

      <div className={WRAP}>
        <SocialPromoBanner />
      </div>

      {/* RAQAMLAR */}
      <section className={cx(WRAP, "pt-10 sm:pt-16")}>
        <dl className="grid grid-cols-2 gap-2.5 sm:gap-5 lg:grid-cols-4">
          {[
            { value: stats.data ? stats.data.clubs : "—", label: t("landing.stat.clubs") },
            { value: stats.data ? stats.data.open_now : "—", label: t("home.stat.open") },
            { value: stats.data ? stats.data.cities : "—", label: t("landing.stat.cities") },
            { value: t("landing.stat.freeValue"), label: t("landing.stat.free") },
          ].map((s, i) => (
            <div key={s.label} className="flex flex-col-reverse rounded-[18px] bg-surface p-4 sm:rounded-[24px] sm:p-7">
              <dt className="mt-1 text-[13px] font-semibold text-muted sm:mt-2 sm:text-base">{s.label}</dt>
              <dd className={cx("truncate font-display text-[40px] uppercase leading-none tabular-nums sm:text-[72px]", i === 3 && "text-accent")}>{s.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ZONALAR */}
      <section id="zones" className={cx(WRAP, "scroll-mt-24 pt-14 sm:pt-24")}>
        <h2 className={cx(H2, "mb-6 sm:mb-10")}>
          <TwoTone text={t("landing.zones.title")} />
        </h2>
        <div className="grid gap-3 sm:gap-5 md:grid-cols-3">
          {(
            [
              { n: "01", k: "zone1", card: "bg-accent text-on-accent", num: "" },
              { n: "02", k: "zone2", card: "bg-paper text-ink", num: "" },
              { n: "03", k: "zone3", card: "border-2 border-accent bg-surface", num: "text-accent" },
            ] as const
          ).map((z) => (
            <div key={z.n} className={cx("flex min-h-[190px] flex-col justify-between rounded-[24px] p-6 sm:min-h-[260px] sm:p-8", z.card)}>
              <span className={cx("font-display text-[64px] leading-none sm:text-[96px]", z.num)}>{z.n}</span>
              <div>
                <div className="font-display text-[34px] uppercase leading-none sm:text-[44px]">{t(`landing.${z.k}`)}</div>
                <div className="mt-1.5 font-semibold">{t(`landing.${z.k}.text`)}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3 QADAM */}
      <section id="how" className={cx(WRAP, "scroll-mt-24 pt-14 sm:pt-[72px]")}>
        <h2 className={cx(H2, "mb-6 sm:mb-10")}>
          <TwoTone text={t("home.how.title")} />
        </h2>
        <ol className="grid gap-7 sm:gap-8 md:grid-cols-3">
          {(["landing.step1", "landing.step2", "landing.step3"] as const).map((k, i) => (
            <li key={k} className="border-t-[6px] border-accent pt-4 sm:pt-5">
              <div className="font-display text-[56px] leading-none text-accent sm:text-[64px]">{i + 1}</div>
              <div className="mt-1 mb-2 text-[22px] leading-tight font-bold sm:text-[26px]">{t(k)}</div>
              <p className="leading-normal text-soft sm:text-lg">{t(`${k}.text`)}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ONLAYN BRON — oq karta */}
      <section className={cx(WRAP, "pt-14 sm:pt-24")}>
        <div className="grid items-center gap-8 rounded-[24px] bg-paper p-6 text-ink sm:rounded-[32px] sm:p-14 lg:grid-cols-[1.25fr_1fr]">
          <div>
            <div className="text-[13px] font-bold tracking-[0.08em] uppercase">{t("landing.book.kicker")}</div>
            <h2 className="mt-3 font-display text-[40px] uppercase leading-none sm:text-[64px]">{t("landing.book.title")}</h2>
            <p className="mt-4 max-w-xl leading-normal font-medium text-ink-soft sm:text-lg">{t("landing.book.text")}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="#clubs" className={buttonClass("dark", "lg")}>
                {t("landing.book.cta")}
              </a>
              <Link href="/bookings" className="inline-flex min-h-14 items-center justify-center rounded-[14px] border-2 border-ink px-7 text-[17px] font-bold tracking-wide uppercase transition hover:bg-ink hover:text-fg">
                {t("landing.book.mine")}
              </Link>
            </div>
          </div>
          <ul className="grid gap-3">
            {(["landing.book.f1", "landing.book.f2", "landing.book.f3"] as const).map((k) => (
              <li key={k} className="flex items-center gap-4 rounded-[18px] bg-ink p-4 text-fg sm:p-5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-accent text-on-accent">
                  <Check className="h-5 w-5" strokeWidth={3.2} />
                </span>
                <span className="font-bold">{t(k)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className={cx(WRAP, "scroll-mt-24 pt-14 sm:pt-24")}>
        <h2 className={cx(H2, "mb-6 sm:mb-10")}>
          <TwoTone text={t("landing.faq.title")} />
        </h2>
        <div className="grid max-w-4xl gap-3">
          {([1, 2, 3, 4] as const).map((n) => (
            <details key={n} className="group rounded-[18px] border-2 border-line bg-surface px-5 open:border-accent">
              <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-3 text-[17px] font-bold sm:text-lg [&::-webkit-details-marker]:hidden">
                {t(`landing.faq.q${n}`)}
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-fg text-ink transition group-open:rotate-180 group-open:bg-accent">
                  <ChevronDown className="h-5 w-5" strokeWidth={2.6} />
                </span>
              </summary>
              <p className="pb-5 leading-normal text-soft">{t(`landing.faq.a${n}`)}</p>
            </details>
          ))}
        </div>
      </section>

      {/* KLUB EGALARI UCHUN */}
      <section className={cx(WRAP, "pt-14 pb-12 sm:pt-[72px] sm:pb-14")}>
        <div className="flex flex-wrap items-center justify-between gap-8 rounded-[24px] bg-accent p-7 text-on-accent sm:rounded-[32px] sm:p-14">
          <h2 className="flex-[1_1_480px] font-display text-[44px] uppercase leading-none sm:text-[80px]">
            {t("landing.cta.line1")}
            <br />
            {t("landing.cta.line2")}
          </h2>
          <div className="flex flex-col gap-3">
            <Link href="/for-clubs" className="inline-flex min-h-16 items-center justify-center rounded-[14px] bg-ink px-9 text-lg font-bold text-fg uppercase transition hover:bg-surface-3">
              {t("landing.cta.button")}
            </Link>
            <span className="text-sm font-semibold">{t("home.owner.note")}</span>
          </div>
        </div>
      </section>
    </main>
  );
}

/** Klub kartasi: mobilda ixcham qator, desktopda katta karta (nomi Anton'da). */
function ClubTile({ club: b, tone }: { club: ClubCard; tone: (typeof TONES)[number] }) {
  const { t } = useI18n();
  const zones = b.zones.map((z) => z.name).join(" · ");
  return (
    <Link
      href={`/clubs/${b.id}`}
      className={cx(
        "group flex min-h-[72px] items-center justify-between gap-3 rounded-[18px] px-4 py-3 transition sm:min-h-[260px] sm:flex-col sm:items-stretch sm:justify-between sm:rounded-[24px] sm:p-8 sm:hover:-translate-y-1",
        tone.card,
      )}
    >
      <div className="hidden items-start gap-3 sm:flex">
        <OpenBadge open={b.is_open_now} on={tone.on} />
        <ArrowUpRight className="ml-auto h-9 w-9 shrink-0 transition group-hover:translate-x-1 group-hover:-translate-y-1" strokeWidth={2.4} />
      </div>
      <div className="min-w-0">
        <div className="truncate text-[17px] font-bold sm:line-clamp-2 sm:font-display sm:text-[44px] sm:leading-none sm:font-normal sm:whitespace-normal sm:uppercase">{b.name}</div>
        <div className="truncate text-[13px] font-semibold sm:mt-2 sm:text-base">{zones || b.address || b.city}</div>
        <div className="mt-1 hidden truncate sm:block">
          {zones && <span className="font-medium opacity-80">{b.address ?? b.city} · </span>}
          <PriceFrom club={b} />
        </div>
      </div>
      <span className="shrink-0 text-[13px] font-bold sm:hidden">{b.is_open_now === null ? <PriceFrom club={b} /> : b.is_open_now ? t("clubs.openNow") : t("clubs.closed")}</span>
    </Link>
  );
}
