"use client";

import { Building2, Clock, ExternalLink, LayoutGrid, Layers, MapPin, MapPinOff, Plus, Search, User } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { type Credentials, CredentialsModal, CopyButton } from "@/components/credentials";
import { HoursView, ZonesView } from "@/components/club-offer";
import { Pager } from "@/components/pager";
import { ShareClub } from "@/components/share-club";
import { StaffActions } from "@/components/staff-actions";
import { ZoneLayoutView } from "@/components/zone-layout";
import { Alert, Badge, Button, Card, Field, Heading, Input, Modal, Spinner } from "@/components/ui";
import { type MessageKey, useErrorText, useI18n } from "@/i18n/provider";
import { fmtDateTime, fmtPublicId } from "@/lib/format";
import { session } from "@/lib/session";
import type { Application, Club, ClubDetail } from "@/lib/types";
import { normalizePhone, useApi } from "@/lib/use-api";

const LIMIT = 20;

export default function ClubsPage() {
  return (
    <Suspense>
      <Clubs />
    </Suspense>
  );
}

function Clubs() {
  const { t } = useI18n();
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creds, setCreds] = useState<Credentials | null>(null);
  const creating = params.get("new") === "1";
  const applicationId = params.get("application");
  const list = useApi<Club[]>(`/admin/clubs?${new URLSearchParams({ page: String(page), limit: String(LIMIT), ...(search ? { q: search } : {}) })}`);

  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(q.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [q]);

  const closeCreate = () => router.replace("/platform/clubs");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Heading>{t("nav.clubs")}</Heading>
        <Button onClick={() => router.replace("/platform/clubs?new=1")}>
          <Plus className="h-4 w-4" />
          {t("club.new")}
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
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.data.map((c) => (
            <button key={c.id} onClick={() => setOpenId(c.id)} className="text-left">
              <Card className="h-full space-y-3 transition hover:border-accent/40">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-bold">{c.name}</div>
                    <div className="flex items-center gap-1 truncate text-sm text-muted">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      {[c.city, c.address].filter(Boolean).join(", ")}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge tone={c.status === "ACTIVE" ? "green" : "red"}>{t(`club.status.${c.status}` as MessageKey)}</Badge>
                    {c.latitude === null && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-warn">
                        <MapPinOff className="h-3 w-3" />
                        {t("location.notSet")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-line-soft pt-3 text-sm">
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <User className="h-4 w-4 shrink-0 text-accent" />
                    <span className="truncate">{c.operator ? `${c.operator.username} · ID ${fmtPublicId(c.operator.public_id)}` : t("club.noOperator")}</span>
                  </span>
                  <span className="shrink-0 text-muted">👁 {c.managers_count}</span>
                </div>
              </Card>
            </button>
          ))}
          <div className="md:col-span-2 xl:col-span-3">
            <Pager page={page} limit={LIMIT} total={list.meta?.total} onPage={setPage} />
          </div>
        </div>
      )}
      {creating && (
        <CreateClubModal
          applicationId={applicationId}
          onClose={closeCreate}
          onCreated={(c) => {
            closeCreate();
            setCreds(c);
            list.reload();
          }}
        />
      )}
      {creds && <CredentialsModal creds={creds} onClose={() => setCreds(null)} />}
      {openId && <ClubModal id={openId} onClose={() => setOpenId(null)} onChanged={list.reload} />}
    </div>
  );
}

type Form = { name: string; city: string; address: string; phone: string; operator_username: string; operator_first_name: string; operator_last_name: string; operator_password: string };
const EMPTY: Form = { name: "", city: "", address: "", phone: "", operator_username: "", operator_first_name: "", operator_last_name: "", operator_password: "" };

function CreateClubModal({ applicationId, onClose, onCreated }: { applicationId: string | null; onClose: () => void; onCreated: (c: Credentials) => void }) {
  const { t } = useI18n();
  const app = useApi<Application>(applicationId ? `/admin/club-applications/${applicationId}` : null);
  // Arizadan oldindan to'ldirish: ariza yuklangach forma shu qiymatlar bilan ochiladi
  if (applicationId && !app.data) {
    return <Modal title={t("club.new")} onClose={onClose}>{app.error ? <Alert>{app.error}</Alert> : <Spinner />}</Modal>;
  }
  const a = app.data;
  const [first, ...rest] = a ? a.full_name.split(/\s+/) : [""];
  const initial: Form = a
    ? { ...EMPTY, // Migratsiyada klub nomi o'rniga ism yozilgan eski ariza — nom bo'sh ochiladi, super admin to'g'risini kiritadi
        name: a.club_name && a.club_name !== a.full_name ? a.club_name : "",
        city: a.city ?? "", address: a.address ?? "", phone: a.phone, operator_first_name: first ?? "", operator_last_name: rest.join(" ") }
    : EMPTY;
  return <CreateClubForm application={a} applicationId={applicationId} initial={initial} onClose={onClose} onCreated={onCreated} />;
}

