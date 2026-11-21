"use client";

import { formatMoney } from "@ng/types";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BookingTicket, STATUS_TONE, type TicketBooking } from "@/components/booking-ticket";
import { Alert, Modal, Spinner, StepLabel, buttonClass, cx } from "@/components/ui";
import { type MessageKey, useErrorText, useI18n } from "@/i18n/provider";
import { fmtDay, fmtTime } from "@/lib/format";
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

  if (loading || !me || (list.loading && !list.data)) return <Spinner className="mx-auto my-24 h-7 w-7" />;
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
      className={cx("flex w-full items-center gap-3.5 rounded-[18px] bg-surface p-4 text-left transition hover:bg-surface-2", !live(b) && "opacity-60")}
    >
      <div className="w-[68px] shrink-0">
        <div className="font-display text-[30px] leading-none tabular-nums">{fmtTime(b.start_at)}</div>
        <div className="mt-1 text-xs font-semibold text-muted">{fmtDay(b.start_at, t as never)}</div>
      </div>
      <div className="min-w-0 flex-1 border-l-2 border-dashed border-line-strong pl-3.5">
        <div className="truncate text-[17px] font-bold">{b.club.name}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] font-semibold text-muted">
          <span className="font-bold tracking-widest text-accent">{b.code}</span>
          <span>
            · {b.devices.length} {t("ticket.seatsN")}
          </span>
          <span>· {b.is_open ? t("ticket.open") : formatMoney(b.total_amount, locale)}</span>
        </div>
        <span className={cx("mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-bold sm:hidden", (STATUS_TONE[b.status] ?? STATUS_TONE.COMPLETED).dark)}>{t(`booking.status.${b.status}` as MessageKey)}</span>
      </div>
      <span className={cx("hidden shrink-0 rounded-full px-3 py-1.5 text-xs font-bold sm:inline-flex", (STATUS_TONE[b.status] ?? STATUS_TONE.COMPLETED).dark)}>{t(`booking.status.${b.status}` as MessageKey)}</span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted" strokeWidth={2.6} />
    </button>
  );

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-7 px-5 py-6 sm:px-8 sm:py-10">
      <h1 className="font-display text-[44px] uppercase leading-none sm:text-7xl">{t("booking.mine")}</h1>
      {error && <Alert>{error}</Alert>}
      {list.error && <Alert>{list.error}</Alert>}
      <section className="space-y-2.5">
        <StepLabel>{t("booking.upcoming", { n: upcoming.length, max: 5 })}</StepLabel>
        {upcoming.length ? (
          upcoming.map(card)
        ) : (
          <div className="flex flex-col items-center gap-4 rounded-[18px] border-2 border-dashed border-line-strong px-5 py-10 text-center">
            <p className="font-semibold text-muted">{t("booking.none")}</p>
            <Link href="/map" className={buttonClass("primary", "md")}>
              {t("home.cta")}
            </Link>
          </div>
        )}
      </section>
      {past.length > 0 && (
        <section className="space-y-2.5">
          <StepLabel tone="muted">{t("booking.past")}</StepLabel>
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
                <button
                  type="button"
                  className="min-h-12 w-full rounded-xl border-2 border-ink font-bold transition hover:bg-ink hover:text-fg"
                  onClick={async () => {
                    await cancel(opened);
                  }}
                >
                  {t("booking.cancel")}
                </button>
              ) : (
                new Date(opened.start_at).getTime() > now && <p className="text-center text-xs font-semibold text-ink-soft">{t("booking.cancelClosed")}</p>
              ))
            }
          />
        </Modal>
      )}
    </main>
  );
}
