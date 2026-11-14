"use client";

import { Building2, Plus, Search, UserPlus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { type Credentials, CredentialsModal } from "@/components/credentials";
import { Pager } from "@/components/pager";
import { StaffActions } from "@/components/staff-actions";
import { Alert, Badge, Button, Card, Field, Heading, Input, Modal, Spinner } from "@/components/ui";
import { type MessageKey, useErrorText, useI18n } from "@/i18n/provider";
import { fmtDateTime, fmtPublicId } from "@/lib/format";
import { session } from "@/lib/session";
import type { Manager } from "@/lib/types";
import { normalizePhone, useApi } from "@/lib/use-api";

const LIMIT = 20;

export default function ManagersPage() {
  return (
    <Suspense>
      <Managers />
    </Suspense>
  );
}

function Managers() {
  const { t, locale } = useI18n();
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [creds, setCreds] = useState<Credentials | null>(null);
  const creating = params.get("new") === "1";
  const list = useApi<Manager[]>(`/admin/managers?${new URLSearchParams({ page: String(page), limit: String(LIMIT), ...(search ? { q: search } : {}) })}`);

  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(q.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [q]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Heading>{t("nav.managers")}</Heading>
        <Button onClick={() => router.replace("/platform/managers?new=1")}>
          <Plus className="h-4 w-4" />
          {t("manager.new")}
        </Button>
      </div>
      <div className="relative w-full sm:w-72">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("common.search")} className="h-10 w-full pl-9" />
      </div>
      {list.error && <Alert>{list.error}</Alert>}
      {list.loading && !list.data ? (
        <Spinner />
      ) : !list.data?.length ? (
        <Card className="py-12 text-center text-muted">{t("common.empty")}</Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {list.data.map((m) => (
            <Card key={m.id} className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-bold">{[m.first_name, m.last_name].filter(Boolean).join(" ")}</div>
                  <div className="truncate font-mono text-sm text-muted">
                    {m.username} · ID {fmtPublicId(m.public_id)}
                    {m.phone ? ` · ${m.phone}` : ""}
                  </div>
                </div>
                <Badge tone={m.status === "ACTIVE" ? "green" : "red"}>{t(`user.status.${m.status}` as MessageKey)}</Badge>
              </div>
              <div className="text-sm">
                <div className="mb-1 text-xs text-muted">
                  {t("manager.clubs")} ({m.clubs.length})
                </div>
                {m.clubs.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {m.clubs.map((c) => (
                      <span key={c.id} className="inline-flex items-center gap-1 rounded-lg bg-surface-2 px-2 py-1 text-xs font-semibold">
                        <Building2 className="h-3 w-3 text-accent" />
                        {c.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted">{t("manager.noClubs")}</span>
                )}
              </div>
              <div className="text-xs text-muted">
                {t("common.lastLogin")}: {m.last_login_at ? fmtDateTime(m.last_login_at, locale) : t("common.never")}
              </div>
              <StaffActions user={m} onChanged={list.reload} />
            </Card>
          ))}
          <div className="lg:col-span-2">
            <Pager page={page} limit={LIMIT} total={list.meta?.total} onPage={setPage} />
          </div>
        </div>
      )}
      {creating && (
        <CreateManagerModal
          onClose={() => router.replace("/platform/managers")}
          onCreated={(c) => {
            router.replace("/platform/managers");
            setCreds(c);
            list.reload();
          }}
        />
      )}
      {creds && <CredentialsModal creds={creds} onClose={() => setCreds(null)} />}
    </div>
  );
}

type Form = { username: string; first_name: string; last_name: string; phone: string; password: string };

function CreateManagerModal({ onClose, onCreated }: { onClose: () => void; onCreated: (c: Credentials) => void }) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const [f, setF] = useState<Form>({ username: "", first_name: "", last_name: "", phone: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await session.post<Credentials>("/admin/managers", {
        username: f.username,
        first_name: f.first_name,
        last_name: f.last_name || undefined,
        phone: f.phone.replace(/\D/g, "") ? normalizePhone(f.phone) : undefined,
        password: f.password || undefined,
      });
      onCreated(res.data);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t("manager.new")} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label={t("club.username")} hint={t("club.usernameHint")}>
          <Input value={f.username} onChange={set("username")} pattern="[A-Za-z][A-Za-z0-9._\-]{2,31}" autoCapitalize="none" required autoFocus />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("club.firstName")}>
            <Input value={f.first_name} onChange={set("first_name")} maxLength={80} required />
          </Field>
          <Field label={`${t("club.lastName")} (${t("common.optional")})`}>
            <Input value={f.last_name} onChange={set("last_name")} maxLength={80} />
          </Field>
        </div>
        <Field label={`${t("manager.phone")} (${t("common.optional")})`}>
          <Input type="tel" value={f.phone} onChange={set("phone")} placeholder="+998 90 123 45 67" />
        </Field>
        <Field label={`${t("club.password")} (${t("common.optional")})`} hint={t("club.passwordHint")}>
          <Input type="text" value={f.password} onChange={set("password")} minLength={8} maxLength={128} autoComplete="new-password" />
        </Field>
        <Button type="submit" loading={busy} className="w-full">
          <UserPlus className="h-4 w-4" />
          {t("club.create")}
        </Button>
      </form>
    </Modal>
  );
}