function CreateClubForm({ application, applicationId, initial, onClose, onCreated }: { application: Application | null; applicationId: string | null; initial: Form; onClose: () => void; onCreated: (c: Credentials) => void }) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const app = { data: application };
  const [f, setF] = useState<Form>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = {
        name: f.name,
        city: f.city,
        address: f.address || undefined,
        phone: f.phone.replace(/\D/g, "") ? normalizePhone(f.phone) : undefined,
        application_id: applicationId ?? undefined,
        operator_username: f.operator_username,
        operator_first_name: f.operator_first_name,
        operator_last_name: f.operator_last_name || undefined,
        operator_password: f.operator_password || undefined,
      };
      const res = await session.post<{ club_id: string; operator: Credentials }>("/admin/clubs", body);
      onCreated(res.data.operator);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t("club.new")} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {app.data && (
          <Alert tone="info">
            {t("nav.applications")}: <b>{app.data.club_name ?? app.data.full_name}</b> · {app.data.phone}
            {app.data.branches_count ? ` · ${t("app.branches")}: ${app.data.branches_count}` : ""}
          </Alert>
        )}
        <p className="text-sm text-muted">{t("club.newHint")}</p>
        {error && <Alert>{error}</Alert>}
        <Field label={t("club.name")} hint={app.data ? t("club.nameHint") : undefined}>
          <Input value={f.name} onChange={set("name")} minLength={2} maxLength={120} placeholder="Cyber Arena — Chilonzor" required autoFocus />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("club.city")}>
            <Input value={f.city} onChange={set("city")} minLength={2} maxLength={80} required />
          </Field>
          <Field label={`${t("club.phone")} (${t("common.optional")})`}>
            <Input type="tel" value={f.phone} onChange={set("phone")} placeholder="+998 90 123 45 67" />
          </Field>
        </div>
        <Field label={`${t("club.address")} (${t("common.optional")})`}>
          <Input value={f.address} onChange={set("address")} maxLength={300} />
        </Field>
        <div className="border-t border-line-soft pt-4 font-bold">{t("club.operatorSection")}</div>
        <Field label={t("club.username")} hint={t("club.usernameHint")}>
          <Input value={f.operator_username} onChange={set("operator_username")} pattern="[A-Za-z][A-Za-z0-9._\-]{2,31}" autoCapitalize="none" required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("club.firstName")}>
            <Input value={f.operator_first_name} onChange={set("operator_first_name")} maxLength={80} required />
          </Field>
          <Field label={`${t("club.lastName")} (${t("common.optional")})`}>
            <Input value={f.operator_last_name} onChange={set("operator_last_name")} maxLength={80} />
          </Field>
        </div>
        <Field label={`${t("club.password")} (${t("common.optional")})`} hint={t("club.passwordHint")}>
          <Input type="text" value={f.operator_password} onChange={set("operator_password")} minLength={8} maxLength={128} autoComplete="new-password" />
        </Field>
        <Button type="submit" loading={busy} className="w-full">
          <Building2 className="h-4 w-4" />
          {t("club.create")}
        </Button>
      </form>
    </Modal>
  );
}

