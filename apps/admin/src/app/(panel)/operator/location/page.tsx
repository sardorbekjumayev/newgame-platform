"use client";

import { ClubSubscriptionInfo } from "@/components/club-subscription";
import { Card, Heading } from "@/components/ui";
import { ClubLocationForm } from "@/components/club-location-form";
import { useI18n } from "@/i18n/provider";
import { fmtDateTime } from "@/lib/format";
import { useOperator } from "@/lib/operator";

/** Klub joyini keyin o'zgartirish (birinchi belgilash — layout'dagi majburiy qadam). */
export default function LocationPage() {
  const { t, locale } = useI18n();
  const { data, setData } = useOperator();
  if (!data) return null;
  return (
    <div className="max-w-4xl space-y-5">
      <Heading>{t("nav.clubSettings")}</Heading>

      <Card className="space-y-2">
        <div className="font-bold">{t("sub.title")}</div>
        <ClubSubscriptionInfo s={data.subscription} />
        {data.subscription && data.subscription.status !== "TRIAL" && data.subscription.status !== "ACTIVE" && <p className="text-xs text-muted">{t("sub.operatorPayHint")}</p>}
      </Card>

      <div>
        <h2 className="text-lg font-bold">{t("nav.location")}</h2>
        {data.club.location_set_at && <p className="mt-1 text-sm text-muted">{t("location.updatedAt", { at: fmtDateTime(data.club.location_set_at, locale) })}</p>}
      </div>
      <ClubLocationForm club={data.club} onSaved={setData} />
    </div>
  );
}
