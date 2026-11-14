"use client";

import { Building2, Check, Eye, Phone, User, X } from "lucide-react";
import { useState } from "react";
import { Pager } from "@/components/pager";
import { Alert, Badge, Button, Card, Chip, Field, Heading, Modal, Spinner } from "@/components/ui";
import { type MessageKey, useErrorText, useI18n } from "@/i18n/provider";
import { fmtDateTime, fmtPublicId } from "@/lib/format";
import { session } from "@/lib/session";
import type { RemovalRequest, RemovalStatus } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const STATUSES: RemovalStatus[] = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"];
const TONE: Record<RemovalStatus, "amber" | "green" | "red" | "neutral"> = { PENDING: "amber", APPROVED: "green", REJECTED: "red", CANCELLED: "neutral" };
const LIMIT = 20;

/** Operatorlarning "menejerni olib tashlash" so'rovlari: super admin ikkala tomon bilan bog'lanib qaror qiladi. */
export default function RemovalsPage() {
  const { t, locale } = useI18n();
  const [status, setStatus] = useState<RemovalStatus | "">("PENDING");
  const [page, setPage] = useState(1);
  const [decide, setDecide] = useState<{ r: RemovalRequest; approve: boolean } | null>(null);
  const list = useApi<RemovalRequest[]>(`/admin/removal-requests?${new URLSearchParams({ page: String(page), limit: String(LIMIT), ...(status ? { status } : {}) })}`);

  return (
    <div className="space-y-5">
      <div>
        <Heading>{t("nav.removals")}</Heading>
        <p className="mt-1 text-sm text-muted">{t("removal.adminHint")}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <Chip key={s} active={status === s} onClick={() => (setStatus(s), setPage(1))}>
            {t(`removal.status.${s}` as MessageKey)}
          </Chip>
        ))}
        <Chip active={!status} onClick={() => (setStatus(""), setPage(1))}>
          {t("app.all")}
        </Chip>
      </div>
      {list.error && <Alert>{list.error}</Alert>}
      {list.loading && !list.data ? (
        <Spinner />
      ) : !list.data?.length ? (
        <Card className="py-12 text-center text-muted">{t("common.empty")}</Card>
      ) : (
        <div className="space-y-3">
          {list.data.map((r) => (
            <Card key={r.id} className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2 font-bold">
                  <Building2 className="h-5 w-5 shrink-0 text-accent" />
                  <span className="truncate">{r.club.name}</span>
                  <span className="truncate text-sm font-normal text-muted">{[r.club.city, r.club.address].filter(Boolean).join(", ")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted">{fmtDateTime(r.created_at, locale)}</span>
                  <Badge tone={TONE[r.status]}>{t(`removal.status.${r.status}` as MessageKey)}</Badge>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Party icon={User} title={t("removal.fromOperator")} p={r.operator} extraPhone={r.club.phone} />
                <Party icon={Eye} title={t("removal.manager")} p={r.manager} />
              </div>
              {r.reason && (
                <div className="rounded-xl bg-surface-2 p-3 text-sm">
                  <span className="text-muted">{t("removal.reason")}: </span>
                  {r.reason}
                </div>
              )}
              {r.status !== "PENDING" && (r.admin_note || r.handler) && (
                <div className="text-sm text-muted">
                  {r.handler && `${[r.handler.first_name, r.handler.last_name].filter(Boolean).join(" ")} · ${fmtDateTime(r.handled_at, locale)}`}
                  {r.admin_note && <div className="mt-1 text-fg">«{r.admin_note}»</div>}
                </div>
              )}
              {r.status === "PENDING" && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="danger" onClick={() => setDecide({ r, approve: true })}>
                    <Check className="h-4 w-4" />
                    {t("removal.approve")}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setDecide({ r, approve: false })}>
                    <X className="h-4 w-4" />
                    {t("removal.reject")}
                  </Button>
                </div>
              )}
            </Card>
          ))}
          <Pager page={page} limit={LIMIT} total={list.meta?.total} onPage={setPage} />
        </div>
      )}
      {decide && (
        <DecideModal
          {...decide}
          onClose={() => setDecide(null)}
          onDone={() => {
            setDecide(null);
            list.reload();
          }}
        />
      )}
    </div>
  );
}

function Party({ icon: Icon, title, p, extraPhone }: { icon: typeof User; title: string; p: RemovalRequest["manager"]; extraPhone?: string | null }) {
  const phone = p?.phone ?? extraPhone ?? null;
  return (
    <div className="rounded-xl border border-line-soft p-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-muted">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </div>
      {p ? (
        <>
          <div className="font-semibold">{[p.first_name, p.last_name].filter(Boolean).join(" ") || p.username}</div>
          <div className="font-mono text-xs text-muted">
            {p.username} · ID {fmtPublicId(p.public_id)}
          </div>
          {phone && (
            <a href={`tel:${phone}`} className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline">
              <Phone className="h-3.5 w-3.5" />
              {phone}
            </a>
          )}
        </>
      ) : (
        <div className="text-sm text-muted">—</div>
      )}
    </div>
  );
}

function DecideModal({ r, approve, onClose, onDone }: { r: RemovalRequest; approve: boolean; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const manager = r.manager ? [r.manager.first_name, r.manager.last_name].filter(Boolean).join(" ") || r.manager.username : "—";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await session.post(`/admin/removal-requests/${r.id}/${approve ? "approve" : "reject"}`, { admin_note: note.trim() || undefined });
      onDone();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <Modal title={approve ? t("removal.approve") : t("removal.reject")} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Alert tone="info">{t(approve ? "removal.approveExplain" : "removal.rejectExplain", { manager: manager ?? "—", club: r.club.name })}</Alert>
        {error && <Alert>{error}</Alert>}
        <Field label={`${t("app.note")} (${t("common.optional")})`}>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder={t("removal.notePlaceholder")}
            className="w-full rounded-[14px] border border-line bg-surface px-4 py-3 text-[15px] outline-none focus:border-accent"
          />
        </Field>
        <Button type="submit" variant={approve ? "danger" : "primary"} className="w-full" loading={busy}>
          {approve ? t("removal.approve") : t("removal.reject")}
        </Button>
      </form>
    </Modal>
  );
}
