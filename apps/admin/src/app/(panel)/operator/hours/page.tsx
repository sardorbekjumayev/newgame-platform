"use client";

import { Copy, Plus, Save, X } from "lucide-react";
import { useState } from "react";
import { Alert, Button, Card, Heading, Input, Spinner, cx } from "@/components/ui";
import { type MessageKey, useErrorText, useI18n } from "@/i18n/provider";
import { session } from "@/lib/session";
import { DAY_KEYS, type DayKey, type WorkingHours } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const DEFAULT: WorkingHours = { always_open: false, ...(Object.fromEntries(DAY_KEYS.map((d) => [d, [{ open: "10:00", close: "02:00" }]])) as Record<DayKey, { open: string; close: string }[]>) };

/** Operator: haftalik ish vaqti. Yopilish ochilishdan oldin bo'lsa — ertasi kunga o'tadi (masalan 10:00–02:00). */
export default function HoursPage() {
  const { t } = useI18n();
  const res = useApi<{ working_hours: WorkingHours | null }>("/operator/working-hours");
  if (res.error) return <Alert>{res.error}</Alert>;
  if (!res.data) return <Spinner />;
  return <HoursForm initial={res.data.working_hours ?? DEFAULT} isNew={!res.data.working_hours} title={t("nav.hours")} />;
}

function HoursForm({ initial, isNew, title }: { initial: WorkingHours; isNew: boolean; title: string }) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const [wh, setWh] = useState<WorkingHours>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const update = (d: DayKey, fn: (w: { open: string; close: string }[]) => { open: string; close: string }[]) => {
    setSaved(false);
    setWh((s) => ({ ...s, [d]: fn(s[d]) }));
  };

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const r = await session.put<{ working_hours: WorkingHours }>("/operator/working-hours", { working_hours: wh });
      setWh(r.data.working_hours);
      setSaved(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <Heading>{title}</Heading>
        <p className="mt-1 text-sm text-muted">{t("hours.hint")}</p>
      </div>
      {isNew && <Alert tone="info">{t("hours.notSet")}</Alert>}
      <Card className="flex items-center justify-between gap-3">
        <div>
          <div className="font-bold">24/7</div>
          <div className="text-sm text-muted">{t("hours.alwaysOpenHint")}</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={wh.always_open}
          onClick={() => (setSaved(false), setWh((s) => ({ ...s, always_open: !s.always_open })))}
          className={cx("relative h-7 w-12 rounded-full transition", wh.always_open ? "bg-accent" : "bg-surface-3")}
        >
          <span className={cx("absolute top-1 h-5 w-5 rounded-full bg-white transition", wh.always_open ? "left-6" : "left-1")} />
        </button>
      </Card>
      {!wh.always_open && (
        <Card className="divide-y divide-line-soft p-0">
          {DAY_KEYS.map((d) => {
            const windows = wh[d];
            const closed = windows.length === 0;
            return (
              <div key={d} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="w-28 font-semibold">{t(`day.${d}` as MessageKey)}</div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!closed}
                    onChange={(e) => update(d, () => (e.target.checked ? [{ open: "10:00", close: "02:00" }] : []))}
                    className="h-4 w-4 accent-[var(--color-accent)]"
                  />
                  {closed ? t("hours.closed") : t("hours.open")}
                </label>
                {!closed && (
                  <div className="flex flex-1 flex-col gap-2">
                    {windows.map((w, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input type="time" value={w.open} onChange={(e) => update(d, (ws) => ws.map((x, j) => (j === i ? { ...x, open: e.target.value } : x)))} className="h-10 w-32" />
                        <span className="text-muted">—</span>
                        <Input type="time" value={w.close} onChange={(e) => update(d, (ws) => ws.map((x, j) => (j === i ? { ...x, close: e.target.value } : x)))} className="h-10 w-32" />
                        {w.close <= w.open && <span className="text-xs text-muted">{t("hours.nextDay")}</span>}
                        {windows.length > 1 && (
                          <button type="button" className="text-muted hover:text-danger-soft" onClick={() => update(d, (ws) => ws.filter((_, j) => j !== i))} aria-label={t("common.delete")}>
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                    {windows.length < 3 && (
                      <button type="button" className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-accent hover:underline" onClick={() => update(d, (ws) => [...ws, { open: "14:00", close: "18:00" }])}>
                        <Plus className="h-3.5 w-3.5" />
                        {t("hours.addBreak")}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}
      {!wh.always_open && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => (setSaved(false), setWh((s) => ({ ...s, ...(Object.fromEntries(DAY_KEYS.map((d) => [d, s.mon.map((w) => ({ ...w }))])) as Record<DayKey, { open: string; close: string }[]>) })))}
        >
          <Copy className="h-4 w-4" />
          {t("hours.copyMonday")}
        </Button>
      )}
      {error && <Alert>{error}</Alert>}
      {saved && <Alert tone="success">{t("hours.saved")}</Alert>}
      <Button size="lg" loading={busy} onClick={save}>
        <Save className="h-4 w-4" />
        {t("common.save")}
      </Button>
    </div>
  );
}
