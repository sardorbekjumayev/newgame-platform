"use client";

import { formatMoney } from "@ng/types";
import { CheckCircle2, Clock, Infinity as InfinityIcon, Monitor, Phone, User, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { TimeWheels } from "@/components/time-wheel";
import { type ZoneLayout, DECOR_ICON, SEAT_CELL, resolveLayout } from "@/components/zone-layout";
import { Alert, Button, Card, Chip, Heading, Spinner, cx } from "@/components/ui";
import { type MessageKey, useErrorText, useI18n } from "@/i18n/provider";
import { session } from "@/lib/session";
import { type WorkingHours, DAY_KEYS } from "@/lib/types";
import { useApi } from "@/lib/use-api";

/** `free_until`/`limited_by` — faqat ochiq vaqt rejimida: joy qachongacha bo'sh va nima chekladi (keyingi bron yoki umumiy chegara). */
type Device = { id: string; seat_no: number; status: "FREE" | "BUSY" | "UNAVAILABLE"; free_until?: string | null; limited_by?: "BOOKING" | "CAP" | null };
type Zone = { id: string; name: string; color: string | null; devices_count: number | null; layout: ZoneLayout | null; price: number | null; tariff: string | null; free: number; devices: Device[] };
type Avail = { start_at: string; end_at: string; zones: Zone[] };
type Created = { id: string; code: string; status: string; start_at: string; end_at: string; total_amount: number; zones: { name: string; seats: number[] }[]; is_open?: boolean; open?: { limit_at: string } };

const TZ = "Asia/Tashkent";
const DURATIONS = [30, 60, 120, 180, 240, 300];
const hm = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
/** Toshkent vaqti "HH:MM" (+ daqiqa). */
const clock = (plusMin = 0) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(Date.now() + plusMin * 60_000));
const toMin = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};
/**
 * Boshlanish (sana + daqiqa) va davomiylik ish vaqtiga sig'adimi. Yopilish ochilishdan oldin/teng bo'lsa — tungi
 * smena (ertasi kuni tugaydi), oldingi kunning tungi smenasi ham hisobga olinadi. Ish vaqti kiritilmagan — cheklov yo'q.
 */
function fitsHours(wh: WorkingHours | null, date: string, start: number, minutes: number) {
  if (!wh || wh.always_open) return true;
  const dow = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7; // 0 = dushanba
  const spans = (d: number, shift: number) =>
    (wh[DAY_KEYS[(d + 7) % 7]] ?? []).map((w) => {
      const o = toMin(w.open);
      let c = toMin(w.close);
      if (c <= o) c += 1440;
      return [o + shift, c + shift] as const;
    });
  return [...spans(dow, 0), ...spans(dow - 1, -1440)].some(([o, c]) => start >= o && start + minutes <= c);
}

/** Bugun tanlash mumkin bo'lgan eng erta daqiqa (hozir − 10 daq; yarim tundan keyin — 00:00). */
const earliestToday = () => {
  const d = new Date(Date.now() - 10 * 60_000);
  if (new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d) !== day(0)) return 0;
  const [h, m] = clock(-10).split(":").map(Number);
  return h * 60 + m;
};
const day = (offset: number) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + offset * 86400_000));

/**
 * Joyida bron: klubga o'zi kelgan mijoz uchun operator 3 bosqichda joyni band qiladi —
 * vaqt (default "hozir") → davomiylik → o'rindiqlar. Ism/telefon ixtiyoriy.
 * «Ochiq vaqt» — davomiylik o'rniga: hozirdan boshlanadi, tugashi noma'lum; operator to'xtatadi va summa o'shanda
 * (soatlik tarif bo'yicha) hisoblanadi. Narx bu rejimda soatiga ko'rsatiladi.
 */
