"use client";

import { Clock, Eye, UserMinus } from "lucide-react";
import { useState } from "react";
import { Alert, Badge, Button, Card, Field, Heading, Modal } from "@/components/ui";
import { useErrorText, useI18n } from "@/i18n/provider";
import { fmtDateTime, fmtPublicId } from "@/lib/format";
import { useOperator } from "@/lib/operator";
import { session } from "@/lib/session";
import type { OperatorDashboard } from "@/lib/types";

type Mgr = OperatorDashboard["managers"][number];

/** Klubni kuzatayotgan menejerlar. Olib tashlash — super admin tasdig'i bilan (so'rov). */
export default function OperatorManagersPage() {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const { data, reload } = useOperator();
  const [target, setTarget] = useState<Mgr | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!data) return null;
  const name = (m: Mgr) => [m.first_name, m.last_name].filter(Boolean).join(" ") || m.username || "—";

  async function cancel(m: Mgr) {
    if (!m.removal_request || !confirm(t("removal.cancelConfirm"))) return;
    setError(null);
    try {
      await session.delete(`/operator/removal-requests/${m.removal_request.id}`);
      reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <Heading>{t("nav.managers")}</Heading>
        <p className="mt-1 text-sm text-muted">{t("removal.pageHint")}</p>
      </div>
      {error && <Alert>{error}</Alert>}
      {data.managers.length === 0 ? (
        <Card className="py-12 text-center text-muted">{t("operator.noManagers")}</Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.managers.map((m) => (
            <Card key={m.id} className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent/10 text-accent">
                    <Eye className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-bold">{name(m)}</div>
                    <div className="truncate font-mono text-xs text-muted">
                      {m.username} · ID {fmtPublicId(m.public_id)}
                    </div>
                  </div>
                </div>
                {m.removal_request && <Badge tone="amber">{t("removal.pending")}</Badge>}
              </div>
              <div className="text-xs text-muted">{t("removal.linkedAt", { at: fmtDateTime(m.linked_at, locale) })}</div>
              {m.removal_request ? (
                <div className="space-y-2 rounded-xl bg-surface-2 p-3 text-sm">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <Clock className="h-4 w-4 text-warn" />
                    {t("removal.waiting")}
                  </div>
                  {m.removal_request.reason && <p className="text-muted">«{m.removal_request.reason}»</p>}
                  <Button size="sm" variant="ghost" onClick={() => cancel(m)}>
                    {t("removal.cancel")}
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="danger" onClick={() => setTarget(m)}>
                  <UserMinus className="h-4 w-4" />
                  {t("removal.request")}
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}
      {target && (
        <RemovalModal
          manager={target}
          name={name(target)}
          onClose={() => setTarget(null)}
          onSent={() => {
            setTarget(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function RemovalModal({ manager, name, onClose, onSent }: { manager: Mgr; name: string; onClose: () => void; onSent: () => void }) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await session.post(`/operator/managers/${manager.id}/removal-request`, { reason: reason.trim() || undefined });
      onSent();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <Modal title={t("removal.request")} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Alert tone="info">{t("removal.explain", { name })}</Alert>
        {error && <Alert>{error}</Alert>}
        <Field label={`${t("removal.reason")} (${t("common.optional")})`}>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={1000}
            rows={3}
            className="w-full rounded-[14px] border border-line bg-surface px-4 py-3 text-[15px] outline-none focus:border-accent"
          />
        </Field>
        <Button type="submit" variant="danger" className="w-full" loading={busy}>
          {t("removal.send")}
        </Button>
      </form>
    </Modal>
  );
}
