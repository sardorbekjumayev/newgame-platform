"use client";

import { I18nProvider } from "@/i18n/provider";
import { AuthProvider } from "@/lib/session";
import { TelegramProvider } from "@/lib/telegram";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <AuthProvider>
        <TelegramProvider>{children}</TelegramProvider>
      </AuthProvider>
    </I18nProvider>
  );
}
