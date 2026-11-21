"use client";

import { Check, Monitor } from "lucide-react";
import { cx } from "@/components/ui";
import { useI18n } from "@/i18n/provider";
import { durationLabel } from "@/lib/format";

/** Namuna zal: 12 o'rindiq — 2 tasi tanlangan (chiptadagi №5, 6), 2 tasi band. */
const SEATS = ["free", "free", "busy", "free", "picked", "picked", "free", "busy", "free", "free", "free", "free"] as const;

/**
 * Bosh sahifa hero'sining o'ng tomoni (faqat keng ekranda, bezak): mahsulotning o'zi —
 * zal sxemasidan joy tanlash → bron chiptasi (kod bilan) va aylanuvchi lime "stiker".
 * Ma'lumotlar namunaviy; ekran o'quvchilardan yashirilgan.
 */
export function HeroArt({ className }: { className?: string }) {
  const { t } = useI18n();
  const ring = `${t("landing.h1.m1")} ✦ ${t("landing.h1.m2")} ✦ ${t("landing.h1.m3")} ✦ `.toUpperCase();

  return (
    <div aria-hidden className={cx("pointer-events-none relative ml-auto h-[440px] w-full max-w-[520px] select-none", className)}>
      {/* Zal sxemasi */}
      <div className="absolute bottom-0 left-0 w-[236px] animate-float rounded-[24px] border-2 border-line-strong bg-surface p-5 [animation-delay:-3.5s] -rotate-[7deg]">
        <div className="text-[13px] font-bold tracking-[0.08em] text-accent uppercase">{t("catalog.layout")}</div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {SEATS.map((s, i) => (
            <span
              key={i}
              className={cx(
                "flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg border-2 text-[10px] leading-none font-bold",
                s === "picked" ? "border-accent bg-accent text-on-accent" : s === "busy" ? "border-line-strong text-dim" : "border-fg text-fg",
              )}
            >
              <Monitor className="h-3.5 w-3.5" />
              {i + 1}
            </span>
          ))}
        </div>
        <div className="mt-3 flex justify-between text-[13px] font-bold">
          <span className="text-muted">{t("seat.on")}</span>
          <span>2/5</span>
        </div>
      </div>

      {/* Bron chiptasi */}
      <div className="absolute top-2 right-0 w-[292px] animate-float rounded-[24px] bg-paper p-5 text-ink shadow-[0_28px_70px_rgba(0,0,0,0.6)] rotate-[5deg]">
        <div className="text-[11px] font-bold tracking-[0.2em] text-ink-soft uppercase">Zonup</div>
        <div className="mt-1 font-display text-[30px] uppercase leading-none">{t("ticket.label")}</div>
        <div className="my-3.5 border-t-2 border-dashed border-ink" />
        <div className="rounded-[14px] bg-ink px-3 py-3 text-center">
          <div className="text-[10px] font-bold tracking-[0.2em] text-muted uppercase">{t("booking.code")}</div>
          <div className="mt-1 font-display text-[40px] leading-none tracking-[0.14em] text-accent">ZN4UP7</div>
        </div>
        <dl className="mt-3.5 space-y-1.5 text-sm font-bold">
          {[
            [t("ticket.zone"), "VIP · №5, 6"],
            [t("ticket.date"), `${t("book.today")}, 18:00`],
            [t("ticket.duration"), durationLabel(120, t as never)],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Aylanuvchi stiker */}
      <div className="absolute top-0 left-[5%] grid h-[136px] w-[136px] place-items-center rounded-full bg-accent text-on-accent shadow-[0_16px_40px_rgba(0,0,0,0.5)]">
        <svg viewBox="0 0 136 136" className="absolute inset-0 animate-spin-slow">
          <defs>
            <path id="hero-ring" d="M68,68 m-50,0 a50,50 0 1,1 100,0 a50,50 0 1,1 -100,0" />
          </defs>
          <text className="font-display" fontSize="15" fill="currentColor">
            <textPath href="#hero-ring" textLength="306" lengthAdjust="spacing">
              {ring + ring}
            </textPath>
          </text>
        </svg>
        <Check className="h-11 w-11" strokeWidth={3.4} />
      </div>
    </div>
  );
}
