"use client";

import { formatMoney } from "@ng/types";
import { Navigation, Phone } from "lucide-react";
import { cx } from "@/components/ui";
import { type MessageKey, useI18n } from "@/i18n/provider";
import { durationLabel, fmtDay, fmtPhone, fmtTime } from "@/lib/format";

export type TicketBooking = {
  id: string; code: string; status: string; start_at: string; end_at: string; duration_minutes?: number; total_amount: number;
  /** Mijoz bron paytida tasdiqlagan aloqa raqami (operator shu raqamga qo'ng'iroq qiladi) */
  contact_phone?: string | null;
  /** Ochiq vaqt (operator ochgan, davom etmoqda): tugash va summa hali noma'lum — operator to'xtatganda yoziladi */
  is_open?: boolean;
  club: { id: string; name: string; address: string | null; phone: string | null; latitude?: number | null; longitude?: number | null };
  devices: { zone: string; color: string | null; seat_no: number }[];
};

/** Holat belgisi: qora fon ustida (ro'yxat) va oq chipta ustida. */
export const STATUS_TONE: Record<string, { dark: string; paper: string }> = {
  CONFIRMED: { dark: "bg-accent text-on-accent", paper: "bg-ink text-accent" },
  CHECKED_IN: { dark: "bg-paper text-ink", paper: "bg-ink text-fg" },
  COMPLETED: { dark: "border-2 border-line-strong text-muted", paper: "border-2 border-ink-soft text-ink-soft" },
  CANCELLED: { dark: "bg-danger/15 text-danger-soft", paper: "bg-danger text-ink" },
  NO_SHOW: { dark: "bg-warn/15 text-warn", paper: "bg-warn text-ink" },
};

/** Klubgacha yo'nalish (Yandex): koordinata bo'lmasa — manzil bo'yicha qidiruv. */
export function routeUrl(club: TicketBooking["club"]) {
  if (club.latitude != null && club.longitude != null) return `https://yandex.uz/maps/?rtext=~${club.latitude},${club.longitude}&rtt=auto`;
  return club.address ? `https://yandex.uz/maps/?text=${encodeURIComponent(`${club.name}, ${club.address}`)}` : null;
}

/**
 * Bron chiptasi — dizayndagi oq karta: klub, uzuq chiziq, satrlar (zona, sana, davomiylik, jami)
 * va katta kod (operatorga aytiladi). `actions` — qo'ng'iroq / yo'nalish tugmalari.
 */
export function BookingTicket({ b, footer, compact, actions = true }: { b: TicketBooking; footer?: React.ReactNode; compact?: boolean; actions?: boolean }) {
  const { t, locale } = useI18n();
  const live = b.status === "CONFIRMED" || b.status === "CHECKED_IN";
  const minutes = b.duration_minutes ?? Math.round((new Date(b.end_at).getTime() - new Date(b.start_at).getTime()) / 60_000);

  // Seatlarni zona bo'yicha guruhlash
  const zones = new Map<string, number[]>();
  for (const d of b.devices) zones.set(d.zone, [...(zones.get(d.zone) ?? []), d.seat_no]);

  const route = routeUrl(b.club);
  const tone = STATUS_TONE[b.status] ?? STATUS_TONE.COMPLETED;

  return (
    <div className={cx("rounded-[22px] bg-paper p-5 text-ink", !live && "opacity-80")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display text-[28px] uppercase leading-none break-words">{b.club.name}</div>
          {b.club.address && <div className="mt-1.5 text-sm text-ink-soft">{b.club.address}</div>}
        </div>
        <span className={cx("shrink-0 rounded-full px-3 py-1.5 text-xs font-bold whitespace-nowrap", tone.paper)}>{t(`booking.status.${b.status}` as MessageKey)}</span>
      </div>

      <div className="my-4 border-t-2 border-dashed border-ink" />

      {/* Kod — chiptaning asosiy qismi */}
      <div className={cx("rounded-[14px] bg-ink text-center", compact ? "px-3 py-3" : "px-3 py-4")}>
        <div className="text-[11px] font-bold tracking-[0.2em] text-muted uppercase">{t("booking.code")}</div>
        <div className={cx("mt-1 font-display leading-none tracking-[0.14em]", compact ? "text-[36px]" : "text-[48px]", live ? "text-accent" : "text-dim line-through")}>{b.code}</div>
        {live && <p className="mt-2 text-xs font-semibold text-muted">{t("ticket.showCode")}</p>}
      </div>

      <dl className="mt-4 space-y-2 font-bold">
        <Row label={t("ticket.zone")}>
          {[...zones.entries()].map(([name, seats]) => (
            <span key={name} className="block">
              {name} · №{seats.sort((x, y) => x - y).join(", ")}
            </span>
          ))}
        </Row>
        <Row label={t("ticket.date")}>
          {fmtDay(b.start_at, t as never)}, {fmtTime(b.start_at)}
          {b.is_open ? " →" : `–${fmtTime(b.end_at)}`}
        </Row>
        <Row label={t("ticket.duration")}>{b.is_open ? t("ticket.open") : durationLabel(minutes, t as never)}</Row>
        {b.contact_phone && <Row label={t("ticket.phone")}>{fmtPhone(b.contact_phone)}</Row>}
        <Row label={t("book.total")}>
          {b.is_open ? "—" : formatMoney(b.total_amount, locale)}
          <span className="block text-xs font-semibold text-ink-soft">{b.is_open ? t("ticket.openTotal") : t("booking.payAtClub")}</span>
        </Row>
      </dl>

      {actions && live && (b.club.phone || route) && (
        <div className="mt-4 flex gap-2">
          {b.club.phone && (
            <a href={`tel:${b.club.phone}`} aria-label={b.club.phone} className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border-2 border-ink transition hover:bg-ink hover:text-fg">
              <Phone className="h-5 w-5" strokeWidth={2.4} />
            </a>
          )}
          {route && (
            <a href={route} target="_blank" rel="noreferrer" className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-ink px-4 font-bold text-fg transition hover:bg-surface-3">
              <Navigation className="h-4 w-4" strokeWidth={2.4} /> {t("booking.route")}
            </a>
          )}
        </div>
      )}

      {footer && <div className="mt-4">{footer}</div>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
