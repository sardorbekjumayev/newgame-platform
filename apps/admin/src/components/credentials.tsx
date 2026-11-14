"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Alert, Button, Modal, cx } from "@/components/ui";
import { useI18n } from "@/i18n/provider";
import { fmtPublicId } from "@/lib/format";

export type Credentials = { user_id: string; public_id: string; username: string; password?: string; must_change_password: boolean };

export function CopyButton({ text, className }: { text: string; className?: string }) {
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={cx("inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-muted transition hover:bg-surface-2 hover:text-fg", className)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard yo'q (http) — foydalanuvchi qo'lda nusxalaydi */
        }
      }}
    >
      {done ? <Check className="h-3.5 w-3.5 text-accent" /> : <Copy className="h-3.5 w-3.5" />}
      {done ? t("common.copied") : t("common.copy")}
    </button>
  );
}

/** Yaratilgan/tiklangan akkaunt: login + parol + User ID. Parol faqat shu oynada ko'rinadi. */
export function CredentialsModal({ creds, onClose }: { creds: Credentials; onClose: () => void }) {
  const { t } = useI18n();
  const panelUrl = typeof window !== "undefined" ? `${window.location.origin}/login` : "";
  // [nom, ko'rinish, nusxa matni]
  const rows: [string, string, string][] = [
    [t("creds.panel"), panelUrl, panelUrl],
    [t("club.username"), creds.username, creds.username],
    ...(creds.password ? ([[t("club.password"), creds.password, creds.password]] as [string, string, string][]) : []),
    [t("user.id"), fmtPublicId(creds.public_id), creds.public_id],
  ];
  const all = rows.map(([k, , v]) => `${k}: ${v}`).join("\n");
  return (
    <Modal title={t("creds.title")} onClose={onClose}>
      <div className="space-y-4">
        <Alert tone="info">{t("creds.body")}</Alert>
        <dl className="divide-y divide-line-soft rounded-2xl border border-line-soft bg-surface">
          {rows.map(([k, v, copy]) => (
            <div key={k} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="truncate font-mono text-[15px] font-bold">{v}</dd>
              </div>
              <CopyButton text={copy} />
            </div>
          ))}
        </dl>
        {!creds.password && <p className="text-sm text-muted">{t("creds.passwordSet")}</p>}
        {creds.must_change_password && <p className="text-sm text-muted">{t("creds.mustChange")}</p>}
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => navigator.clipboard?.writeText(all).catch(() => undefined)}>
            <Copy className="h-4 w-4" />
            {t("creds.copyAll")}
          </Button>
          <Button className="flex-1" onClick={onClose}>
            {t("common.close")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
