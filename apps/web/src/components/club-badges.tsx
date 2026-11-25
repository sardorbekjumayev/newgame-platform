"use client";

import { formatMoney } from "@ng/types";
import { cx } from "@/components/ui";
import { useI18n } from "@/i18n/provider";
import type { ClubCard } from "@/lib/types";

/**
 * "Hozir ochiq / Yopiq" belgisi (ish vaqti kiritilmagan bo'lsa ko'rsatilmaydi).
 * `on` — qaysi fon ustida: qora (dark), lime yoki oq karta.
 */
export function OpenBadge({ open, on = "dark", className }: { open: boolean | null; on?: "dark" | "accent" | "paper"; className?: string }) {
  const { t } = useI18n();
  if (open === null) return null;
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-[13px] font-bold whitespace-nowrap",
        on === "dark" && (open ? "bg-accent text-on-accent" : "border-2 border-line-strong text-muted"),
        on === "accent" && (open ? "bg-ink text-accent" : "border-2 border-ink text-ink"),
        on === "paper" && (open ? "bg-ink text-fg" : "border-2 border-ink-soft text-ink-soft"),
        className,
      )}
    >
      {open ? t("clubs.openNow") : t("clubs.closed")}
    </span>
  );
}

/** Klub logotipi: oq fonli kvadrat (shaffof logotiplar ham ko'rinadi). O'lchami `className` bilan. */
export function ClubLogo({ url, className }: { url: string; className?: string }) {
  return (
    <span className={cx("grid shrink-0 place-items-center overflow-hidden rounded-[12px] border-2 border-ink bg-paper", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- API'dagi tayyor webp */}
      <img src={url} alt="" loading="lazy" className="h-full w-full object-contain p-1" />
    </span>
  );
}

export function PriceFrom({ club }: { club: Pick<ClubCard, "price_from" | "price_unit"> }) {
  const { t, locale } = useI18n();
  if (club.price_from == null) return null;
  const price = formatMoney(club.price_from, locale);
  return <span className="font-bold">{club.price_unit === "HOUR" ? t("map.priceFrom", { price }) : t("catalog.packageFrom", { price })}</span>;
}
