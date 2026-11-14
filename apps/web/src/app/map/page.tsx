"use client";

import { formatMoney } from "@ng/types";
import { Globe2, LocateFixed, MapPin, Search } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OpenBadge, PriceFrom } from "@/components/club-badges";
import { MapView } from "@/components/map/map-view";
import type { BBox, LatLng, MapMarker } from "@/components/map/provider";
import { Button, Spinner } from "@/components/ui";
import { useI18n } from "@/i18n/provider";
import { api } from "@/lib/api";
import { distanceKm } from "@/lib/geo";
import type { ClubCard } from "@/lib/types";

type Mode = "locating" | "near" | "all";
type State = { status: "loading" } | { status: "ready"; items: ClubCard[] } | { status: "error" };

export default function MapPage() {
  return (
    <Suspense>
      <ClubsMap />
    </Suspense>
  );
}

/** Xarita: foydalanuvchi joylashuvi bo'yicha atrofidagi klublar; ruxsat bo'lmasa — barcha klublar. */
function ClubsMap() {
  const { t, locale } = useI18n();
  const params = useSearchParams();
  const [state, setState] = useState<State>({ status: "loading" });
  const [selected, setSelected] = useState<string | null>(null);
  const [center, setCenter] = useState<LatLng | undefined>();
  const [zoom, setZoom] = useState(12);
  const [fit, setFit] = useState<LatLng[] | undefined>();
  const [me, setMe] = useState<LatLng | null>(null);
  const [mode, setMode] = useState<Mode>("locating");
  const [q, setQ] = useState(params.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const listRef = useRef<HTMLDivElement>(null);

  // Xarita surilganda ko'rinayotgan hudud bo'yicha yuklash ("Yaqinimdagilar" rejimida)
  const load = useCallback(
    (bbox: BBox) => {
      if (mode === "all") return;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        api.get<ClubCard[]>(`/clubs/map?bbox=${bbox.map((n) => n.toFixed(5)).join(",")}`).then(
          (r) => setState({ status: "ready", items: r.data }),
          () => setState({ status: "error" }),
        );
      }, 350);
    },
    [mode],
  );
  useEffect(() => () => clearTimeout(timer.current), []);

  const showAll = useCallback(() => {
    setMode("all");
    api.get<ClubCard[]>("/clubs/map").then(
      (r) => {
        setState({ status: "ready", items: r.data });
        if (r.data.length) setFit(r.data.map((b) => ({ lat: b.latitude, lng: b.longitude })));
      },
      () => setState({ status: "error" }),
    );
  }, []);

  const locate = useCallback(() => {
    if (!navigator.geolocation) return showAll();
    setMode("locating");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude };
        setMe(pos);
        setZoom(14);
        setCenter(pos);
        setMode("near");
      },
      () => showAll(),
      { timeout: 8000, maximumAge: 300_000 },
    );
  }, [showAll]);

  useEffect(() => {
    const id = setTimeout(locate, 0);
    return () => clearTimeout(id);
  }, [locate]);

  const items = useMemo(() => {
    const list = state.status === "ready" ? state.items : [];
    const needle = q.trim().toLowerCase();
    const filtered = needle ? list.filter((b) => `${b.name} ${b.address ?? ""} ${b.city} ${b.zones.map((z) => z.name).join(" ")}`.toLowerCase().includes(needle)) : list;
    return me ? [...filtered].sort((a, b) => distanceKm(me, { lat: a.latitude, lng: a.longitude }) - distanceKm(me, { lat: b.latitude, lng: b.longitude })) : filtered;
  }, [state, me, q]);

  const markers = useMemo<MapMarker[]>(
    () =>
      items.map((b) => ({
        id: b.id,
        position: { lat: b.latitude, lng: b.longitude },
        label: b.price_from != null ? formatMoney(b.price_from, locale).replace(/\s\S+$/, "") : b.name,
        active: b.id === selected,
      })),
    [items, selected, locale],
  );

  const select = (id: string) => {
    setSelected(id);
    listRef.current?.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  return (
    <main className="flex flex-1 flex-col-reverse lg:h-[calc(100vh-68px)] lg:flex-row">
      <aside ref={listRef} className="flex flex-col gap-3.5 bg-surface p-5 lg:w-[420px] lg:shrink-0 lg:overflow-y-auto">
        <div className="flex items-baseline justify-between">
          <h1 className="font-display text-xl font-bold">{t(mode === "near" ? "map.nearby" : "map.all")}</h1>
          {state.status === "ready" && <span className="text-[13px] text-muted">{t("map.found", { n: items.length })}</span>}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("home.searchPlaceholder")}
            className="h-11 w-full rounded-xl border border-line bg-bg pl-9 pr-3 text-sm outline-none focus:border-accent"
          />
        </div>
        <div className="flex gap-2">
          <Button variant={mode === "near" || mode === "locating" ? "primary" : "secondary"} size="sm" onClick={locate} disabled={mode === "locating"}>
            <LocateFixed className="h-4 w-4" />
            {t("map.nearMe")}
          </Button>
          <Button variant={mode === "all" ? "primary" : "secondary"} size="sm" onClick={showAll}>
            <Globe2 className="h-4 w-4" />
            {t("map.showAll")}
          </Button>
        </div>
        {mode === "locating" && <p className="text-xs text-muted">{t("catalog.locating")}</p>}
        {state.status === "loading" && <Spinner className="mx-auto my-8 h-5 w-5" />}
        {state.status === "error" && <p className="py-6 text-center text-sm text-muted">{t("map.error")}</p>}
        {state.status === "ready" && items.length === 0 && <p className="py-6 text-center text-sm text-muted">{t(mode === "near" ? "map.empty" : "catalog.noneYet")}</p>}
        {items.map((b) => (
          <button
            key={b.id}
            data-id={b.id}
            onClick={() => {
              setSelected(b.id);
              setCenter({ lat: b.latitude, lng: b.longitude });
            }}
            className={`flex flex-col gap-1.5 rounded-2xl p-4 text-left transition ${b.id === selected ? "bg-surface-3 ring-1 ring-accent" : "bg-surface-2 hover:bg-surface-3"}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 font-bold">{b.name}</div>
              <OpenBadge open={b.is_open_now} />
            </div>
            {b.address && (
              <div className="flex items-center gap-1 truncate text-[13px] text-muted">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{b.address}</span>
              </div>
            )}
            {b.zones.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {b.zones.map((z) => (
                  <span key={z.name} className="rounded-md bg-bg px-1.5 py-0.5 text-[11px] font-semibold" style={{ color: z.color ?? undefined }}>
                    {z.name}
                  </span>
                ))}
              </div>
            )}
            <div className="text-[13px]">
              <PriceFrom club={b} />
              {me && <span className="text-muted"> · {t("map.km", { km: distanceKm(me, { lat: b.latitude, lng: b.longitude }).toFixed(1) })}</span>}
            </div>
            {b.id === selected && (
              <Link href={`/clubs/${b.id}`} className="mt-1 text-[13px] font-bold text-accent hover:underline" onClick={(e) => e.stopPropagation()}>
                {t("catalog.openClub")}
              </Link>
            )}
          </button>
        ))}
      </aside>
      <MapView className="min-h-[55vh] flex-1" center={center} zoom={zoom} fit={fit} pin={me} markers={markers} onBoundsChange={load} onMarkerClick={select} />
    </main>
  );
}
