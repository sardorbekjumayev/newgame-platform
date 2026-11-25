"use client";

import { formatMoney } from "@ng/types";
import { Globe2, LocateFixed, MapPin, Search } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClubLogo, OpenBadge, PriceFrom } from "@/components/club-badges";
import { MapView } from "@/components/map/map-view";
import type { BBox, LatLng, MapMarker } from "@/components/map/provider";
import { Chip, Spinner } from "@/components/ui";
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
    <main className="flex flex-1 flex-col-reverse lg:h-[calc(100vh-76px)] lg:flex-row">
      <aside ref={listRef} className="flex flex-col gap-3 bg-nav p-5 lg:w-[440px] lg:shrink-0 lg:overflow-y-auto">
        <div className="flex items-end justify-between gap-3">
          <h1 className="font-display text-[28px] uppercase leading-none sm:text-[36px]">{t(mode === "near" ? "map.nearby" : "map.all")}</h1>
          {state.status === "ready" && <span className="shrink-0 text-[13px] font-bold text-muted">{t("map.found", { n: items.length })}</span>}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-5 w-5 -translate-y-1/2 text-ink-soft" strokeWidth={2.6} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("clubs.searchPlaceholder")}
            aria-label={t("clubs.searchPlaceholder")}
            className="h-12 w-full rounded-[14px] bg-paper pr-3 pl-11 text-[15px] font-semibold text-ink outline-none placeholder:text-ink-soft focus:ring-4 focus:ring-accent/70"
          />
        </div>
        <div className="flex gap-2">
          <Chip active={mode === "near" || mode === "locating"} onClick={() => locate(true)} disabled={finding} className="inline-flex items-center gap-1.5">
            <LocateFixed className="h-4 w-4" strokeWidth={2.6} />
            {t("map.nearMe")}
          </Chip>
          <Chip active={mode === "all"} onClick={showAll} className="inline-flex items-center gap-1.5">
            <Globe2 className="h-4 w-4" strokeWidth={2.6} />
            {t("map.showAll")}
          </Chip>
        </div>
        {mode === "locating" && <p className="text-xs font-semibold text-muted">{t("catalog.locating")}</p>}
        {state.status === "loading" && <Spinner className="mx-auto my-8 h-6 w-6" />}
        {state.status === "error" && <p className="py-6 text-center text-sm font-semibold text-muted">{t("map.error")}</p>}
        {state.status === "ready" && items.length === 0 && (
          <p className="rounded-[18px] border-2 border-dashed border-line-strong px-4 py-8 text-center text-sm font-semibold text-muted">{t(mode === "near" ? "map.empty" : "catalog.noneYet")}</p>
        )}
        {items.map((b) => {
          const on = b.id === selected;
          return (
            <div
              key={b.id}
              data-id={b.id}
              role="button"
              tabIndex={0}
              aria-pressed={on}
              onClick={() => {
                setSelected(b.id);
                setCenter({ lat: b.latitude, lng: b.longitude });
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                setSelected(b.id);
                setCenter({ lat: b.latitude, lng: b.longitude });
              }}
              className={`flex cursor-pointer flex-col gap-1.5 rounded-[18px] p-4 text-left transition ${on ? "bg-accent text-on-accent" : "bg-surface hover:bg-surface-2"}`}
            >
              <div className="flex items-start gap-3">
                {b.logo_url && <ClubLogo url={b.logo_url} className="h-11 w-11" />}
                <div className="min-w-0 flex-1 self-center text-[17px] font-bold">{b.name}</div>
                <OpenBadge open={b.is_open_now} on={on ? "accent" : "dark"} className="px-2.5! py-1! text-xs!" />
              </div>
              {b.address && (
                <div className={`flex items-center gap-1 text-[13px] font-semibold ${on ? "" : "text-muted"}`}>
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{b.address}</span>
                </div>
              )}
              {b.zones.length > 0 && <div className={`truncate text-[13px] font-semibold ${on ? "" : "text-soft"}`}>{b.zones.map((z) => z.name).join(" · ")}</div>}
              <div className="text-[13px]">
                <PriceFrom club={b} />
                {me && <span className={`font-semibold ${on ? "" : "text-muted"}`}> · {t("map.km", { km: distanceKm(me, { lat: b.latitude, lng: b.longitude }).toFixed(1) })}</span>}
              </div>
              {on && (
                <Link
                  href={`/clubs/${b.id}`}
                  className="mt-2 inline-flex min-h-12 items-center justify-center rounded-xl bg-ink px-4 font-bold text-fg transition hover:bg-surface-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  {t("catalog.openClub")}
                </Link>
              )}
            </div>
          );
        })}
      </aside>
      <div className="relative flex min-h-[55vh] flex-1">
        <MapView className="flex-1" center={center} zoom={zoom} focus={focus} fit={fit} pin={me} pinAccuracy={accuracy} markers={markers} onBoundsChange={load} onMarkerClick={select} />
        <button
          type="button"
          onClick={() => locate(true)}
          disabled={finding}
          title={t("map.locateMe")}
          aria-label={t("map.locateMe")}
          className="absolute right-4 bottom-6 z-10 grid h-14 w-14 place-items-center rounded-[14px] border-2 border-ink bg-accent text-on-accent shadow-xl transition hover:bg-accent-hover active:translate-y-px disabled:opacity-80"
        >
          {finding ? <Spinner className="h-5 w-5 text-on-accent" /> : <LocateFixed className="h-6 w-6" strokeWidth={2.6} />}
        </button>
        {(geoError || (me && accuracy)) && (
          <div className="absolute bottom-6 left-4 right-20 z-10 sm:right-auto sm:max-w-sm">
            {geoError ? (
              <div className="rounded-xl border-2 border-danger bg-bg px-3 py-2 text-sm font-semibold text-danger-soft shadow-lg">{geoError}</div>
            ) : (
              <div className="inline-block rounded-xl bg-ink px-3 py-1.5 text-xs font-semibold text-muted shadow-lg">{t("map.geo.accuracy", { m: accuracy! })}</div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
