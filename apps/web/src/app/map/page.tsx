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
  const [accuracy, setAccuracy] = useState<number | undefined>();
  const [focus, setFocus] = useState(0);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [finding, setFinding] = useState(false);
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

  /**
   * Aniq joylashuv: GPS (enableHighAccuracy), keshsiz. `manual` — tugma bosilgan: xato bo'lsa sababini ko'rsatamiz,
   * "hammasi" rejimiga o'tmaymiz. Avtomatik (sahifa ochilganda) — ruxsat bo'lmasa barcha klublar.
   */
  const locate = useCallback(
    (manual = false) => {
      setGeoError(null);
      if (!window.isSecureContext || !navigator.geolocation) {
        if (manual) setGeoError(t(window.isSecureContext ? "map.geo.unsupported" : "map.geo.insecure"));
        else showAll();
        return;
      }
      setFinding(true);
      if (!manual) setMode("locating");
      navigator.geolocation.getCurrentPosition(
        (p) => {
          const pos = { lat: p.coords.latitude, lng: p.coords.longitude };
          setFinding(false);
          setMe(pos);
          setAccuracy(Math.round(p.coords.accuracy));
          setZoom(p.coords.accuracy < 200 ? 16 : 14);
          setCenter(pos);
          setFocus((n) => n + 1);
          setMode("near");
        },
        (err) => {
          setFinding(false);
          if (manual) setGeoError(t(err.code === err.PERMISSION_DENIED ? "map.geo.denied" : err.code === err.TIMEOUT ? "map.geo.timeout" : "map.geo.unavailable"));
          else showAll();
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      );
    },
    [showAll, t],
  );

  useEffect(() => {
    const id = setTimeout(() => locate(false), 0);
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
          <Button variant={mode === "near" || mode === "locating" ? "primary" : "secondary"} size="sm" onClick={() => locate(true)} disabled={finding}>
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
      <div className="relative flex min-h-[55vh] flex-1">
        <MapView className="flex-1" center={center} zoom={zoom} focus={focus} fit={fit} pin={me} pinAccuracy={accuracy} markers={markers} onBoundsChange={load} onMarkerClick={select} />
        <button
          type="button"
          onClick={() => locate(true)}
          disabled={finding}
          title={t("map.locateMe")}
          aria-label={t("map.locateMe")}
          className="absolute bottom-6 right-4 z-10 grid h-12 w-12 place-items-center rounded-full bg-accent text-on-accent shadow-xl transition hover:scale-105 disabled:opacity-80"
        >
          {finding ? <Spinner className="h-5 w-5" /> : <LocateFixed className="h-6 w-6" />}
        </button>
        {(geoError || (me && accuracy)) && (
          <div className="absolute bottom-6 left-4 right-20 z-10 sm:right-auto sm:max-w-sm">
            {geoError ? (
              <div className="rounded-xl bg-bg/95 px-3 py-2 text-sm text-danger shadow-lg">{geoError}</div>
            ) : (
              <div className="inline-block rounded-xl bg-bg/90 px-3 py-1.5 text-xs text-muted shadow-lg">{t("map.geo.accuracy", { m: accuracy! })}</div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
