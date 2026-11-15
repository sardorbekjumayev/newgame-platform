"use client";

import { BrickWall, DoorOpen, Footprints, type LucideIcon, Monitor, Toilet, Tv, Wallet } from "lucide-react";
import { useRef, useState } from "react";
import { cx } from "@/components/ui";

/** Qurilmaning xonadagi joyi. room = null — hali joylashtirilmagan (tray). */
export type Seat = { room: string | null; x: number; y: number };
export type SeatTile = { id: string; name: string; tone?: string };

export const SEAT_CELL = 64;

type Drag = { id: string; offX: number; offY: number; px: number; py: number; moved: boolean };

/**
 * Xona sxemasi muharriri: har bir xona — cols×rows katakli zal. Qurilmani sudrab istalgan xonaga /
 * istalgan katakka qo'yish mumkin (xonalar orasida ham). Tushirilgan joy `data-room` atributidan topiladi.
 */
export function useSeatDrag(onDrop: (id: string, seat: Seat) => void) {
  const [drag, setDrag] = useState<Drag | null>(null);

  const start = (id: string, e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id, offX: e.clientX - r.left, offY: e.clientY - r.top, px: e.clientX, py: e.clientY, moved: false });
  };
  const move = (e: React.PointerEvent) => {
    if (drag) setDrag({ ...drag, px: e.clientX, py: e.clientY, moved: true });
  };
  const end = (e: React.PointerEvent) => {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (!d.moved) return;
    // Tile markazi qaysi xona ustida ekanini aniqlaymiz
    const cx0 = e.clientX - d.offX + SEAT_CELL / 2;
    const cy0 = e.clientY - d.offY + SEAT_CELL / 2;
    const target = document.elementsFromPoint(cx0, cy0).find((el) => (el as HTMLElement).dataset?.room !== undefined) as HTMLElement | undefined;
    if (!target) return;
    const room = target.dataset.room || null;
    if (!room) return onDrop(d.id, { room: null, x: 0, y: 0 });
    const r = target.getBoundingClientRect();
    const cols = Number(target.dataset.cols);
    const rows = Number(target.dataset.rows);
    const x = Math.max(0, Math.min(cols - 1, Math.floor((cx0 - r.left) / SEAT_CELL)));
    const y = Math.max(0, Math.min(rows - 1, Math.floor((cy0 - r.top) / SEAT_CELL)));
    onDrop(d.id, { room, x, y });
  };
  return { drag, start, move, end, cancel: () => setDrag(null) };
}

