"use client";

import { formatMoney } from "@ng/types";
import { CalendarDays, Check, Phone, Square, Undo2, UserX, X } from "lucide-react";
import { useState } from "react";
import { type OpenInfo, type StoppedSession, StoppedModal, fmtElapsed } from "@/components/open-session";
import { Alert, Badge, Button, Card, Chip, Heading, Spinner } from "@/components/ui";
import { type MessageKey, useErrorText, useI18n } from "@/i18n/provider";
import { session } from "@/lib/session";
import { useApi } from "@/lib/use-api";

type Booking = {
  id: string; code: string; status: string; start_at: string; end_at: string; total_amount: number; checked_in_at: string | null;
  customer: { first_name: string | null; last_name: string | null; phone: string | null };
  /** Mijoz bron paytida tasdiqlagan aloqa raqami — qo'ng'iroq shu raqamga (bo'sh bo'lsa akkaunt raqami) */
  contact_phone?: string | null;
  /** Ochiq vaqt (davom etmoqda): `open` — o'tgan vaqt va shu paytgacha summa; `total_amount` ham shu summa */
  is_open?: boolean;
  open?: OpenInfo;
  devices: { zone: string; color: string | null; seat_no: number }[];
};
const TONE: Record<string, "green" | "violet" | "neutral" | "red" | "amber"> = { CONFIRMED: "green", CHECKED_IN: "violet", COMPLETED: "neutral", CANCELLED: "red", NO_SHOW: "amber" };
const TZ = "Asia/Tashkent";
const time = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
const dayOf = (offset: number) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + offset * 86400_000));

/** Operator: kun bo'yicha bronlar — keldi / kelmadi / bekor qilish. */
export default function OperatorBookingsPage() {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const [days] = useState(() => Array.from({ length: 7 }, (_, i) => dayOf(i - 1)));
  const [date, setDate] = useState(days[1]);
  const [now] = useState(() => Date.now());
  const list = useApi<{ date: string; bookings: Booking[] }>(`/operator/bookings?date=${date}`);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stopped, setStopped] = useState<StoppedSession | null>(null);
  const rows = list.data?.bookings ?? [];
  const live = rows.filter((b) => ["CONFIRMED", "CHECKED_IN"].includes(b.status));

  async function act(b: Booking, action: "check-in" | "no-show" | "cancel" | "undo-check-in") {
    if (action !== "check-in" && !confirm(t(`opBooking.confirm.${action}` as MessageKey))) return;
    setBusy(b.id);
    setError(null);
    try {
      await session.post(`/operator/bookings/${b.id}/${action}`, {});
      list.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  /** Ochiq sessiyani to'xtatish — yakuniy summa oynada ko'rsatiladi. */
  async function stop(b: Booking) {
    if (!confirm(t("opOpen.stopConfirm"))) return;
    setBusy(b.id);
    setError(null);
    try {
      const res = await session.post<StoppedSession>(`/operator/bookings/${b.id}/stop`, {});
      setStopped(res.data);
      list.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      {stopped && <StoppedModal s={stopped} onClose={() => setStopped(null)} />}
      <div>
        <Heading>{t("nav.bookings")}</Heading>
        <p className="mt-1 text-sm text-muted">{t("opBooking.hint")}</p>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {days.map((d, i) => (
          <Chip key={d} active={d === date} onClick={() => setDate(d)} className="shrink-0">
            {i === 0 ? t("opBooking.yesterday") : i === 1 ? t("opBooking.today") : i === 2 ? t("opBooking.tomorrow") : `${d.slice(8)}.${d.slice(5, 7)}`}
          </Chip>
        ))}
      </div>
      {error && <Alert>{error}</Alert>}
      {list.error && <Alert>{list.error}</Alert>}
      {list.loading && !list.data ? (
        <Spinner />
      ) : !rows.length ? (
        <Card className="flex items-center justify-center gap-2 py-12 text-muted">
          <CalendarDays className="h-5 w-5" /> {t("opBooking.empty")}
        </Card>
      ) : (
        <>
          <div className="text-sm text-muted">{t("opBooking.summary", { n: live.length, total: formatMoney(live.reduce((s, b) => s + b.total_amount, 0), locale) })}</div>
          <div className="space-y-2">
            {rows.map((b) => {
              const name = [b.customer.first_name, b.customer.last_name].filter(Boolean).join(" ") || t("opBooking.noName");
              const started = new Date(b.start_at).getTime() + 10 * 60_000 <= now; // "kelmadi" — boshlanishdan 10 daqiqa keyin
              return (
                <Card key={b.id} className="flex flex-wrap items-center gap-x-5 gap-y-3">
                  <div className="w-24 shrink-0">
                    <div className="font-display text-xl font-bold tabular-nums">{time(b.start_at)}</div>
                    {b.open ? (
                      <div className="text-xs font-semibold text-accent">{fmtElapsed(b.open.elapsed_minutes, t)}</div>
                    ) : (
                      <div className="text-xs text-muted tabular-nums">–{time(b.end_at)}</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold">{name}</span>
                      {(b.contact_phone ?? b.customer.phone) && (
                        <a href={`tel:${b.contact_phone ?? b.customer.phone}`} className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline">
                          <Phone className="h-3.5 w-3.5" /> {b.contact_phone ?? b.customer.phone}
                        </a>
                      )}
                      <span className="font-mono text-xs text-muted">#{b.code}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-xs">
                      {b.devices.map((d, i) => (
                        <span key={i} className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-2 py-0.5 font-semibold">
                          <span className="h-2 w-2 rounded-full" style={{ background: d.color ?? "#3a3f4b" }} />
                          {d.zone} #{d.seat_no}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold tabular-nums">{formatMoney(b.total_amount, locale)}</div>
                    {b.open ? <Badge tone="green">{t("opOpen.title")}</Badge> : <Badge tone={TONE[b.status] ?? "neutral"}>{t(`opBooking.status.${b.status}` as MessageKey)}</Badge>}
                  </div>
                  {b.open && (
                    <div className="flex w-full flex-wrap justify-end gap-1 sm:w-auto">
                      <Button size="sm" loading={busy === b.id} onClick={() => stop(b)}>
                        <Square className="h-4 w-4" /> {t("opOpen.stop")}
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busy === b.id} onClick={() => act(b, "cancel")} title={t("opBooking.cancel")}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                  {b.status === "CHECKED_IN" && !b.open && (
                    <div className="flex w-full justify-end sm:w-auto">
                      <Button size="sm" variant="ghost" loading={busy === b.id} onClick={() => act(b, "undo-check-in")}>
                        <Undo2 className="h-4 w-4" /> {t("opBooking.undo")}
                      </Button>
                    </div>
                  )}
                  {b.status === "CONFIRMED" && (
                    <div className="flex w-full flex-wrap justify-end gap-1 sm:w-auto">
                      <Button size="sm" loading={busy === b.id} onClick={() => act(b, "check-in")}>
                        <Check className="h-4 w-4" /> {t("opBooking.checkIn")}
                      </Button>
                      {started && (
                        <Button size="sm" variant="secondary" disabled={busy === b.id} onClick={() => act(b, "no-show")}>
                          <UserX className="h-4 w-4" /> {t("opBooking.noShow")}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" disabled={busy === b.id} onClick={() => act(b, "cancel")} title={t("opBooking.cancel")}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
