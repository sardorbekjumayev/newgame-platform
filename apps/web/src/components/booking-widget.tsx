"use client";

import { formatMoney } from "@ng/types";
import { CalendarCheck, CheckCircle2, Clock, Monitor } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { BookingTicket, type TicketBooking } from "@/components/booking-ticket";
import { Alert, Button, Card, Chip, Spinner, cx } from "@/components/ui";
import { type DecorKind, ZoneLayoutView, type ZoneLayout } from "@/components/zone-layout-view";
import { type MessageKey, useErrorText, useI18n } from "@/i18n/provider";
import { durationLabel, fmtDate, fmtTime, tzDate } from "@/lib/format";
import { session, useAuth } from "@/lib/session";
import { useApi } from "@/lib/use-api";

const ADVANCE_DAYS = 5;
const HOURS = [1, 2, 3, 4, 5];
const MAX_DEVICES = 5; // API: BOOKING_RULES.maxDevices

type Slots = { windows: { from: string; to: string }[] };
type AvailDevice = { id: string; seat_no: number; status: "FREE" | "BUSY" | "UNAVAILABLE" };
type AvailZone = { id: string; name: string; color: string | null; description: string | null; devices_count: number | null; layout: ZoneLayout | null; price: number | null; tariff: string | null; free: number; devices: AvailDevice[] };
type Availability = { start_at: string; end_at: string; zones: AvailZone[] };
type Created = { id: string; code: string };

/**
 * Bron: 1) sana → 2) necha soat → 3) kelish vaqti (surib tanlanadi) → 4) zona va qurilmalar (zal sxemasi) → bron.
 * To'lov klubda. Faqat ro'yxatdan o'tgan mijoz bron qiladi.
 */
