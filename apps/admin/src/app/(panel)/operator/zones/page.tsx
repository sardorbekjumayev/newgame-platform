"use client";

import { formatMoney, parseSom, tiyinToSomInput } from "@ng/types";
import { Clock, Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Alert, Badge, Button, Card, Chip, Field, Heading, Input, Modal, Spinner, cx } from "@/components/ui";
import { type MessageKey, useErrorText, useI18n } from "@/i18n/provider";
import { session } from "@/lib/session";
import type { Tariff, TariffType, Zone } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const COLORS = ["#C6FF3D", "#FFB020", "#7C5CFF", "#22D3EE", "#FF5C7A", "#A3A3A3"];

/** Operator: zonalar (VIP, Umumiy ...) va har bir zonaning tariflari. */
export default function ZonesPage() {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const zones = useApi<Zone[]>("/operator/zones");
  const tariffs = useApi<Tariff[]>("/operator/tariffs");
  const [zoneEdit, setZoneEdit] = useState<Zone | "new" | null>(null);
  const [tariffEdit, setTariffEdit] = useState<{ zoneId: string; tariff: Tariff | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = () => {
    zones.reload();
    tariffs.reload();
  };

  async function remove(path: string, confirmText: string) {
    if (!confirm(confirmText)) return;
    setError(null);
    try {
      await session.delete(path);
      reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  const fmtDuration = (m: number) => (m % 60 === 0 ? t("tariff.hours", { n: m / 60 }) : t("tariff.minutes", { n: m }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Heading>{t("nav.zones")}</Heading>
          <p className="mt-1 text-sm text-muted">{t("zone.hint")}</p>
        </div>
        <Button onClick={() => setZoneEdit("new")}>
          <Plus className="h-4 w-4" />
          {t("zone.new")}
        </Button>
      </div>
      {(error || zones.error || tariffs.error) && <Alert>{error ?? zones.error ?? tariffs.error}</Alert>}
      {!zones.data ? (
        <Spinner />
      ) : zones.data.length === 0 ? (
        <Card className="space-y-3 py-12 text-center">
          <Layers className="mx-auto h-10 w-10 text-muted" />
          <p className="text-muted">{t("zone.empty")}</p>
          <div>
            <Button onClick={() => setZoneEdit("new")}>
              <Plus className="h-4 w-4" />
              {t("zone.new")}
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {zones.data.map((z) => {
            const list = (tariffs.data ?? []).filter((x) => x.zone_id === z.id);
            return (
              <Card key={z.id} className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="h-10 w-2 shrink-0 rounded-full" style={{ background: z.color ?? "#3a3f4b" }} />
                    <div className="min-w-0">
                      <div className="font-display text-xl font-bold">{z.name}</div>
                      {z.description && <div className="text-sm text-muted">{z.description}</div>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setZoneEdit(z)} title={t("common.edit")}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(`/operator/zones/${z.id}`, t("zone.deleteConfirm", { name: z.name }))} title={t("common.delete")}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  {list.length === 0 && <p className="text-sm text-muted">{t("tariff.empty")}</p>}
                  {list.map((x) => (
                    <div key={x.id} className={cx("flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-surface-2 px-4 py-3", !x.is_active && "opacity-60")}>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 font-semibold">
                          {x.name}
                          {!x.is_active && <Badge>{t("tariff.inactive")}</Badge>}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted">
                          <span>{x.type === "HOURLY" ? t("tariff.type.HOURLY") : `${t("tariff.type.PACKAGE")} · ${fmtDuration(x.duration_minutes ?? 0)}`}</span>
                          {x.valid_from && (
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {x.valid_from}–{x.valid_to}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="font-display text-lg font-bold text-accent tabular-nums">
                        {formatMoney(x.price, locale)}
                        {x.type === "HOURLY" && <span className="text-sm font-semibold text-muted"> / {t("tariff.perHour")}</span>}
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setTariffEdit({ zoneId: z.id, tariff: x })} title={t("common.edit")}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(`/operator/tariffs/${x.id}`, t("tariff.deleteConfirm", { name: x.name }))} title={t("common.delete")}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <Button size="sm" variant="secondary" onClick={() => setTariffEdit({ zoneId: z.id, tariff: null })}>
                    <Plus className="h-4 w-4" />
                    {t("tariff.new")}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {zoneEdit && (
        <ZoneModal
          zone={zoneEdit === "new" ? null : zoneEdit}
          onClose={() => setZoneEdit(null)}
          onSaved={() => {
            setZoneEdit(null);
            reload();
          }}
        />
      )}
      {tariffEdit && zones.data && (
        <TariffModal
          zones={zones.data}
          zoneId={tariffEdit.zoneId}
          tariff={tariffEdit.tariff}
          onClose={() => setTariffEdit(null)}
          onSaved={() => {
            setTariffEdit(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function ZoneModal({ zone, onClose, onSaved }: { zone: Zone | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const [name, setName] = useState(zone?.name ?? "");
  const [description, setDescription] = useState(zone?.description ?? "");
  const [color, setColor] = useState<string | null>(zone?.color ?? COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { name, description: description.trim() || null, color };
      if (zone) await session.patch(`/operator/zones/${zone.id}`, body);
      else await session.post("/operator/zones", body);
      onSaved();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <Modal title={zone ? t("zone.edit") : t("zone.new")} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label={t("zone.name")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("zone.namePlaceholder")} maxLength={60} required autoFocus />
        </Field>
        <div className="flex flex-wrap gap-2">
          {["VIP", t("zone.preset.general"), "PlayStation", "Bootcamp"].map((p) => (
            <Chip key={p} type="button" active={name === p} onClick={() => setName(p)}>
              {p}
            </Chip>
          ))}
        </div>
        <Field label={`${t("zone.description")} (${t("common.optional")})`}>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("zone.descriptionPlaceholder")} maxLength={300} />
        </Field>
        <Field label={t("zone.color")}>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={c}
                className={cx("h-9 w-9 rounded-full border-2 transition", color === c ? "border-fg scale-110" : "border-transparent")}
                style={{ background: c }}
              />
            ))}
          </div>
        </Field>
        <Button type="submit" className="w-full" loading={busy}>
          {t("common.save")}
        </Button>
      </form>
    </Modal>
  );
}

function TariffModal({ zones, zoneId, tariff, onClose, onSaved }: { zones: Zone[]; zoneId: string; tariff: Tariff | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const [zone, setZone] = useState(tariff?.zone_id ?? zoneId);
  const [name, setName] = useState(tariff?.name ?? "");
  const [type, setType] = useState<TariffType>(tariff?.type ?? "HOURLY");
  const [price, setPrice] = useState(tariff ? tiyinToSomInput(tariff.price) : "");
  const [hours, setHours] = useState(tariff?.duration_minutes ? String(tariff.duration_minutes / 60) : "3");
  const [windowOn, setWindowOn] = useState(!!tariff?.valid_from);
  const [from, setFrom] = useState(tariff?.valid_from ?? "22:00");
  const [to, setTo] = useState(tariff?.valid_to ?? "08:00");
  const [active, setActive] = useState(tariff?.is_active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const tiyin = parseSom(price);
    if (tiyin === null) return setError(t("tariff.invalidPrice"));
    const minutes = Math.round(Number(hours.replace(",", ".")) * 60);
    if (type === "PACKAGE" && !(minutes >= 15)) return setError(t("tariff.invalidDuration"));
    setBusy(true);
    setError(null);
    try {
      const body = {
        zone_id: zone,
        name,
        type,
        price: tiyin,
        duration_minutes: type === "PACKAGE" ? minutes : null,
        valid_from: windowOn ? from : null,
        valid_to: windowOn ? to : null,
        is_active: active,
      };
      if (tariff) await session.patch(`/operator/tariffs/${tariff.id}`, body);
      else await session.post("/operator/tariffs", { ...body, duration_minutes: body.duration_minutes ?? undefined });
      onSaved();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <Modal title={tariff ? t("tariff.edit") : t("tariff.new")} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label={t("tariff.zone")}>
          <select value={zone} onChange={(e) => setZone(e.target.value)} className="h-11 w-full rounded-[14px] border border-line bg-surface px-4 text-[15px] outline-none focus:border-accent">
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex gap-2">
          {(["HOURLY", "PACKAGE"] as const).map((k) => (
            <Chip key={k} type="button" active={type === k} onClick={() => setType(k)}>
              {t(`tariff.type.${k}` as MessageKey)}
            </Chip>
          ))}
        </div>
        <p className="text-xs text-muted">{t(type === "HOURLY" ? "tariff.hourlyHint" : "tariff.packageHint")}</p>
        <Field label={t("tariff.name")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t(type === "HOURLY" ? "tariff.namePlaceholderHourly" : "tariff.namePlaceholderPackage")} maxLength={80} required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={type === "HOURLY" ? t("tariff.pricePerHour") : t("tariff.pricePackage")}>
            <Input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d ]/g, ""))} inputMode="numeric" placeholder="25 000" required />
          </Field>
          {type === "PACKAGE" && (
            <Field label={t("tariff.duration")}>
              <Input value={hours} onChange={(e) => setHours(e.target.value.replace(/[^\d.,]/g, ""))} inputMode="decimal" placeholder="3" required />
            </Field>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={windowOn} onChange={(e) => setWindowOn(e.target.checked)} className="h-4 w-4 accent-[var(--color-accent)]" />
          {t("tariff.window")}
        </label>
        {windowOn && (
          <div className="grid grid-cols-2 gap-4">
            <Field label={t("tariff.from")}>
              <Input type="time" value={from} onChange={(e) => setFrom(e.target.value)} required />
            </Field>
            <Field label={t("tariff.to")}>
              <Input type="time" value={to} onChange={(e) => setTo(e.target.value)} required />
            </Field>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-[var(--color-accent)]" />
          {t("tariff.active")}
        </label>
        <Button type="submit" className="w-full" loading={busy}>
          {t("common.save")}
        </Button>
      </form>
    </Modal>
  );
}
