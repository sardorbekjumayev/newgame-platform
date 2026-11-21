"use client";

import { formatMoney } from "@ng/types";
import { AlarmClock, BellRing, CalendarDays, CalendarPlus, Check, PhoneCall, PhoneOff, Phone, Search, Square, Timer, UserCheck, UserX, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { type OpenInfo, type StoppedSession, StoppedModal, fmtElapsed } from "@/components/open-session";
import { type ZoneLayout, ZoneLayoutView } from "@/components/zone-layout";
import { Alert, Badge, Button, Card, Input, Modal, cx } from "@/components/ui";
import { type MessageKey, useErrorText, useI18n } from "@/i18n/provider";
import { session } from "@/lib/session";

type Contact = "NEW" | "CONFIRMED" | "PREPAID" | "NO_ANSWER";
type Booking = {
  id: string; code: string; status: string; start_at: string; end_at: string; created_at: string; total_amount: number;
  contact_status: Contact; contact_note: string | null; contacted_at: string | null;
  customer: { first_name: string | null; last_name: string | null; phone: string | null };
  /** Mijoz bron paytida tasdiqlagan aloqa raqami — qo'ng'iroq shu raqamga (bo'sh bo'lsa akkaunt raqami) */
  contact_phone?: string | null;
  zones: { id: string; name: string; color: string | null; layout: ZoneLayout | null; devices_count: number | null; seats: number[] }[];
};
type OpenSession = Booking & { open: OpenInfo };
type Board = { bookings: Booking[]; open_sessions?: OpenSession[]; no_show_after_minutes: number; stats: { today: number; checked_in_today: number; cancelled_today: number; late: number; uncontacted: number } };
type Filter = "all" | "late" | "uncontacted";

/** Qo'ng'iroq qilinadigan raqam: mijoz bron paytida ko'rsatgani, bo'lmasa akkaunt (yoki mehmon) raqami. */
const callPhone = (b: Booking) => b.contact_phone ?? b.customer.phone;

const TZ = "Asia/Tashkent";
const NEW_MS = 30 * 60_000;
const CONTACTS: Contact[] = ["CONFIRMED", "PREPAID", "NO_ANSWER", "NEW"];
const CONTACT_TONE: Record<Contact, "neutral" | "green" | "violet" | "amber"> = { NEW: "amber", CONFIRMED: "green", PREPAID: "violet", NO_ANSWER: "neutral" };
const fmt = (iso: string) => {
  const d = new Date(iso);
  return {
    day: new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "2-digit", month: "2-digit" }).format(d),
    hm: new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d),
  };
};
const nameOf = (b: Booking) => [b.customer.first_name, b.customer.last_name].filter(Boolean).join(" ");

