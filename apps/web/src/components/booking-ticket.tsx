"use client";

import { formatMoney } from "@ng/types";
import { Clock, MapPin, Navigation, Phone } from "lucide-react";
import { cx } from "@/components/ui";
import { type MessageKey, useI18n } from "@/i18n/provider";
import { durationLabel, fmtDate, fmtTime } from "@/lib/format";

export type TicketBooking = {
  id: string; code: string; status: string; start_at: string; end_at: string; duration_minutes?: number; total_amount: number;
  club: { id: string; name: string; address: string | null; phone: string | null; latitude?: number | null; longitude?: number | null };
  devices: { zone: string; color: string | null; seat_no: number }[];
};

const STATUS_TONE: Record<string, string> = {
  CONFIRMED: "bg-emerald-500/15 text-emerald-400",
  CHECKED_IN: "bg-violet-500/15 text-violet-300",
  COMPLETED: "bg-white/10 text-muted",
  CANCELLED: "bg-red-500/15 text-red-400",
  NO_SHOW: "bg-amber-500/15 text-amber-300",
};

/** Bron chiptasi: klub, sana/vaqt, o'rindiqlar, katta kod (operatorga aytiladi), narx, yo'l. */
export function BookingTicket({ b, footer, compact }: { b: TicketBooking; footer?: React.ReactNode; compact?: boolean }) {
  const { t, locale } = useI18n();
  const live = b.status === "CONFIRMED" || b.status === "CHECKED_IN";
  const minutes = b.duration_minutes ?? Math.round((new Date(b.end_at).getTime() - new Date(b.start_at).getTime()) / 60_000);

  // Seatlarni zona bo'yicha guruhlash
  const zones = new Map<string, { color: string | null; seats: number[] }>();
  for (const d of b.devices) {
    if (!zones.has(d.zone)) zones.set(d.zone, { color: d.color, seats: [] });
    zones.get(d.zone)!.seats.push(d.seat_no);
  }

  const route =
    b.club.latitude != null && b.club.longitude != null
      ? `https://yandex.uz/maps/?rtext=~${b.club.latitude},${b.club.longitude}&rtt=auto`
      : b.club.address
        ? `https://yandex.uz/maps/?text=${encodeURIComponent(`${b.club.name}, ${b.club.address}`)}`
        : null;

  return (
    <div className={cx("relative overflow-hidden rounded-[22px] border border-line-soft bg-surface shadow-xl", !live && "opacity-75")}>
      {/* Yuqori qism: klub va vaqt */}
      <div className="relative bg-gradient-to-br from-accent/25 via-accent/10 to-transparent p-5">
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent">Zonup · {t("ticket.label")}</div>
            <div className="mt-1 truncate font-display text-xl font-bold">{b.club.name}</div>
            {b.club.address && (
              <div className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                <MapPin className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{b.club.address}</span>
              </div>
            )}
          </div>
          <span className={cx("shrink-0 rounded-full px-2.5 py-1 text-xs font-bold", STATUS_TONE[b.status] ?? STATUS_TONE.COMPLETED)}>
            {t(`booking.status.${b.status}` as MessageKey)}
          </span>
        </div>

        <div className="relative mt-4 grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <div>
            <div className="text-xs text-muted">{fmtDate(b.start_at, t as never)}</div>
            <div className="font-display text-3xl font-bold tabular-nums">{fmtTime(b.start_at)}</div>
          </div>
          <div className="mb-2 flex flex-col items-center text-[11px] font-semibold text-muted">
            <Clock className="mb-0.5 h-3.5 w-3.5" />
            {durationLabel(minutes, t as never)}
            <span className="mt-1 h-px w-12 bg-line" />
          </div>
          <div className="text-right">
            <div className="text-xs text-muted">{t("ticket.until")}</div>
            <div className="font-display text-3xl font-bold tabular-nums">{fmtTime(b.end_at)}</div>
          </div>
        </div>
      </div>

      {/* Yirtiladigan chiziq */}
      <div className="relative h-0">
        <span className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-bg" />
        <span className="absolute -right-3 -top-3 h-6 w-6 rounded-full bg-bg" />
        <div className="mx-5 border-t-2 border-dashed border-line" />
      </div>

      {/* Pastki qism: o'rindiqlar va kod */}
      <div className="space-y-4 p-5">
        <div className="space-y-1.5">
          <div className="text-[11px] font-bold uppercase tracking-widest text-muted">{t("ticket.seats")}</div>
          <div className="flex flex-wrap gap-1.5">
            {[...zones.entries()].map(([name, z]) => (
              <span key={name} className="inline-flex items-center gap-1.5 rounded-xl bg-surface-2 px-2.5 py-1.5 text-sm font-semibold">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: z.color ?? "#3a3f4b" }} />
                {name}
                <span className="font-mono text-accent">#{z.seats.sort((x, y) => x - y).join(", #")}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Kod — chiptaning asosiy qismi */}
        <div className={cx("relative overflow-hidden rounded-2xl border text-center", live ? "border-accent/40 bg-accent/[0.07]" : "border-line-soft bg-surface-2", compact ? "px-4 py-3" : "px-4 py-5")}>
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(135deg,transparent_0_10px,rgba(255,255,255,0.025)_10px_20px)]" />
          <div className="relative text-[11px] font-bold uppercase tracking-[0.25em] text-muted">{t("booking.code")}</div>
          <div className={cx("relative mt-1 flex justify-center gap-1.5 font-mono font-bold", compact ? "text-2xl" : "text-4xl")}>
            {b.code.split("").map((ch, i) => (
              <span
                key={i}
                className={cx(
                  "grid place-items-center rounded-lg bg-bg/70 ring-1 ring-line-soft",
                  live ? "text-accent" : "text-muted line-through decoration-2",
                  compact ? "h-10 w-8" : "h-14 w-11",
                )}
              >
                {ch}
              </span>
            ))}
          </div>
          {live && <p className="relative mt-2 text-xs text-muted">{t("ticket.showCode")}</p>}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-surface-2 px-4 py-3">
          <div>
            <div className="text-xs text-muted">{t("booking.payAtClub")}</div>
            <div className="font-display text-xl font-bold tabular-nums">{formatMoney(b.total_amount, locale)}</div>
          </div>
          {live && (
            <div className="flex gap-2">
              {b.club.phone && (
                <a href={`tel:${b.club.phone}`} aria-label={b.club.phone} className="grid h-10 w-10 place-items-center rounded-xl border border-line hover:border-accent/60">
                  <Phone className="h-4 w-4" />
                </a>
              )}
              {route && (
                <a href={route} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-accent px-3 text-sm font-bold text-on-accent hover:bg-accent-hover">
                  <Navigation className="h-4 w-4" /> {t("booking.route")}
                </a>
              )}
            </div>
          )}
        </div>

        {footer}
      </div>
    </div>
  );
}
