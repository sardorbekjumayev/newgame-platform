"use client";

import { Loader2, Phone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { buttonClass } from "@/components/ui";
import { useI18n } from "@/i18n/provider";
import { useTelegram } from "@/lib/telegram";

/** Telegram Mini App kirish nuqtasi: avtomatik kirish → klublar xaritasi. */
export default function TelegramEntry() {
  const { t } = useI18n();
  const { isTg, status, login, shareContact } = useTelegram();
  const router = useRouter();

  useEffect(() => {
    if (status !== "ready") return;
    const next = new URLSearchParams(window.location.search).get("next");
    router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/map");
  }, [status, router]);

  // Oddiy brauzerda ochilsa — saytning o'zi
  useEffect(() => {
    const id = setTimeout(() => {
      if (!isTg) router.replace("/");
    }, 1500);
    return () => clearTimeout(id);
  }, [isTg, router]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-5 px-6 py-16 text-center">
      {status === "need_contact" ? (
        <>
          <span className="grid h-[72px] w-[72px] place-items-center rounded-full bg-accent text-on-accent">
            <Phone className="h-8 w-8" strokeWidth={2.6} />
          </span>
          <h1 className="font-display text-[44px] uppercase leading-none">{t("tg.needTitle")}</h1>
          <p className="leading-normal text-soft">{t("tg.needText")}</p>
          <button onClick={() => void shareContact()} className={buttonClass("primary", "lg", "w-full")}>
            {t("tg.share")}
          </button>
        </>
      ) : status === "error" ? (
        <>
          <p className="font-semibold text-soft">{t("tg.error")}</p>
          <button onClick={() => void login()} className={buttonClass("secondary", "md")}>
            {t("tg.retry")}
          </button>
        </>
      ) : (
        <>
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
          <p className="font-semibold text-muted">{t("tg.loading")}</p>
        </>
      )}
    </main>
  );
}
