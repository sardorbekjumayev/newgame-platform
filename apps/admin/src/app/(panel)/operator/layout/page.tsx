"use client";

import { Eraser, Minus, MousePointer2, Plus, Wand2 } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { DECOR_ICON, DECOR_KINDS, DecorCell, type DecorKind, RoomGrid, SEAT_CELL, SeatButton, type ZoneLayout, defaultSize, resolveLayout, useSeatDrag } from "@/components/zone-layout";
import { Alert, Button, Card, Chip, Heading, Spinner, cx } from "@/components/ui";
import { type MessageKey, useErrorText, useI18n } from "@/i18n/provider";
import { session } from "@/lib/session";
import type { Zone } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const GRID_MIN = 2;
const GRID_MAX = 40;

/**
 * Zal sxemasi: operator zonani tanlaydi → zonadagi qurilmalar soni (devices_count) bo'yicha o'rindiqlar
 * avtomatik joylanadi; ularni sudrab ko'chirish, devor/yo'lak/eshik va h.k. chizish mumkin.
 */
export default function LayoutPage() {
  const { t } = useI18n();
  const zones = useApi<Zone[]>("/operator/zones");
  const [picked, setPicked] = useState<string | null>(null);
  const list = zones.data ?? [];
  const zone = list.find((z) => z.id === picked) ?? list[0] ?? null;

  return (
    <div className="space-y-5">
      <div>
        <Heading>{t("layout.title")}</Heading>
        <p className="mt-1 max-w-2xl text-sm text-muted">{t("layout.hint")}</p>
      </div>
      {zones.error && <Alert>{zones.error}</Alert>}
      {zones.loading && !zones.data ? (
        <Spinner />
      ) : list.length === 0 ? (
        <Card className="py-12 text-center text-muted">
          {t("layout.noZones")}{" "}
          <Link href="/operator/zones" className="font-bold text-accent hover:underline">
            {t("nav.zones")}
          </Link>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {list.map((z) => (
              <Chip key={z.id} active={zone?.id === z.id} onClick={() => setPicked(z.id)}>
                <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: z.color ?? "#3a3f4b" }} />
                {z.name}
                {z.devices_count ? ` · ${z.devices_count}` : ""}
              </Chip>
            ))}
          </div>
          {zone &&
            (zone.devices_count ? (
              <Editor key={`${zone.id}:${zone.devices_count}`} zone={zone} onSaved={zones.reload} />
            ) : (
              <Card className="py-10 text-center text-muted">
                {t("layout.needDevices")}{" "}
                <Link href="/operator/zones" className="font-bold text-accent hover:underline">
                  {t("nav.zones")}
                </Link>
              </Card>
            ))}
        </>
      )}
    </div>
  );
}

