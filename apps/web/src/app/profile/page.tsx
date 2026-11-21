"use client";

import { LogOut, Monitor, Save, Settings, ShieldCheck, Smartphone, UserCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, Button, Card, Field, Input, Spinner } from "@/components/ui";
import { LOCALES, type Locale, useErrorText, useI18n } from "@/i18n/provider";
import { fmtDateTimeTz } from "@/lib/format";
import { session, useAuth } from "@/lib/session";
import { useApi } from "@/lib/use-api";

type Session = { id: string; device_info: { platform?: string; user_agent?: string } | null; ip: string | null; created_at: string; expires_at: string; current: boolean };
const LANG_NAMES: Record<Locale, string> = { uz: "O'zbekcha", ru: "Русский", en: "English" };

/** Mijoz profili: shaxsiy ma'lumotlar va til, faol qurilmalar, chiqish. */
export default function ProfilePage() {
  const { t } = useI18n();
  const { me, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !me) router.replace("/login?next=/profile");
  }, [loading, me, router]);

  if (loading || !me) return <Spinner className="mx-auto my-20 h-6 w-6" />;
  const name = [me.first_name, me.last_name].filter(Boolean).join(" ");

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-5 py-6 sm:px-8 sm:py-10">
      <div className="flex items-center gap-4">
        <span className="grid h-[72px] w-[72px] shrink-0 place-items-center rounded-[18px] bg-accent font-display text-[40px] leading-none text-on-accent">
          {(me.first_name || me.phone || "?").replace("+", "").slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h1 className="truncate font-display text-[40px] uppercase leading-none sm:text-[56px]">{name || t("profile.title")}</h1>
          <div className="mt-1.5 font-semibold text-muted">{me.phone}</div>
        </div>
      </div>
      {!name && <Alert tone="info">{t("profile.fillName")}</Alert>}
      <SettingsCard />
      <SessionsCard />
      <LogoutCard />
    </main>
  );
}

function SettingsCard() {
  const { t, locale, setLocale } = useI18n();
  const errorText = useErrorText();
  const { me, reload } = useAuth();
  const [f, setF] = useState({ first_name: me?.first_name ?? "", last_name: me?.last_name ?? "", email: me?.email ?? "" });
  const [lang, setLang] = useState<Locale>((me?.language as Locale) ?? locale);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => (setSaved(false), setF((s) => ({ ...s, [k]: e.target.value })));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await session.patch("/auth/me", { first_name: f.first_name, last_name: f.last_name, email: f.email.trim() || null, language: lang });
      setLocale(lang); // sayt tili ham shu
      await reload();
      setSaved(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-5 rounded-[24px]! sm:p-7">
      <div className="flex items-center gap-2.5 font-display text-[28px] uppercase leading-none">
        <Settings className="h-6 w-6 text-accent" strokeWidth={2.4} />
        {t("profile.settings")}
      </div>
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("profile.firstName")}>
            <Input value={f.first_name} onChange={set("first_name")} maxLength={80} autoComplete="given-name" />
          </Field>
          <Field label={t("profile.lastName")}>
            <Input value={f.last_name} onChange={set("last_name")} maxLength={80} autoComplete="family-name" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("profile.phone")} hint={t("profile.phoneHint")}>
            <Input value={me?.phone ?? ""} disabled />
          </Field>
          <Field label={`${t("profile.email")} (${t("apply.optional")})`}>
            <Input type="email" value={f.email} onChange={set("email")} maxLength={254} autoComplete="email" />
          </Field>
        </div>
        <Field label={t("profile.language")}>
          <div className="flex flex-wrap gap-2">
            {LOCALES.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => (setSaved(false), setLang(l))}
                aria-pressed={lang === l}
                className={`min-h-11 rounded-full border-2 px-4 text-sm font-bold transition ${lang === l ? "border-accent bg-accent text-on-accent" : "border-fg text-fg hover:bg-fg hover:text-ink"}`}
              >
                {LANG_NAMES[l]}
              </button>
            ))}
          </div>
        </Field>
        {error && <Alert>{error}</Alert>}
        {saved && <Alert tone="success">{t("profile.saved")}</Alert>}
        <Button type="submit" loading={busy} size="lg" className="w-full sm:w-auto">
          <Save className="h-5 w-5" strokeWidth={2.6} />
          {t("profile.save")}
        </Button>
      </form>
    </Card>
  );
}

