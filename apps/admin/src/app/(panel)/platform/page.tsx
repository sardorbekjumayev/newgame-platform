"use client";

import { AlertTriangle, Building2, CreditCard, Handshake, Inbox, MapPinOff, UserMinus, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { ActionTile, Alert, Heading, Stat } from "@/components/ui";
import { useI18n } from "@/i18n/provider";
import type { PlatformStats } from "@/lib/types";
import { useApi } from "@/lib/use-api";

export default function PlatformDashboard() {
  const { t } = useI18n();
  const s = useApi<PlatformStats>("/admin/stats");
  const v = (n: number | undefined) => (s.loading ? "…" : (n ?? "—"));
  return (
    <div className="space-y-6">
      <Heading>{t("platform.title")}</Heading>
      {s.error && <Alert>{s.error}</Alert>}
      {!!s.data?.subscription_alerts && (
        <Link href="/platform/subscriptions" className="block">
          <Alert>
            <span className="inline-flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> {t("sub.alertBanner", { n: s.data.subscription_alerts })}
            </span>
          </Alert>
        </Link>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Inbox} label={t("platform.stat.appsNew")} value={v(s.data?.applications_new)} accent />
        <Stat icon={Handshake} label={t("platform.stat.appsOpen")} value={v(s.data?.applications_open)} />
        <Stat icon={Building2} label={t("platform.stat.clubs")} value={s.data ? `${s.data.clubs} (${s.data.clubs_active})` : v(undefined)} />
        <Stat icon={Users} label={t("platform.stat.managers")} value={v(s.data?.managers)} />
        <Link href="/platform/removals">
          <Stat icon={UserMinus} label={t("platform.stat.removals")} value={v(s.data?.removals_pending)} accent={!!s.data?.removals_pending} />
        </Link>
        <Link href="/platform/subscriptions">
          <Stat icon={CreditCard} label={t("platform.stat.subAlerts")} value={v(s.data?.subscription_alerts)} accent={!!s.data?.subscription_alerts} />
        </Link>
        <Link href="/platform/clubs">
          <Stat icon={MapPinOff} label={t("platform.stat.noLocation")} value={v(s.data?.clubs_no_location)} />
        </Link>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Link href="/platform/applications">
          <ActionTile icon={Handshake} title={t("platform.quick.apps")} tone="accent" />
        </Link>
        <Link href="/platform/clubs?new=1">
          <ActionTile icon={Building2} title={t("platform.quick.club")} />
        </Link>
        <Link href="/platform/managers?new=1">
          <ActionTile icon={UserPlus} title={t("platform.quick.manager")} />
        </Link>
      </div>
    </div>
  );
}
