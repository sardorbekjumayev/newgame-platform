"use client";

import { formatMoney } from "@ng/types";
import { Check, Clock, LayoutGrid, Navigation, Phone } from "lucide-react";
import Link from "next/link";
import { use, useState } from "react";
import { ClubLogo, OpenBadge, PriceFrom } from "@/components/club-badges";
import { MapArt } from "@/components/map/map-art";
import { MapView } from "@/components/map/map-view";
import { ShareClub } from "@/components/share-club";
import { BackButton, Card, Modal, Spinner, buttonClass, cx } from "@/components/ui";
import { ZoneLayoutView } from "@/components/zone-layout-view";
import { type MessageKey, useI18n } from "@/i18n/provider";
import { useAuth } from "@/lib/session";
import type { ClubDetailPublic, PublicTariff, PublicZone, WorkingHoursPublic } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
/** Toshkent bo'yicha bugungi hafta kuni (DAYS indeksi). */
const todayIdx = () => {
  const wd = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", weekday: "short" }).format(new Date());
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(wd);
};

const PILL = "inline-flex items-center gap-1.5 rounded-full border-2 border-fg px-3.5 py-1.5 text-[13px] font-bold whitespace-nowrap";

/**
 * Ommaviy klub sahifasi (template/design.html — "Mobil: klub sahifasi"): lime sarlavha → holat, manzil →
 * zonalar va narxlar → ish vaqti, xarita. Bron shu sahifada ochilmaydi: «BRON QILISH» tugmasi
 * `/clubs/:id/book` ga olib boradi (kirmagan bo'lsa — avval login).
 */
export default function ClubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useI18n();
  const club = useApi<ClubDetailPublic>(`/clubs/${id}`);

  if (club.loading) return <Spinner className="mx-auto my-24 h-7 w-7" />;
  if (!club.data)
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-5 px-5 py-20 text-center">
        <h1 className="font-display text-[44px] uppercase leading-none">{club.error ?? t("catalog.notFound")}</h1>
        <Link href="/map" className={buttonClass("primary", "lg")}>
          {t("nav.map")}
        </Link>
      </main>
    );

  const c = club.data;
  const pos = { lat: c.latitude, lng: c.longitude };
  const devices = c.zones.reduce((n, z) => n + (z.devices_count ?? 0), 0);
  const today = c.working_hours && !c.working_hours.always_open ? (c.working_hours[DAYS[todayIdx()]] ?? []) : null;
  // API bron konteksti bilan bir xil shart: tarifi va qurilmasi bor zona
  const bookable = c.zones.some((z) => z.tariffs.length > 0 && (z.devices_count ?? 0) > 0);
  const hoursText = c.working_hours?.always_open ? "24/7" : today ? (today.length ? today.map((w) => `${w.open}–${w.close}`).join(", ") : t("catalog.dayOff")) : null;

  return (
    <main className="mx-auto w-full max-w-[1280px] flex-1 pb-6 md:px-8 md:pt-2 md:pb-28 lg:pb-16">
      {/* Sarlavha: klub rasmi bo'lsa — rasm (pastdan qoraytirilgan, nom o'qilsin), bo'lmasa lime.
          `isolate`/z-index qo'ymang: ulashish oynasi shu yerda ochiladi va yangi stacking context uni yopishqoq bron kartasi ostida qoldiradi. */}
      <section
        className={cx(
          "relative flex flex-col justify-between gap-8 overflow-hidden p-5 md:rounded-[32px] md:p-10",
          c.photo_url ? "min-h-[320px] bg-surface text-fg md:min-h-[440px]" : "min-h-[200px] bg-accent text-on-accent md:min-h-[300px]",
        )}
      >
        {c.photo_url && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- API'dagi tayyor webp */}
            <img src={c.photo_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-linear-to-t from-black/90 via-black/35 to-black/10" />
          </>
        )}
        <div className="relative flex items-center justify-between gap-3">
          <BackButton href="/map" label={t("nav.map")} tone="light" />
          <ShareClub clubId={c.id} clubName={c.name} />
        </div>
        <div className="relative space-y-4">
          {c.logo_url && <ClubLogo url={c.logo_url} className="h-16 w-16 rounded-[16px]! md:h-24 md:w-24 md:rounded-[20px]!" />}
          <h1 className="font-display text-[44px] uppercase leading-none break-words md:text-[80px] lg:text-[104px]">{c.name}</h1>
        </div>
      </section>

      <div className="grid items-start gap-8 px-5 pt-4 md:px-0 md:pt-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-10">
        <div className="min-w-0 space-y-8 md:space-y-10">
          <section className="space-y-3.5">
            <div className="flex flex-wrap gap-2">
              <OpenBadge open={c.is_open_now} className="px-3.5! py-2!" />
              {hoursText && (
                <span className={PILL}>
                  <Clock className="h-3.5 w-3.5" strokeWidth={2.6} />
                  {hoursText}
                </span>
              )}
              {devices > 0 && <span className={PILL}>{t("catalog.devicesN", { n: devices })}</span>}
            </div>
            <p className="text-[15px] leading-normal text-soft md:text-lg">{[c.address, c.city].filter(Boolean).join(", ")}</p>
            <div className="flex flex-wrap gap-2">
              <a
                href={`https://yandex.uz/maps/?rtext=~${c.latitude},${c.longitude}&rtt=auto`}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClass("secondary", "md", "flex-1 sm:flex-none")}
              >
                <Navigation className="h-4 w-4" strokeWidth={2.6} />
                {t("catalog.route")}
              </a>
              {c.phone && (
                <a href={`tel:${c.phone}`} className={buttonClass("secondary", "md", "flex-1 whitespace-nowrap sm:flex-none")}>
                  <Phone className="h-4 w-4" strokeWidth={2.6} />
                  {c.phone}
                </a>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-2xl uppercase leading-none md:text-[40px]">{t("club.zones")}</h2>
            {c.zones.length === 0 && <Card className="py-10 text-center font-semibold text-muted">{t("catalog.noZones")}</Card>}
            {c.zones.map((z) => (
              <ZoneCard key={z.id} z={z} />
            ))}
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-2xl uppercase leading-none md:text-[40px]">{t("catalog.hoursTitle")}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Card>
                <HoursTable wh={c.working_hours} />
              </Card>
              <MapView className="h-full min-h-64 rounded-[18px]" center={pos} zoom={16} markers={[{ id: c.id, position: pos, label: c.name, active: true }]} fallback={<MapArt single />} />
            </div>
          </section>
        </div>

        {/* Desktop: yopishqoq bron kartasi */}
        <aside className="sticky top-[100px] hidden lg:block">
          <div className="rounded-[24px] bg-surface p-7">
            <div className="font-display text-[40px] uppercase leading-none">{t("book.title")}</div>
            {c.price_from != null && (
              <div className="mt-2 text-lg text-accent">
                <PriceFrom club={c} />
              </div>
            )}
            <ul className="mt-5 space-y-3 font-semibold text-soft">
              {(["landing.book.f1", "landing.book.f2", "landing.book.f3", "booking.payAtClub"] as const).map((k) => (
                <li key={k} className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-accent text-on-accent">
                    <Check className="h-3.5 w-3.5" strokeWidth={3.6} />
                  </span>
                  {t(k)}
                </li>
              ))}
            </ul>
            <BookAction clubId={c.id} bookable={bookable} className="mt-6" hint />
          </div>
        </aside>
      </div>

      {/* Mobil: pastki BRON paneli (pastki menyu o'rnida) */}
      {bookable && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-line bg-bg px-5 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] lg:hidden">
          <div className="mx-auto max-w-xl">
            <BookAction clubId={c.id} bookable />
          </div>
        </div>
      )}
    </main>
  );
}