function SessionsCard() {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const list = useApi<Session[]>("/auth/sessions");
  const { signOut } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function revoke(s: Session) {
    // Joriy qurilma — oddiy chiqish (tokenlar tozalanadi)
    if (s.current) {
      if (!confirm(t("profile.revokeCurrentConfirm"))) return;
      await signOut();
      router.replace("/");
      return;
    }
    setError(null);
    try {
      await session.delete(`/auth/sessions/${s.id}`);
      list.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  const deviceName = (s: Session) => {
    const ua = s.device_info?.user_agent ?? "";
    const os = /iphone|ipad/i.test(ua) ? "iOS" : /android/i.test(ua) ? "Android" : /windows/i.test(ua) ? "Windows" : /mac os/i.test(ua) ? "macOS" : /linux/i.test(ua) ? "Linux" : null;
    const browser = /edg\//i.test(ua) ? "Edge" : /firefox/i.test(ua) ? "Firefox" : /chrome/i.test(ua) ? "Chrome" : /safari/i.test(ua) ? "Safari" : null;
    return [browser, os].filter(Boolean).join(" · ") || s.device_info?.platform || t("profile.unknownDevice");
  };

  return (
    <Card className="space-y-4 rounded-[24px]! sm:p-7">
      <div className="flex items-center gap-2.5 font-display text-[28px] uppercase leading-none">
        <ShieldCheck className="h-6 w-6 text-accent" strokeWidth={2.4} />
        {t("profile.sessions")}
      </div>
      <p className="text-sm font-semibold text-muted">{t("profile.sessionsHint")}</p>
      {error && <Alert>{error}</Alert>}
      {!list.data ? (
        <Spinner className="h-5 w-5" />
      ) : (
        <ul className="divide-y-2 divide-line overflow-hidden rounded-[14px] border-2 border-line">
          {list.data.map((s) => {
            const mobile = /android|iphone|ipad/i.test(s.device_info?.user_agent ?? "");
            return (
              <li key={s.id} className={`flex items-center gap-3 px-4 py-3 ${s.current ? "bg-surface-2" : ""}`}>
                {mobile ? <Smartphone className={`h-5 w-5 shrink-0 ${s.current ? "text-accent" : "text-muted"}`} /> : <Monitor className={`h-5 w-5 shrink-0 ${s.current ? "text-accent" : "text-muted"}`} />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 truncate text-[15px] font-bold">
                    {deviceName(s)}
                    {s.current && <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-on-accent">{t("profile.thisDevice")}</span>}
                  </div>
                  <div className="truncate text-xs font-semibold text-muted">
                    {fmtDateTimeTz(s.created_at, locale)}
                    {s.ip ? ` · ${s.ip}` : ""}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => revoke(s)}>
                  {s.current ? t("auth.logout") : t("profile.revoke")}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function LogoutCard() {
  const { t } = useI18n();
  const { signOut } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState<"one" | "all" | null>(null);

  async function out(all: boolean) {
    if (all && !confirm(t("profile.logoutAllConfirm"))) return;
    setBusy(all ? "all" : "one");
    try {
      if (all) await session.post("/auth/logout-all").catch(() => undefined);
      await signOut();
    } finally {
      router.replace("/");
    }
  }

  return (
    <Card className="flex flex-col gap-4 rounded-[24px]! sm:flex-row sm:items-center sm:justify-between sm:p-7">
      <div className="flex items-center gap-2.5 font-display text-[28px] uppercase leading-none">
        <UserCircle className="h-6 w-6 text-accent" strokeWidth={2.4} />
        {t("profile.account")}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" loading={busy === "all"} onClick={() => out(true)}>
          {t("auth.logoutAll")}
        </Button>
        <Button variant="danger" loading={busy === "one"} onClick={() => out(false)}>
          <LogOut className="h-4 w-4" strokeWidth={2.6} />
          {t("auth.logout")}
        </Button>
      </div>
    </Card>
  );
}
