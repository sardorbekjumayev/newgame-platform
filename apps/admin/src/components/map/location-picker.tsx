"use client";

import { Crosshair, LocateFixed, MapPin, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Alert, Button, Input, Spinner, cx } from "@/components/ui";
import { useI18n } from "@/i18n/provider";
import { MapView, mapProvider } from "./map-view";
import { type LatLng, type SearchResult, TASHKENT } from "./provider";

/**
 * Klub joyini tanlash:
 *  1) qidiruv — qisman manzil ham bo'ladi ("Chilonzor 9 kvartal", "Yunusobod metro") → xarita o'sha joyga yaqinlashadi;
 *  2) xaritaga bosish yoki pinni sudrash — aniq joy;
 *  3) "Mening joyim" — brauzer geolokatsiyasi.
 * Har o'zgarishda manzil teskari geokodlanadi (operator keyin tahrirlashi mumkin).
 */
export function LocationPicker({
  value,
  onChange,
  className,
}: {
  value: LatLng | null;
  onChange: (pos: LatLng, address: string | null) => void;
  className?: string;
}) {
  const { t, locale } = useI18n();
  const [view, setView] = useState<{ center: LatLng; zoom: number }>(() => ({ center: value ?? TASHKENT, zoom: value ? 17 : 12 }));
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const seq = useRef(0);
  const skipSearch = useRef(false); // natija tanlanganda q o'zgaradi — qayta qidirmaslik

  const pick = async (pos: LatLng) => {
    const n = ++seq.current;
    onChange(pos, null);
    setGeocoding(true);
    const address = await mapProvider.reverseGeocode(pos, locale).catch(() => null);
    // Ketma-ket bosishlarda faqat oxirgisining manzili qo'yiladi
    if (n === seq.current) {
      onChange(pos, address);
      setGeocoding(false);
    }
  };

  // Qidiruv: yozish to'xtagach 400ms
  useEffect(() => {
    const query = q.trim();
    if (query.length < 3) return;
    if (skipSearch.current) {
      skipSearch.current = false;
      return;
    }
    let alive = true;
    const id = setTimeout(async () => {
      setSearching(true);
      const r = await mapProvider.search(query, locale, value ?? undefined).catch(() => []);
      if (alive) {
        setResults(r);
        setSearching(false);
      }
    }, 400);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [q, locale]); // eslint-disable-line react-hooks/exhaustive-deps

  // 3 belgidan qisqa so'rovda ro'yxat ko'rinmaydi
  const shown = q.trim().length >= 3 ? results : null;

  const choose = (r: SearchResult) => {
    setView({ center: r.position, zoom: r.precise ? 18 : 16 });
    setResults(null);
    skipSearch.current = true;
    setQ(r.title);
    // Aniq uy topilsa — pin shu yerga; aks holda faqat yaqinlashamiz, operator o'zi bosib belgilaydi
    if (r.precise) void pick(r.position);
  };

  const myLocation = () => {
    setGeoError(null);
    if (!navigator.geolocation) return setGeoError(t("location.geoUnavailable"));
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude };
        setView({ center: pos, zoom: 18 });
        void pick(pos);
      },
      () => setGeoError(t("location.geoDenied")),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  if (!mapProvider.configured) return <Alert>{t("map.noKey")}</Alert>;

  return (
    <div className={cx("space-y-3", className)}>
      <div className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("location.searchPlaceholder")} className="h-11 w-full pl-9" />
            {searching && <Spinner className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" />}
          </div>
          <Button type="button" variant="secondary" onClick={myLocation} title={t("location.myLocation")}>
            <LocateFixed className="h-4 w-4" />
            <span className="hidden sm:inline">{t("location.myLocation")}</span>
          </Button>
        </div>
        {shown && (
          <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-2xl border border-line bg-bg p-1 shadow-2xl">
            {shown.length === 0 ? (
              <li className="px-3 py-2.5 text-sm text-muted">{t("location.noResults")}</li>
            ) : (
              shown.map((r, i) => (
                <li key={i}>
                  <button type="button" onClick={() => choose(r)} className="flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left hover:bg-surface-2">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{r.title}</span>
                      <span className="block truncate text-xs text-muted">{r.subtitle}</span>
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
      {geoError && <Alert>{geoError}</Alert>}
      <div className="relative">
        <MapView className="h-[420px] rounded-2xl" center={view.center} zoom={view.zoom} pin={value} onMapClick={pick} onPinDrag={pick} />
        <div className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-xs font-semibold text-white">
          <Crosshair className="h-3.5 w-3.5" />
          {value ? t("location.dragHint") : t("location.clickHint")}
        </div>
      </div>
      {value && (
        <div className="font-mono text-xs text-muted">
          {value.lat.toFixed(6)}, {value.lng.toFixed(6)}
          {geocoding && " …"}
        </div>
      )}
    </div>
  );
}
