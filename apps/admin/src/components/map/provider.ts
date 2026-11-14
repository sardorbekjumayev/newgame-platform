/**
 * Xarita provayderi abstraksiyasi.
 * Sahifalar faqat shu interfeys bilan ishlaydi; provayder (hozir Yandex) almashtirilsa UI o'zgarmaydi.
 */
export type LatLng = { lat: number; lng: number };
/** [g'arb, janub, sharq, shimol] — API `bbox=w,s,e,n` tartibida. */
export type BBox = [number, number, number, number];

export type MapMarker = {
  id: string;
  position: LatLng;
  label: string;
  active?: boolean;
};

export interface MapHandle {
  setMarkers(markers: MapMarker[]): void;
  setCenter(center: LatLng, zoom?: number): void;
  /** Bitta tanlanadigan pin (klub joyi). null — olib tashlash. Sudrab aniqlashtirsa bo'ladi (onPinDrag). */
  setPin(position: LatLng | null): void;
  getBBox(): BBox;
  destroy(): void;
}

export type MapEvents = {
  onBoundsChange?: (bbox: BBox, zoom: number) => void;
  onMarkerClick?: (id: string) => void;
  onMapClick?: (pos: LatLng) => void;
  /** Pin sudrab qo'yilganda yangi joy. */
  onPinDrag?: (pos: LatLng) => void;
};

/** Qidiruv natijasi (manzil, ko'cha, mahalla, mo'ljal). */
export type SearchResult = { title: string; subtitle: string; position: LatLng; precise: boolean };

export interface MapProvider {
  create(container: HTMLElement, opts: { center: LatLng; zoom: number; locale: string } & MapEvents): Promise<MapHandle>;
  /** Koordinata → manzil (teskari geokodlash). */
  reverseGeocode(pos: LatLng, locale: string): Promise<string | null>;
  /** Matn → joylar (qisman manzil ham bo'ladi: "Chilonzor 9", "Yunusobod metro"). near — natijalarni shu atrofga yaqinlashtirish. */
  search(query: string, locale: string, near?: LatLng): Promise<SearchResult[]>;
  /** Kalit sozlanganmi (yo'q bo'lsa UI tushunarli xabar ko'rsatadi). */
  configured: boolean;
}

export const TASHKENT: LatLng = { lat: 41.3111, lng: 69.2797 };