export function SeatButton({
  tile,
  dragging,
  drag,
  style,
  className,
  editable,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  tile: SeatTile;
  dragging?: boolean;
  drag?: Drag | null;
  style?: React.CSSProperties;
  className?: string;
  editable?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
  onPointerMove?: (e: React.PointerEvent) => void;
  onPointerUp?: (e: React.PointerEvent) => void;
  onPointerCancel?: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const floating: React.CSSProperties | undefined =
    dragging && drag?.moved ? { position: "fixed", left: drag.px - drag.offX, top: drag.py - drag.offY, zIndex: 50, pointerEvents: "none" } : undefined;
  return (
    <button
      ref={ref}
      type="button"
      title={tile.name}
      className={cx(
        "flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 bg-bg text-center touch-none select-none",
        tile.tone ?? "border-accent text-accent",
        editable && "cursor-grab",
        dragging && "cursor-grabbing shadow-2xl ring-2 ring-accent",
        className,
      )}
      style={{ width: SEAT_CELL - 8, height: SEAT_CELL - 8, ...style, ...floating }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <Monitor className="h-4 w-4" />
      <b className="w-full truncate px-0.5 text-[11px] text-fg">{tile.name}</b>
    </button>
  );
}

/** Bitta xona maydoni (grid). Ichidagi o'rindiqlar absolyut joylashadi. */
export function RoomGrid({ roomId, cols, rows, children, onCell }: { roomId: string; cols: number; rows: number; children: React.ReactNode; onCell?: (x: number, y: number, first: boolean) => void }) {
  // Bezak chizish rejimi: bosib turib sudrasangiz bir nechta katak bo'yaladi
  const last = useRef<string | null>(null);
  const cell = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: Math.floor((e.clientX - r.left) / SEAT_CELL), y: Math.floor((e.clientY - r.top) / SEAT_CELL) };
  };
  const paint = (e: React.PointerEvent<HTMLDivElement>, first: boolean) => {
    const c = cell(e);
    if (c.x < 0 || c.y < 0 || c.x >= cols || c.y >= rows) return;
    const k = `${c.x}:${c.y}`;
    if (!first && last.current === k) return;
    last.current = k;
    onCell!(c.x, c.y, first);
  };
  return (
    <div className="overflow-auto rounded-2xl border border-line bg-surface p-2">
      <div
        data-room={roomId}
        data-cols={cols}
        data-rows={rows}
        className={cx("relative", onCell && "cursor-crosshair touch-none")}
        onPointerDown={onCell ? (e) => (e.currentTarget.setPointerCapture(e.pointerId), paint(e, true)) : undefined}
        onPointerMove={onCell ? (e) => e.buttons === 1 && paint(e, false) : undefined}
        onPointerUp={onCell ? () => (last.current = null) : undefined}
        style={{
          width: cols * SEAT_CELL,
          height: rows * SEAT_CELL,
          backgroundImage:
            "radial-gradient(circle, var(--color-line, rgba(128,128,128,.35)) 1.5px, transparent 1.5px)",
          backgroundSize: `${SEAT_CELL}px ${SEAT_CELL}px`,
          backgroundPosition: `${SEAT_CELL / 2}px ${SEAT_CELL / 2}px`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ---------- Bezaklar (kirish, kassa, devor...) ----------

export const DECOR_KINDS = ["ENTRANCE", "CASHIER", "WALL", "AISLE", "TV", "WC"] as const;
export type DecorKind = (typeof DECOR_KINDS)[number];
export type Decor = { kind: DecorKind; x: number; y: number };

export const DECOR_ICON: Record<DecorKind, LucideIcon> = { ENTRANCE: DoorOpen, CASHIER: Wallet, WALL: BrickWall, AISLE: Footprints, TV: Tv, WC: Toilet };
const DECOR_STYLE: Record<DecorKind, string> = {
  ENTRANCE: "border-2 border-dashed border-accent/70 bg-accent/10 text-accent",
  CASHIER: "border-2 border-warn/70 bg-warn/10 text-warn",
  WALL: "bg-line text-muted",
  AISLE: "border border-dashed border-line text-muted/60",
  TV: "border-2 border-line bg-surface-2 text-fg",
  WC: "border-2 border-line bg-surface-2 text-muted",
};

/** Katakdagi bezak. Devor/yo'lak katakni to'liq to'ldiradi — qo'shnilar bilan yaxlit chiziq bo'ladi. */
export function DecorCell({ d, label, style, className, ...rest }: { d: Decor; label: string; style?: React.CSSProperties; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  const Icon = DECOR_ICON[d.kind];
  const full = d.kind === "WALL" || d.kind === "AISLE";
  return (
    <div
      title={label}
      className={cx("absolute flex select-none items-center justify-center touch-none", full ? "rounded-sm" : "rounded-xl", DECOR_STYLE[d.kind], className)}
      style={full ? { left: d.x * SEAT_CELL, top: d.y * SEAT_CELL, width: SEAT_CELL, height: SEAT_CELL, ...style } : { left: d.x * SEAT_CELL + 4, top: d.y * SEAT_CELL + 4, width: SEAT_CELL - 8, height: SEAT_CELL - 8, ...style }}
      {...rest}
    >
      <Icon className="h-5 w-5" />
    </div>
  );
}

// ---------- Zona sxemasi ma'lumoti ----------

export type ZoneLayout = { cols: number; rows: number; seats: { n: number; x: number; y: number }[]; decor: Decor[] };

/** Avtomatik boshlang'ich o'lcham: qurilmalar soniga qarab, yo'laklar uchun joy qoldirib. */
export function defaultSize(n: number) {
  const cols = Math.min(40, Math.max(6, Math.ceil(Math.sqrt(n * 1.6)) + 2));
  const rows = Math.min(40, Math.max(4, Math.ceil(n / Math.max(1, cols - 2)) * 2 + 1));
  return { cols, rows };
}

/**
 * Saqlangan sxema + devices_count → to'liq joylashuv. Ortiqcha o'rindiqlar (son kamaygan) tashlanadi,
 * yetishmaganlari bo'sh katakka avtomatik qo'yiladi (qatorma-qator, har ikkinchi qator — yo'lak).
 * Joy yetmasa — tray (joylashtirilmagan) ro'yxatida qoladi.
 */
export function resolveLayout(saved: ZoneLayout | null | undefined, count: number): { layout: ZoneLayout; tray: number[] } {
  const base: ZoneLayout = saved ? { ...saved, seats: saved.seats.filter((s) => s.n <= count && s.x < saved.cols && s.y < saved.rows), decor: saved.decor.filter((d) => d.x < saved.cols && d.y < saved.rows) } : { ...defaultSize(count), seats: [], decor: [] };
  const used = new Set([...base.seats, ...base.decor].map((c) => `${c.x}:${c.y}`));
  const have = new Set(base.seats.map((s) => s.n));
  const seats = [...base.seats];
  const tray: number[] = [];
  const free: [number, number][] = [];
  // Avval toq qatorlar (0,2,4…) — oradagi qatorlar yo'lak bo'lib qoladi; keyin qolganlari
  for (const pass of [0, 1]) for (let y = 0; y < base.rows; y++) if (y % 2 === pass) for (let x = 0; x < base.cols; x++) if (!used.has(`${x}:${y}`)) free.push([x, y]);
  for (let n = 1; n <= count; n++) {
    if (have.has(n)) continue;
    const c = free.shift();
    if (c) seats.push({ n, x: c[0], y: c[1] });
    else tray.push(n);
  }
  return { layout: { ...base, seats }, tray };
}

/** Faqat ko'rish: zona sxemasi (menejer paneli). Saqlanmagan bo'lsa — null qaytaradi. */
export function ZoneLayoutView({
  zone,
  decorLabel,
  highlight,
}: {
  zone: { id: string; devices_count: number | null; layout?: ZoneLayout | null };
  decorLabel: (k: DecorKind) => string;
  /** Belgilangan o'rindiqlar (masalan, bron qilinganlar) — qolganlari xira. */
  highlight?: number[];
}) {
  if (!zone.layout || !zone.devices_count) return null;
  const { layout } = resolveLayout(zone.layout, zone.devices_count);
  return (
    <RoomGrid roomId={zone.id} cols={layout.cols} rows={layout.rows}>
      {layout.decor.map((d, i) => (
        <DecorCell key={`d${i}`} d={d} label={decorLabel(d.kind)} />
      ))}
      {layout.seats.map((s) => (
        <SeatButton
          key={s.n}
          tile={{ id: String(s.n), name: String(s.n), tone: highlight ? (highlight.includes(s.n) ? "border-accent bg-accent/25 text-accent ring-2 ring-accent" : "border-line text-muted opacity-40") : undefined }}
          className="absolute cursor-default" style={{ left: s.x * SEAT_CELL + 4, top: s.y * SEAT_CELL + 4 }} />
      ))}
    </RoomGrid>
  );
}
