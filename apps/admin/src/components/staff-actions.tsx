"use client";

import { KeyRound, Lock, Unlock } from "lucide-react";
import { useState } from "react";
import { type Credentials, CredentialsModal } from "@/components/credentials";
import { Alert, Button } from "@/components/ui";
import { useErrorText, useI18n } from "@/i18n/provider";
import { session } from "@/lib/session";
import type { StaffUser } from "@/lib/types";

/** Operator/menejer akkaunti: parolni tiklash va bloklash (super admin). */
export function StaffActions({ user, onChanged }: { user: Pick<StaffUser, "id" | "status">; onChanged: () => void }) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const [busy, setBusy] = useState<"reset" | "status" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creds, setCreds] = useState<Credentials | null>(null);

  async function run(kind: "reset" | "status", fn: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  const blocked = user.status === "BLOCKED";
  return (
    <div className="space-y-2">
      {error && <Alert>{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          loading={busy === "reset"}
          onClick={() =>
            confirm(t("user.resetConfirm")) &&
            run("reset", async () => setCreds((await session.post<Credentials>(`/admin/users/${user.id}/reset-password`)).data))
          }
        >
          <KeyRound className="h-4 w-4" />
          {t("user.resetPassword")}
        </Button>
        <Button
          size="sm"
          variant={blocked ? "secondary" : "danger"}
          loading={busy === "status"}
          onClick={() =>
            run("status", async () => {
              await session.patch(`/admin/users/${user.id}/status`, { status: blocked ? "ACTIVE" : "BLOCKED" });
              onChanged();
            })
          }
        >
          {blocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
          {blocked ? t("user.unblock") : t("user.block")}
        </Button>
      </div>
      {creds && (
        <CredentialsModal
          creds={creds}
          onClose={() => {
            setCreds(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}