function ClubModal({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const club = useApi<ClubDetail>(`/admin/clubs/${id}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const c = club.data;
  const refresh = () => {
    club.reload();
    onChanged();
  };

  async function toggle() {
    if (!c) return;
    setBusy(true);
    setError(null);
    try {
      await session.patch(`/admin/clubs/${id}`, { status: c.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" });
      refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={c?.name ?? "…"} onClose={onClose}>
      {!c ? (
        club.error ? <Alert>{club.error}</Alert> : <Spinner />
      ) : (
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-muted">{[c.city, c.address, c.phone].filter(Boolean).join(" · ")}</div>
            <div className="flex shrink-0 items-center gap-2">
              <ShareClub clubId={c.id} clubName={c.name} size="sm" />
              <Badge tone={c.status === "ACTIVE" ? "green" : "red"}>{t(`club.status.${c.status}` as MessageKey)}</Badge>
            </div>
          </div>
          {error && <Alert>{error}</Alert>}
          <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2 text-sm">
            {c.latitude !== null && c.longitude !== null ? (
              <>
                <span className="font-mono text-xs text-muted">
                  {c.latitude.toFixed(6)}, {c.longitude.toFixed(6)}
                </span>
                <a
                  href={`https://yandex.uz/maps/?pt=${c.longitude},${c.latitude}&z=17&l=map`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-accent hover:underline"
                >
                  {t("location.openMap")}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-warn">
                <MapPinOff className="h-4 w-4" />
                {t("location.notSetLong")}
              </span>
            )}
          </div>
          <section className="space-y-3 rounded-2xl border border-line-soft bg-surface p-4">
            <div className="text-xs font-bold uppercase tracking-widest text-muted">{t("club.operator")}</div>
            {c.operator ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-bold">{[c.operator.first_name, c.operator.last_name].filter(Boolean).join(" ")}</div>
                    <div className="truncate font-mono text-sm text-muted">{c.operator.username}</div>
                  </div>
                  <Badge tone={c.operator.status === "ACTIVE" ? "green" : "red"}>{t(`user.status.${c.operator.status}` as MessageKey)}</Badge>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2">
                  <span className="text-sm text-muted">{t("user.id")}</span>
                  <span className="flex items-center gap-1 font-mono font-bold">
                    {fmtPublicId(c.operator.public_id)}
                    <CopyButton text={c.operator.public_id ?? ""} />
                  </span>
                </div>
                <div className="text-xs text-muted">
                  {t("common.lastLogin")}: {c.operator.last_login_at ? fmtDateTime(c.operator.last_login_at, locale) : t("common.never")}
                </div>
                <StaffActions user={c.operator} onChanged={refresh} />
              </>
            ) : (
              <div className="text-sm text-muted">{t("club.noOperator")}</div>
            )}
          </section>
          <section className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-muted">
              <Layers className="h-3.5 w-3.5" />
              {t("nav.zones")} ({c.zones.length} / {c.zones.reduce((n, z) => n + z.tariffs.length, 0)})
            </div>
            <ZonesView zones={c.zones} compact />
          </section>
          {c.zones.some((z) => z.layout && z.devices_count) && (
            <section className="min-w-0 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-muted">
                <LayoutGrid className="h-3.5 w-3.5" />
                {t("layout.title")}
              </div>
              {c.zones
                .filter((z) => z.layout && z.devices_count)
                .map((z) => (
                  <div key={z.id} className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-bold">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: z.color ?? "#3a3f4b" }} />
                      {z.name}
                      <span className="font-normal text-muted">· {t("zone.devicesN", { n: z.devices_count! })}</span>
                    </div>
                    <ZoneLayoutView zone={z} decorLabel={(k) => t(`layout.decor.${k}` as MessageKey)} />
                  </div>
                ))}
            </section>
          )}
          <section className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-muted">
              <Clock className="h-3.5 w-3.5" />
              {t("nav.hours")}
              {c.is_open_now !== null && <Badge tone={c.is_open_now ? "green" : "neutral"}>{t(c.is_open_now ? "managerPanel.openNow" : "managerPanel.closedNow")}</Badge>}
            </div>
            <div className="rounded-2xl border border-line-soft p-4">
              <HoursView wh={c.working_hours} />
            </div>
          </section>
          <section className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-widest text-muted">
              {t("club.managers")} ({c.managers.length})
            </div>
            {c.managers.length ? (
              <ul className="divide-y divide-line-soft rounded-2xl border border-line-soft">
                {c.managers.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <span className="truncate font-semibold">{[m.first_name, m.last_name].filter(Boolean).join(" ") || m.username}</span>
                    <span className="shrink-0 text-xs text-muted">{fmtDateTime(m.linked_at, locale)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-sm text-muted">—</div>
            )}
          </section>
          <Button variant={c.status === "ACTIVE" ? "danger" : "secondary"} className="w-full" loading={busy} onClick={toggle}>
            {c.status === "ACTIVE" ? t("club.suspend") : t("club.activate")}
          </Button>
        </div>
      )}
    </Modal>
  );
}
