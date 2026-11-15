"use client";

import { BrickWall, DoorOpen, Footprints, type LucideIcon, Monitor, Toilet, Tv, Wallet } from "lucide-react";

/** Operator chizgan zal sxemasi (faqat ko'rish). Format: API `zones.layout`. */
export type DecorKind = "ENTRANCE" | "CASHIER" | "WALL" | "AISLE" | "TV" | "WC";
export type ZoneLayout = { cols: number; rows: number; seats: { n: number; x: number; y: number }[]; decor: { kind: DecorKind; x: number; y: number }[] };

const CELL = 48;
const ICON: Record<DecorKind, LucideIcon> = { ENTRANCE: DoorOpen, CASHIER: Wallet, WALL: BrickWall, AISLE: Footprints, TV: Tv, WC: Toilet };
const STYLE: Record<DecorKind, string> = {
  ENTRANCE: "border-2 border-dashed border-accent/70 bg-accent/10 text-accent",
  CASHIER: "border-2 border-warn/70 bg-warn/10 text-warn",
  WALL: "bg-line text-muted",
  AISLE: "border border-dashed border-line text-muted/60",
  TV: "border-2 border-line bg-surface-2 text-fg",
  WC: "border-2 border-line bg-surface-2 text-muted",
};

export type SeatState = "FREE" | "BUSY" | "UNAVAILABLE" | "PICKED";
const SEAT_STYLE: Record<SeatState, string> = {
  FREE: "border-accent bg-bg text-accent hover:bg-accent/15 cursor-pointer",
  PICKED: "border-accent bg-accent text-on-accent cursor-pointer",
  BUSY: "border-line bg-surface-2 text-muted cursor-not-allowed opacity-60",
  UNAVAILABLE: "border-line bg-surface-2 text-muted cursor-not-allowed opacity-40",
};

/** `seatState`/`onSeat` berilsa — tanlanadigan (bron): bo'sh/band/tanlangan o'rindiqlar. */
export function ZoneLayoutView({ layout, count, decorLabel, seatState, onSeat }: { layout: ZoneLayout; count: number; decorLabel: (k: DecorKind) => string; seatState?: (n: number) => SeatState; onSeat?: (n: number) => void }) {
  const inside = (c: { x: number; y: number }) => c.x < layout.cols && c.y < layout.rows;
  const seats = layout.seats.filter((s) => s.n <= count && inside(s));
  const decor = layout.decor.filter(inside);
  // Ko'rinish faqat ishlatilgan qism bilan cheklanadi (bo'sh qator/ustunlar kesiladi)
  const used = [...seats, ...decor];
  const cols = used.length ? Math.max(...used.map((c) => c.x)) + 1 : layout.cols;
  const rows = used.length ? Math.max(...used.map((c) => c.y)) + 1 : layout.rows;
  return (
    <div className="flex justify-center overflow-auto rounded-2xl border border-line bg-surface p-3">
      <div
        className="relative"
        style={{
          width: cols * CELL,
          height: rows * CELL,
          backgroundImage: "radial-gradient(circle, var(--color-line) 1.5px, transparent 1.5px)",
          backgroundSize: `${CELL}px ${CELL}px`,
          backgroundPosition: `${CELL / 2}px ${CELL / 2}px`,
        }}
      >
        {decor.map((d, i) => {
          const Icon = ICON[d.kind] ?? Footprints;
          const full = d.kind === "WALL" || d.kind === "AISLE";
          return (
            <div
              key={`d${i}`}
              title={decorLabel(d.kind)}
              className={`absolute flex items-center justify-center ${full ? "rounded-sm" : "rounded-lg"} ${STYLE[d.kind] ?? ""}`}
              style={full ? { left: d.x * CELL, top: d.y * CELL, width: CELL, height: CELL } : { left: d.x * CELL + 3, top: d.y * CELL + 3, width: CELL - 6, height: CELL - 6 }}
            >
              <Icon className="h-4 w-4" />
            </div>
          );
        })}
        {seats.map((s) => {
          const st = seatState?.(s.n);
          const box = { left: s.x * CELL + 3, top: s.y * CELL + 3, width: CELL - 6, height: CELL - 6 };
          const inner = (
            <>
              <Monitor className="h-3.5 w-3.5" />
              <b className={`text-[10px] leading-none tabular-nums ${st === "PICKED" ? "" : "text-fg"}`}>{s.n}</b>
            </>
          );
          return st ? (
            <button
              key={s.n}
              type="button"
              disabled={st === "BUSY" || st === "UNAVAILABLE"}
              onClick={() => onSeat?.(s.n)}
              className={`absolute flex flex-col items-center justify-center rounded-lg border-2 transition ${SEAT_STYLE[st]}`}
              style={box}
            >
              {inner}
            </button>
          ) : (
            <div key={s.n} className="absolute flex flex-col items-center justify-center rounded-lg border-2 border-accent bg-bg text-accent" style={box}>
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}
