"use client";

import { ArrowLeft, X } from "lucide-react";
import Link from "next/link";
import { forwardRef, useEffect } from "react";

/*
 * Umumiy UI — template/design.html uslubi: 2px chiziqlar, lime to'ldirilgan asosiy tugma,
 * oq hoshiyali ikkilamchi tugma, bosish maydoni kamida 44px, sarlavhalar Anton (font-display + uppercase).
 */

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type ButtonVariant = "primary" | "secondary" | "white" | "dark" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const BTN_SIZE: Record<ButtonSize, string> = {
  sm: "min-h-11 rounded-[10px] px-4 text-sm",
  md: "min-h-12 rounded-xl px-5 text-[15px]",
  lg: "min-h-14 rounded-[14px] px-7 text-[17px] uppercase tracking-wide",
};
const BTN_VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover",
  secondary: "border-2 border-fg text-fg hover:bg-fg hover:text-ink",
  white: "bg-paper text-ink hover:bg-soft",
  dark: "bg-ink text-fg hover:bg-surface-3",
  ghost: "text-muted hover:bg-surface hover:text-fg",
  danger: "border-2 border-danger text-danger-soft hover:bg-danger hover:text-ink",
};

/** Tugma ko'rinishi — `<Link>` ham tugmadek ko'rinishi uchun. */
export const buttonClass = (variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) =>
  cx(
    "inline-flex items-center justify-center gap-2 text-center font-bold transition active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40 disabled:active:translate-y-0",
    BTN_SIZE[size],
    BTN_VARIANT[variant],
    className,
  );

export function Button({
  variant = "primary",
  size = "md",
  loading,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}) {
  return (
    <button {...props} disabled={props.disabled || loading} className={buttonClass(variant, size, className)}>
      {loading && <Spinner className="h-4 w-4 text-current" />}
      {children}
    </button>
  );
}

export const fieldClass =
  "rounded-[14px] border-2 border-dim bg-bg px-4 text-base font-semibold text-fg outline-none transition placeholder:font-medium placeholder:text-dim focus:border-accent disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} {...props} className={cx("h-14 w-full", fieldClass, className)} />;
});

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx("h-14 pr-8", fieldClass, className)} />;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Card({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div {...props} className={cx("rounded-[18px] bg-surface p-5", className)}>
      {children}
    </div>
  );
}

/** Katta raqamli ko'rsatkich. */
export function Stat({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div className="rounded-[18px] bg-surface p-5">
      <div className={cx("font-display text-5xl leading-none tabular-nums", accent && "text-accent")}>{value}</div>
      <div className="mt-2 text-sm font-semibold text-muted">{label}</div>
    </div>
  );
}

export function Heading({ className, children }: { className?: string; children: React.ReactNode }) {
  return <h1 className={cx("font-display text-[40px] uppercase leading-none sm:text-6xl", className)}>{children}</h1>;
}

/** Sarlavhadagi egilgan lime "marker" (dizayndagi «toping.»). */
export function Hl({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cx("inline-block -skew-x-6 bg-accent px-[0.1em] text-on-accent", className)}>{children}</span>;
}

/** Ikki rangli sarlavha: oxirgi so'z lime (dizayndagi «Zonani tanlang»). */
export function TwoTone({ text }: { text: string }) {
  const i = text.trimEnd().lastIndexOf(" ");
  if (i < 0) return <span className="text-accent">{text}</span>;
  return (
    <>
      {text.slice(0, i)} <span className="text-accent">{text.slice(i + 1)}</span>
    </>
  );
}

/** Bosqich yorlig'i: «1 · SANA». */
export function StepLabel({ n, children, className, tone = "accent" }: { n?: number; children: React.ReactNode; className?: string; tone?: "accent" | "muted" }) {
  return (
    <div className={cx("text-[13px] font-bold uppercase tracking-[0.08em]", tone === "accent" ? "text-accent" : "text-muted", className)}>
      {n != null && <>{n} · </>}
      {children}
    </div>
  );
}

/** Tanlov tugmasi (sana, vaqt, zona): tanlangani lime, band/yopig'i — xira va chizilgan. */
export function Option({
  selected,
  struck,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean; struck?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      {...props}
      className={cx(
        "min-h-12 rounded-xl border-2 px-2 font-bold transition disabled:cursor-not-allowed",
        selected
          ? "border-accent bg-accent text-on-accent"
          : "border-fg text-fg hover:bg-fg hover:text-ink disabled:border-line-strong disabled:text-dim disabled:hover:bg-transparent",
        struck && "line-through",
        className,
      )}
    />
  );
}

/** Kvadrat "orqaga" tugmasi. `tone="light"` — lime fon ustida (oq, qora hoshiya). */
export function BackButton({ href, onClick, label, tone = "dark" }: { href?: string; onClick?: () => void; label: string; tone?: "dark" | "light" }) {
  const cls = cx(
    "grid h-12 w-12 shrink-0 place-items-center rounded-[14px] border-2 transition active:translate-y-px",
    tone === "light" ? "border-ink bg-paper text-ink hover:bg-ink hover:text-fg" : "border-fg text-fg hover:bg-fg hover:text-ink",
  );
  const icon = <ArrowLeft className="h-6 w-6" strokeWidth={2.6} />;
  return href ? (
    <Link href={href} aria-label={label} className={cls}>
      {icon}
    </Link>
  ) : (
    <button type="button" onClick={onClick} aria-label={label} className={cls}>
      {icon}
    </button>
  );
}

export function Alert({ tone = "error", children }: { tone?: "error" | "success" | "info"; children: React.ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cx(
        "rounded-[14px] border-2 px-4 py-3 text-sm font-semibold",
        tone === "error" && "border-danger bg-danger/10 text-danger-soft",
        tone === "success" && "border-accent bg-accent/10 text-accent",
        tone === "info" && "border-line-strong bg-surface text-soft",
      )}
    >
      {children}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx("animate-spin", !className?.includes("text-") && "text-accent", className ?? "h-5 w-5")} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "green" | "red" | "amber" | "violet" }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-bold",
        tone === "neutral" && "border-2 border-line-strong text-muted",
        tone === "green" && "bg-accent text-on-accent",
        tone === "red" && "bg-danger/15 text-danger-soft",
        tone === "amber" && "bg-warn/15 text-warn",
        tone === "violet" && "bg-paper text-ink",
      )}
    >
      {children}
    </span>
  );
}

/** Filtr "chip" (pill): faol — lime, qolganlari oq hoshiyali. */
export function Chip({ active, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      {...props}
      className={cx(
        "min-h-11 rounded-full border-2 px-4 text-sm font-bold whitespace-nowrap transition",
        active ? "border-accent bg-accent text-on-accent" : "border-fg text-fg hover:bg-fg hover:text-ink",
        className,
      )}
    />
  );
}

/** Logo: ZON + egilgan lime «UP». */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cx("font-display text-[28px] leading-none tracking-[0.02em] text-fg sm:text-[34px]", className)}>
      ZON<span className="ml-0.5 inline-block -skew-x-[8deg] bg-accent px-[0.2em] text-on-accent">UP</span>
    </span>
  );
}

/** Pastdan chiquvchi (mobil) / markaziy (desktop) modal oyna. */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[24px] border-t-2 border-line bg-nav p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:rounded-[24px] sm:border-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-[28px] uppercase leading-none">{title}</h2>
          <button
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border-2 border-fg text-fg transition hover:bg-fg hover:text-ink"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-5 w-5" strokeWidth={2.6} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
