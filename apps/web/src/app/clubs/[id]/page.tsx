"use client";

import { formatMoney } from "@ng/types";
import { ArrowLeft, Clock, Navigation, Phone } from "lucide-react";
import Link from "next/link";
import { use } from "react";
import { OpenBadge, PriceFrom } from "@/components/club-badges";
import { ShareClub } from "@/components/share-club";
import { ZoneLayoutView } from "@/components/zone-layout-view";
import { BookingWidget } from "@/components/booking-widget";
import { MapView } from "@/components/map/map-view";
import { Card, Spinner } from "@/components/ui";
import { type MessageKey, useI18n } from "@/i18n/provider";
import type { ClubDetailPublic, WorkingHoursPublic } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

/** Ommaviy klub sahifasi: manzil, xarita, zonalar va tariflar, ish vaqti. */
export default function ClubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, locale } = useI18n();
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
  const fmtDur = (m: number) => (m % 60 === 0 ? t("catalog.hours", { n: m / 60 }) : t("catalog.minutes", { n: m }));

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-8 sm:px-8">
      <Link href="/map" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" />
        {t("nav.map")}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="font-display text-3xl font-bold sm:text-4xl">{c.name}</h1>
          <div className="text-muted">{[c.address, c.city].filter(Boolean).join(" · ")}</div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <OpenBadge open={c.is_open_now} />
            <PriceFrom club={c} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ShareClub clubId={c.id} clubName={c.name} />
          {c.phone && (
            <a href={`tel:${c.phone}`} className="inline-flex h-11 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-semibold hover:border-accent/60">
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

      <BookingWidget clubId={c.id} />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="min-w-0 space-y-4">
          <h2 className="font-display text-2xl font-bold">{t("catalog.zonesTitle")}</h2>
          {c.zones.length === 0 && <Card className="py-8 text-center text-muted">{t("catalog.noZones")}</Card>}
          {c.zones.map((z) => (
            <Card key={z.id} className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="h-8 w-1.5 rounded-full" style={{ background: z.color ?? "#3a3f4b" }} />
                <div>
                  <div className="font-display text-lg font-bold">{z.name}</div>
                  <div className="text-sm text-muted">{[z.devices_count ? t("catalog.devicesN", { n: z.devices_count }) : null, z.description].filter(Boolean).join(" · ")}</div>
                </div>
              </div>
              {z.tariffs.length === 0 ? (
                <p className="text-sm text-muted">{t("catalog.noTariffs")}</p>
              ) : (
                <ul className="divide-y divide-line-soft">
                  {z.tariffs.map((x) => (
                    <li key={x.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div>
                        <div className="font-semibold">{x.name}</div>
                        <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                          {x.type === "PACKAGE" && x.duration_minutes && <span>{fmtDur(x.duration_minutes)}</span>}
                          {x.valid_from && (
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {x.valid_from}–{x.valid_to}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="font-display text-lg font-bold text-accent tabular-nums">
                        {formatMoney(x.price, locale)}
                        {x.type === "HOURLY" && <span className="text-sm font-semibold text-muted"> / {t("catalog.hour")}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {z.layout && z.devices_count ? (
                <details className="group">
                  <summary className="cursor-pointer select-none text-sm font-bold text-accent hover:underline">{t("catalog.layout")}</summary>
                  <div className="mt-3">
                    <ZoneLayoutView layout={z.layout} count={z.devices_count} decorLabel={(k) => t(`catalog.decor.${k}` as MessageKey)} />
                  </div>
                </details>
              ) : null}
            </Card>
          ))}
        </section>
        <aside className="space-y-4">
          <MapView className="h-72 rounded-2xl" center={pos} zoom={16} markers={[{ id: c.id, position: pos, label: c.name, active: true }]} />
          <Card className="space-y-2">
            <div className="flex items-center gap-2 font-bold">
              <Clock className="h-4 w-4 text-accent" />
              {t("catalog.hoursTitle")}
            </div>
            <HoursTable wh={c.working_hours} />
          </Card>
        </aside>
      </div>
    </main>
  );
}

function HoursTable({ wh }: { wh: WorkingHoursPublic | null }) {
  const { t } = useI18n();
  if (!wh) return <p className="text-sm text-muted">{t("catalog.hoursUnknown")}</p>;
  if (wh.always_open) return <p className="font-semibold text-accent">{t("catalog.alwaysOpen")}</p>;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
      {DAYS.map((d) => {
        const ws = wh[d] ?? [];
        return (
          <div key={d} className="contents">
            <dt className="text-muted">{t(`catalog.day.${d}` as MessageKey)}</dt>
            <dd className="text-right font-semibold tabular-nums">{ws.length ? ws.map((w) => `${w.open}–${w.close}`).join(", ") : t("catalog.dayOff")}</dd>
          </div>
        );
      })}
    </dl>
  );
}
