"use client";

import { BarChart3, Building2, ChevronRight, KeyRound, MapPin, Plus, User, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ClubSubscriptionInfo } from "@/components/club-subscription";
import { ShareClub } from "@/components/share-club";
import { Alert, Badge, Button, Card, Heading, Input, Spinner } from "@/components/ui";
import { type MessageKey, useErrorText, useI18n } from "@/i18n/provider";
import { fmtDateTime, fmtPublicId } from "@/lib/format";
import { mmss, useSecondsLeft } from "@/lib/countdown";
import { session } from "@/lib/session";
import type { LinkRequest, ManagerClub } from "@/lib/types";
import { useApi } from "@/lib/use-api";

/**
 * Menejer: 1) operator User ID si → so'rov (kod operator paneliga chiqadi); 2) operator aytgan kod → klub bog'lanadi.
 */
export default function ManagerPage() {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const clubs = useApi<ManagerClub[]>("/manager/clubs");
  const requests = useApi<LinkRequest[]>("/manager/link-requests");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [active, setActive] = useState<string | null>(null); // kod kiritilayotgan so'rov
  const digits = code.replace(/\D/g, "");

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setOk(false);
    try {
      await fn();
    } catch (err) {
      setError(errorText(err));
      // Muddati tugagan/bloklangan so'rov — ro'yxatdan chiqadi
      requests.reload();
    } finally {
      setBusy(false);
    }
  }

  const request = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const res = await session.post<{ request_id: string }>("/manager/link-requests", { public_id: digits });
      setCode("");
      setActive(res.data.request_id);
      requests.reload();
    });
  };

  const confirmCode = (id: string, value: string) =>
    run(async () => {
      const res = await session.post<{ clubs: ManagerClub[] }>(`/manager/link-requests/${id}/confirm`, { code: value });
      clubs.setData(res.data.clubs);
      setActive(null);
      setOk(true);
      requests.reload();
    });

  const cancelRequest = (id: string) =>
    run(async () => {
      await session.delete(`/manager/link-requests/${id}`);
      if (active === id) setActive(null);
      requests.reload();
    });

  async function unlink(c: ManagerClub) {
    const reason = prompt(`${t("managerPanel.removeConfirm")}\n${c.name}\n\n${t("managerPanel.removeReason")}`);
    if (reason === null) return;
    try {
      await session.post(`/manager/clubs/${c.id}/removal-request`, reason.trim() ? { reason: reason.trim() } : {});
      clubs.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function cancelUnlink(c: ManagerClub) {
    if (!c.pending_removal || !confirm(t("removal.cancelConfirm"))) return;
    try {
      await session.delete(`/manager/removal-requests/${c.pending_removal.id}`);
      clubs.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <div className="space-y-6">
      <Heading>{t("managerPanel.title")}</Heading>

      <Card className="space-y-3">
        <div className="font-bold">{t("managerPanel.add")}</div>
        <p className="text-sm text-muted">{t("managerPanel.addHint")}</p>
        <form onSubmit={request} className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/[^\d ]/g, "").slice(0, 9));
              setOk(false);
            }}
            inputMode="numeric"
            placeholder="482 71 93"
            className="font-mono text-lg tracking-widest sm:w-56"
            required
          />
          <Button type="submit" loading={busy && !active} disabled={digits.length !== 7}>
            <Plus className="h-4 w-4" />
            {t("managerPanel.addSubmit")}
          </Button>
        </form>
        {!!requests.data?.length && (
          <div className="space-y-2 pt-1">
            {requests.data.map((r) => (
              <PendingRequest
                key={r.id}
                req={r}
                open={active === r.id}
                busy={busy}
                onOpen={() => setActive(r.id)}
                onConfirm={(v) => confirmCode(r.id, v)}
                onCancel={() => cancelRequest(r.id)}
              />
            ))}
          </div>
        )}
        {error && <Alert>{error}</Alert>}
        {ok && <Alert tone="success">{t("managerPanel.added")}</Alert>}
      </Card>

      {clubs.loading && !clubs.data ? (
        <Spinner />
      ) : clubs.error ? (
        <Alert>{clubs.error}</Alert>
      ) : !clubs.data?.length ? (
        <Card className="py-12 text-center text-muted">{t("managerPanel.empty")}</Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {clubs.data.map((c) => (
            <Card key={c.id} className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
                  <Building2 className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">{c.name}</div>
                  <div className="flex items-center gap-1 truncate text-sm text-muted">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    {[c.city, c.address].filter(Boolean).join(", ")}
                  </div>
                </div>
                {!c.pending_removal && (
                  <button className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-danger-soft" title={t("managerPanel.remove")} aria-label={t("managerPanel.remove")} onClick={() => unlink(c)}>
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {c.pending_removal && (
                <div className="space-y-1.5 rounded-xl bg-surface-2 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone="amber">{t("removal.pending")}</Badge>
                    {c.pending_removal.by_me && (
                      <button className="text-xs font-semibold text-muted hover:text-fg hover:underline" onClick={() => cancelUnlink(c)}>
                        {t("removal.cancel")}
                      </button>
                    )}
                  </div>
                  <p className="text-muted">{t(c.pending_removal.by_me ? "managerPanel.removePending" : "managerPanel.removeByOperator")}</p>
                  {c.pending_removal.reason && <p className="text-muted">«{c.pending_removal.reason}»</p>}
                </div>
              )}
              <div className="flex items-center justify-between gap-2 border-t border-line-soft pt-3 text-sm">
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <User className="h-4 w-4 shrink-0 text-accent" />
                  <span className="truncate">
                    {c.operator ? `${[c.operator.first_name, c.operator.last_name].filter(Boolean).join(" ")} · ID ${fmtPublicId(c.operator.public_id)}` : t("club.noOperator")}
                  </span>
                </span>
                <Badge tone={c.status === "ACTIVE" ? "green" : "red"}>{t(`club.status.${c.status}` as MessageKey)}</Badge>
              </div>
              <ClubSubscriptionInfo s={c.subscription} compact />
              {c.zones.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {c.zones.map((z) => (
                    <span key={z.id} className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-2 py-1 text-xs font-semibold">
                      <span className="h-2 w-2 rounded-full" style={{ background: z.color ?? "#3a3f4b" }} />
                      {z.name}
                      {z.devices_count ? <span className="font-normal text-muted">· {z.devices_count}</span> : null}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/manager/clubs/${c.id}`} className="inline-flex items-center gap-1 text-sm font-bold text-accent hover:underline">
                  {c.zones.length ? t("managerPanel.zonesTariffs", { z: c.zones.length, t: c.tariffs_count }) : t("managerPanel.noZones")}
                  <ChevronRight className="h-4 w-4" />
                </Link>
                <ShareClub clubId={c.id} clubName={c.name} size="sm" />
              </div>
              <div className="text-xs text-muted">
                {t("common.lastLogin")} ({t("role.OPERATOR").toLowerCase()}): {c.operator?.last_login_at ? fmtDateTime(c.operator.last_login_at, locale) : t("common.never")}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card className="flex items-center gap-4 border border-dashed border-line py-10 text-muted">
        <BarChart3 className="h-8 w-8 shrink-0" />
        <span>{t("managerPanel.soon")}</span>
      </Card>
    </div>
  );
}

function PendingRequest({ req, open, busy, onOpen, onConfirm, onCancel }: { req: LinkRequest; open: boolean; busy: boolean; onOpen: () => void; onConfirm: (code: string) => void; onCancel: () => void }) {
  const { t } = useI18n();
  const left = useSecondsLeft(req.expires_at);
  const [code, setCode] = useState("");
  if (left <= 0) return null;
  return (
    <div className="space-y-3 rounded-2xl border border-accent/30 bg-surface-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 font-semibold">
          <KeyRound className="h-4 w-4 text-accent" />
          {open ? t("managerPanel.codeTitle") : t("managerPanel.pending")}
        </span>
        <span className="text-xs tabular-nums text-muted">{t("operator.expiresIn", mmss(left))}</span>
      </div>
      {open ? (
        <>
          <p className="text-sm text-muted">{t("managerPanel.codeHint")}</p>
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              onConfirm(code);
            }}
          >
            <Input
              value={code}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                setCode(v);
                if (v.length === 6 && !busy) onConfirm(v);
              }}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              className="text-center font-mono text-xl tracking-[0.4em] sm:w-48"
              autoFocus
              required
            />
            <Button type="submit" loading={busy} disabled={code.length !== 6}>
              {t("managerPanel.codeSubmit")}
            </Button>
            <Button type="button" variant="ghost" onClick={onCancel}>
              {t("managerPanel.cancel")}
            </Button>
          </form>
        </>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" onClick={onOpen}>
            {t("managerPanel.enterCode")}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            {t("managerPanel.cancel")}
          </Button>
        </div>
      )}
    </div>
  );
}
