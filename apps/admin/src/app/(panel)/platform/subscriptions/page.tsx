"use client";

import { formatMoney } from "@ng/types";
import { AlertTriangle, Building2, CalendarPlus, CreditCard, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Alert, Badge, Button, Card, Chip, Field, Heading, Input, Modal, Select, Spinner } from "@/components/ui";
import { type MessageKey, useErrorText, useI18n } from "@/i18n/provider";
import { fmtDateTime } from "@/lib/format";
import { session } from "@/lib/session";
import type { Plan, SubStatus, SubscriptionRow } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const TONE: Record<SubStatus | "NONE", "violet" | "green" | "amber" | "red" | "neutral"> = { TRIAL: "violet", ACTIVE: "green", EXPIRING: "amber", EXPIRED: "red", NONE: "neutral" };
type Filter = "ALL" | "ALERT" | "NONE";

/** Super admin: klublar obunasi. Tugagan/tugayotganlar birinchi — ogohlantirish shu yerda. */
export default function SubscriptionsPage() {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const rows = useApi<SubscriptionRow[]>("/admin/subscriptions");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [assign, setAssign] = useState<SubscriptionRow | null>(null);
  const [extend, setExtend] = useState<SubscriptionRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = (rows.data ?? []).filter((r) =>
    filter === "ALERT" ? r.subscription && ["EXPIRED", "EXPIRING"].includes(r.subscription.status) : filter === "NONE" ? !r.subscription : true,
  );
  const alerts = (rows.data ?? []).filter((r) => r.subscription && ["EXPIRED", "EXPIRING"].includes(r.subscription.status)).length;

  async function cancel(r: SubscriptionRow) {
    if (!confirm(`${t("sub.cancelConfirm")}\n${r.name}`)) return;
    setError(null);
    try {
      await session.delete(`/admin/clubs/${r.id}/subscription`);
      rows.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <Heading>{t("nav.subscriptions")}</Heading>
        <p className="mt-1 max-w-2xl text-sm text-muted">{t("sub.hint")}</p>
      </div>
      {alerts > 0 && (
        <Alert>
          <span className="inline-flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> {t("sub.alertBanner", { n: alerts })}
          </span>
        </Alert>
      )}
      {error && <Alert>{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        {(["ALL", "ALERT", "NONE"] as Filter[]).map((f) => (
          <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
            {t(`sub.filter.${f}` as MessageKey)}
          </Chip>
        ))}
      </div>
      {rows.error && <Alert>{rows.error}</Alert>}
      {rows.loading && !rows.data ? (
        <Spinner />
      ) : !list.length ? (
        <Card className="py-12 text-center text-muted">{t("common.empty")}</Card>
      ) : (
        <div className="space-y-2">
          {list.map((r) => {
            const s = r.subscription;
            const status = s?.status ?? "NONE";
            const over = s && (r.usage.zones > s.plan.max_zones || r.usage.devices > s.plan.max_devices);
            return (
              <Card key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
                    <Building2 className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-bold">{r.name}</div>
                    <div className="truncate text-sm text-muted">{[r.city, r.address].filter(Boolean).join(", ")}</div>
                  </div>
                </div>
                <div className="min-w-[220px] text-sm">
                  {s ? (
                    <>
                      <div className="font-semibold">
                        {s.plan.name} · {formatMoney(s.plan.price, locale)}/{t("plan.month")}
                      </div>
                      <div className={over ? "font-semibold text-danger-soft" : "text-muted"}>
                        {t("sub.usage", { z: r.usage.zones, zm: s.plan.max_zones, d: r.usage.devices, dm: s.plan.max_devices })}
                      </div>
                      <div className="text-muted">
                        {status === "TRIAL" && `${t("sub.trialUntil")}: ${fmtDateTime(s.trial_ends_at, locale)} · `}
                        {t("sub.until")}: {fmtDateTime(s.ends_at, locale)}
                      </div>
                    </>
                  ) : (
                    <div className="text-muted">{t("sub.usageNoPlan", { z: r.usage.zones, d: r.usage.devices })}</div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge tone={TONE[status]}>
                    {t(`sub.status.${status}` as MessageKey)}
                    {s && status !== "EXPIRED" ? ` · ${t("sub.daysLeft", { n: Math.max(0, s.days_left) })}` : ""}
                  </Badge>
                  <div className="flex flex-wrap justify-end gap-1">
                    {s && (
                      <Button size="sm" onClick={() => setExtend(r)}>
                        <CalendarPlus className="h-4 w-4" /> {t("sub.extend")}
                      </Button>
                    )}
                    <Button size="sm" variant={s ? "secondary" : "primary"} onClick={() => setAssign(r)}>
                      <CreditCard className="h-4 w-4" /> {s ? t("sub.change") : t("sub.assign")}
                    </Button>
                    {s && (
                      <Button size="sm" variant="ghost" onClick={() => cancel(r)} title={t("sub.cancel")}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {assign && <AssignModal row={assign} onClose={() => setAssign(null)} onDone={() => (setAssign(null), rows.reload())} />}
      {extend && <ExtendModal row={extend} onClose={() => setExtend(null)} onDone={() => (setExtend(null), rows.reload())} />}
    </div>
  );
}

function AssignModal({ row, onClose, onDone }: { row: SubscriptionRow; onClose: () => void; onDone: () => void }) {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const plans = useApi<Plan[]>("/admin/plans");
  const active = (plans.data ?? []).filter((p) => p.is_active);
  const [planId, setPlanId] = useState<string>(row.subscription?.plan.id ?? "");
  const [trial, setTrial] = useState(row.subscription ? "0" : "14");
  const [months, setMonths] = useState("1");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const plan = active.find((p) => p.id === (planId || active[0]?.id));
  const digits = (v: string) => v.replace(/\D/g, "");
  const [now] = useState(() => Date.now());
  const ends = new Date(now + Number(trial || 0) * 86400000);
  ends.setMonth(ends.getMonth() + Number(months || 0));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      await session.put(`/admin/clubs/${row.id}/subscription`, { plan_id: plan.id, trial_days: Number(trial || 0), months: Number(months || 0), note: note.trim() || null });
      onDone();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <Modal title={`${t("sub.assign")} — ${row.name}`} onClose={onClose}>
      {plans.loading && !plans.data ? (
        <Spinner />
      ) : active.length === 0 ? (
        <div className="space-y-3 text-center">
          <p className="text-muted">{t("sub.noPlans")}</p>
          <Link href="/platform/plans" className="font-bold text-accent hover:underline">
            {t("nav.plans")}
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          {row.subscription && <Alert tone="success">{t("sub.replaceNote")}</Alert>}
          <Field label={t("sub.plan")}>
            <select value={plan?.id ?? ""} onChange={(e) => setPlanId(e.target.value)} className="h-12 w-full rounded-[14px] border border-line bg-surface px-4 text-[15px] outline-none focus:border-accent">
              {active.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {formatMoney(p.price, locale)} · {t("plan.zonesN", { n: p.max_zones })} · {t("plan.devicesN", { n: p.max_devices })}
                </option>
              ))}
            </select>
          </Field>
          {plan && (row.usage.zones > plan.max_zones || row.usage.devices > plan.max_devices) && (
            <Alert>{t("sub.overLimit", { z: row.usage.zones, d: row.usage.devices })}</Alert>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("sub.trialDays")}>
              <Input inputMode="numeric" value={trial} onChange={(e) => setTrial(digits(e.target.value))} placeholder="14" />
            </Field>
            <Field label={t("sub.months")}>
              <Input inputMode="numeric" value={months} onChange={(e) => setMonths(digits(e.target.value))} placeholder="1" />
            </Field>
          </div>
          <p className="text-sm text-muted">
            {t("sub.until")}: <b className="text-fg">{fmtDateTime(ends.toISOString(), locale)}</b>
          </p>
          <Field label={`${t("sub.note")} (${t("common.optional")})`}>
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder={t("sub.notePlaceholder")} />
          </Field>
          <Button type="submit" className="w-full" loading={busy} disabled={Number(trial || 0) + Number(months || 0) === 0}>
            {t("common.save")}
          </Button>
        </form>
      )}
    </Modal>
  );
}

function ExtendModal({ row, onClose, onDone }: { row: SubscriptionRow; onClose: () => void; onDone: () => void }) {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const s = row.subscription!;
  const [months, setMonths] = useState("1");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const from = new Date(Math.max(new Date(s.ends_at).getTime(), now));
  const ends = new Date(from);
  ends.setMonth(ends.getMonth() + Number(months || 0));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await session.post(`/admin/clubs/${row.id}/subscription/extend`, { months: Number(months), note: note.trim() || undefined });
      onDone();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <Modal title={`${t("sub.extend")} — ${row.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <p className="text-sm text-muted">{t("sub.extendHint")}</p>
        <Field label={t("sub.months")}>
          <Select value={months} onChange={(e) => setMonths(e.target.value)}>
            {[1, 2, 3, 6, 12].map((m) => (
              <option key={m} value={m}>
                {t("sub.monthsN", { n: m })} · {formatMoney(s.plan.price * m, locale)}
              </option>
            ))}
          </Select>
        </Field>
        <p className="text-sm text-muted">
          {t("sub.until")}: <b className="text-fg">{fmtDateTime(ends.toISOString(), locale)}</b>
        </p>
        <Field label={`${t("sub.note")} (${t("common.optional")})`}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder={t("sub.notePlaceholder")} />
        </Field>
        <Button type="submit" className="w-full" loading={busy}>
          {t("sub.extend")}
        </Button>
      </form>
    </Modal>
  );
}
