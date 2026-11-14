"use client";

import { MapPinned } from "lucide-react";
import { ClubLocationForm } from "@/components/club-location-form";
import { Alert, Card, Heading, Spinner } from "@/components/ui";
import { useI18n } from "@/i18n/provider";
import { OperatorProvider, useOperator } from "@/lib/operator";

export default function OperatorLayout({ children }: { children: React.ReactNode }) {
  return (
    <OperatorProvider>
      <LocationGate>{children}</LocationGate>
    </OperatorProvider>
  );
}

/** Birinchi qadam: klub joyi xaritada belgilanmaguncha operator paneli ochilmaydi. */
function LocationGate({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const { data, error, setData } = useOperator();
  if (!data) return error ? <Alert>{error}</Alert> : <Spinner />;
  if (!data.club.needs_location) return <>{children}</>;
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent text-on-accent">
          <MapPinned className="h-6 w-6" />
        </span>
        <div>
          <Heading>{t("location.setupTitle")}</Heading>
          <p className="mt-1 text-muted">{t("location.setupText", { club: data.club.name })}</p>
        </div>
      </div>
      <Card className="space-y-2 text-sm">
        <ol className="list-decimal space-y-1 pl-5 text-muted">
          <li>{t("location.step1")}</li>
          <li>{t("location.step2")}</li>
          <li>{t("location.step3")}</li>
        </ol>
      </Card>
      <ClubLocationForm club={data.club} onSaved={setData} />
    </div>
  );
}
