"use client";

import { formatMoney } from "@ng/types";
import { CalendarCheck, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BookingTicket, type TicketBooking } from "@/components/booking-ticket";
import { Alert, Button, Card, Modal, Spinner, cx } from "@/components/ui";
import { type MessageKey, useErrorText, useI18n } from "@/i18n/provider";
import { fmtDate, fmtTime } from "@/lib/format";
import { session, useAuth } from "@/lib/session";
import { useApi } from "@/lib/use-api";

type Booking = TicketBooking & { can_cancel: boolean };

/** Mijoz: mening bronlarim — kelgusi va o'tganlar, bekor qilish (kamida 1 soat oldin). */
export default function BookingsPage() {
  const { t, locale } = useI18n();
  const [openId, setOpenId] = useState<string | null>(null);
  const errorText = useErrorText();
  const { me, loading } = useAuth();
  const router = useRouter();
  const list = useApi<Booking[]>(me ? "/me/bookings" : null);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    if (!loading && !me) router.replace("/login?next=/bookings");
  }, [loading, me, router]);

  async function cancel(b: Booking) {
    if (!confirm(t("booking.cancelConfirm"))) return;
    setError(null);
    try {
      await session.post(`/me/bookings/${b.id}/cancel`, {});
      list.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  if (loading || !me || (list.loading && !list.data)) return <Spinner className="mx-auto my-20 h-6 w-6" />;
  const upcoming = (list.data ?? []).filter((b) => ["CONFIRMED", "CHECKED_IN"].includes(b.status) && new Date(b.end_at).getTime() > now).reverse();
  const past = (list.data ?? []).filter((b) => !upcoming.includes(b));

  const live = (b: Booking) => b.status === "CONFIRMED" || b.status === "CHECKED_IN";
  const opened = (list.data ?? []).find((b) => b.id === openId) ?? null;

  // Ixcham qator — bosilsa to'liq chipta ochiladi
  const card = (b: Booking) => (
    <button
      key={b.id}
      type="button"
      onClick={() => setOpenId(b.id)}
      className={cx(
        "flex w-full items-center gap-4 rounded-2xl border bg-surface p-4 text-left transition hover:border-accent/50",
        live(b) ? "border-line-soft" : "border-line-soft opacity-60",
      )}
    >
      <div className="w-16 shrink-0 text-center">
        <div className="text-xs text-muted">{fmtDate(b.start_at, t as never)}</div>
        <div className="font-display text-xl font-bold tabular-nums">{fmtTime(b.start_at)}</div>
      </div>
      <div className="min-w-0 flex-1 border-l border-dashed border-line pl-4">
        <div className="truncate font-bold">{b.club.name}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
          <span className="font-mono font-bold tracking-widest text-accent">{b.code}</span>
          <span>· {b.devices.length} {t("ticket.seatsN")}</span>
          <span>· {formatMoney(b.total_amount, locale)}</span>
        </div>
      </div>
      <span className={cx("shrink-0 rounded-full px-2.5 py-1 text-xs font-bold", STATUS_TONE[b.status] ?? STATUS_TONE.COMPLETED)}>
        {t(`booking.status.${b.status}` as MessageKey)}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
    </button>
  );

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-8 sm:px-8">
      <h1 className="flex items-center gap-2 font-display text-3xl font-bold">
        <CalendarCheck className="h-7 w-7 text-accent" /> {t("booking.mine")}
      </h1>
      {error && <Alert>{error}</Alert>}
      {list.error && <Alert>{list.error}</Alert>}
      <section className="space-y-2.5">
        <h2 className="font-bold text-muted">{t("booking.upcoming", { n: upcoming.length, max: 5 })}</h2>
        {upcoming.length ? upcoming.map(card) : (
          <Card className="py-10 text-center text-muted">
            {t("booking.none")}{" "}
            <Link href="/map" className="font-bold text-accent hover:underline">
              {t("nav.map")}
            </Link>
          </Card>
        )}
      </section>
      {past.length > 0 && (
        <section className="space-y-2.5">
          <h2 className="font-bold text-muted">{t("booking.past")}</h2>
          {past.map(card)}
        </section>
      )}
      {opened && (
        <Modal title={t("ticket.label")} onClose={() => setOpenId(null)}>
          <BookingTicket
            b={opened}
            footer={
              opened.status === "CONFIRMED" &&
              (opened.can_cancel ? (
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await cancel(opened);
                    }}
                  >
                    {t("booking.cancel")}
                  </Button>
                </div>
              ) : (
                new Date(opened.start_at).getTime() > now && <p className="text-right text-xs text-muted">{t("booking.cancelClosed")}</p>
              ))
            }
          />
        </Modal>
      )}
    </main>
  );
}

const STATUS_TONE: Record<string, string> = {
  CONFIRMED: "bg-emerald-500/15 text-emerald-400",
  CHECKED_IN: "bg-violet-500/15 text-violet-300",
  COMPLETED: "bg-white/10 text-muted",
  CANCELLED: "bg-red-500/15 text-red-400",
  NO_SHOW: "bg-amber-500/15 text-amber-300",
};
