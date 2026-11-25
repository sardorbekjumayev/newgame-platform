"use client";

import { Database, DatabaseBackup, Download, FileArchive, History, Images, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Chip, Field, Heading, Input, Spinner, Stat } from "@/components/ui";
import { type MessageKey, useErrorText, useI18n } from "@/i18n/provider";
import { API_URL } from "@/lib/api";
import { fmtBytes, fmtDateTime } from "@/lib/format";
import { session } from "@/lib/session";
import type { BackupInfo, BackupResult } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const PRESETS = ["all", "7d", "30d", "month", "custom"] as const;
type Preset = (typeof PRESETS)[number];

/** Bugungi kun (YYYY-MM-DD) server vaqt mintaqasida — davr chegaralari serverda ham shu mintaqa bo'yicha olinadi. */
const todayIn = (tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const shiftDay = (day: string, n: number) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
/** 2026-11-25 → 25.11.2026 */
const pretty = (day: string) => day.split("-").reverse().join(".");
const downloadUrl = (id: string) => `${API_URL}/admin/backups/${id}/download`;

/** Super admin: baza + yuklangan rasmlar zaxira nusxasi (zip). Butun davr — to'liq, davr — shu kunlardagi o'zgarishlar. */
export default function BackupsPage() {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const info = useApi<BackupInfo>("/admin/backups");
  const today = useMemo(() => todayIn(info.data?.timezone ?? "Asia/Tashkent"), [info.data?.timezone]);

  const [preset, setPreset] = useState<Preset>("all");
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BackupResult | null>(null);
  const [expired, setExpired] = useState(false);

  const range =
    preset === "all" ? null
    : preset === "7d" ? { from: shiftDay(today, -6), to: today }
    : preset === "30d" ? { from: shiftDay(today, -29), to: today }
    : preset === "month" ? { from: `${today.slice(0, 8)}01`, to: today }
    : (custom ?? { from: `${today.slice(0, 8)}01`, to: today });
  const valid = !range || (!!range.from && !!range.to && range.from <= range.to);

  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => setExpired(true), result.expires_in * 1000);
    return () => clearTimeout(timer);
  }, [result]);

  async function submit() {
    setBusy(true);
    setError(null);
    setResult(null);
    setExpired(false);
    try {
      const { data } = await session.post<BackupResult>("/admin/backups", range ?? {});
      setResult(data);
      // Brauzerning o'z yuklab olishi (katta fayl xotiraga olinmaydi); havola — bir martalik kalit bilan
      const a = document.createElement("a");
      a.href = downloadUrl(data.id);
      a.download = data.file_name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      info.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const last = info.data?.history[0];
  const periodLabel = (h: { kind: "full" | "period"; from: string | null; to: string | null }) =>
    h.kind === "period" && h.from && h.to ? `${pretty(h.from)} — ${pretty(h.to)}` : t("backup.preset.all");

  return (
    <div className="space-y-5">
      <div>
        <Heading>{t("nav.backups")}</Heading>
        <p className="mt-1 max-w-2xl text-sm text-muted">{t("backup.hint")}</p>
      </div>

      {info.error && <Alert>{info.error}</Alert>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat icon={Database} label={t("backup.stat.db")} value={info.data ? fmtBytes(info.data.database_bytes) : "…"} />
        <Stat
          icon={Images}
          label={t("backup.stat.files")}
          value={info.data ? fmtBytes(info.data.storage_bytes) : "…"}
          hint={info.data ? t("backup.stat.filesN", { n: info.data.storage_files }) : undefined}
        />
        <Stat
          icon={History}
          label={t("backup.stat.last")}
          accent={!!last}
          value={<span className="text-lg">{!info.data ? "…" : last ? fmtDateTime(last.at, locale) : t("backup.stat.never")}</span>}
          hint={last ? periodLabel(last) : undefined}
        />
      </div>

      <Card className="space-y-4">
        <div className="flex items-center gap-2 font-bold">
          <DatabaseBackup className="h-5 w-5 text-accent" /> {t("backup.new")}
        </div>
        <div className="space-y-2">
          <div className="text-[13px] font-semibold text-muted">{t("backup.period")}</div>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <Chip key={p} active={preset === p} disabled={busy} onClick={() => setPreset(p)}>
                {t(`backup.preset.${p}` as MessageKey)}
              </Chip>
            ))}
          </div>
        </div>
        {preset === "custom" && range && (
          <div className="grid max-w-md grid-cols-2 gap-3">
            <Field label={t("backup.from")}>
              <Input type="date" value={range.from} max={range.to || today} disabled={busy} onChange={(e) => setCustom({ from: e.target.value, to: range.to })} />
            </Field>
            <Field label={t("backup.to")}>
              <Input type="date" value={range.to} min={range.from || undefined} max={today} disabled={busy} onChange={(e) => setCustom({ from: range.from, to: e.target.value })} />
            </Field>
          </div>
        )}
        <p className="max-w-2xl text-sm text-muted">
          {!range ? t("backup.fullNote") : valid ? t("backup.periodNote", { from: pretty(range.from), to: pretty(range.to) }) : t("backup.invalidPeriod")}
        </p>
        <div className="flex max-w-2xl items-start gap-2 rounded-xl bg-surface-2 p-3 text-[13px] text-muted">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" /> {t("backup.sensitive")}
        </div>
        {error && <Alert>{error}</Alert>}
        <Button onClick={submit} loading={busy} disabled={!valid}>
          {!busy && <Download className="h-4 w-4" />} {busy ? t("backup.preparing") : t("backup.submit")}
        </Button>
        {result && (
          <Alert tone="success">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-bold">{t("backup.ready")}</div>
                <div className="mt-1 flex items-center gap-1.5 break-all text-fg">
                  <FileArchive className="h-4 w-4 shrink-0" /> {result.file_name}
                </div>
                <div className="mt-0.5 text-fg/70">{t("backup.readyMeta", { size: fmtBytes(result.size), rows: result.rows, files: result.files })}</div>
                <div className="mt-1 text-xs text-fg/60">{expired ? t("backup.linkExpired") : t("backup.linkTtl", { n: Math.round(result.expires_in / 60) })}</div>
              </div>
              {!expired && (
                <a href={downloadUrl(result.id)} download={result.file_name} className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-accent/50 px-3.5 text-[13px] font-semibold text-accent hover:bg-accent/10">
                  <Download className="h-4 w-4" /> {t("backup.downloadAgain")}
                </a>
              )}
            </div>
          </Alert>
        )}
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center gap-2 font-bold">
          <History className="h-5 w-5 text-accent" /> {t("backup.history")}
        </div>
        {info.loading && !info.data ? (
          <Spinner />
        ) : !info.data?.history.length ? (
          <p className="py-4 text-sm text-muted">{t("backup.historyEmpty")}</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {info.data.history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
                <div className="min-w-0">
                  <span className="font-semibold">{fmtDateTime(h.at, locale)}</span>
                  {h.actor && <span className="text-muted"> · {h.actor}</span>}
                </div>
                <div className="flex items-center gap-3 text-muted">
                  <span>{periodLabel(h)}</span>
                  <span className="tabular-nums text-fg">{fmtBytes(h.size)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
