"use client";

import { formatMoney } from "@ng/types";
import { CalendarCheck, MapPin } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Spinner } from "@/components/ui";
import { type MessageKey, useErrorText, useI18n } from "@/i18n/provider";
import { fmtDate, fmtTime } from "@/lib/format";
import { session, useAuth } from "@/lib/session";
import { useApi } from "@/lib/use-api";

type Booking = {
  id: string; code: string; status: string; start_at: string; end_at: string; total_amount: number; can_cancel: boolean;
  club: { id: string; name: string; address: string | null; phone: string | null };
  devices: { zone: string; color: string | null; seat_no: number }[];
};
const TONE: Record<string, "green" | "violet" | "neutral" | "red" | "amber"> = { CONFIRMED: "green", CHECKED_IN: "violet", COMPLETED: "neutral", CANCELLED: "red", NO_SHOW: "amber" };

/** Mijoz: mening bronlarim — kelgusi va o'tganlar, bekor qilish (kamida 1 soat oldin). */
export default function BookingsPage() {
  const { t, locale } = useI18n();
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

  const card = (b: Booking) => (
    <Card key={b.id} className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/clubs/${b.club.id}`} className="font-display text-lg font-bold hover:text-accent">
            {b.club.name}
          </Link>
          {b.club.address && (
            <div className="flex items-center gap-1 text-sm text-muted">
              <MapPin className="h-3.5 w-3.5" /> {b.club.address}
            </div>
          )}
        </div>
        <Badge tone={TONE[b.status] ?? "neutral"}>{t(`booking.status.${b.status}` as MessageKey)}</Badge>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="font-semibold">
          {fmtDate(b.start_at, t as never)}, {fmtTime(b.start_at)}–{fmtTime(b.end_at)}
        </span>
        <span className="text-muted">
          {t("booking.code")}: <b className="font-mono text-fg">{b.code}</b>
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5 text-xs">
        {b.devices.map((d, i) => (
          <span key={i} className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-2 py-1 font-semibold">
            <span className="h-2 w-2 rounded-full" style={{ background: d.color ?? "#3a3f4b" }} />
            {d.zone} #{d.seat_no}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-3">
        <div>
          <span className="font-display text-lg font-bold text-accent">{formatMoney(b.total_amount, locale)}</span>
          <span className="ml-2 text-xs text-muted">{t("booking.payAtClub")}</span>
        </div>
        {b.status === "CONFIRMED" &&
          (b.can_cancel ? (
            <Button size="sm" variant="secondary" onClick={() => cancel(b)}>
              {t("booking.cancel")}
            </Button>
          ) : (
            new Date(b.start_at).getTime() > now && <span className="text-xs text-muted">{t("booking.cancelClosed")}</span>
          ))}
      </div>
    </Card>
  );

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-8 sm:px-8">
      <h1 className="flex items-center gap-2 font-display text-3xl font-bold">
        <CalendarCheck className="h-7 w-7 text-accent" /> {t("booking.mine")}
      </h1>
      {error && <Alert>{error}</Alert>}
      {list.error && <Alert>{list.error}</Alert>}
      <section className="space-y-3">
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
        <section className="space-y-3">
          <h2 className="font-bold text-muted">{t("booking.past")}</h2>
          {past.map(card)}
        </section>
      )}
    </main>
  );
}
