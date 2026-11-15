"use client";

import { Loader2, Phone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
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
          <span className="grid h-16 w-16 place-items-center rounded-2xl bg-accent/15 text-accent">
            <Phone className="h-8 w-8" />
          </span>
          <h1 className="font-display text-2xl font-bold">{t("tg.needTitle")}</h1>
          <p className="text-sm text-muted">{t("tg.needText")}</p>
          <button onClick={() => void shareContact()} className="h-12 w-full rounded-xl bg-accent font-bold text-on-accent hover:bg-accent-hover">
            {t("tg.share")}
          </button>
        </>
      ) : status === "error" ? (
        <>
          <p className="text-sm text-muted">{t("tg.error")}</p>
          <button onClick={() => void login()} className="h-11 rounded-xl border border-line px-5 font-semibold">
            {t("tg.retry")}
          </button>
        </>
      ) : (
        <>
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
          <p className="text-sm text-muted">{t("tg.loading")}</p>
        </>
      )}
    </main>
  );
}
