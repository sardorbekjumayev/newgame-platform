"use client";

import { formatMoney } from "@ng/types";
import { Check, Minus, Monitor, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { BookingTicket, type TicketBooking, routeUrl } from "@/components/booking-ticket";
import { LegalConsent } from "@/components/legal-consent";
import { SocialFollowCard } from "@/components/social";
import { Alert, BackButton, Button, Input, Modal, Option, Spinner, StepLabel, buttonClass, cx } from "@/components/ui";
import { type DecorKind, ZoneLayoutView, type ZoneLayout } from "@/components/zone-layout-view";
import { type MessageKey, useErrorText, useI18n } from "@/i18n/provider";
import { track } from "@/lib/analytics";
import { durationLabel, fmtDate, fmtDay, fmtPhone, fmtTime, tzDate } from "@/lib/format";
import { session, useAuth } from "@/lib/session";
import { getWebApp } from "@/lib/telegram";
import type { ClubDetailPublic } from "@/lib/types";
import { isUzPhone, normalizePhone, useApi } from "@/lib/use-api";

// API: BOOKING_RULES (advanceDays, maxMinutes, maxDevices)
const ADVANCE_DAYS = 5;
const MAX_HOURS = 12;
const MAX_DEVICES = 5;
/** Vaqtlar to'ri dastlab shuncha katak (3 qator); qolgani «Yana vaqtlar» bilan ochiladi. */
const SLOTS_COLLAPSED = 12;

type Slots = { windows: { from: string; to: string }[]; slots: { start_at: string; free: number }[] };
type AvailDevice = { id: string; seat_no: number; status: "FREE" | "BUSY" | "UNAVAILABLE" };
type AvailZone = { id: string; name: string; color: string | null; description: string | null; devices_count: number | null; layout: ZoneLayout | null; price: number | null; tariff: string | null; free: number; devices: AvailDevice[] };
type Availability = { start_at: string; end_at: string; zones: AvailZone[] };

/**
 * Bron oqimi (template/design.html — "Mobil: bron qilish"): 1 · sana → 2 · necha soat → 3 · vaqt → 4 · zona → 5 · o'rindiq → 6 · aloqa raqami,
 * pastda «Jami» va «TASDIQLASH». Narx va bo'sh joylar vaqt + davomiylikka bog'liq, shuning uchun zona vaqtdan keyin tanlanadi.
 * Aloqa raqami oxirgi bronda ishlatilgan raqam bilan (`GET /me/booking-contact`; birinchi safar — akkaunt raqami: u Telegram orqali
 * tasdiqlangan va qo'ng'iroq qabul qilmasligi mumkin) to'ldiriladi, mijoz o'zgartirishi mumkin; bron qilishdan oldin raqam
 * to'g'riligi so'raladi — operator aynan shu raqamga qo'ng'iroq qiladi.
 * To'lov klubda. Sahifa faqat kirgan mijozga ochiladi (`app/clubs/[id]/book`).
 */
export function BookingFlow({ club }: { club: ClubDetailPublic }) {
  const clubId = club.id;
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const { me } = useAuth();
  const dates = useMemo(() => Array.from({ length: ADVANCE_DAYS + 1 }, (_, i) => tzDate(i)), []);
  const [date, setDate] = useState(dates[0]);
  const [hours, setHours] = useState(2);
  const [start, setStart] = useState<string | null>(null);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [allSlots, setAllSlots] = useState(false);
  const [exact, setExact] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<TicketBooking | null>(null);
  // Aloqa raqami: oxirgi bronda ishlatilgani (server eslab qoladi), bo'lmasa akkaunt raqami; mijoz o'zgartirishi mumkin.
  // `phoneEdit` — mijoz maydonga tekkanidan keyingi qiymat; tegmaguncha eslab qolingan raqam ko'rinadi.
  const remembered = useApi<{ contact_phone: string | null }>("/me/booking-contact");
  const [phoneEdit, setPhone] = useState<string | null>(null);
  const savedPhone = remembered.data?.contact_phone ?? me?.phone ?? null;
  const phone = phoneEdit ?? (savedPhone ? fmtPhone(savedPhone) : "+998 ");
  const [phoneError, setPhoneError] = useState(false);
  const [askPhone, setAskPhone] = useState(false);
  const phoneRef = useRef<HTMLInputElement>(null);
  const contactPhone = normalizePhone(phone);
  const phoneOk = isUzPhone(phone);
  const minutes = hours * 60;

  const slots = useApi<Slots>(`/clubs/${clubId}/booking/slots?date=${date}&duration=${minutes}`);
  const avail = useApi<Availability>(start ? `/clubs/${clubId}/booking/availability?start_at=${encodeURIComponent(start)}&duration=${minutes}` : null);
  const zones = useMemo(() => avail.data?.zones ?? [], [avail.data]);
  const zone = zones.find((z) => z.id === zoneId) ?? zones.find((z) => z.price != null && z.free > 0) ?? null;

  const times = slots.data?.slots ?? [];
  const windows = slots.data?.windows ?? [];
  const startMs = start ? Date.parse(start) : null;
  const end = startMs != null ? new Date(startMs + minutes * 60_000).toISOString() : null;
  const shown = allSlots ? times : times.slice(0, SLOTS_COLLAPSED);
  // Aniq daqiqa (masalan 18:47) tanlangan — to'rdagi kataklarga to'g'ri kelmaydi
  const offGrid = startMs != null && !times.some((s) => Date.parse(s.start_at) === startMs);

  const devIndex = useMemo(() => new Map(zones.flatMap((z) => z.devices.map((d) => [d.id, { zone: z, d }] as const))), [zones]);
  const total = picked.reduce((n, id) => n + (devIndex.get(id)?.zone.price ?? 0), 0);
  const seatsByZone = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const id of picked) {
      const x = devIndex.get(id);
      if (x) m.set(x.zone.name, [...(m.get(x.zone.name) ?? []), x.d.seat_no].sort((a, b) => a - b));
    }
    return [...m.entries()];
  }, [picked, devIndex]);

  // Oldingi tanlovlar keyingi bosqich o'zgarganda tozalanadi
  function reset(level: "date" | "duration" | "start") {
    if (level !== "start") {
      setStart(null);
      setExact(false);
      setAllSlots(false);
    }
    setPicked([]);
    setZoneId(null);
    setError(null);
  }

  function toggle(d: AvailDevice) {
    if (d.status !== "FREE") return;
    if (!picked.includes(d.id) && picked.length >= MAX_DEVICES) {
      setError(t("book.maxSeats", { n: MAX_DEVICES }));
      return;
    }
    setError(null);
    setPicked((p) => (p.includes(d.id) ? p.filter((x) => x !== d.id) : [...p, d.id]));
  }

  const focusPhone = () => {
    phoneRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    phoneRef.current?.focus({ preventScroll: true });
  };

  /** «TASDIQLASH»: avval raqam to'g'riligini so'raymiz — operator shu raqamga qo'ng'iroq qiladi. */
  function confirmPhone() {
    if (!start || !picked.length) return;
    if (!phoneOk) {
      setPhoneError(true);
      focusPhone();
      return;
    }
    setError(null);
    setAskPhone(true);
  }

  async function book() {
    if (!start || !picked.length || !phoneOk) return;
    setBusy(true);
    setError(null);
    try {
      const res = await session.post<TicketBooking>("/bookings", { club_id: clubId, start_at: start, duration_minutes: minutes, device_ids: picked, contact_phone: contactPhone });
      setAskPhone(false);
      setDone(res.data);
      // GA4 konversiyasi: faqat klub ID va sonlar (shaxsiy ma'lumotsiz)
      track("booking_created", { club_id: clubId, duration_minutes: minutes, seats: picked.length });
      getWebApp()?.HapticFeedback?.notificationOccurred("success");
      window.scrollTo({ top: 0 });
    } catch (e) {
      setAskPhone(false);
      setError(errorText(e));
      avail.reload();
      slots.reload();
      setPicked([]);
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <BookingDone
        b={done}
        onAnother={() => {
          setDone(null);
          reset("date");
          slots.reload();
        }}
      />
    );

  const dateLabel = (d: string, i: number) => (i === 0 ? t("book.today") : i === 1 ? t("book.tomorrow") : fmtDate(`${d}T12:00:00+05:00`, t as never));
  const cta = !start ? t("book.pickTime") : !picked.length ? t("seat.title") : t("book.confirm");
  const confirm = (
    <Button size="lg" className="w-full" onClick={confirmPhone} disabled={busy || !start || !picked.length}>
      {cta}
    </Button>
  );

  return (
    <main className="mx-auto w-full max-w-[1280px] flex-1 px-5 pb-24 md:px-8 md:pb-48 lg:pb-16">
      <div className="flex items-center gap-3 py-5 md:py-8">
        <BackButton href={`/clubs/${clubId}`} label={club.name} />
        <div className="min-w-0">
          <h1 className="font-display text-[30px] uppercase leading-none md:text-[56px]">{t("book.title")}</h1>
          <div className="mt-1 truncate text-sm font-semibold text-muted md:text-base">{club.name}</div>
        </div>
      </div>

      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-6">
          {/* 1 · Sana */}
          <section>
            <StepLabel n={1} className="mb-2">
              {t("book.date")}
            </StepLabel>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {dates.map((d, i) => (
                <Option
                  key={d}
                  selected={d === date}
                  onClick={() => {
                    setDate(d);
                    reset("date");
                  }}
                  className="min-h-14! text-[15px]"
                >
                  {dateLabel(d, i)}
                </Option>
              ))}
            </div>
          </section>

          {/* 2 · Necha soat */}
          <section>
            <StepLabel n={2} className="mb-2">
              {t("book.step.hours")}
            </StepLabel>
            <div className="flex items-center justify-between rounded-[14px] bg-surface p-1.5 sm:max-w-sm">
              <button
                type="button"
                aria-label={t("book.less")}
                disabled={hours <= 1}
                onClick={() => {
                  setHours(hours - 1);
                  reset("duration");
                }}
                className="grid h-12 w-12 place-items-center rounded-[10px] bg-paper text-ink transition active:translate-y-px disabled:opacity-30"
              >
                <Minus className="h-6 w-6" strokeWidth={3} />
              </button>
              <span aria-live="polite" className="font-display text-[32px] uppercase leading-none">
                {durationLabel(minutes, t as never)}
              </span>
              <button
                type="button"
                aria-label={t("book.more")}
                disabled={hours >= MAX_HOURS}
                onClick={() => {
                  setHours(hours + 1);
                  reset("duration");
                }}
                className="grid h-12 w-12 place-items-center rounded-[10px] bg-accent text-on-accent transition active:translate-y-px disabled:opacity-30"
              >
                <Plus className="h-6 w-6" strokeWidth={3} />
              </button>
            </div>
          </section>

          {/* 3 · Vaqt */}
          <section>
            <StepLabel n={3} className="mb-2">
              {t("ticket.time")}
            </StepLabel>
            {slots.loading && !slots.data ? (
              <Spinner className="h-6 w-6" />
            ) : slots.error ? (
              <Alert>{slots.error}</Alert>
            ) : !times.length && !windows.length ? (
              <p className="rounded-[14px] border-2 border-line-strong px-4 py-3 text-sm font-semibold text-muted">{t("book.noSlots")}</p>
            ) : (
              <>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {shown.map((s) => (
                    <Option
                      key={s.start_at}
                      selected={startMs === Date.parse(s.start_at)}
                      disabled={s.free === 0}
                      struck={s.free === 0}
                      onClick={() => {
                        setStart(s.start_at);
                        reset("start");
                      }}
                      className="tabular-nums"
                    >
                      {fmtTime(s.start_at)}
                    </Option>
                  ))}
                  {offGrid && start && (
                    <Option selected className="tabular-nums">
                      {fmtTime(start)}
                    </Option>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-5">
                  {times.length > SLOTS_COLLAPSED && (
                    <button type="button" onClick={() => setAllSlots((v) => !v)} className="min-h-11 text-sm font-bold text-accent hover:underline">
                      {allSlots ? t("book.lessTimes") : t("book.moreTimes")}
                    </button>
                  )}
                  {windows.length > 0 && (
                    <button type="button" onClick={() => setExact((v) => !v)} aria-expanded={exact} className="min-h-11 text-sm font-bold text-accent hover:underline">
                      {t("book.exactTime")}
                    </button>
                  )}
                </div>
                {exact && windows.length > 0 && (
                  <TimePicker
                    key={`${date}:${minutes}`}
                    date={date}
                    windows={windows}
                    value={start}
                    onChange={(v) => {
                      setStart(v);
                      reset("start");
                    }}
                    hint={t("booking.pickTimeHint")}
                  />
                )}
              </>
            )}
            {start && end && (
              <p className="mt-2 font-bold">
                {fmtDay(start, t as never)}, {fmtTime(start)}–{fmtTime(end)}
              </p>
            )}
          </section>

          {/* 4 · Zona, 5 · O'rindiq — vaqt tanlangach */}
          {start &&
            (avail.error ? (
              <Alert>{avail.error}</Alert>
            ) : !avail.data ? (
              <Spinner className="h-6 w-6" />
            ) : (
              <>
                <section>
                  <StepLabel n={4} className="mb-2">
                    {t("ticket.zone")}
                  </StepLabel>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {zones.map((z) => {
                      const on = zone?.id === z.id;
                      const off = z.price == null || z.free === 0;
                      const n = picked.filter((id) => devIndex.get(id)?.zone.id === z.id).length;
                      return (
                        <button
                          key={z.id}
                          type="button"
                          disabled={off}
                          aria-pressed={on}
                          onClick={() => setZoneId(z.id)}
                          className={cx(
                            "rounded-[14px] border-2 p-3 text-left transition disabled:cursor-not-allowed",
                            on ? "border-accent bg-accent text-on-accent" : off ? "border-line-strong text-dim" : "border-fg hover:bg-fg hover:text-ink",
                          )}
                        >
                          <div className="flex items-center gap-2 font-bold">
                            <span className={cx("h-2.5 w-2.5 shrink-0 rounded-full", on && "ring-2 ring-ink")} style={{ background: z.color ?? "#4a4a4a" }} />
                            <span className="truncate">{z.name}</span>
                            {n > 0 && <span className={cx("ml-auto rounded-md px-1.5 text-xs", on ? "bg-ink text-accent" : "bg-accent text-on-accent")}>{n}</span>}
                          </div>
                          {z.price == null ? (
                            <div className="mt-1.5 text-[13px] font-semibold">{t("booking.noTariff")}</div>
                          ) : (
                            <>
                              <div className="mt-1.5 text-lg leading-tight font-bold tabular-nums">{formatMoney(z.price, locale)}</div>
                              <div className="text-xs font-semibold opacity-80">{t("seat.freeOf", { n: z.free, total: z.devices.length })}</div>
                            </>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-xs font-semibold text-muted">{t("book.forDuration", { d: durationLabel(minutes, t as never) })}</p>
                </section>

                {zone && zone.price != null && (
                  <section>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <StepLabel n={5}>{t("book.step.seat")}</StepLabel>
                      <span className={cx("text-[13px] font-bold tabular-nums", picked.length >= MAX_DEVICES ? "text-warn" : "text-muted")}>
                        {picked.length}/{MAX_DEVICES}
                      </span>
                    </div>
                    <Legend />
                    <div className="mt-2">
                      {zone.layout && zone.devices_count ? (
                        <ZoneLayoutView
                          layout={zone.layout}
                          count={zone.devices_count}
                          decorLabel={(k: DecorKind) => t(`seat.decor.${k}` as MessageKey)}
                          seatState={(n) => {
                            const d = zone.devices.find((x) => x.seat_no === n);
                            if (!d) return "UNAVAILABLE";
                            return picked.includes(d.id) ? "PICKED" : d.status;
                          }}
                          onSeat={(n) => {
                            const d = zone.devices.find((x) => x.seat_no === n);
                            if (d) toggle(d);
                          }}
                        />
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {zone.devices.map((d) => {
                            const on = picked.includes(d.id);
                            return (
                              <button
                                key={d.id}
                                type="button"
                                disabled={d.status !== "FREE"}
                                aria-pressed={on}
                                onClick={() => toggle(d)}
                                className={cx(
                                  "flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-xl border-2 text-xs font-bold transition",
                                  on ? "border-accent bg-accent text-on-accent" : d.status === "FREE" ? "border-fg hover:bg-fg hover:text-ink" : "cursor-not-allowed border-line-strong text-dim",
                                )}
                              >
                                <Monitor className="h-3.5 w-3.5" />
                                {d.seat_no}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {/* Aloqa raqami — operator shu raqamga qo'ng'iroq qiladi */}
                <section>
                  <StepLabel n={zone && zone.price != null ? 6 : 5} className="mb-2">
                    {t("book.step.phone")}
                  </StepLabel>
                  <Input
                    ref={phoneRef}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    aria-label={t("book.step.phone")}
                    aria-invalid={phoneError}
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      setPhoneError(false);
                    }}
                    onBlur={() => {
                      if (phoneOk) setPhone(fmtPhone(contactPhone));
                      else setPhoneError(true);
                    }}
                    className={cx("text-lg! tabular-nums sm:max-w-sm", phoneError && "border-danger!")}
                  />
                  {phoneError && <p className="mt-2 text-sm font-semibold text-danger-soft">{t("apply.invalidPhone")}</p>}
                  <p className="mt-2 max-w-xl text-xs leading-5 text-muted">{t("book.phoneHint")}</p>
                  {me?.phone && contactPhone !== me.phone && (
                    <button
                      type="button"
                      onClick={() => {
                        setPhone(fmtPhone(me.phone!));
                        setPhoneError(false);
                      }}
                      className="min-h-11 text-sm font-bold text-accent hover:underline"
                    >
                      {t("book.phoneReset")} · {fmtPhone(me.phone)}
                    </button>
                  )}
                </section>
              </>
            ))}

          <p className="text-xs leading-5 text-muted">{t("booking.rules")}</p>
          <LegalConsent kind="booking" className="lg:hidden" />
        </div>

        {/* Desktop: yakun kartasi */}
        <aside className="sticky top-[100px] hidden lg:block">
          <div className="rounded-[24px] bg-surface p-7">
            <div className="font-display text-[32px] uppercase leading-none break-words">{club.name}</div>
            {club.address && <div className="mt-1.5 text-sm text-muted">{club.address}</div>}
            <div className="my-5 border-t-2 border-dashed border-line-strong" />
            <dl className="space-y-2.5 font-bold">
              <SummaryRow label={t("book.date")}>{start ? fmtDay(start, t as never) : dateLabel(date, dates.indexOf(date))}</SummaryRow>
              <SummaryRow label={t("ticket.time")}>{start && end ? `${fmtTime(start)}–${fmtTime(end)}` : "—"}</SummaryRow>
              <SummaryRow label={t("ticket.duration")}>{durationLabel(minutes, t as never)}</SummaryRow>
              <SummaryRow label={t("ticket.phone")}>{phoneOk ? fmtPhone(contactPhone) : "—"}</SummaryRow>
              <SummaryRow label={t("ticket.zone")}>
                {seatsByZone.length
                  ? seatsByZone.map(([name, seats]) => (
                      <span key={name} className="block">
                        {name} · №{seats.join(", ")}
                      </span>
                    ))
                  : "—"}
              </SummaryRow>
            </dl>
            <div className="my-5 border-t-2 border-dashed border-line-strong" />
            <div className="flex items-end justify-between gap-3">
              <span className="font-bold text-muted">{t("book.total")}</span>
              <span className="font-display text-[40px] leading-none text-accent tabular-nums">{formatMoney(total, locale)}</span>
            </div>
            <div className="mt-1 text-right text-xs font-semibold text-muted">{t("booking.payAtClub")}</div>
            {error && (
              <div className="mt-4">
                <Alert>{error}</Alert>
              </div>
            )}
            <div className="mt-5">{confirm}</div>
            <LegalConsent kind="booking" className="mt-3" />
          </div>
        </aside>
      </div>

      {/* Mobil: pastki panel — jami va tasdiqlash */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-line bg-bg px-5 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] lg:hidden">
        <div className="mx-auto max-w-xl">
          {error && (
            <div className="mb-2.5">
              <Alert>{error}</Alert>
            </div>
          )}
          <div className="mb-2.5 flex justify-between gap-3 font-bold">
            <span className="text-muted">
              {t("book.total")}
              {picked.length > 0 && ` · ${picked.length} ${t("ticket.seatsN")}`}
            </span>
            <span className="text-accent tabular-nums">{formatMoney(total, locale)}</span>
          </div>
          {confirm}
        </div>
      </div>

      {/* Bron qilishdan oldin: raqam to'g'rimi? */}
      {askPhone && (
        <Modal title={t("book.phoneConfirm.title")} onClose={() => !busy && setAskPhone(false)}>
          <div className="space-y-4">
            <div className="rounded-[18px] bg-surface px-4 py-6 text-center font-display text-[34px] leading-none tracking-[0.04em] text-accent tabular-nums sm:text-[44px]">{fmtPhone(contactPhone)}</div>
            <p className="leading-normal font-semibold text-soft">{t("book.phoneConfirm.text")}</p>
            <div className="flex flex-col gap-2.5">
              <Button size="lg" className="w-full" onClick={book} loading={busy}>
                {t("book.phoneConfirm.yes")}
              </Button>
              <Button
                variant="secondary"
                size="lg"
                className="w-full"
                disabled={busy}
                onClick={() => {
                  setAskPhone(false);
                  setTimeout(focusPhone, 50);
                }}
              >
                {t("book.phoneConfirm.edit")}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </main>
  );
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

/** "Bron tasdiqlandi" ekrani (template/design.html): belgi, katta sarlavha, oq chipta, yo'nalish va bronlarim. */
function BookingDone({ b, onAnother }: { b: TicketBooking; onAnother: () => void }) {
  const { t } = useI18n();
  const route = routeUrl(b.club);
  return (
    <main className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col gap-7 px-5 pt-8 pb-6 md:px-8 lg:grid lg:grid-cols-2 lg:grid-rows-[1fr_auto] lg:items-center lg:gap-x-16 lg:py-16">
      <div className="lg:self-end">
        <div className="grid h-[72px] w-[72px] place-items-center rounded-full bg-accent text-on-accent">
          <Check className="h-9 w-9" strokeWidth={3.2} />
        </div>
        <h1 className="mt-6 font-display text-[clamp(52px,17vw,68px)] uppercase leading-[0.95] lg:text-[104px]">
          {t("booking.done.line1")}
          <br />
          <span className="text-accent">{t("booking.done.line2")}</span>
        </h1>
      </div>
      <div className="space-y-3 lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <BookingTicket b={b} actions={false} />
        <SocialFollowCard />
      </div>
      <div className="flex flex-col gap-2.5 lg:self-start">
        {route && (
          <a href={route} target="_blank" rel="noopener noreferrer" className={buttonClass("primary", "lg", "w-full")}>
            {t("booking.getRoute")}
          </a>
        )}
        <Link href="/bookings" className={buttonClass(route ? "secondary" : "primary", "lg", "w-full")}>
          {t("booking.toMine")}
        </Link>
        <button type="button" onClick={onAnother} className="min-h-11 text-sm font-bold text-muted hover:text-fg">
          {t("booking.another")}
        </button>
      </div>
    </main>
  );
}

const ITEM = 44;
const pad = (n: number) => String(n).padStart(2, "0");
const at = (date: string, h: number, m: number) => Date.parse(`${date}T${pad(h)}:${pad(m)}:00+05:00`);

/**
 * Aniq kelish vaqti: soat va daqiqa barabanlari (istalgan daqiqa, masalan 18:47). Suriladi yoki bosiladi.
 * Faqat ish vaqti ichidagi va tanlangan davomiylik sig'adigan vaqtlar faol.
 */
function TimePicker({ date, windows, value, onChange, hint }: { date: string; windows: { from: string; to: string }[]; value: string | null; onChange: (iso: string) => void; hint: string }) {
  const ranges = useMemo(() => windows.map((w) => [Date.parse(w.from), Date.parse(w.to)] as const), [windows]);
  const ok = (h: number, m: number) => {
    const t = at(date, h, m);
    return ranges.some(([a, b]) => t >= a && t <= b);
  };
  const hourOk = (h: number) => Array.from({ length: 60 }, (_, m) => m).some((m) => ok(h, m));
  const cur = value ? new Date(Date.parse(value) + 5 * 3600_000) : null;
  const first = new Date(ranges[0][0] + 5 * 3600_000);
  const [h, setH] = useState(cur ? cur.getUTCHours() : first.getUTCHours());
  const [m, setM] = useState(cur ? cur.getUTCMinutes() : first.getUTCMinutes());

  const pick = (nh: number, nm: number) => {
    // Soat o'zgarsa va daqiqa yaroqsiz bo'lsa — eng yaqin yaroqli daqiqa
    let mm = nm;
    if (!ok(nh, mm)) {
      const cands = Array.from({ length: 60 }, (_, x) => x).filter((x) => ok(nh, x));
      if (!cands.length) return;
      mm = cands.reduce((a, b) => (Math.abs(b - nm) < Math.abs(a - nm) ? b : a));
    }
    setH(nh);
    setM(mm);
    onChange(new Date(at(date, nh, mm)).toISOString());
  };

  // Ochilganda vaqt tanlanmagan bo'lsa — eng erta yaroqli vaqt
  useEffect(() => {
    if (!value) onChange(new Date(at(date, h, m)).toISOString());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mt-1 space-y-2 rounded-[14px] bg-surface p-4">
      <div className="flex items-center gap-3">
        <Wheel items={Array.from({ length: 24 }, (_, x) => x)} value={h} enabled={hourOk} onPick={(x) => pick(x, m)} />
        <span className="font-display text-[40px] leading-none text-muted">:</span>
        <Wheel items={Array.from({ length: 60 }, (_, x) => x)} value={m} enabled={(x) => ok(h, x)} onPick={(x) => pick(h, x)} />
      </div>
      <p className="text-xs leading-5 text-muted">{hint}</p>
    </div>
  );
}

/** Vertikal baraban: scroll-snap, o'rtadagi qiymat tanlanadi; yaroqsizlari xira. */
function Wheel({ items, value, enabled, onPick }: { items: number[]; value: number; enabled: (n: number) => boolean; onPick: (n: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const silent = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const top = items.indexOf(value) * ITEM;
    if (Math.abs(el.scrollTop - top) > 2) {
      silent.current = true;
      el.scrollTo({ top, behavior: "smooth" });
      setTimeout(() => (silent.current = false), 400);
    }
  }, [value, items]);

  const onScroll = () => {
    if (silent.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      let i = Math.round(el.scrollTop / ITEM);
      i = Math.max(0, Math.min(items.length - 1, i));
      if (!enabled(items[i])) {
        // Eng yaqin yaroqlisiga
        const valid = items.map((n, k) => (enabled(n) ? k : -1)).filter((k) => k >= 0);
        if (!valid.length) return;
        i = valid.reduce((a, b) => (Math.abs(b - i) < Math.abs(a - i) ? b : a));
      }
      if (items[i] !== value) onPick(items[i]);
      else el.scrollTo({ top: i * ITEM, behavior: "smooth" });
    }, 120);
  };

  return (
    <div className="relative h-[176px] w-20 overflow-hidden rounded-[14px] border-2 border-line-strong bg-bg">
      <div className="pointer-events-none absolute inset-x-1 top-1/2 h-11 -translate-y-1/2 rounded-[10px] bg-accent" />
      <div ref={ref} onScroll={onScroll} className="gc-noscroll h-full snap-y snap-mandatory overflow-y-scroll py-[66px]">
        {items.map((n) => {
          const on = enabled(n);
          return (
            <button
              key={n}
              type="button"
              disabled={!on}
              onClick={() => onPick(n)}
              className={cx("relative block h-11 w-full snap-center text-center font-display text-[28px] leading-none tabular-nums transition", n === value ? "text-on-accent" : on ? "text-fg" : "text-surface-3")}
            >
              {pad(n)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Legend() {
  const { t } = useI18n();
  const item = (cls: string, label: string) => (
    <span className="inline-flex items-center gap-1.5">
      <span className={cx("h-4 w-4 rounded-[5px] border-2", cls)} />
      {label}
    </span>
  );
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-muted">
      {item("border-fg", t("seat.free"))}
      {item("border-accent bg-accent", t("seat.on"))}
      {item("border-line-strong", t("seat.busy"))}
    </div>
  );
}
