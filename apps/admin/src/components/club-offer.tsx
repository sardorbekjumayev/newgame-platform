"use client";

import { formatMoney } from "@ng/types";
import { Clock } from "lucide-react";
import { Badge, Card, cx } from "@/components/ui";
import { type MessageKey, useI18n } from "@/i18n/provider";
import { DAY_KEYS, type ManagerClubDetail, type WorkingHours } from "@/lib/types";

type Zones = ManagerClubDetail["zones"];

/** Klub zonalari va tariflari (faqat ko'rish) — menejer va super admin panellarida. `compact` — modal ichida. */
export function ZonesView({ zones, compact }: { zones: Zones; compact?: boolean }) {
  const { t, locale } = useI18n();
  const fmtDur = (m: number) => (m % 60 === 0 ? t("tariff.hours", { n: m / 60 }) : t("tariff.minutes", { n: m }));
  if (zones.length === 0) return <Card className={cx("text-center text-muted", compact ? "py-5 text-sm" : "py-10")}>{t("managerPanel.noZonesLong")}</Card>;
  return (
    <div className={compact ? "space-y-2" : "space-y-4"}>
      {zones.map((z) => (
        <Card key={z.id} className={cx("space-y-3", compact && "p-4")}>
          <div className="flex items-center gap-3">
            <span className={cx("shrink-0 rounded-full", compact ? "h-7 w-1.5" : "h-9 w-2")} style={{ background: z.color ?? "#3a3f4b" }} />
            <div className="min-w-0">
              <div className={cx("font-display font-bold", compact ? "text-base" : "text-lg")}>{z.name}</div>
              {z.description && <div className="text-sm text-muted">{z.description}</div>}
            </div>
          </div>
          {z.tariffs.length === 0 ? (
            <p className="text-sm text-muted">{t("tariff.empty")}</p>
          ) : (
            <div className="space-y-2">
              {z.tariffs.map((x) => (
                <div key={x.id} className={cx("flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-surface-2", compact ? "px-3 py-2" : "px-4 py-3", !x.is_active && "opacity-60")}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      {x.name}
                      {!x.is_active && <Badge>{t("tariff.inactive")}</Badge>}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted">
                      <span>{x.type === "HOURLY" ? t("tariff.type.HOURLY") : `${t("tariff.type.PACKAGE")} · ${fmtDur(x.duration_minutes ?? 0)}`}</span>
                      {x.valid_from && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {x.valid_from}–{x.valid_to}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={cx("font-display font-bold text-accent tabular-nums", compact ? "text-base" : "text-lg")}>
                    {formatMoney(x.price, locale)}
                    {x.type === "HOURLY" && <span className="text-sm font-semibold text-muted"> / {t("tariff.perHour")}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

/** Haftalik ish vaqti (faqat ko'rish). */
export function HoursView({ wh }: { wh: WorkingHours | null }) {
  const { t } = useI18n();
  if (!wh) return <p className="text-sm text-muted">{t("managerPanel.hoursNotSet")}</p>;
  if (wh.always_open) return <p className="font-semibold text-accent">24/7</p>;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
      {DAY_KEYS.map((d) => {
        const ws = wh[d] ?? [];
        return (
          <div key={d} className="contents">
            <dt className="text-muted">{t(`day.${d}` as MessageKey)}</dt>
            <dd className="text-right font-semibold tabular-nums">{ws.length ? ws.map((w) => `${w.open}–${w.close}`).join(", ") : t("hours.closed")}</dd>
          </div>
        );
      })}
    </dl>
  );
}