export default function WalkInPage() {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const [now, setNow] = useState(true);
  const [date, setDate] = useState(() => day(0));
  const [time, setTime] = useState(() => clock(5));
  const [minutes, setMinutes] = useState(60);
  const [open, setOpen] = useState(false); // ochiq vaqt (har doim "hozir"dan)
  const [customH, setCustomH] = useState("");
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [checkIn, setCheckIn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Created | null>(null);

  const minToday = earliestToday(); // bugun shundan oldingi vaqt tanlanmaydi
  const startIso = now ? null : time ? new Date(`${date}T${time}:00+05:00`).toISOString() : null;
  const path = open ? "/operator/bookings/availability?open=1" : now ? `/operator/bookings/availability?duration=${minutes}` : startIso ? `/operator/bookings/availability?duration=${minutes}&start_at=${encodeURIComponent(startIso)}` : null;
  const avail = useApi<Avail>(path);
  const reloadRef = useRef(avail.reload);
  useEffect(() => {
    reloadRef.current = avail.reload;
  });
  const hours = useApi<{ working_hours: WorkingHours | null }>("/operator/working-hours").data?.working_hours ?? null;
  const zones = useMemo(() => (avail.data?.zones ?? []).filter((z) => z.devices.length), [avail.data]);
  const zone = zones.find((z) => z.id === zoneId) ?? zones.find((z) => z.free > 0) ?? zones[0] ?? null;
  const devIndex = useMemo(() => new Map(zones.flatMap((z) => z.devices.map((d) => [d.id, { z, d }] as const))), [zones]);
  const total = picked.reduce((n, id) => n + (devIndex.get(id)?.z.price ?? 0), 0); // ochiq vaqtda — soatiga
  // Ochiq vaqt: tanlangan joylarning eng erta chegarasi (bitta sessiya — bitta tugash)
  const limit = open
    ? picked
        .map((id) => devIndex.get(id)?.d)
        .filter((d): d is Device => !!d?.free_until)
        .sort((a, b) => a.free_until!.localeCompare(b.free_until!))[0]
    : undefined;

  // Bandlik o'zgarib turadi — 20 soniyada yangilanadi
  useEffect(() => {
    const id = setInterval(() => reloadRef.current(), 20_000);
    return () => clearInterval(id);
  }, []);

  const changed = () => {
    setPicked([]);
    setError(null);
  };

  function toggle(d: Device) {
    if (d.status !== "FREE") return;
    setError(null);
    setPicked((p) => (p.includes(d.id) ? p.filter((x) => x !== d.id) : [...p, d.id]));
  }

  async function submit() {
    if (!picked.length) return;
    setBusy(true);
    setError(null);
    try {
      const res = await session.post<Created>("/operator/bookings/walk-in", {
        ...(open ? { open: true } : { ...(startIso ? { start_at: startIso } : {}), duration_minutes: minutes, check_in: now && checkIn }),
        device_ids: picked,
        guest_name: name.trim() || undefined,
        guest_phone: phone.trim() || undefined,
      });
      setDone(res.data);
      setPicked([]);
      setName("");
      setPhone("");
      avail.reload();
    } catch (e) {
      setError(errorText(e));
      avail.reload();
      setPicked([]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <Heading>{t("walkIn.title")}</Heading>
        <p className="mt-1 text-sm text-muted">{t("walkIn.hint")}</p>
      </div>

      {done && (
        <Card className="flex flex-wrap items-center gap-4 border border-green-500/40 bg-green-500/5">
          <CheckCircle2 className="h-10 w-10 shrink-0 text-green-400" />
          <div className="min-w-0 flex-1">
            <div className="font-bold">{done.is_open ? t("walkIn.doneOpen") : done.status === "CHECKED_IN" ? t("walkIn.doneNow") : t("walkIn.doneLater")}</div>
            <div className="text-sm text-muted">
              {done.zones.map((z) => `${z.name} #${z.seats.join(", #")}`).join(" · ")} ·{" "}
              {done.is_open ? `${hm(done.start_at)} → ${t("walkIn.openUntil", { time: hm(done.open?.limit_at ?? done.end_at) })}` : `${hm(done.start_at)}–${hm(done.end_at)} · ${formatMoney(done.total_amount, locale)}`}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted">{t("walkIn.code")}</div>
            <div className="font-mono text-2xl font-bold tracking-[0.2em] text-accent">{done.code}</div>
          </div>
        </Card>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="space-y-5">
          {/* 1. Qachon */}
          <Row n={1} title={t("walkIn.when")}>
            <div className="flex flex-wrap items-center gap-2">
              <Chip active={now} onClick={() => (setNow(true), changed())}>
                <Zap className="h-4 w-4" /> {t("walkIn.now")}
              </Chip>
              {/* Ochiq vaqt faqat hozirdan boshlanadi */}
              <Chip active={!now && date === day(0)} disabled={open} className="disabled:opacity-40" onClick={() => (setNow(false), setDate(day(0)), setTime(clock(5)), changed())}>
                {t("opBooking.today")}
              </Chip>
              <Chip active={!now && date === day(1)} disabled={open} className="disabled:opacity-40" onClick={() => (setNow(false), setDate(day(1)), changed())}>
                {t("opBooking.tomorrow")}
              </Chip>
            </div>
            {!now && (
              <div className="mt-3">
                <TimeWheels
                  value={time}
                  onChange={(v) => (setTime(v), changed())}
                  // Bugun — o'tgan vaqtni tanlab bo'lmaydi (10 daqiqagacha ruxsat, server ham shunday)
                  enabled={(h, m) => (date !== day(0) || h * 60 + m >= minToday) && fitsHours(hours, date, h * 60 + m, minutes)}
                />
              </div>
            )}
          </Row>

          {/* 2. Qancha */}
          <Row n={2} title={t("walkIn.howLong")}>
            <div className="flex flex-wrap items-center gap-2">
              {DURATIONS.map((m) => (
                <Chip key={m} active={!open && !customH && minutes === m} onClick={() => (setOpen(false), setCustomH(""), setMinutes(m), changed())}>
                  {m < 60 ? t("walkIn.min", { n: m }) : t("walkIn.hours", { n: m / 60 })}
                </Chip>
              ))}
              <label className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-bg px-3 text-sm">
                <input
                  inputMode="numeric"
                  value={customH}
                  placeholder={t("walkIn.other")}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 2);
                    setCustomH(v);
                    const n = Number(v);
                    if (n >= 1 && n <= 12) {
                      setOpen(false);
                      setMinutes(n * 60);
                      changed();
                    }
                  }}
                  className="w-16 bg-transparent outline-none placeholder:text-muted"
                />
                <span className="text-muted">{t("walkIn.h")}</span>
              </label>
              <Chip active={open} onClick={() => (setOpen(true), setNow(true), setCustomH(""), changed())}>
                <InfinityIcon className="h-4 w-4" /> {t("walkIn.open")}
              </Chip>
            </div>
            {open && <p className="mt-2 text-sm text-muted">{t("walkIn.openHint")}</p>}
            {avail.data && (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-muted">
                <Clock className="h-4 w-4 text-accent" />
                {open ? `${hm(avail.data.start_at)} → ${t("walkIn.openUntil", { time: hm(avail.data.end_at) })}` : `${hm(avail.data.start_at)} – ${hm(avail.data.end_at)}`}
              </p>
            )}
          </Row>

          {/* 3. Joylar */}
          <Row n={3} title={t("walkIn.seats")}>
            {!path ? (
              <p className="text-sm text-muted">{t("walkIn.pickTime")}</p>
            ) : avail.error ? (
              <Alert>{avail.error}</Alert>
            ) : avail.loading && !avail.data ? (
              <Spinner />
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {zones.map((z) => {
                    const n = picked.filter((id) => devIndex.get(id)?.z.id === z.id).length;
                    return (
                      <button
                        key={z.id}
                        type="button"
                        disabled={z.price == null}
                        onClick={() => setZoneId(z.id)}
                        className={cx(
                          "min-w-36 rounded-2xl border px-3 py-2 text-left transition disabled:opacity-50",
                          zone?.id === z.id ? "border-accent bg-accent/10" : "border-line hover:border-accent/50",
                        )}
                      >
                        <div className="flex items-center gap-2 font-bold">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: z.color ?? "#3a3f4b" }} />
                          {z.name}
                          {n > 0 && <span className="ml-auto rounded-md bg-accent px-1.5 text-xs text-on-accent">{n}</span>}
                        </div>
                        <div className="text-xs text-muted">
                          {z.price == null
                            ? t(open ? "walkIn.noHourly" : "walkIn.noTariff")
                            : `${open ? t("walkIn.perHour", { price: formatMoney(z.price, locale) }) : formatMoney(z.price, locale)} · ${t("walkIn.free", { n: z.free, total: z.devices.length })}`}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {zone && zone.price != null && <SeatMap zone={zone} picked={picked} onToggle={toggle} />}
                <div className="flex flex-wrap gap-4 text-xs text-muted">
                  <Legend cls="border-accent text-accent" label={t("walkIn.legend.free")} />
                  <Legend cls="border-accent bg-accent text-on-accent" label={t("walkIn.legend.picked")} />
                  <Legend cls="border-line bg-surface-2 opacity-50" label={t("walkIn.legend.busy")} />
                </div>
              </div>
            )}
          </Row>
        </Card>

        {/* Yakun */}
        <Card className="space-y-4 xl:sticky xl:top-4">
          <div className="font-bold">{t("walkIn.summary")}</div>
          {picked.length ? (
            <div className="flex flex-wrap gap-1.5">
              {picked.map((id) => {
                const x = devIndex.get(id);
                return x ? (
                  <button key={id} onClick={() => toggle(x.d)} className="rounded-lg bg-surface-2 px-2 py-1 text-sm font-semibold hover:line-through" title={t("walkIn.remove")}>
                    {x.z.name} #{x.d.seat_no}
                  </button>
                ) : null;
              })}
            </div>
          ) : (
            <p className="text-sm text-muted">{t("walkIn.noSeats")}</p>
          )}
          <div>
            <div className="text-xs text-muted">{t(open ? "walkIn.openRate" : "walkIn.total")}</div>
            <div className="font-display text-3xl font-bold text-accent tabular-nums">{formatMoney(total, locale)}</div>
            {open && <div className="mt-1 text-xs text-muted">{t("walkIn.openTotalHint")}</div>}
          </div>
          {/* Ochiq vaqt qachongacha davom etishi mumkin: keyingi bron bo'lsa — ogohlantirish */}
          {limit && (
            <div className={cx("rounded-xl px-3 py-2 text-sm font-semibold", limit.limited_by === "BOOKING" ? "bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/40" : "bg-surface-2 text-muted")}>
              {limit.limited_by === "BOOKING" ? t("walkIn.openUntilBooked", { time: hm(limit.free_until!) }) : t("walkIn.openUntil", { time: hm(limit.free_until!) })}
            </div>
          )}
          <div className="space-y-2">
            <label className="flex items-center gap-2 rounded-xl border border-line bg-bg px-3">
              <User className="h-4 w-4 shrink-0 text-muted" />
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={t("walkIn.name")} className="h-10 w-full bg-transparent text-sm outline-none" />
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-line bg-bg px-3">
              <Phone className="h-4 w-4 shrink-0 text-muted" />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} inputMode="tel" placeholder={t("walkIn.phone")} className="h-10 w-full bg-transparent text-sm outline-none" />
            </label>
            {now && !open && (
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={checkIn} onChange={(e) => setCheckIn(e.target.checked)} className="h-4 w-4 accent-[var(--color-accent)]" />
                {t("walkIn.checkIn")}
              </label>
            )}
          </div>
          {error && <Alert>{error}</Alert>}
          <Button className="h-12 w-full text-base" loading={busy} disabled={!picked.length} onClick={submit}>
            <Monitor className="h-5 w-5" /> {t(open ? "walkIn.openSubmit" : "walkIn.submit", { n: picked.length })}
          </Button>
        </Card>
      </div>
    </div>
  );
}

function Row({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
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

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cx("h-3.5 w-3.5 rounded border-2", cls)} />
      {label}
    </span>
  );
}

/** Zal sxemasi bo'yicha tanlash (sxema yo'q bo'lsa — raqamlar to'ri). */
function SeatMap({ zone, picked, onToggle }: { zone: Zone; picked: string[]; onToggle: (d: Device) => void }) {
  const { t } = useI18n();
  const bySeat = new Map(zone.devices.map((d) => [d.seat_no, d]));
  const btn = (d: Device | undefined, n: number, style?: React.CSSProperties) => {
    const on = !!d && picked.includes(d.id);
    const free = d?.status === "FREE";
    return (
      <button
        key={n}
        type="button"
        disabled={!free}
        onClick={() => d && onToggle(d)}
        style={style}
        className={cx(
          "flex flex-col items-center justify-center rounded-xl border-2 text-xs font-bold transition",
          on ? "border-accent bg-accent text-on-accent" : free ? "border-accent text-accent hover:bg-accent/15" : "cursor-not-allowed border-line bg-surface-2 text-muted opacity-50",
        )}
      >
        <Monitor className="h-4 w-4" />
        {n}
      </button>
    );
  };

  if (!zone.layout || !zone.devices_count)
    return <div className="flex flex-wrap gap-2">{zone.devices.map((d) => btn(d, d.seat_no, { width: 56, height: 56 }))}</div>;

  const { layout } = resolveLayout(zone.layout, zone.devices_count);
  const used = [...layout.seats, ...layout.decor];
  const cols = used.length ? Math.max(...used.map((c) => c.x)) + 1 : layout.cols;
  const rows = used.length ? Math.max(...used.map((c) => c.y)) + 1 : layout.rows;
  return (
    <div className="overflow-auto rounded-2xl border border-line bg-surface p-3">
      <div className="relative mx-auto" style={{ width: cols * SEAT_CELL, height: rows * SEAT_CELL }}>
        {layout.decor.map((d, i) => {
          const Icon = DECOR_ICON[d.kind];
          return (
            <div
              key={`d${i}`}
              title={t(`layout.decor.${d.kind}` as MessageKey)}
              className="absolute grid place-items-center rounded-lg bg-surface-2 text-muted"
              style={{ left: d.x * SEAT_CELL + 4, top: d.y * SEAT_CELL + 4, width: SEAT_CELL - 8, height: SEAT_CELL - 8 }}
            >
              <Icon className="h-4 w-4" />
            </div>
          );
        })}
        {layout.seats.map((s) => btn(bySeat.get(s.n), s.n, { position: "absolute", left: s.x * SEAT_CELL + 4, top: s.y * SEAT_CELL + 4, width: SEAT_CELL - 8, height: SEAT_CELL - 8 }))}
      </div>
    </div>
  );
}
