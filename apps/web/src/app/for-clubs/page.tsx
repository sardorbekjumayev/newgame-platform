"use client";

import { BarChart3, CalendarCheck, Check, Users } from "lucide-react";
import Link from "next/link";
import { Fragment, useState } from "react";
import { Alert, Button, Card, Field, Input, buttonClass, fieldClass } from "@/components/ui";
import { useErrorText, useI18n } from "@/i18n/provider";
import { api } from "@/lib/api";
import { normalizePhone } from "@/lib/use-api";

// Allaqachon ulangan klub egalari uchun panel manzili (masalan https://club.<domen>). Sozlanmagan bo'lsa — havola yo'q.
const CLUB_PANEL_URL = process.env.NEXT_PUBLIC_CLUB_PANEL_URL || null;
const UZ_PHONE = /^\+998\d{9}$/;

type Form = { full_name: string; phone: string; club_name: string; telegram: string; comment: string };
const EMPTY: Form = { full_name: "", phone: "+998 ", club_name: "", telegram: "", comment: "" };

/** Klub egasi ulanish arizasi (aloqa ma'lumotlari va klub nomi; shahar, filial va manzilni keyin o'zi kiritadi): akkauntsiz forma → super admin paneliga (`POST /club-applications`). */
export default function ForClubsPage() {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const [f, setF] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const phone = normalizePhone(f.phone);
    if (!UZ_PHONE.test(phone)) return setError(t("apply.invalidPhone"));
    setBusy(true);
    setError(null);
    try {
      await api.post("/club-applications", {
        full_name: f.full_name.trim(),
        phone,
        club_name: f.club_name.trim(),
        telegram: f.telegram.trim() || undefined,
        comment: f.comment.trim() || undefined,
        language: locale,
      });
      setSentTo(phone);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const consent = t("apply.consent").split(/(\{partner\})/);

  return (
    <main className="mx-auto w-full max-w-[1280px] flex-1 px-5 py-6 sm:px-8 sm:py-12">
      <div className="grid items-start gap-10 lg:grid-cols-[1fr_minmax(0,520px)] lg:gap-14">
        <section className="space-y-6 lg:sticky lg:top-28">
          <span className="inline-block rounded-full border-2 border-accent px-[18px] py-2 text-[13px] font-bold tracking-[0.08em] text-accent uppercase">{t("apply.kicker")}</span>
          <h1 className="font-display text-[48px] uppercase leading-[0.95] sm:text-[88px]">{t("apply.title")}</h1>
          <p className="max-w-lg text-lg leading-normal font-medium text-soft">{t("apply.subtitle")}</p>
          <ul className="space-y-3">
            {[
              { icon: Users, key: "apply.benefit.clients" },
              { icon: CalendarCheck, key: "apply.benefit.booking" },
              { icon: BarChart3, key: "apply.benefit.reports" },
            ].map((b) => (
              <li key={b.key} className="flex items-center gap-3 font-bold">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] bg-accent text-on-accent">
                  <b.icon className="h-5 w-5" strokeWidth={2.6} />
                </span>
                {t(b.key as "apply.benefit.clients")}
              </li>
            ))}
          </ul>
          <div className="rounded-[18px] bg-surface p-5">
            <div className="mb-3 text-[13px] font-bold tracking-[0.08em] text-accent uppercase">{t("apply.steps.title")}</div>
            <ol className="space-y-3 font-semibold">
              {(["apply.step1", "apply.step2", "apply.step3"] as const).map((k, i) => (
                <li key={k} className="flex items-center gap-3.5">
                  <span className="w-5 shrink-0 font-display text-[32px] leading-none text-accent">{i + 1}</span>
                  {t(k)}
                </li>
              ))}
            </ol>
          </div>
          {CLUB_PANEL_URL && (
            <p className="text-sm font-semibold text-muted">
              {t("apply.haveAccount")}{" "}
              <a href={CLUB_PANEL_URL} className="font-bold text-fg underline decoration-dim underline-offset-2 hover:text-accent">
                {t("apply.login")}
              </a>
            </p>
          )}
        </section>

        <Card className="rounded-[24px]! sm:p-8">
          {sentTo ? (
            <div className="flex flex-col items-center gap-4 py-10 text-center" role="status">
              <span className="grid h-[72px] w-[72px] place-items-center rounded-full bg-accent text-on-accent">
                <Check className="h-9 w-9" strokeWidth={3.2} />
              </span>
              <h2 className="font-display text-[40px] uppercase leading-none">{t("apply.success.title")}</h2>
              <p className="font-semibold text-soft">{t("apply.success.text", { phone: sentTo })}</p>
              <Link href="/" className={buttonClass("secondary", "md", "mt-2")}>
                {t("apply.success.home")}
              </Link>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={submit}>
              <h2 className="font-display text-[32px] uppercase leading-none">{t("apply.form.title")}</h2>
              <Field label={t("apply.fullName")}>
                <Input value={f.full_name} onChange={set("full_name")} autoComplete="name" minLength={2} maxLength={120} required />
              </Field>
              <Field label={t("apply.phone")} hint={t("apply.phoneHint")}>
                <Input type="tel" inputMode="tel" value={f.phone} onChange={set("phone")} autoComplete="tel" required />
              </Field>
              <Field label={t("apply.clubName")}>
                <Input value={f.club_name} onChange={set("club_name")} minLength={2} maxLength={120} required />
              </Field>
              <Field label={`${t("apply.telegram")} · ${t("apply.optional")}`}>
                <Input value={f.telegram} onChange={set("telegram")} placeholder="@username" maxLength={100} />
              </Field>
              <Field label={`${t("apply.comment")} · ${t("apply.optional")}`}>
                <textarea
                  value={f.comment}
                  onChange={set("comment")}
                  rows={3}
                  maxLength={2000}
                  placeholder={t("apply.commentPlaceholder")}
                  className={`w-full py-3 ${fieldClass}`}
                />
              </Field>
              {error && <Alert>{error}</Alert>}
              <Button type="submit" size="lg" loading={busy} className="w-full">
                {t("apply.submit")}
              </Button>
              <p className="text-center text-xs leading-5 text-muted">
                {consent.map((p, i) =>
                  p === "{partner}" ? (
                    <Link key={i} href="/legal/partner" target="_blank" className="font-semibold text-fg underline decoration-dim underline-offset-2 hover:text-accent">
                      {t("legal.partner")}
                    </Link>
                  ) : (
                    <Fragment key={i}>{p}</Fragment>
                  ),
                )}
              </p>
            </form>
          )}
        </Card>
      </div>
    </main>
  );
}
