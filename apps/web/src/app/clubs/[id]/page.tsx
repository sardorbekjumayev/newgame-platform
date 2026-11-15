"use client";

import { formatMoney } from "@ng/types";
import { ArrowLeft, Clock, LayoutGrid, MapPin, Monitor, Navigation, Package, Phone, Timer } from "lucide-react";
import Link from "next/link";
import { use, useState } from "react";
import { OpenBadge, PriceFrom } from "@/components/club-badges";
import { ShareClub } from "@/components/share-club";
import { ZoneLayoutView } from "@/components/zone-layout-view";
import { BookingWidget } from "@/components/booking-widget";
import { MapView } from "@/components/map/map-view";
import { Card, Modal, Spinner, cx } from "@/components/ui";
import { type MessageKey, useI18n } from "@/i18n/provider";
import type { ClubDetailPublic, PublicTariff, PublicZone, WorkingHoursPublic } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
/** Toshkent bo'yicha bugungi hafta kuni (DAYS indeksi). */
const todayIdx = () => {
  const wd = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", weekday: "short" }).format(new Date());
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(wd);
};

/** Ommaviy klub sahifasi: sarlavha → (chapda) narxlar, ish vaqti, xarita · (o'ngda) bron. */
export default function ClubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useI18n();
  const club = useApi<ClubDetailPublic>(`/clubs/${id}`);

  if (club.loading) return <Spinner className="mx-auto my-20 h-6 w-6" />;
  if (!club.data)
    return (
      <main className="mx-auto max-w-xl flex-1 px-4 py-20 text-center text-muted">
        <p>{club.error ?? t("catalog.notFound")}</p>
        <Link href="/map" className="mt-4 inline-block font-bold text-accent hover:underline">
          {t("nav.map")}
        </Link>
      </main>
    );

  const c = club.data;
  const pos = { lat: c.latitude, lng: c.longitude };
  const devices = c.zones.reduce((n, z) => n + (z.devices_count ?? 0), 0);
  const today = c.working_hours && !c.working_hours.always_open ? (c.working_hours[DAYS[todayIdx()]] ?? []) : null;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <Link href="/map" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" />
        {t("nav.map")}
      </Link>

      {/* Sarlavha */}
      <section className="relative overflow-hidden rounded-[24px] border border-line-soft bg-surface p-5 sm:p-7">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <OpenBadge open={c.is_open_now} />
              {c.zones.map((z) => (
                <span key={z.id} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold">
                  <span className="h-2 w-2 rounded-full" style={{ background: z.color ?? "#3a3f4b" }} />
                  {z.name}
                </span>
              ))}
            </div>
            <h1 className="font-display text-3xl font-bold sm:text-4xl">{c.name}</h1>
            <div className="flex items-start gap-1.5 text-sm text-muted">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
              {[c.address, c.city].filter(Boolean).join(" · ")}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <span className="inline-flex items-center gap-1.5">
                <Timer className="h-4 w-4 text-accent" />
                <PriceFrom club={c} />
              </span>
              {devices > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <Monitor className="h-4 w-4 text-accent" />
                  {t("catalog.devicesN", { n: devices })}
                </span>
              )}
              {(c.working_hours?.always_open || today) && (
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-accent" />
                  {c.working_hours?.always_open ? "24/7" : today!.length ? `${t("club.today")}: ${today!.map((w) => `${w.open}–${w.close}`).join(", ")}` : t("catalog.dayOff")}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <ShareClub clubId={c.id} clubName={c.name} />
            {c.phone && (
              <a href={`tel:${c.phone}`} className="inline-flex h-11 items-center gap-2 rounded-xl border border-line bg-bg px-4 text-sm font-semibold hover:border-accent/60">
                <Phone className="h-4 w-4" />
                {c.phone}
              </a>
            )}
            <a
              href={`https://yandex.uz/maps/?rtext=~${c.latitude},${c.longitude}&rtt=auto`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-bold text-on-accent hover:bg-accent-hover"
            >
              <Navigation className="h-4 w-4" />
              {t("catalog.route")}
            </a>
          </div>
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
        {/* Bron — mobilda birinchi */}
        <div id="book" className="min-w-0 scroll-mt-24 lg:order-2">
          <BookingWidget clubId={c.id} />
        </div>

        <div className="min-w-0 space-y-6 lg:order-1">
          <section className="space-y-3">
            <h2 className="font-display text-2xl font-bold">{t("club.pricesTitle")}</h2>
            {c.zones.length === 0 && <Card className="py-8 text-center text-muted">{t("catalog.noZones")}</Card>}
            {c.zones.map((z) => (
              <ZonePrices key={z.id} z={z} />
            ))}
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <Card className="space-y-3">
              <div className="flex items-center gap-2 font-bold">
                <Clock className="h-4 w-4 text-accent" />
                {t("catalog.hoursTitle")}
              </div>
              <HoursTable wh={c.working_hours} />
            </Card>
            <MapView className="h-full min-h-64 rounded-2xl" center={pos} zoom={16} markers={[{ id: c.id, position: pos, label: c.name, active: true }]} />
          </section>
        </div>
      </div>
    </main>
  );
}

/** Zona narxlari: soatbay va paketlar alohida; paketda soatiga narx va tejash foizi. */
function ZonePrices({ z }: { z: PublicZone }) {
  const { t, locale } = useI18n();
  const [layout, setLayout] = useState(false);
  const hourly = z.tariffs.filter((x) => x.type === "HOURLY").sort((a, b) => a.price - b.price);
  const packages = z.tariffs.filter((x) => x.type === "PACKAGE" && x.duration_minutes).sort((a, b) => a.duration_minutes! - b.duration_minutes!);
  // Taqqoslash uchun asosiy soatlik narx — vaqt cheklovisiz eng arzoni (yo'q bo'lsa — eng arzoni)
  const base = (hourly.find((x) => !x.valid_from) ?? hourly[0])?.price ?? null;

  return (
    <Card className="space-y-4 p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft p-4 sm:p-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: z.color ?? "#3a3f4b" }} />
          <div className="min-w-0">
            <div className="font-display text-lg font-bold">{z.name}</div>
            <div className="text-sm text-muted">{[z.devices_count ? t("catalog.devicesN", { n: z.devices_count }) : null, z.description].filter(Boolean).join(" · ")}</div>
          </div>
        </div>
        {z.layout && z.devices_count ? (
          <button onClick={() => setLayout(true)} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-semibold hover:border-accent/60">
            <LayoutGrid className="h-4 w-4 text-accent" />
            {t("catalog.layout")}
          </button>
        ) : null}
      </div>

      <div className="space-y-5 px-4 pb-4 sm:px-5 sm:pb-5">
        {z.tariffs.length === 0 && <p className="text-sm text-muted">{t("catalog.noTariffs")}</p>}

        {hourly.length > 0 && (
          <div className="space-y-2">
            <SubTitle icon={Timer}>{t("club.hourly")}</SubTitle>
            <ul className="divide-y divide-line-soft rounded-2xl bg-surface-2/60">
              {hourly.map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="font-semibold">{x.name}</div>
                    <Window x={x} />
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="font-display text-lg font-bold text-accent tabular-nums">{formatMoney(x.price, locale)}</span>
                    <span className="text-sm text-muted"> / {t("catalog.hour")}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {packages.length > 0 && (
          <div className="space-y-2">
            <SubTitle icon={Package}>{t("club.packages")}</SubTitle>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {packages.map((x) => {
                const h = x.duration_minutes! / 60;
                const perHour = Math.round(x.price / h);
                const save = base ? Math.round((1 - x.price / (base * h)) * 100) : 0;
                return (
                  <div key={x.id} className="relative rounded-2xl border border-line-soft bg-surface-2/60 p-4">
                    {save >= 5 && <span className="absolute right-3 top-3 rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-on-accent">−{save}%</span>}
                    <div className="font-display text-2xl font-bold">{x.duration_minutes! % 60 === 0 ? t("catalog.hours", { n: h }) : t("catalog.minutes", { n: x.duration_minutes! })}</div>
                    <div className="truncate text-xs text-muted">{x.name}</div>
                    <div className="mt-3 font-display text-xl font-bold text-accent tabular-nums">{formatMoney(x.price, locale)}</div>
                    <div className="text-xs text-muted">≈ {formatMoney(perHour, locale)} / {t("catalog.hour")}</div>
                    <Window x={x} />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {layout && z.layout && z.devices_count && (
        <Modal title={`${z.name} — ${t("catalog.layout")}`} onClose={() => setLayout(false)}>
          <ZoneLayoutView layout={z.layout} count={z.devices_count} decorLabel={(k) => t(`catalog.decor.${k}` as MessageKey)} />
        </Modal>
      )}
    </Card>
  );
}

function SubTitle({ icon: Icon, children }: { icon: typeof Timer; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-muted">
      <Icon className="h-3.5 w-3.5" />
      {children}
    </div>
  );
}

function Window({ x }: { x: PublicTariff }) {
  const { t } = useI18n();
  if (!x.valid_from) return null;
  return (
    <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-bg/60 px-1.5 py-0.5 text-[11px] font-semibold text-muted">
      <Clock className="h-3 w-3" />
      {t("club.onlyBetween", { from: x.valid_from, to: x.valid_to ?? "" })}
    </div>
  );
}

function HoursTable({ wh }: { wh: WorkingHoursPublic | null }) {
  const { t } = useI18n();
  const [today] = useState(todayIdx);
  if (!wh) return <p className="text-sm text-muted">{t("catalog.hoursUnknown")}</p>;
  if (wh.always_open) return <p className="font-semibold text-accent">{t("catalog.alwaysOpen")}</p>;
  return (
    <dl className="space-y-0.5 text-sm">
      {DAYS.map((d, i) => {
        const ws = wh[d] ?? [];
        return (
          <div key={d} className={cx("flex justify-between gap-4 rounded-lg px-2 py-1", i === today && "bg-accent/10 font-bold text-fg")}>
            <dt className={i === today ? "text-accent" : "text-muted"}>{t(`catalog.day.${d}` as MessageKey)}</dt>
            <dd className="font-semibold tabular-nums">{ws.length ? ws.map((w) => `${w.open}–${w.close}`).join(", ") : t("catalog.dayOff")}</dd>
          </div>
        );
      })}
    </dl>
  );
}
