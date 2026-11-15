"use client";

import { useEffect, useRef } from "react";
import { cx } from "@/components/ui";

const ITEM = 44;
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * 24 soatlik vaqt tanlash: soat va daqiqa barabanlari (suriladi yoki bosiladi) — mijoz bron vidjetidagi kabi.
 * `value` — "HH:MM"; `enabled(h, m)` — tanlash mumkin bo'lgan vaqtlar (masalan, o'tgan vaqt emas).
 */
export function TimeWheels({ value, onChange, enabled = () => true }: { value: string; onChange: (v: string) => void; enabled?: (h: number, m: number) => boolean }) {
  const [h, m] = value.split(":").map(Number);
  const hourOk = (x: number) => Array.from({ length: 60 }, (_, k) => k).some((k) => enabled(x, k));
  const pick = (nh: number, nm: number) => {
    let mm = nm;
    if (!enabled(nh, mm)) {
      const c = Array.from({ length: 60 }, (_, k) => k).filter((k) => enabled(nh, k));
      if (!c.length) return;
      mm = c.reduce((a, b) => (Math.abs(b - nm) < Math.abs(a - nm) ? b : a));
    }
    onChange(`${pad(nh)}:${pad(mm)}`);
  };
  return (
    <div className="flex items-center gap-3">
      <Wheel items={HOURS} value={h} enabled={hourOk} onPick={(x) => pick(x, m)} />
      <span className="font-display text-3xl font-bold text-muted">:</span>
      <Wheel items={MINUTES} value={m} enabled={(x) => enabled(h, x)} onPick={(x) => pick(h, x)} />
    </div>
  );
}

const HOURS = Array.from({ length: 24 }, (_, x) => x);
const MINUTES = Array.from({ length: 60 }, (_, x) => x);

/** Vertikal baraban: scroll-snap, o'rtadagi qiymat tanlanadi; yaroqsizlari xira. */
function Wheel({ items, value, enabled, onPick }: { items: number[]; value: number; enabled: (n: number) => boolean; onPick: (n: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const silent = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const top = items.indexOf(value) * ITEM;
    if (Math.abs(el.scrollTop - top) > 2) {
      silent.current = true;
      el.scrollTo({ top, behavior: "smooth" });
      setTimeout(() => (silent.current = false), 400);
    }
  }, [value, items]);

  const onScroll = () => {
    if (silent.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      let i = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ITEM)));
      if (!enabled(items[i])) {
        const valid = items.map((n, k) => (enabled(n) ? k : -1)).filter((k) => k >= 0);
        if (!valid.length) return;
        i = valid.reduce((a, b) => (Math.abs(b - i) < Math.abs(a - i) ? b : a));
      }
      if (items[i] !== value) onPick(items[i]);
      else el.scrollTo({ top: i * ITEM, behavior: "smooth" });
    }, 120);
  };

  return (
    <div className="relative h-[176px] w-20 overflow-hidden rounded-2xl border border-line bg-bg">
      <div className="pointer-events-none absolute inset-x-1 top-1/2 h-11 -translate-y-1/2 rounded-xl bg-accent/15 ring-1 ring-accent/60" />
      <div ref={ref} onScroll={onScroll} className="h-full snap-y snap-mandatory overflow-y-scroll py-[66px] [scrollbar-width:none]">
        {items.map((n) => {
          const on = enabled(n);
          return (
            <button
              key={n}
              type="button"
              disabled={!on}
              onClick={() => onPick(n)}
              className={cx("relative block h-11 w-full snap-center text-center font-display text-2xl tabular-nums transition", n === value ? "font-bold text-fg" : on ? "text-muted hover:text-fg" : "text-muted/25")}
            >
              {pad(n)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
