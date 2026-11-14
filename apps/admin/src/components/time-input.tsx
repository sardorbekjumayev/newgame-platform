"use client";

import { cx } from "@/components/ui";

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const STEP_MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));
const sel = "h-full appearance-none bg-transparent text-fg px-2 text-center font-mono text-[15px] tabular-nums outline-none";

/**
 * 24 soatlik vaqt tanlagich ("HH:MM"). Brauzerning AM/PM ko'rinishiga bog'liq emas.
 * 00:00 — yarim tun.
 */
export function TimeInput({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const [h = "00", m = "00"] = (value || "00:00").split(":");
  const minutes = STEP_MINUTES.includes(m) ? STEP_MINUTES : [...STEP_MINUTES, m].sort();
  return (
    <span className={cx("inline-flex h-12 items-center rounded-[14px] border border-line bg-surface focus-within:border-accent", className)}>
      <select aria-label="HH" value={h} onChange={(e) => onChange(`${e.target.value}:${m}`)} className={sel}>
        {HOURS.map((x) => (
          <option key={x} value={x}>{x}</option>
        ))}
      </select>
      <span className="font-mono text-muted">:</span>
      <select aria-label="MM" value={m} onChange={(e) => onChange(`${h}:${e.target.value}`)} className={sel}>
        {minutes.map((x) => (
          <option key={x} value={x}>{x}</option>
        ))}
      </select>
    </span>
  );
}
