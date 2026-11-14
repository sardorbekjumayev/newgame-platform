"use client";

import { Heading } from "@/components/ui";
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
      <div>
        <Heading>{t("nav.location")}</Heading>
        {data.club.location_set_at && <p className="mt-1 text-sm text-muted">{t("location.updatedAt", { at: fmtDateTime(data.club.location_set_at, locale) })}</p>}
      </div>
      <ClubLocationForm club={data.club} onSaved={setData} />
    </div>
  );
}
