"use client";

import { BarChart3, Eye, KeyRound, MapPin, Phone } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CopyButton } from "@/components/credentials";
import { ClubSubscriptionInfo } from "@/components/club-subscription";
import { ShareClub } from "@/components/share-club";
import { Alert, Badge, Button, Card, Heading } from "@/components/ui";
import { type MessageKey, useErrorText, useI18n } from "@/i18n/provider";
import { mmss, useSecondsLeft } from "@/lib/countdown";
import { fmtPublicId } from "@/lib/format";
import { useOperator } from "@/lib/operator";
import { session } from "@/lib/session";

/** Operator: o'z klubi + User ID (menejerga aytish uchun) + menejerlarning ulanish so'rovlari (kod). */
export default function OperatorPage() {
  const { t } = useI18n();
  const errorText = useErrorText();
  const { data, reload } = useOperator();
  const [actionError, setActionError] = useState<string | null>(null);
  if (!data) return null;
  const { me, club, managers, link_requests, subscription } = data;

  async function reject(id: string) {
    if (!confirm(t("operator.rejectConfirm"))) return;
    setActionError(null);
    try {
      await session.post(`/operator/link-requests/${id}/reject`);
      reload();
    } catch (e) {
      setActionError(errorText(e));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Heading>{club.name}</Heading>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              {[club.city, club.address].filter(Boolean).join(", ")}
            </span>
            {club.phone && (
              <span className="inline-flex items-center gap-1">
                <Phone className="h-4 w-4" />
                {club.phone}
              </span>
            )}
            <Link href="/operator/location" className="font-semibold text-accent hover:underline">
              {t("location.change")}
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ShareClub clubId={club.id} clubName={club.name} />
          <Badge tone={club.status === "ACTIVE" ? "green" : "red"}>{t(`club.status.${club.status}` as MessageKey)}</Badge>
        </div>
      </div>

      <Card className="space-y-2">
        <div className="font-bold">{t("sub.title")}</div>
        <ClubSubscriptionInfo s={subscription} />
        {subscription && subscription.status !== "TRIAL" && subscription.status !== "ACTIVE" && <p className="text-xs text-muted">{t("sub.operatorPayHint")}</p>}
      </Card>

      {actionError && <Alert>{actionError}</Alert>}
      {link_requests.length > 0 && (
        <Card className="space-y-3 border border-warn/40">
          <div className="flex items-center gap-2 font-bold">
            <KeyRound className="h-5 w-5 text-warn" />
            {t("operator.requests")}
          </div>
          <p className="text-sm text-muted">{t("operator.requestsHint")}</p>
          <div className="grid gap-3 md:grid-cols-2">
            {link_requests.map((r) => (
              <LinkRequestCard
                key={r.id}
                name={[r.manager.first_name, r.manager.last_name].filter(Boolean).join(" ") || r.manager.username || "—"}
                code={r.code}
                expiresAt={r.expires_at}
                onReject={() => reject(r.id)}
              />
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card className="relative space-y-3 overflow-hidden border border-accent/30">
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-accent/10 blur-3xl" />
          <div className="text-xs font-bold uppercase tracking-widest text-muted">{t("operator.idTitle")}</div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-display text-5xl font-bold tracking-widest text-accent tabular-nums">{fmtPublicId(me.public_id)}</span>
            <CopyButton text={me.public_id ?? ""} />
          </div>
          <p className="max-w-md text-sm text-muted">{t("operator.idHint")}</p>
        </Card>
        <Link href="/operator/managers">
          <Card className="flex h-full flex-col justify-between gap-3 transition hover:border-accent/40">
            <div className="flex items-center gap-2 font-bold">
              <Eye className="h-5 w-5 text-accent" />
              {t("operator.managers")}
            </div>
            <div className="font-display text-5xl font-bold tabular-nums">{managers.length}</div>
            <span className="text-sm font-semibold text-accent">{t("nav.managers")} →</span>
          </Card>
        </Link>
      </div>

      <Card className="flex items-center gap-4 border border-dashed border-line py-10 text-muted">
        <BarChart3 className="h-8 w-8 shrink-0" />
        <span>{t("operator.soon")}</span>
      </Card>
    </div>
  );
}

function LinkRequestCard({ name, code, expiresAt, onReject }: { name: string; code: string; expiresAt: string; onReject: () => void }) {
  const { t } = useI18n();
  const left = useSecondsLeft(expiresAt);
  if (left <= 0) return null;
  return (
    <div className="space-y-2 rounded-2xl bg-surface-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-semibold">{name}</span>
        <span className="shrink-0 text-xs tabular-nums text-muted">{t("operator.expiresIn", mmss(left))}</span>
      </div>
      <div className="text-xs text-muted">{t("operator.codeFor")}</div>
      <div className="font-display text-4xl font-bold tracking-[0.3em] text-accent tabular-nums">{code}</div>
      <Button size="sm" variant="ghost" onClick={onReject}>
        {t("operator.reject")}
      </Button>
    </div>
  );
}
