"use client";

import type { LoginResult } from "@ng/types";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { session, useAuth } from "./session";

type TgWebApp = {
  initData: string;
  colorScheme: "light" | "dark";
  ready: () => void;
  expand: () => void;
  setHeaderColor?: (c: string) => void;
  setBackgroundColor?: (c: string) => void;
  requestContact?: (cb: (ok: boolean) => void) => void;
  BackButton: { show: () => void; hide: () => void; onClick: (cb: () => void) => void; offClick: (cb: () => void) => void };
  HapticFeedback?: { notificationOccurred: (t: "success" | "error" | "warning") => void };
};
declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

/** Telegram Mini App ichida bo'lsak — WebApp obyekti (initData bo'sh emas). */
export function getWebApp(): TgWebApp | null {
  if (typeof window === "undefined") return null;
  const w = window.Telegram?.WebApp;
  return w && w.initData ? w : null;
}

type Status = "off" | "auth" | "need_contact" | "ready" | "error";
type TgCtx = { isTg: boolean; status: Status; login: () => Promise<Status>; shareContact: () => Promise<void> };
const Ctx = createContext<TgCtx>({ isTg: false, status: "off", login: async () => "off", shareContact: async () => undefined });

const ROOT_PATHS = ["/tg", "/map", "/bookings", "/profile", "/"];

/**
 * Telegram Mini App rejimi: initData bilan avtomatik kirish, Telegram ranglari, "Orqaga" tugmasi.
 * Raqam botda ulashilmagan bo'lsa — `need_contact` (sahifa `shareContact()` ni chaqiradi).
 */
export function TelegramProvider({ children }: { children: React.ReactNode }) {
  const { me, loading, signIn } = useAuth();
  const isTg = useSyncExternalStore(
    () => () => undefined,
    () => !!getWebApp(),
    () => false,
  );
  const [raw, setStatus] = useState<Status>("auth");
  const status: Status = !isTg ? "off" : me ? "ready" : raw;
  const router = useRouter();
  const pathname = usePathname();
  const tried = useRef(false);

  const login = useCallback(async (): Promise<Status> => {
    const wa = getWebApp();
    if (!wa) return "off";
    try {
      const res = await session.post<({ need_contact: true } | ({ need_contact: false } & LoginResult))>("/auth/telegram-webapp", { init_data: wa.initData });
      const d = res.data;
      if (d.need_contact) {
        setStatus("need_contact");
        return "need_contact";
      }
      signIn(d);
      setStatus("ready");
      return "ready";
    } catch {
      setStatus("error");
      return "error";
    }
  }, [signIn]);

  // Telegram ichidamizmi — skript yuklangach aniqlanadi
  useEffect(() => {
    const wa = getWebApp();
    if (!wa) return;
    document.documentElement.dataset.tg = "1";
    wa.ready();
    wa.expand();
    try {
      wa.setHeaderColor?.("#0e0f13");
      wa.setBackgroundColor?.("#0e0f13");
    } catch {
      /* eski klientlar */
    }
  }, []);

  // Avtomatik kirish (bir marta)
  useEffect(() => {
    if (!isTg || loading || me || tried.current) return;
    tried.current = true;
    void login();
  }, [isTg, loading, me, login]);

  // Telegram "Orqaga" tugmasi
  useEffect(() => {
    const wa = getWebApp();
    if (!wa) return;
    const back = () => router.back();
    if (ROOT_PATHS.includes(pathname)) wa.BackButton.hide();
    else {
      wa.BackButton.show();
      wa.BackButton.onClick(back);
    }
    return () => wa.BackButton.offClick(back);
  }, [pathname, router]);

  const shareContact = useCallback(async () => {
    const wa = getWebApp();
    if (!wa?.requestContact) return;
    const ok = await new Promise<boolean>((r) => wa.requestContact!(r));
    if (!ok) return;
    setStatus("auth");
    // Kontakt botga keladi va bog'lanadi — bir necha soniya kutib qayta urinamiz
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const s = await login();
      if (s === "ready") {
        wa.HapticFeedback?.notificationOccurred("success");
        return;
      }
      if (s === "error") return;
    }
    setStatus("need_contact");
  }, [login]);

  return <Ctx.Provider value={{ isTg, status, login, shareContact }}>{children}</Ctx.Provider>;
}

export const useTelegram = () => useContext(Ctx);
