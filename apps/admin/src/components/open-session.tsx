"use client";

import { formatMoney } from "@ng/types";
import { Button, Modal } from "@/components/ui";
import { useI18n } from "@/i18n/provider";

/**
 * "Ochiq vaqt": operator ochadi, tugashi noma'lum — faqat operator to'xtatadi, summa o'shanda
 * (soatlik tarif bo'yicha, daqiqasiga) hisoblanadi. API: `POST /operator/bookings/walk-in {open:true}`, `POST .../:id/stop`.
 */
/** Davom etayotgan sessiya holati: o'tgan vaqt, shu paytgacha summa va chegarasi (klub yopilishi / 12 soat / keyingi bron). */
export type OpenInfo = { elapsed_minutes: number; amount: number; limit_at: string };
/** To'xtatilgan sessiya (`.../stop` javobi). */
export type StoppedSession = { id: string; code: string; start_at: string; end_at: string; duration_minutes: number; total_amount: number; zones: { name: string; seats: number[] }[] };

const TZ = "Asia/Tashkent";
export const hm = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

type T = ReturnType<typeof useI18n>["t"];
export const fmtElapsed = (min: number, t: T) => (min < 60 ? t("opOpen.m", { m: min }) : t("opOpen.hm", { h: Math.floor(min / 60), m: min % 60 }));

/** Sessiya to'xtatilgach: operator mijozdan oladigan yakuniy summa. */
export function StoppedModal({ s, onClose }: { s: StoppedSession; onClose: () => void }) {
  const { t, locale } = useI18n();
  return (
    <Modal title={t("opOpen.stopped", { code: s.code })} onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-2xl bg-accent/10 p-5 text-center ring-1 ring-accent/40">
          <div className="text-sm text-muted">{t("opOpen.toPay")}</div>
          <div className="font-display text-4xl font-bold text-accent tabular-nums">{formatMoney(s.total_amount, locale)}</div>
        </div>
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">{t("opOpen.seats")}</dt>
            <dd className="text-right font-semibold">{s.zones.map((z) => `${z.name} #${z.seats.join(", #")}`).join(" · ")}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">{t("opOpen.time")}</dt>
            <dd className="font-semibold tabular-nums">
              {hm(s.start_at)}–{hm(s.end_at)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">{t("opOpen.duration")}</dt>
            <dd className="font-semibold">{fmtElapsed(s.duration_minutes, t)}</dd>
          </div>
        </dl>
        <Button className="h-11 w-full" onClick={onClose}>
          {t("opOpen.close")}
        </Button>
      </div>
    </Modal>
  );
}
