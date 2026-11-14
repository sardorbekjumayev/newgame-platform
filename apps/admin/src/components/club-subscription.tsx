"use client";

import { formatMoney } from "@ng/types";
import { CreditCard } from "lucide-react";
import { Badge, cx } from "@/components/ui";
import { type MessageKey, useI18n } from "@/i18n/provider";
import { fmtDateTime } from "@/lib/format";
import type { ClubSubSummary } from "@/lib/types";

const TONE = { TRIAL: "violet", ACTIVE: "green", EXPIRING: "amber", EXPIRED: "red" } as const;

/** Klub obunasi (menejer): reja, narx, limitlar va keyingi to'lovgacha qolgan vaqt. */
export function ClubSubscriptionInfo({ s, compact }: { s: ClubSubSummary | null; compact?: boolean }) {
  const { t, locale } = useI18n();
  if (!s)
    return (
      <div className="flex items-center gap-1.5 text-sm text-muted">
        <CreditCard className="h-4 w-4 shrink-0" /> {t("sub.status.NONE")}
      </div>
    );
  const left = Math.max(0, s.days_left);
  return (
    <div className={cx("space-y-1 text-sm", !compact && "rounded-xl bg-surface-2 p-3")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <CreditCard className="h-4 w-4 shrink-0 text-accent" />
          {s.plan.name} · {formatMoney(s.plan.price, locale)}/{t("plan.month")}
        </span>
        <Badge tone={TONE[s.status]}>{t(`sub.status.${s.status}` as MessageKey)}</Badge>
      </div>
      {!compact && <div className="text-muted">{t("sub.limits", { z: s.plan.max_zones, d: s.plan.max_devices })}</div>}
      <div className={s.status === "EXPIRED" ? "font-semibold text-danger-soft" : s.status === "EXPIRING" ? "font-semibold text-warn" : "text-muted"}>
        {s.status === "EXPIRED"
          ? t("sub.paymentOverdue", { at: fmtDateTime(s.ends_at, locale) })
          : t(s.status === "TRIAL" ? "sub.trialPayIn" : "sub.payIn", { n: left, at: fmtDateTime(s.ends_at, locale) })}
      </div>
    </div>
  );
}
