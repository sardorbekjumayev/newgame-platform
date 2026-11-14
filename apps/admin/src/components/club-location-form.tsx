"use client";

import { Save } from "lucide-react";
import { useState } from "react";
import { LocationPicker } from "@/components/map/location-picker";
import type { LatLng } from "@/components/map/provider";
import { Alert, Button, Field, Input } from "@/components/ui";
import { useErrorText, useI18n } from "@/i18n/provider";
import { session } from "@/lib/session";
import type { OperatorDashboard } from "@/lib/types";

/** Klub joyi: xarita + manzil matni → PUT /operator/location. */
export function ClubLocationForm({ club, onSaved }: { club: OperatorDashboard["club"]; onSaved: (d: OperatorDashboard) => void }) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const [pos, setPos] = useState<LatLng | null>(club.latitude !== null && club.longitude !== null ? { lat: club.latitude, lng: club.longitude } : null);
  const [address, setAddress] = useState(club.address ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    if (!pos) return setError(t("location.pickFirst"));
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await session.put<OperatorDashboard>("/operator/location", { latitude: pos.lat, longitude: pos.lng, address: address.trim() || undefined });
      setSaved(true);
      onSaved(res.data);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <LocationPicker
        value={pos}
        onChange={(p, addr) => {
          setPos(p);
          setSaved(false);
          if (addr) setAddress(addr);
        }}
      />
      <Field label={t("club.address")} hint={t("location.addressHint")}>
        <Input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} />
      </Field>
      {error && <Alert>{error}</Alert>}
      {saved && <Alert tone="success">{t("location.saved")}</Alert>}
      <Button size="lg" className="w-full sm:w-auto" loading={busy} disabled={!pos} onClick={save}>
        <Save className="h-4 w-4" />
        {t("location.save")}
      </Button>
    </div>
  );
}
