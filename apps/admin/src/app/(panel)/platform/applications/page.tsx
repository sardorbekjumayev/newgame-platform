"use client";

import { Building2, Phone, Search, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Pager } from "@/components/pager";
import { Alert, Badge, Button, Card, Chip, Field, Heading, Input, Modal, Select, Spinner } from "@/components/ui";
import { type MessageKey, useErrorText, useI18n } from "@/i18n/provider";
import { fmtDateTime } from "@/lib/format";
import { session } from "@/lib/session";
import type { Application, ApplicationStatus } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const STATUSES: ApplicationStatus[] = ["NEW", "CONTACTED", "APPROVED", "REJECTED"];
const TONE: Record<ApplicationStatus, "violet" | "amber" | "green" | "red"> = { NEW: "violet", CONTACTED: "amber", APPROVED: "green", REJECTED: "red" };
const LIMIT = 20;

export default function ApplicationsPage() {
  const { t, locale } = useI18n();
  const [status, setStatus] = useState<ApplicationStatus | "">("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const qs = new URLSearchParams({ page: String(page), limit: String(LIMIT), ...(status ? { status } : {}), ...(search ? { q: search } : {}) });
  const list = useApi<Application[]>(`/admin/club-applications?${qs}`);

  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(q.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [q]);

  return (
    <div className="space-y-5">
      <Heading>{t("nav.applications")}</Heading>
      <div className="flex flex-wrap items-center gap-2">
        <Chip active={!status} onClick={() => (setStatus(""), setPage(1))}>
          {t("app.all")}
        </Chip>
        {STATUSES.map((s) => (
          <Chip key={s} active={status === s} onClick={() => (setStatus(s), setPage(1))}>
            {t(`app.status.${s}` as MessageKey)}
          </Chip>
        ))}
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("common.search")} className="h-10 w-full pl-9" />
        </div>
      </div>
      {list.error && <Alert>{list.error}</Alert>}
      {list.loading && !list.data ? (
        <Spinner />
      ) : !list.data?.length ? (
        <Card className="py-12 text-center text-muted">{t("common.empty")}</Card>
      ) : (
        <div className="space-y-2">
          {list.data.map((a) => (
            <button key={a.id} onClick={() => setOpenId(a.id)} className="w-full text-left">
              <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 transition hover:border-accent/40">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">{a.club_name ?? a.full_name}</div>
                  <div className="truncate text-sm text-muted">
                    {[a.club_name ? a.full_name : null, a.phone, a.telegram, a.city].filter(Boolean).join(" · ")}
                    {a.branches_count ? ` · ${t("app.branches")}: ${a.branches_count}` : ""}
                  </div>
                </div>
                <span className="text-xs text-muted">{fmtDateTime(a.created_at, locale)}</span>
                <Badge tone={TONE[a.status]}>{t(`app.status.${a.status}` as MessageKey)}</Badge>
              </Card>
            </button>
          ))}
          <Pager page={page} limit={LIMIT} total={list.meta?.total} onPage={setPage} />
        </div>
      )}
      {openId && <ApplicationModal id={openId} onClose={() => setOpenId(null)} onChanged={list.reload} />}
    </div>
  );
}

function ApplicationModal({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const router = useRouter();
  const app = useApi<Application>(`/admin/club-applications/${id}`);
  const [status, setStatus] = useState<ApplicationStatus | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const a = app.data;

  async function save() {
    if (!a) return;
    setBusy(true);
    setError(null);
    try {
      await session.patch(`/admin/club-applications/${id}`, { status: status ?? a.status, admin_note: note ?? a.admin_note ?? "" });
      onChanged();
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!a || !confirm(`${t("app.deleteConfirm")}\n${a.club_name ?? a.full_name}`)) return;
    setBusy(true);
    setError(null);
    try {
      await session.delete(`/admin/club-applications/${id}`);
      onChanged();
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const rows: [MessageKey, React.ReactNode][] = a
    ? [
        ["app.fullName", a.full_name],
        ["app.phone", <a key="p" href={`tel:${a.phone}`} className="inline-flex items-center gap-1.5 font-semibold text-accent hover:underline"><Phone className="h-3.5 w-3.5" />{a.phone}</a>],
        ["app.club", a.club_name],
        ["app.city", a.city],
        ["app.address", a.address],
        ["app.devices", a.devices_count],
        ["app.branches", a.branches_count],
        ["app.telegram", a.telegram && <a key="tg" href={`https://t.me/${a.telegram.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-accent hover:underline"><Send className="h-3.5 w-3.5" />{a.telegram}</a>],
        ["app.comment", a.comment],
        ["common.created", fmtDateTime(a.created_at, locale)],
      ]
    : [];

  return (
    <Modal title={a ? (a.club_name ?? a.full_name) : "…"} onClose={onClose}>
      {!a ? (
        app.error ? <Alert>{app.error}</Alert> : <Spinner />
      ) : (
        <div className="space-y-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            {rows.filter(([, v]) => v !== null && v !== undefined && v !== "").map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{t(k)}</dt>
                <dd className="whitespace-pre-wrap break-words font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          {!!a.clubs?.length && (
            <div className="rounded-xl bg-surface-2 p-3 text-sm">
              <div className="mb-1 text-muted">{t("app.createdClubs")}</div>
              <ul className="list-disc pl-5 font-semibold">
                {a.clubs.map((c) => (
                  <li key={c.id}>{c.name}</li>
                ))}
              </ul>
            </div>
          )}
          {error && <Alert>{error}</Alert>}
          <Field label={t("app.status")}>
            <Select value={status ?? a.status} onChange={(e) => setStatus(e.target.value as ApplicationStatus)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`app.status.${s}` as MessageKey)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("app.note")}>
            <textarea
              value={note ?? a.admin_note ?? ""}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
              rows={3}
              className="w-full rounded-[14px] border border-line bg-surface px-4 py-3 text-[15px] outline-none focus:border-accent"
            />
          </Field>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="secondary" className="flex-1" loading={busy} onClick={save}>
              {t("common.save")}
            </Button>
            <Button className="flex-1" onClick={() => router.push(`/platform/clubs?new=1&application=${a.id}`)}>
              <Building2 className="h-4 w-4" />
              {t("app.createClub")}
            </Button>
          </div>
          {!a.clubs?.length && (
            <Button variant="danger" className="w-full" disabled={busy} onClick={remove}>
              <Trash2 className="h-4 w-4" />
              {t("app.delete")}
            </Button>
          )}
        </div>
      )}
    </Modal>
  );
}
