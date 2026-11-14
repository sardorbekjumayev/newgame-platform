"use client";

import { formatMoney } from "@ng/types";
import { LayoutGrid, Monitor, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { Alert, Badge, Button, Card, Field, Heading, Input, Modal, Spinner } from "@/components/ui";
import { useErrorText, useI18n } from "@/i18n/provider";
import { session } from "@/lib/session";
import type { Plan } from "@/lib/types";
import { useApi } from "@/lib/use-api";

/** Super admin: obuna rejalari — nomi, oylik narx, zallar va qurilmalar limiti. */
export default function PlansPage() {
  const { t, locale } = useI18n();
  const plans = useApi<Plan[]>("/admin/plans");
  const [edit, setEdit] = useState<Plan | "new" | null>(null);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Heading>{t("nav.plans")}</Heading>
          <p className="mt-1 max-w-2xl text-sm text-muted">{t("plan.hint")}</p>
        </div>
        <Button onClick={() => setEdit("new")}>
          <Plus className="h-4 w-4" /> {t("plan.new")}
        </Button>
      </div>
      {plans.error && <Alert>{plans.error}</Alert>}
      {plans.loading && !plans.data ? (
        <Spinner />
      ) : !plans.data?.length ? (
        <Card className="py-12 text-center text-muted">{t("plan.empty")}</Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {plans.data.map((p) => (
            <Card key={p.id} className={p.is_active ? "space-y-3" : "space-y-3 opacity-60"}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-display text-xl font-bold">{p.name}</div>
                  <div className="font-display text-2xl font-bold text-accent tabular-nums">
                    {formatMoney(p.price, locale)}
                    <span className="text-sm font-semibold text-muted"> / {t("plan.month")}</span>
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setEdit(p)} title={t("common.edit")}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-1 font-semibold">
                  <LayoutGrid className="h-4 w-4 text-accent" /> {t("plan.zonesN", { n: p.max_zones })}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-1 font-semibold">
                  <Monitor className="h-4 w-4 text-accent" /> {t("plan.devicesN", { n: p.max_devices })}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm text-muted">
                <span>{t("plan.clubsN", { n: p.clubs_count ?? 0 })}</span>
                {!p.is_active && <Badge>{t("plan.inactive")}</Badge>}
              </div>
            </Card>
          ))}
        </div>
      )}
      {edit && <PlanModal plan={edit === "new" ? null : edit} onClose={() => setEdit(null)} onSaved={() => (setEdit(null), plans.reload())} />}
    </div>
  );
}

function PlanModal({ plan, onClose, onSaved }: { plan: Plan | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const [name, setName] = useState(plan?.name ?? "");
  const [price, setPrice] = useState(plan ? String(plan.price / 100) : "");
  const [zones, setZones] = useState(plan ? String(plan.max_zones) : "");
  const [devices, setDevices] = useState(plan ? String(plan.max_devices) : "");
  const [active, setActive] = useState(plan?.is_active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const digits = (v: string) => v.replace(/\D/g, "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { name, price: Number(price) * 100, max_zones: Number(zones), max_devices: Number(devices), is_active: active };
      if (plan) await session.patch(`/admin/plans/${plan.id}`, body);
      else await session.post("/admin/plans", body);
      onSaved();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <Modal title={plan ? t("plan.edit") : t("plan.new")} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label={t("plan.name")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Standart" maxLength={60} required autoFocus />
        </Field>
        <Field label={t("plan.price")}>
          <Input inputMode="numeric" value={price} onChange={(e) => setPrice(digits(e.target.value))} placeholder="100000" required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("plan.maxZones")}>
            <Input inputMode="numeric" value={zones} onChange={(e) => setZones(digits(e.target.value))} placeholder="5" required />
          </Field>
          <Field label={t("plan.maxDevices")}>
            <Input inputMode="numeric" value={devices} onChange={(e) => setDevices(digits(e.target.value))} placeholder="50" required />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-[var(--color-accent)]" />
          {t("plan.active")}
        </label>
        {plan && (plan.clubs_count ?? 0) > 0 && <p className="text-xs text-muted">{t("plan.editNote")}</p>}
        <Button type="submit" className="w-full" loading={busy}>
          {t("common.save")}
        </Button>
      </form>
    </Modal>
  );
}
