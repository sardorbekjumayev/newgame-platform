"use client";

import { LOCALES, useI18n } from "@/i18n/provider";

/** Til tanlash: oq hoshiyali segment, faoli oq fonda (template/design.html). */
export function LocaleSwitcher() {
  const { locale, setLocale } = useI18n();
  return (
    <div className="inline-flex overflow-hidden rounded-[10px] border-2 border-fg">
      {LOCALES.map((l) => (
        <button
          key={l}
          onClick={() => setLocale(l)}
          aria-pressed={l === locale}
          className={`min-h-11 w-11 text-sm font-bold uppercase transition ${l === locale ? "bg-fg text-ink" : "text-fg hover:bg-surface"}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