/** Operator bosh sahifasi: kod bo'yicha qidirish, statistika kartalari va kutilayotgan bronlar (10 s da yangilanadi). */
export function NewBookings() {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<Booking | null>(null);
  const [viaCode, setViaCode] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [code, setCode] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [stopping, setStopping] = useState<string | null>(null);
  const [stopped, setStopped] = useState<StoppedSession | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const res = await session.get<Board>("/operator/bookings/upcoming");
      const list = res.data.bookings;
      if (seen.current) {
        const added = list.filter((b) => !seen.current!.has(b.id)).map((b) => b.id);
        if (added.length) setFresh((f) => new Set([...f, ...added]));
      }
      seen.current = new Set(list.map((b) => b.id));
      setBoard(res.data);
      setOpen((o) => (o ? (list.find((b) => b.id === o.id) ?? o) : o));
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
    setNow(Date.now());
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Ochiq sessiyani to'xtatish — yakuniy summa oynada ko'rsatiladi. */
  async function stop(b: OpenSession) {
    if (!confirm(t("opOpen.stopConfirm"))) return;
    setStopping(b.id);
    setError(null);
    try {
      const res = await session.post<StoppedSession>(`/operator/bookings/${b.id}/stop`, {});
      setStopped(res.data);
      load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setStopping(null);
    }
  }

  async function findByCode(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().replace(/^#/, "").toUpperCase();
    if (!c) return;
    setCodeBusy(true);
    setCodeError(null);
    try {
      const res = await session.get<Booking>(`/operator/bookings/by-code/${encodeURIComponent(c)}`);
      setOpen(res.data);
      setViaCode(true);
      setCode("");
    } catch {
      setCodeError(t("opDesk.notFound"));
    } finally {
      setCodeBusy(false);
    }
  }

  function pickFilter(f: Filter) {
    setFilter((cur) => (cur === f ? "all" : f));
    setTimeout(() => listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  const all = board?.bookings ?? [];
  const isLate = (b: Booking) => new Date(b.start_at).getTime() <= now;
  const rows = filter === "late" ? all.filter(isLate).sort((a, b) => a.start_at.localeCompare(b.start_at)) : filter === "uncontacted" ? all.filter((b) => b.contact_status === "NEW") : all;
  const ago = (iso: string) => {
    const m = Math.floor((now - new Date(iso).getTime()) / 60_000);
    return m < 1 ? t("opNew.justNow") : m < 60 ? t("opNew.min", { n: m }) : `${fmt(iso).day} ${fmt(iso).hm}`;
  };
  const st = board?.stats;

  return (
    <div className="space-y-4">
      {/* Kod bo'yicha qidirish */}
      <Card className="space-y-2 border border-accent/30">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-bold">
            <UserCheck className="h-5 w-5 text-accent" />
            {t("opDesk.codeTitle")}
          </div>
          <Link href="/operator/walk-in" className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-accent px-3 text-sm font-bold text-on-accent hover:bg-accent-hover">
            <CalendarPlus className="h-4 w-4" /> {t("nav.walkIn")}
          </Link>
        </div>
        <form onSubmit={findByCode} className="flex gap-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder={t("opDesk.codePh")}
            maxLength={20}
            autoComplete="off"
            className="font-mono text-lg tracking-widest"
          />
          <Button type="submit" loading={codeBusy}>
            <Search className="h-4 w-4" /> {t("opDesk.find")}
          </Button>
        </form>
        {codeError && <Alert>{codeError}</Alert>}
        {notice && <Alert tone="success">{notice}</Alert>}
      </Card>

      {/* Statistika kartalari */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard icon={CalendarDays} label={t("opDesk.stat.today")} value={st?.today} />
        <StatCard icon={UserCheck} label={t("opDesk.stat.checkedIn")} value={st?.checked_in_today} />
        <StatCard icon={AlarmClock} label={t("opDesk.stat.late")} value={st?.late} tone={st?.late ? "red" : undefined} active={filter === "late"} onClick={() => pickFilter("late")} />
        <StatCard icon={PhoneCall} label={t("opDesk.stat.uncontacted")} value={st?.uncontacted} tone={st?.uncontacted ? "amber" : undefined} active={filter === "uncontacted"} onClick={() => pickFilter("uncontacted")} />
        <StatCard icon={UserX} label={t("opDesk.stat.cancelled")} value={st?.cancelled_today} />
      </div>

      {/* Ochiq vaqt: davom etayotgan sessiyalar — to'xtatishni faqat operator bosadi */}
      {!!board?.open_sessions?.length && (
        <Card className="space-y-3 border border-accent/30">
          <div className="flex items-center gap-2 font-bold">
            <Timer className="h-5 w-5 text-accent" />
            {t("opOpen.title")}
            <Badge tone="violet">{board.open_sessions.length}</Badge>
          </div>
          <div className="space-y-2">
            {board.open_sessions.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-surface-2 p-3">
                <div className="w-24 shrink-0">
                  <div className="font-display text-lg font-bold tabular-nums">{fmt(b.start_at).hm}</div>
                  <div className="text-xs font-semibold text-accent">{fmtElapsed(b.open.elapsed_minutes, t)}</div>
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold">{nameOf(b) || t("opBooking.noName")}</span>
                    {callPhone(b) && <span className="text-sm font-semibold text-accent">{callPhone(b)}</span>}
                    <span className="font-mono text-xs text-muted">#{b.code}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    {b.zones.map((z) => (
                      <span key={z.id} className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-2 py-0.5 font-semibold">
                        <span className="h-2 w-2 rounded-full" style={{ background: z.color ?? "#3a3f4b" }} />
                        {z.name} #{z.seats.join(", #")}
                      </span>
                    ))}
                    <span className="text-muted">· {t("opOpen.until", { time: fmt(b.open.limit_at).hm })}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted">{t("opOpen.running")}</div>
                  <div className="font-bold tabular-nums">{formatMoney(b.open.amount, locale)}</div>
                </div>
                <Button size="sm" loading={stopping === b.id} onClick={() => stop(b)}>
                  <Square className="h-4 w-4" /> {t("opOpen.stop")}
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Bronlar ro'yxati */}
      <div ref={listRef} className="scroll-mt-4">
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-bold">
              <BellRing className="h-5 w-5 text-accent" />
              {filter === "late" ? t("opDesk.stat.late") : filter === "uncontacted" ? t("opDesk.stat.uncontacted") : t("opNew.title")}
              <Badge tone="violet">{rows.length}</Badge>
            </div>
            <div className="flex items-center gap-3">
              {filter !== "all" && (
                <button className="text-sm font-semibold text-accent hover:underline" onClick={() => setFilter("all")}>
                  {t("opDesk.showAll")}
                </button>
              )}
              <Link href="/operator/bookings" className="text-sm font-semibold text-accent hover:underline">
                {t("opNew.all")} →
              </Link>
            </div>
          </div>
          {error && <Alert>{error}</Alert>}
          {board && !rows.length && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted">
              <CalendarDays className="h-5 w-5" /> {t("opNew.empty")}
            </div>
          )}
          <div className="space-y-2">
            {rows.map((b) => {
              const isNew = fresh.has(b.id) || now - new Date(b.created_at).getTime() < NEW_MS;
              const late = isLate(b) ? Math.floor((now - new Date(b.start_at).getTime()) / 60_000) : null;
              const s = fmt(b.start_at);
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    setOpen(b);
                    setViaCode(false);
                  }}
                  className={cx(
                    "flex w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl p-3 text-left transition hover:ring-2 hover:ring-accent/50",
                    late !== null ? "bg-red-500/10 ring-1 ring-red-500/40" : isNew ? "bg-accent/10 ring-1 ring-accent/40" : "bg-surface-2",
                  )}
                >
                  <div className="w-16 shrink-0">
                    <div className="font-display text-lg font-bold tabular-nums">{s.hm}</div>
                    <div className="text-xs text-muted tabular-nums">{s.day}</div>
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {isNew && <Badge tone="green">{t("opNew.new")}</Badge>}
                      <span className="font-bold">{nameOf(b) || t("opBooking.noName")}</span>
                      {callPhone(b) && <span className="text-sm font-semibold text-accent">{callPhone(b)}</span>}
                      <span className="font-mono text-xs text-muted">#{b.code}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      {b.zones.map((z) => (
                        <span key={z.id} className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-2 py-0.5 font-semibold">
                          <span className="h-2 w-2 rounded-full" style={{ background: z.color ?? "#3a3f4b" }} />
                          {z.name} #{z.seats.join(", #")}
                        </span>
                      ))}
                      <Badge tone={CONTACT_TONE[b.contact_status]}>{t(`opDesk.contact.${b.contact_status}` as MessageKey)}</Badge>
                      {late !== null ? (
                        <span className="font-semibold text-red-400">{t("opDesk.late", { n: late })}</span>
                      ) : (
                        <span className="text-muted">· {t("opNew.created", { ago: ago(b.created_at) })}</span>
                      )}
                    </div>
                  </div>
                  <div className="font-bold tabular-nums">{formatMoney(b.total_amount, locale)}</div>
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      {stopped && <StoppedModal s={stopped} onClose={() => setStopped(null)} />}

      {open && (
        <BookingModal
          b={open}
          viaCode={viaCode}
          now={now}
          noShowAfter={board?.no_show_after_minutes ?? 10}
          onClose={() => setOpen(null)}
          onChanged={(msg, updated) => {
            if (msg) setNotice(msg);
            if (updated) setOpen(updated);
            else setOpen(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
  active,
  onClick,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: number | undefined;
  tone?: "red" | "amber";
  active?: boolean;
  onClick?: () => void;
}) {
  const color = tone === "red" ? "text-red-400" : tone === "amber" ? "text-warn" : "";
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cx(
        "rounded-2xl border bg-surface p-4 text-left transition",
        active ? "border-accent ring-2 ring-accent/40" : tone === "red" ? "border-red-500/40" : "border-line-soft",
        onClick && "cursor-pointer hover:border-accent/60",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] leading-tight text-muted">{label}</span>
        <Icon className={cx("h-4 w-4 shrink-0", color || "text-muted")} />
      </div>
      <div className={cx("mt-1.5 font-display text-3xl font-bold tabular-nums", color)}>{value ?? "—"}</div>
    </Tag>
  );
}

const ARRIVE_BEFORE_MS = 30 * 60_000; // "Keldi" bron vaqtidan 30 daqiqa oldin ochiladi

/**
 * Bron tafsiloti. Ikki alohida bo'lim, aralashmasligi uchun:
 *  1) Qo'ng'iroq natijasi — tugma bosilishi bilan saqlanadi, bron holatiga ta'sir qilmaydi.
 *  2) Mijoz klubga keldi — faqat kod orqali ochilganda yoki bron vaqtiga 30 daqiqa qolganda; tasdiq so'raladi.
 */
function BookingModal({
  b,
  viaCode,
  now,
  noShowAfter,
  onClose,
  onChanged,
}: {
  b: Booking;
  viaCode: boolean;
  now: number;
  noShowAfter: number;
  onClose: () => void;
  onChanged: (msg: string | null, updated?: Booking) => void;
}) {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const [note, setNote] = useState(b.contact_note ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const live = b.status === "CONFIRMED";
  const start = new Date(b.start_at).getTime();
  const noShowAt = start + noShowAfter * 60_000;
  const canArrive = viaCode || now >= start - ARRIVE_BEFORE_MS;
  const s = fmt(b.start_at);
  const e = fmt(b.end_at);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  const saveContact = (c: Contact) =>
    run(`contact-${c}`, async () => {
      const res = await session.put<Booking>(`/operator/bookings/${b.id}/contact`, { contact_status: c, note: note.trim() || undefined });
      setSaved(true);
      onChanged(null, res.data);
    });
  const act = (action: "check-in" | "no-show" | "cancel") => {
    const msg = action === "check-in" ? t("opDesk.arriveConfirm", { name: nameOf(b) || t("opBooking.noName"), code: b.code }) : t(`opBooking.confirm.${action}` as MessageKey);
    if (!confirm(msg)) return;
    return run(action, async () => {
      await session.post(`/operator/bookings/${b.id}/${action}`, {});
      onChanged(action === "check-in" ? t("opDesk.done") : null);
    });
  };

  return (
    <Modal title={t("opDesk.detail", { code: b.code })} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-surface-2 p-3">
          <div>
            <div className="font-bold">{nameOf(b) || t("opBooking.noName")}</div>
            {callPhone(b) && <div className="text-sm font-semibold">{callPhone(b)}</div>}
            {/* Aloqa raqami akkauntnikidan farq qilsa — ikkalasi ham ko'rinadi */}
            {b.contact_phone && b.customer.phone && b.contact_phone !== b.customer.phone && (
              <div className="text-xs text-muted">{t("opDesk.accountPhone", { phone: b.customer.phone })}</div>
            )}
          </div>
          {callPhone(b) && (
            <a href={`tel:${callPhone(b)}`} className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-sm font-bold text-on-accent">
              <Phone className="h-4 w-4" /> {t("opDesk.call")}
            </a>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>
            <span className="text-muted">{t("opDesk.time")}: </span>
            <b className="tabular-nums">
              {s.day} {s.hm}–{e.hm}
            </b>
          </span>
          <b className="tabular-nums">{formatMoney(b.total_amount, locale)}</b>
        </div>

        <div className="space-y-3">
          <div className="text-sm font-bold">{t("opDesk.seats")}</div>
          {b.zones.map((z) => (
            <div key={z.id} className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: z.color ?? "#3a3f4b" }} />
                {z.name} — #{z.seats.join(", #")}
              </div>
              <div className="overflow-x-auto">
                <ZoneLayoutView zone={z} highlight={z.seats} decorLabel={(k) => t(`layout.decor.${k}` as MessageKey)} />
              </div>
            </div>
          ))}
        </div>

        {error && <Alert>{error}</Alert>}

        {live ? (
          <>
            {/* 1) Qo'ng'iroq — faqat eslatma, bron holati o'zgarmaydi */}
            <section className="space-y-2 rounded-2xl border border-line-soft p-3">
              <div className="flex items-center gap-2 text-sm font-bold">
                <PhoneCall className="h-4 w-4 text-accent" /> {t("opDesk.contact.title")}
              </div>
              <p className="text-xs text-muted">{t("opDesk.contact.hint")}</p>
              <Input value={note} onChange={(ev) => setNote(ev.target.value)} placeholder={t("opDesk.notePh")} maxLength={500} aria-label={t("opDesk.note")} />
              <div className="grid grid-cols-2 gap-2">
                {CONTACTS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    disabled={!!busy}
                    onClick={() => saveContact(c)}
                    className={cx(
                      "inline-flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-sm font-semibold transition disabled:opacity-60",
                      b.contact_status === c ? "border-accent bg-accent/15 text-accent" : "border-line-soft text-muted hover:text-fg",
                    )}
                  >
                    {c === "NO_ANSWER" ? <PhoneOff className="h-4 w-4" /> : c === "NEW" ? <PhoneCall className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                    {t(`opDesk.contact.${c}` as MessageKey)}
                  </button>
                ))}
              </div>
              {saved && <p className="text-xs font-semibold text-accent">{t("opDesk.saved")}</p>}
            </section>

            {/* 2) Klubga kelish — alohida, tasdiq bilan */}
            <section className="space-y-2 rounded-2xl border border-green-500/40 bg-green-500/5 p-3">
              <div className="flex items-center gap-2 text-sm font-bold">
                <UserCheck className="h-4 w-4 text-green-400" /> {t("opDesk.arriveTitle")}
              </div>
              {canArrive ? (
                <Button className="w-full" loading={busy === "check-in"} disabled={!!busy} onClick={() => act("check-in")}>
                  <UserCheck className="h-5 w-5" /> {t("opDesk.arriveBtn")}
                </Button>
              ) : (
                <p className="text-xs text-muted">{t("opDesk.arriveLater")}</p>
              )}
            </section>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line-soft pt-3">
              {now >= noShowAt ? (
                <Button size="sm" variant="secondary" loading={busy === "no-show"} disabled={!!busy} onClick={() => act("no-show")}>
                  <UserX className="h-4 w-4" /> {t("opBooking.noShow")}
                </Button>
              ) : now >= start ? (
                <span className="text-xs text-muted">{t("opDesk.noShowIn", { n: Math.ceil((noShowAt - now) / 60_000) })}</span>
              ) : null}
              <Button size="sm" variant="ghost" loading={busy === "cancel"} disabled={!!busy} onClick={() => act("cancel")}>
                <X className="h-4 w-4" /> {t("opBooking.cancel")}
              </Button>
            </div>
          </>
        ) : (
          <div className="text-center">
            <Badge tone={b.status === "CHECKED_IN" ? "violet" : b.status === "CANCELLED" ? "red" : "neutral"}>{t(`opBooking.status.${b.status}` as MessageKey)}</Badge>
          </div>
        )}
      </div>
    </Modal>
  );
}