export function BookingWidget({ clubId }: { clubId: string }) {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const { me, loading: authLoading } = useAuth();
  const dates = useMemo(() => Array.from({ length: ADVANCE_DAYS + 1 }, (_, i) => tzDate(i)), []);
  const [date, setDate] = useState(dates[0]);
  const [hours, setHours] = useState(2);
  const [custom, setCustom] = useState("");
  const [start, setStart] = useState<string | null>(null);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Created | null>(null);
  const [ticket, setTicket] = useState<TicketBooking | null>(null);
  const minutes = hours * 60;

  const slots = useApi<Slots>(`/clubs/${clubId}/booking/slots?date=${date}&duration=${minutes}`);
  const avail = useApi<Availability>(start ? `/clubs/${clubId}/booking/availability?start_at=${encodeURIComponent(start)}&duration=${minutes}` : null);
  const zones = useMemo(() => avail.data?.zones ?? [], [avail.data]);
  const zone = zones.find((z) => z.id === zoneId) ?? zones.find((z) => z.free > 0) ?? zones[0] ?? null;

  // Oldingi tanlovlar keyingi bosqich o'zgarganda tozalanadi
  const reset = (level: "date" | "duration" | "start") => {
    if (level !== "start") setStart(null);
    setPicked([]);
    setZoneId(null);
    setError(null);
  };

  const devIndex = useMemo(() => new Map(zones.flatMap((z) => z.devices.map((d) => [d.id, { zone: z, d }] as const))), [zones]);
  const total = picked.reduce((n, id) => n + (devIndex.get(id)?.zone.price ?? 0), 0);

  function toggle(d: AvailDevice) {
    if (d.status !== "FREE") return;
    if (!picked.includes(d.id) && picked.length >= MAX_DEVICES) {
      setError(t("book.maxSeats", { n: MAX_DEVICES }));
      return;
    }
    setError(null);
    setPicked((p) => (p.includes(d.id) ? p.filter((x) => x !== d.id) : [...p, d.id]));
  }

  async function book() {
    if (!start || !picked.length) return;
    setBusy(true);
    setError(null);
    try {
      const res = await session.post<TicketBooking>("/bookings", { club_id: clubId, start_at: start, duration_minutes: minutes, device_ids: picked });
      setDone(res.data);
      setTicket(res.data);
    } catch (e) {
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
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center justify-center gap-2 text-center font-display text-2xl font-bold">
          <CheckCircle2 className="h-7 w-7 text-accent" /> {t("booking.done")}
        </div>
        {ticket ? (
          <BookingTicket b={ticket} />
        ) : (
          <Card className="space-y-2 text-center">
            <div className="text-muted">{t("booking.code")}</div>
            <div className="font-mono text-3xl font-bold tracking-[0.18em] text-accent">{done.code}</div>
            <p className="text-sm text-muted">{t("booking.payAtClub")}</p>
          </Card>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          <Link href="/bookings" className="inline-flex h-11 items-center rounded-xl bg-accent px-5 text-sm font-bold text-on-accent hover:bg-accent-hover">
            {t("booking.mine")}
          </Link>
          <Button variant="secondary" onClick={() => (setDone(null), setTicket(null), reset("date"), slots.reload())}>
            {t("booking.another")}
          </Button>
        </div>
      </div>
    );

  return (
    <Card className="space-y-6">
      <div className="flex items-center gap-2 font-display text-2xl font-bold">
        <CalendarCheck className="h-6 w-6 text-accent" /> {t("book.title")}
      </div>

      {/* 1. Sana */}
      <Step n={1} title={t("book.date")}>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {dates.map((d, i) => (
            <Chip key={d} active={d === date} onClick={() => (setDate(d), reset("date"))} className="shrink-0">
              {i === 0 ? t("book.today") : i === 1 ? t("book.tomorrow") : fmtDate(`${d}T12:00:00+05:00`, t as never)}
            </Chip>
          ))}
        </div>
      </Step>

      {/* 2. Necha soat */}
      <Step n={2} title={t("booking.howLong")}>
        <div className="flex flex-wrap items-center gap-2">
          {HOURS.map((h) => (
            <Chip key={h} active={!custom && hours === h} onClick={() => (setCustom(""), setHours(h), reset("duration"))}>
              {durationLabel(h * 60, t as never)}
            </Chip>
          ))}
          <label className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-bg px-3 text-sm">
            <input
              inputMode="numeric"
              value={custom}
              placeholder={t("booking.otherHours")}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 2);
                setCustom(v);
                const n = Number(v);
                if (n >= 1 && n <= 12) {
                  setHours(n);
                  reset("duration");
                }
              }}
              className="w-24 bg-transparent outline-none placeholder:text-muted"
            />
            <span className="text-muted">{t("booking.hoursUnit")}</span>
          </label>
        </div>
      </Step>

      {/* 3. Kelish vaqti — surib tanlanadi */}
      <Step n={3} title={t("booking.whenArrive")}>
        {slots.loading && !slots.data ? (
          <Spinner className="h-5 w-5" />
        ) : slots.error ? (
          <Alert>{slots.error}</Alert>
        ) : !slots.data?.windows.length ? (
          <p className="text-sm text-muted">{t("book.noSlots")}</p>
        ) : (
          <TimePicker key={`${date}:${minutes}`} date={date} windows={slots.data.windows} value={start} onChange={(v) => (setStart(v), reset("start"))} hint={t("booking.pickTimeHint")} />
        )}
        {start && (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-muted">
            <Clock className="h-4 w-4 text-accent" />
            {fmtDate(start, t as never)}, {fmtTime(start)}–{fmtTime(new Date(new Date(start).getTime() + minutes * 60_000).toISOString())}
          </p>
        )}
      </Step>

      {/* 4. Zona va qurilmalar */}
      {start && (
        <Step n={4} title={t("seat.title")}>
          {avail.loading && !avail.data ? (
            <Spinner className="h-5 w-5" />
          ) : avail.error ? (
            <Alert>{avail.error}</Alert>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {zones.map((z) => (
                  <button
                    key={z.id}
                    type="button"
                    disabled={z.price == null}
                    onClick={() => setZoneId(z.id)}
                    className={cx(
                      "rounded-2xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50",
                      zone?.id === z.id ? "border-accent bg-accent/10" : "border-line bg-bg hover:border-accent/50",
                    )}
                  >
                    <div className="flex items-center gap-2 font-bold">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: z.color ?? "#3a3f4b" }} />
                      {z.name}
                      {picked.some((id) => devIndex.get(id)?.zone.id === z.id) && (
                        <span className="ml-auto rounded-md bg-accent px-1.5 text-xs text-on-accent">{picked.filter((id) => devIndex.get(id)?.zone.id === z.id).length}</span>
                      )}
                    </div>
                    {z.price == null ? (
                      <div className="mt-1 text-sm text-muted">{t("booking.noTariff")}</div>
                    ) : (
                      <>
                        <div className="mt-1 font-display text-lg font-bold text-accent tabular-nums">{formatMoney(z.price, locale)}</div>
                        <div className="text-[11px] text-muted">{t("book.forDuration", { d: durationLabel(minutes, t as never) })}</div>
                        {z.tariff && <div className="truncate text-xs text-muted">{z.tariff}</div>}
                        <div className={cx("mt-0.5 text-xs font-semibold", z.free ? "text-fg" : "text-red-400")}>{t("seat.freeOf", { n: z.free, total: z.devices.length })}</div>
                      </>
                    )}
                  </button>
                ))}
              </div>
              {zone && zone.price != null && (
                <div className="space-y-2">
                  <Legend />
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
                            onClick={() => toggle(d)}
                            className={cx(
                              "flex h-12 w-12 flex-col items-center justify-center rounded-lg border-2 text-xs font-bold transition",
                              on ? "border-accent bg-accent text-on-accent" : d.status === "FREE" ? "border-accent text-accent hover:bg-accent/15" : "cursor-not-allowed border-line bg-surface-2 text-muted opacity-60",
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
              )}
            </div>
          )}
        </Step>
      )}

      {/* Yakun */}
      {start && (
        <div className="space-y-3 border-t border-line-soft pt-4">
          {error && <Alert>{error}</Alert>}
          <div className={picked.length >= MAX_DEVICES ? "text-xs font-semibold text-warn" : "text-xs text-muted"}>
            {t("book.seatsPicked", { n: picked.length, max: MAX_DEVICES })}
          </div>
          {picked.length > 0 && (
            <div className="flex flex-wrap gap-1.5 text-sm">
              {picked.map((id) => {
                const x = devIndex.get(id);
                return x ? (
                  <span key={id} className="rounded-lg bg-surface-2 px-2 py-1 font-semibold">
                    {x.zone.name} #{x.d.seat_no}
                  </span>
                ) : null;
              })}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm text-muted">{t("book.total")}</div>
              <div className="font-display text-2xl font-bold text-accent tabular-nums">{formatMoney(total, locale)}</div>
              <div className="text-xs text-muted">{t("booking.payAtClub")}</div>
            </div>
            {authLoading ? null : me ? (
              <Button onClick={book} loading={busy} disabled={!picked.length} className="min-w-44">
                {t("book.book")}
              </Button>
            ) : (
              <Link href={`/login?next=${encodeURIComponent(`/clubs/${clubId}`)}`} className="inline-flex h-11 items-center rounded-xl bg-accent px-5 text-sm font-bold text-on-accent hover:bg-accent-hover">
                {t("book.loginToBook")}
              </Link>
            )}
          </div>
          <p className="text-xs text-muted">{t("booking.rules")}</p>
        </div>
      )}
    </Card>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center gap-2 font-bold">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-accent text-xs text-on-accent">{n}</span>
        {title}
      </div>
      {children}
    </section>
  );
}

const ITEM = 44;
const pad = (n: number) => String(n).padStart(2, "0");
const at = (date: string, h: number, m: number) => Date.parse(`${date}T${pad(h)}:${pad(m)}:00+05:00`);

/**
 * Kelish vaqti: soat va daqiqa barabanlari (istalgan daqiqa, masalan 18:47). Suriladi yoki bosiladi.
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

  // Birinchi ochilishda eng erta yaroqli vaqt tanlanadi
  useEffect(() => {
    if (!value) onChange(new Date(at(date, h, m)).toISOString());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <Wheel items={Array.from({ length: 24 }, (_, x) => x)} value={h} enabled={hourOk} onPick={(x) => pick(x, m)} />
        <span className="font-display text-3xl font-bold text-muted">:</span>
        <Wheel items={Array.from({ length: 60 }, (_, x) => x)} value={m} enabled={(x) => ok(h, x)} onPick={(x) => pick(h, x)} />
      </div>
      <p className="text-xs text-muted">{hint}</p>
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
    <div className="relative h-[176px] w-20 overflow-hidden rounded-2xl border border-line bg-bg">
      <div className="pointer-events-none absolute inset-x-1 top-1/2 h-11 -translate-y-1/2 rounded-xl bg-accent/15 ring-1 ring-accent/60" />
      <div ref={ref} onScroll={onScroll} className="h-full snap-y snap-mandatory overflow-y-scroll py-[66px] [scrollbar-width:none]">
        {items.map((n) => {
          const on = enabled(n);
          return (
            <button
              key={n}
              type="button"
              disabled={!on}
              onClick={() => onPick(n)}
              className={cx("relative block h-11 w-full snap-center text-center font-display text-2xl tabular-nums transition", n === value ? "font-bold text-fg" : on ? "text-muted hover:text-fg" : "text-muted/25")}
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
      <span className={cx("h-3.5 w-3.5 rounded border-2", cls)} />
      {label}
    </span>
  );
  return (
    <div className="flex flex-wrap gap-4 text-xs text-muted">
      {item("border-accent", t("seat.free"))}
      {item("border-accent bg-accent", t("seat.on"))}
      {item("border-line bg-surface-2", t("seat.busy"))}
    </div>
  );
}
