"use client";

import { formatMoney } from "@ng/types";
import { useI18n } from "@/i18n/provider";
import type { ClubCard } from "@/lib/types";

/** "Ochiq/Yopiq" belgisi (ish vaqti kiritilmagan bo'lsa ko'rsatilmaydi). */
export function OpenBadge({ open }: { open: boolean | null }) {
  const { t } = useI18n();
  if (open === null) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${open ? "bg-accent/15 text-accent" : "bg-surface-3 text-muted"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${open ? "bg-accent" : "bg-muted"}`} />
      {open ? t("clubs.open") : t("clubs.closed")}
    </span>
  );
}

export function PriceFrom({ club }: { club: Pick<ClubCard, "price_from" | "price_unit"> }) {
  const { t, locale } = useI18n();
  if (club.price_from == null) return null;
  const price = formatMoney(club.price_from, locale);
  return <span className="font-semibold">{club.price_unit === "HOUR" ? t("map.priceFrom", { price }) : t("catalog.packageFrom", { price })}</span>;
}