/**
 * «BRON QILISH»: kirgan mijoz — bron sahifasiga; kirmagan — login'ga (`next` bilan, kirgach bron sahifasi ochiladi).
 * Kirish holati hali aniqlanmagan bo'lsa bron sahifasiga boradi — u o'zi tekshiradi.
 */
function BookAction({ clubId, bookable, className, hint }: { clubId: string; bookable: boolean; className?: string; hint?: boolean }) {
  const { t } = useI18n();
  const { me, loading } = useAuth();
  if (!bookable) return <p className={cx("rounded-[14px] border-2 border-line-strong px-4 py-3 text-sm font-semibold text-muted", className)}>{t("club.noBooking")}</p>;
  const target = `/clubs/${clubId}/book`;
  const guest = !loading && !me;
  return (
    <div className={className}>
      <Link href={guest ? `/login?next=${encodeURIComponent(target)}&reason=book` : target} className={buttonClass("primary", "lg", "w-full")}>
        {t("book.book")}
      </Link>
      {hint && guest && <p className="mt-3 text-center text-[13px] font-semibold text-muted">{t("book.loginToBook")}</p>}
    </div>
  );
}

/** Zona: nomi, qurilmalar soni va eng arzon soatlik narx (dizayn); murakkab tariflar (vaqt oralig'i, paketlar) ostida. */
function ZoneCard({ z }: { z: PublicZone }) {
  const { t, locale } = useI18n();
  const [layout, setLayout] = useState(false);
  const hourly = z.tariffs.filter((x) => x.type === "HOURLY").sort((a, b) => a.price - b.price);
  const packages = z.tariffs.filter((x) => x.type === "PACKAGE" && x.duration_minutes).sort((a, b) => a.duration_minutes! - b.duration_minutes!);
  // Taqqoslash uchun asosiy soatlik narx — vaqt cheklovisiz eng arzoni (yo'q bo'lsa — eng arzoni)
  const base = (hourly.find((x) => !x.valid_from) ?? hourly[0])?.price ?? null;
  const simple = hourly.length === 1 && !hourly[0].valid_from && packages.length === 0;
  const hasLayout = !!z.layout && !!z.devices_count;

  return (
    <div className="rounded-[18px] bg-surface p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[17px] font-bold md:text-xl">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: z.color ?? "#4a4a4a" }} />
            <span className="truncate">{z.name}</span>
          </div>
          <div className="mt-0.5 text-[13px] text-muted md:text-sm">{[z.devices_count ? t("catalog.devicesN", { n: z.devices_count }) : null, z.description].filter(Boolean).join(" · ")}</div>
        </div>
        {base != null ? (
          <b className="shrink-0 text-right whitespace-nowrap text-accent md:text-lg">
            {formatMoney(base, locale)} / {t("catalog.hour")}
          </b>
        ) : packages[0] ? (
          <b className="shrink-0 text-right whitespace-nowrap text-accent md:text-lg">{t("catalog.packageFrom", { price: formatMoney(Math.min(...packages.map((p) => p.price)), locale) })}</b>
        ) : null}
      </div>

      {z.tariffs.length === 0 && <p className="mt-3 text-sm font-semibold text-muted">{t("catalog.noTariffs")}</p>}

      {!simple && z.tariffs.length > 0 && (
        <div className="mt-4 space-y-4 border-t-2 border-line pt-4">
          {hourly.length > 0 && (
            <div>
              <SubTitle>{t("club.hourly")}</SubTitle>
              <ul className="mt-1 divide-y-2 divide-line">
                {hourly.map((x) => (
                  <li key={x.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <div className="font-semibold">{x.name}</div>
                      <Window x={x} />
                    </div>
                    <b className="shrink-0 whitespace-nowrap tabular-nums">
                      {formatMoney(x.price, locale)} <span className="font-semibold text-muted">/ {t("catalog.hour")}</span>
                    </b>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {packages.length > 0 && (
            <div>
              <SubTitle>{t("club.packages")}</SubTitle>
              <div className="mt-2 grid grid-cols-2 gap-2 xl:grid-cols-3">
                {packages.map((x) => {
                  const h = x.duration_minutes! / 60;
                  const perHour = Math.round(x.price / h);
                  const save = base ? Math.round((1 - x.price / (base * h)) * 100) : 0;
                  return (
                    <div key={x.id} className="relative rounded-[14px] border-2 border-line-strong p-3.5">
                      {save >= 5 && <span className="absolute top-2.5 right-2.5 rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-on-accent">−{save}%</span>}
                      <div className="font-display text-[28px] uppercase leading-none">{x.duration_minutes! % 60 === 0 ? t("catalog.hours", { n: h }) : t("catalog.minutes", { n: x.duration_minutes! })}</div>
                      <div className="mt-1 truncate text-xs font-semibold text-muted">{x.name}</div>
                      <div className="mt-2.5 font-bold text-accent tabular-nums">{formatMoney(x.price, locale)}</div>
                      <div className="text-xs text-muted">
                        ≈ {formatMoney(perHour, locale)} / {t("catalog.hour")}
                      </div>
                      <Window x={x} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {hasLayout && (
        <button onClick={() => setLayout(true)} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-[10px] border-2 border-fg px-3.5 text-sm font-bold transition hover:bg-fg hover:text-ink">
          <LayoutGrid className="h-4 w-4" strokeWidth={2.6} />
          {t("catalog.layout")}
        </button>
      )}

      {layout && hasLayout && (
        <Modal title={`${z.name} — ${t("catalog.layout")}`} onClose={() => setLayout(false)}>
          <ZoneLayoutView layout={z.layout!} count={z.devices_count!} decorLabel={(k) => t(`catalog.decor.${k}` as MessageKey)} />
        </Modal>
      )}
    </div>
  );
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-[13px] font-bold tracking-[0.08em] text-accent uppercase">{children}</div>;
}

function Window({ x }: { x: PublicTariff }) {
  const { t } = useI18n();
  if (!x.valid_from) return null;
  return (
    <div className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-muted">
      <Clock className="h-3 w-3" />
      {t("club.onlyBetween", { from: x.valid_from, to: x.valid_to ?? "" })}
    </div>
  );
}

function HoursTable({ wh }: { wh: WorkingHoursPublic | null }) {
  const { t } = useI18n();
  const [today] = useState(todayIdx);
  if (!wh) return <p className="text-sm font-semibold text-muted">{t("catalog.hoursUnknown")}</p>;
  if (wh.always_open) return <p className="font-display text-[28px] uppercase leading-none text-accent">{t("catalog.alwaysOpen")}</p>;
  return (
    <dl className="space-y-1 text-[15px]">
      {DAYS.map((d, i) => {
        const ws = wh[d] ?? [];
        return (
          <div key={d} className={cx("flex justify-between gap-4 rounded-lg px-2.5 py-1.5", i === today ? "bg-accent font-bold text-on-accent" : "font-semibold")}>
            <dt className={i === today ? "" : "text-muted"}>{t(`catalog.day.${d}` as MessageKey)}</dt>
            <dd className="tabular-nums">{ws.length ? ws.map((w) => `${w.open}–${w.close}`).join(", ") : t("catalog.dayOff")}</dd>
          </div>
        );
      })}
    </dl>
  );
}