function Editor({ zone, onSaved }: { zone: Zone; onSaved: () => void }) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const count = zone.devices_count!;
  const [state, setState] = useState(() => resolveLayout(zone.layout, count));
  const [dirty, setDirty] = useState(!zone.layout);
  const [tool, setTool] = useState<DecorKind | "ERASE" | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const paintMode = useRef<"add" | "remove">("add");
  const { layout, tray } = state;

  const update = (layout: ZoneLayout, tray: number[]) => {
    setState({ layout, tray });
    setDirty(true);
    setMsg(null);
  };

  function paintCell(x: number, y: number, first: boolean) {
    if (!tool || layout.seats.some((s) => s.x === x && s.y === y)) return; // o'rindiq ustiga emas
    const at = layout.decor.find((d) => d.x === x && d.y === y);
    if (first) paintMode.current = tool === "ERASE" || at?.kind === tool ? "remove" : "add";
    const rest = layout.decor.filter((d) => !(d.x === x && d.y === y));
    update({ ...layout, decor: paintMode.current === "remove" ? rest : [...rest, { kind: tool as DecorKind, x, y }] }, tray);
  }

  const dnd = useSeatDrag((id, seat) => {
    const n = Number(id);
    const prev = layout.seats.find((s) => s.n === n);
    let seats = layout.seats.filter((s) => s.n !== n);
    let nextTray = tray.filter((x) => x !== n);
    if (!seat.room) return update({ ...layout, seats }, [...nextTray, n].sort((a, b) => a - b));
    const other = seats.find((s) => s.x === seat.x && s.y === seat.y);
    if (other) {
      // joy almashtirish; sudralgan o'rindiq tray'dan kelgan bo'lsa — egallab turgani tray'ga
      seats = seats.filter((s) => s !== other);
      if (prev) seats.push({ n: other.n, x: prev.x, y: prev.y });
      else nextTray = [...nextTray, other.n].sort((a, b) => a - b);
    }
    seats.push({ n, x: seat.x, y: seat.y });
    update({ ...layout, seats, decor: layout.decor.filter((d) => !(d.x === seat.x && d.y === seat.y)) }, nextTray);
  });

  function resize(dc: number, dr: number) {
    const cols = Math.max(GRID_MIN, Math.min(GRID_MAX, layout.cols + dc));
    const rows = Math.max(GRID_MIN, Math.min(GRID_MAX, layout.rows + dr));
    const inside = (c: { x: number; y: number }) => c.x < cols && c.y < rows;
    const out = layout.seats.filter((s) => !inside(s)).map((s) => s.n);
    update({ cols, rows, seats: layout.seats.filter(inside), decor: layout.decor.filter(inside) }, [...tray, ...out].sort((a, b) => a - b));
  }

  function autoArrange() {
    if (!confirm(t("layout.autoConfirm"))) return;
    const r = resolveLayout({ ...defaultSize(count), seats: [], decor: [] }, count);
    update(r.layout, r.tray);
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await session.put(`/operator/zones/${zone.id}/layout`, layout);
      setDirty(false);
      setMsg({ tone: "success", text: t("common.saved") });
      onSaved();
    } catch (e) {
      setMsg({ tone: "error", text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }

  const seatTile = (n: number) => ({ id: String(n), name: String(n), tone: "border-accent text-accent" });

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <ToolButton active={!tool} onClick={() => setTool(null)} icon={MousePointer2} label={t("layout.tool.move")} />
          <span className="mx-1 h-6 w-px bg-line" />
          {DECOR_KINDS.map((k) => (
            <ToolButton key={k} active={tool === k} onClick={() => setTool(k)} icon={DECOR_ICON[k]} label={t(`layout.decor.${k}` as MessageKey)} />
          ))}
          <ToolButton active={tool === "ERASE"} onClick={() => setTool("ERASE")} icon={Eraser} label={t("layout.tool.erase")} />
        </div>
        <p className="text-xs text-muted">{tool ? t("layout.tool.paintHint") : t("layout.tool.moveHint")}</p>
      </Card>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="font-display text-lg font-bold">{zone.name}</div>
          <span className="text-sm text-muted">{t("layout.placed", { a: layout.seats.length, n: count })}</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <SizeControl label={t("layout.width")} value={layout.cols} onChange={(d) => resize(d, 0)} />
            <SizeControl label={t("layout.height")} value={layout.rows} onChange={(d) => resize(0, d)} />
            <Button variant="secondary" size="sm" onClick={autoArrange}>
              <Wand2 className="h-4 w-4" /> {t("layout.auto")}
            </Button>
            {dirty && zone.layout && (
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => (setState(resolveLayout(zone.layout, count)), setDirty(false), setMsg(null))}>
                {t("layout.reset")}
              </Button>
            )}
            <Button size="sm" onClick={save} loading={busy} disabled={!dirty}>
              {t("common.save")}
            </Button>
          </div>
        </div>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        {!zone.layout && <Alert tone="success">{t("layout.draftHint")}</Alert>}
        <RoomGrid roomId={zone.id} cols={layout.cols} rows={layout.rows} onCell={tool ? paintCell : undefined}>
          {layout.decor.map((d, i) => (
            <DecorCell key={`d${i}`} d={d} label={t(`layout.decor.${d.kind}` as MessageKey)} className="pointer-events-none" />
          ))}
          {layout.seats.map((s) => (
            <SeatButton
              key={s.n}
              tile={seatTile(s.n)}
              editable
              dragging={dnd.drag?.id === String(s.n)}
              drag={dnd.drag}
              style={{ left: s.x * SEAT_CELL + 4, top: s.y * SEAT_CELL + 4 }}
              className={cx("absolute", tool && "pointer-events-none")}
              onPointerDown={(e) => dnd.start(String(s.n), e)}
              onPointerMove={dnd.move}
              onPointerUp={dnd.end}
              onPointerCancel={dnd.cancel}
            />
          ))}
        </RoomGrid>
      </Card>

      <Card className="space-y-3">
        <div>
          <div className="font-display text-lg font-bold">{t("layout.tray")}</div>
          <p className="text-sm text-muted">{t("layout.trayHint")}</p>
        </div>
        <div data-room="" className="flex min-h-[72px] flex-wrap gap-2 rounded-2xl border border-dashed border-line p-2">
          {tray.length === 0 && <span className="self-center px-2 text-sm text-muted">{t("layout.trayEmpty")}</span>}
          {tray.map((n) => (
            <SeatButton
              key={n}
              tile={seatTile(n)}
              editable
              dragging={dnd.drag?.id === String(n)}
              drag={dnd.drag}
              onPointerDown={(e) => dnd.start(String(n), e)}
              onPointerMove={dnd.move}
              onPointerUp={dnd.end}
              onPointerCancel={dnd.cancel}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}

function SizeControl({ label, value, onChange }: { label: string; value: number; onChange: (delta: number) => void }) {
  return (
    <div className="flex h-9 items-center gap-1 rounded-xl border border-line bg-surface-2 px-1 text-sm">
      <span className="px-1 text-muted">{label}</span>
      <button type="button" className="rounded-lg p-1 hover:bg-surface disabled:opacity-40" disabled={value <= GRID_MIN} onClick={() => onChange(-1)}>
        <Minus className="h-3.5 w-3.5" />
      </button>
      <b className="w-6 text-center tabular-nums">{value}</b>
      <button type="button" className="rounded-lg p-1 hover:bg-surface disabled:opacity-40" disabled={value >= GRID_MAX} onClick={() => onChange(1)}>
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function ToolButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx("flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold", active ? "bg-accent text-on-accent" : "border border-line bg-surface-2 hover:bg-surface")}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}
