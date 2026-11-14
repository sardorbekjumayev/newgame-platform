"use client";

import type { LoginResult } from "@ng/types";
import { Building2, Eye, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Alert, Button, Card, Field, Input, Logo } from "@/components/ui";
import { useErrorText, useI18n } from "@/i18n/provider";
import { session, useAuth } from "@/lib/session";

export default function LoginPage() {
  const { t } = useI18n();
  const errorText = useErrorText();
  const { me, signIn } = useAuth();
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (me) router.replace("/");
  }, [me, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await session.post<LoginResult>("/auth/login", { login: login.trim(), password, device: { platform: "web-admin" } });
      signIn(res.data);
      router.replace("/");
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <main className="grid flex-1 lg:grid-cols-2">
      <section className="relative hidden overflow-hidden border-r border-line-soft bg-surface p-12 lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="pointer-events-none absolute -top-40 -left-40 h-[480px] w-[480px] rounded-full bg-accent/10 blur-3xl" />
        <Logo className="relative" />
        <div className="relative space-y-6">
          <h2 className="font-display text-4xl font-bold leading-tight">{t("login.side.title")}</h2>
          <p className="max-w-md text-lg text-muted">{t("login.side.text")}</p>
          <ul className="space-y-3 text-[15px]">
            {[
              { icon: ShieldCheck, k: "role.SUPER_ADMIN" as const },
              { icon: Building2, k: "role.OPERATOR" as const },
              { icon: Eye, k: "role.MANAGER" as const },
            ].map((r) => (
              <li key={r.k} className="flex items-center gap-3">
                <r.icon className="h-5 w-5 text-accent" />
                {t(r.k)}
              </li>
            ))}
          </ul>
        </div>
      </section>
      <div className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex items-center justify-between">
            <span className="lg:invisible">
              <Logo />
            </span>
            <LocaleSwitcher />
          </div>
          <Card className="space-y-4 border border-line-soft p-6">
            <div>
              <h1 className="font-display text-2xl font-bold">{t("login.title")}</h1>
              <p className="mt-1 text-sm text-muted">{t("login.subtitle")}</p>
            </div>
            {error && <Alert>{error}</Alert>}
            <form onSubmit={submit} className="space-y-4">
              <Field label={t("login.login")}>
                <Input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" autoCapitalize="none" required autoFocus />
              </Field>
              <Field label={t("login.password")}>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
              </Field>
              <Button type="submit" loading={busy} size="lg" className="w-full">
                {t("login.submit")}
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </main>
  );
}
