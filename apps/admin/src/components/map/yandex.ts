import { session } from "@/lib/session";
import type { BBox, LatLng, MapHandle, MapMarker, MapProvider, SearchResult } from "./provider";

/* Yandex Maps JS API 2.1 — minimal tiplar (rasmiy @types yo'q). */
/* eslint-disable @typescript-eslint/no-explicit-any */
type YMaps = any;

declare global {
  interface Window {
    ymaps?: YMaps;
  }
}

const KEY = process.env.NEXT_PUBLIC_YANDEX_MAPS_KEY ?? "";
const LANG: Record<string, string> = { uz: "uz_UZ", ru: "ru_RU", en: "en_US" };

let loading: Promise<YMaps> | null = null;

function load(locale: string): Promise<YMaps> {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    if (!KEY) return reject(new Error("NEXT_PUBLIC_YANDEX_MAPS_KEY is not set"));
    const s = document.createElement("script");
    s.src = `https://api-maps.yandex.ru/2.1/?apikey=${KEY}&lang=${LANG[locale] ?? "uz_UZ"}`;
    s.async = true;
    s.onload = () => window.ymaps!.ready(() => resolve(window.ymaps));
    s.onerror = () => {
      loading = null;
      reject(new Error("Yandex Maps failed to load"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

const toLL = (p: LatLng) => [p.lat, p.lng];
const fromLL = ([lat, lng]: number[]): LatLng => ({ lat, lng });

export const yandexMaps: MapProvider = {
  configured: !!KEY,

  async create(container, opts) {
    const ymaps = await load(opts.locale);
    const map = new ymaps.Map(
      container,
      { center: toLL(opts.center), zoom: opts.zoom, controls: ["zoomControl", "geolocationControl", "typeSelector"] },
      { suppressMapOpenBlock: true },
    );

    const pill = ymaps.templateLayoutFactory.createClass(
      '<div class="gc-pin {% if properties.active %}gc-pin--active{% endif %}">$[properties.label]</div>',
    );
    const markers = new ymaps.GeoObjectCollection();
    map.geoObjects.add(markers);
    let pin: YMaps = null;

    const emitBounds = () => {
      const [[s, w], [n, e]] = map.getBounds();
      opts.onBoundsChange?.([w, s, e, n], map.getZoom());
    };
    map.events.add("boundschange", emitBounds);
    if (opts.onMapClick) map.events.add("click", (e: YMaps) => opts.onMapClick!(fromLL(e.get("coords"))));
    setTimeout(emitBounds, 0);
    const ro = new ResizeObserver(() => map.container.fitToViewport());
    ro.observe(container);

    const handle: MapHandle = {
      setMarkers(list: MapMarker[]) {
        markers.removeAll();
        for (const m of list) {
          const pm = new ymaps.Placemark(toLL(m.position), { label: m.label, active: m.active }, { iconLayout: pill, iconShape: { type: "Rectangle", coordinates: [[-60, -50], [60, 0]] } });
          pm.events.add("click", () => opts.onMarkerClick?.(m.id));
          markers.add(pm);
        }
      },
      setCenter(center, zoom) {
        map.setCenter(toLL(center), zoom ?? map.getZoom(), { duration: 300 });
      },
      setPin(position) {
        if (!position) {
          if (pin) map.geoObjects.remove(pin);
          pin = null;
          return;
        }
        if (pin) {
          pin.geometry.setCoordinates(toLL(position));
          return;
        }
        // Sudraladigan pin: operator joyni aniq qilib qo'yadi
        pin = new ymaps.Placemark(toLL(position), {}, { preset: "islands#redDotIcon", draggable: !!opts.onPinDrag });
        pin.events.add("dragend", () => opts.onPinDrag?.(fromLL(pin.geometry.getCoordinates())));
        map.geoObjects.add(pin);
      },
      getBBox(): BBox {
        const [[s, w], [n, e]] = map.getBounds();
        return [w, s, e, n];
      },
      destroy() {
        ro.disconnect();
        map.destroy();
      },
    };
    return handle;
  },

  // Geokodlash API orqali (Yandex HTTP Geocoder kaliti serverda; JS API kaliti faqat xarita uchun)
  async reverseGeocode(pos, locale) {
    const qs = new URLSearchParams({ lat: String(pos.lat), lng: String(pos.lng), lang: locale });
    const res = await session.get<{ address: string | null }>(`/geo/reverse?${qs}`);
    return res.data.address;
  },

  async search(query, locale, near) {
    const qs = new URLSearchParams({ q: query, lang: locale, ...(near ? { lat: String(near.lat), lng: String(near.lng) } : {}) });
    const res = await session.get<{ title: string; subtitle: string; latitude: number; longitude: number; precise: boolean }[]>(`/geo/search?${qs}`);
    return res.data.map((r): SearchResult => ({ title: r.title, subtitle: r.subtitle, position: { lat: r.latitude, lng: r.longitude }, precise: r.precise }));
  },
};
