import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import { formatMoney } from "@ng/types";
import type { ClubDetailPublic } from "./types";

/**
 * Klub "share card" — Zonup uslubida (template/design.html: qora fon, lime aksent, Anton sarlavha) PNG.
 * story 1080×1920 (Instagram/Telegram story), post 1080×1350, og 1200×630 (havola preview'i).
 */
export type CardFormat = "story" | "post" | "og";
export const CARD_SIZES: Record<CardFormat, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 },
  post: { width: 1080, height: 1350 },
  og: { width: 1200, height: 630 },
};

type Lang = "uz" | "ru" | "en";
const TEXT: Record<Lang, Record<string, string>> = {
  uz: { open: "Hozir ochiq", closed: "Hozir yopiq", h24: "24/7 ochiq", from: "dan", perHour: "1 soat narxi", perPkg: "Paket narxi", hour: "soat", zones: "Zonalar", prices: "Narxlar", cta: "Zonup'da ko'ring", scan: "Skanerlang — xarita, narxlar va yo'nalish", via: "Zonup orqali ulashildi", pkg: "paket", h: "soat", min: "daq" },
  ru: { open: "Сейчас открыт", closed: "Сейчас закрыт", h24: "Открыт 24/7", from: "от", perHour: "Цена за час", perPkg: "Цена пакета", hour: "час", zones: "Зоны", prices: "Цены", cta: "Смотрите в Zonup", scan: "Сканируйте — карта, цены и маршрут", via: "Поделились через Zonup", pkg: "пакет", h: "ч", min: "мин" },
  en: { open: "Open now", closed: "Closed now", h24: "Open 24/7", from: "from", perHour: "Per hour", perPkg: "Package", hour: "hour", zones: "Zones", prices: "Prices", cta: "See it on Zonup", scan: "Scan — map, prices and directions", via: "Shared via Zonup", pkg: "package", h: "h", min: "min" },
};

const C = { bg: "#0A0A0A", surface: "#1C1C1C", surface2: "#262626", line: "#2E2E2E", lineStrong: "#4A4A4A", fg: "#FFFFFF", muted: "#B8B8B8", accent: "#B6FF00", onAccent: "#0A0A0A" };

/** Sarlavha shrifti: lotin — Anton, kirill — Oswald. */
const DISPLAY = "Anton, Oswald";

let fontsCache: Promise<{ name: string; data: Buffer; weight: 400 | 500 | 600 | 700 | 800; style: "normal" }[]> | null = null;
function fonts() {
  const dir = join(process.cwd(), "src/assets/fonts");
  return (fontsCache ??= Promise.all([
    readFile(join(dir, "Manrope-500.ttf")).then((data) => ({ name: "Manrope", data, weight: 500 as const, style: "normal" as const })),
    readFile(join(dir, "Manrope-700.ttf")).then((data) => ({ name: "Manrope", data, weight: 700 as const, style: "normal" as const })),
    readFile(join(dir, "Manrope-800.ttf")).then((data) => ({ name: "Manrope", data, weight: 800 as const, style: "normal" as const })),
    // Anton — sarlavhalar (faqat 400, kirill yo'q); kirill harflar Oswald 700 ga tushadi (saytdagi kabi)
    readFile(join(dir, "Anton-Regular.ttf")).then((data) => ({ name: "Anton", data, weight: 400 as const, style: "normal" as const })),
    readFile(join(dir, "Oswald-Cyrillic-700.woff")).then((data) => ({ name: "Oswald", data, weight: 700 as const, style: "normal" as const })),
  ]));
}

const priceLabel = (t: ClubDetailPublic["zones"][number]["tariffs"][number], L: Record<string, string>, lang: Lang) => {
  const p = formatMoney(t.price, lang);
  if (t.type === "HOURLY") return `${p} / ${L.hour}`;
  const d = t.duration_minutes ?? 0;
  return `${p} · ${d % 60 === 0 ? `${d / 60} ${L.h}` : `${d} ${L.min}`}`;
};

function Logo({ size }: { size: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", fontFamily: DISPLAY, fontSize: size, fontWeight: 400, letterSpacing: size * 0.02, lineHeight: 1, color: C.fg }}>
      ZON
      <div style={{ display: "flex", marginLeft: size * 0.06, padding: `0 ${size * 0.18}px`, background: C.accent, color: C.onAccent, transform: "skewX(-8deg)" }}>UP</div>
    </div>
  );
}

export async function renderShareCard(club: ClubDetailPublic, format: CardFormat, lang: Lang, url: string) {
  const { width: w, height: h } = CARD_SIZES[format];
  const L = TEXT[lang];
  const vertical = format !== "og";
  const s = w / 1080; // masshtab
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 320, color: { dark: C.onAccent, light: C.accent } });

  const status = club.working_hours?.always_open ? L.h24 : club.is_open_now === true ? L.open : club.is_open_now === false ? L.closed : null;
  const zones = club.zones.slice(0, vertical ? 4 : 3);
  const tariffs = club.zones.flatMap((z) => z.tariffs.map((t) => ({ zone: z, t }))).slice(0, format === "story" ? (club.name.length > 22 ? 2 : 3) : 0); // story — QR bloki sig'ishi uchun 3 tagacha; post (4:5) — joy kam, faqat eng arzon narx
  const money = club.price_from != null ? formatMoney(club.price_from, lang) : null;
  // "25 000 so'm dan" (uz) / "от 25 000 сум" (ru) / "from 25,000 UZS" (en)
  const minPrice = money ? (lang === "uz" ? `${money} ${L.from}` : `${L.from} ${money}`) : null;
  const priceKicker = club.price_unit === "HOUR" ? L.perHour : L.perPkg;
  // Geokoder manzili "Oʻzbekiston, Toshkent, ..." — mamlakat ortiqcha, shahar takrorlanmasin
  const address = (() => {
    const a = (club.address ?? "").replace(/^(O[ʻ'‘`]?zbekiston|Узбекистан|Uzbekistan),\s*/i, "");
    return a && a.toLowerCase().includes(club.city.toLowerCase()) ? a : [a, club.city].filter(Boolean).join(", ");
  })();
  const nameSize = Math.round((club.name.length > 22 ? 112 : 148) * s * (format === "story" ? 1 : format === "post" ? 0.9 : 0.62));

  const header = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <Logo size={vertical ? 64 * s : 40} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: vertical ? "14px 26px" : "8px 18px", borderRadius: 999, border: `3px solid ${C.accent}`, color: C.accent, fontSize: vertical ? 30 * s : 20, fontWeight: 700 }}>
        zonup.uz
      </div>
    </div>
  );

  const closed = club.is_open_now === false;
  const statusPill = status && (
    <div style={{ display: "flex", alignSelf: "flex-start", padding: vertical ? "14px 30px" : "8px 20px", borderRadius: 999, background: closed ? "transparent" : C.accent, border: `3px solid ${closed ? C.lineStrong : C.accent}`, color: closed ? C.muted : C.onAccent, fontSize: vertical ? 32 * s : 22, fontWeight: 800 }}>
      {status}
    </div>
  );

  const zoneChips = zones.length > 0 && (
    <div style={{ display: "flex", flexWrap: "wrap", gap: vertical ? 16 : 10 }}>
      {zones.map((z) => (
        <div key={z.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: vertical ? "14px 26px" : "8px 16px", borderRadius: 999, border: `3px solid ${C.fg}`, color: C.fg, fontSize: vertical ? 34 * s : 22, fontWeight: 700 }}>
          <div style={{ width: vertical ? 14 : 10, height: vertical ? 14 : 10, borderRadius: 99, background: z.color ?? C.accent, display: "flex" }} />
          {z.name}
        </div>
      ))}
    </div>
  );

  const qrBlock = (
    <div style={{ display: "flex", alignItems: "center", gap: vertical ? 36 * s : 22, padding: vertical ? 32 * s : 18, borderRadius: vertical ? 40 * s : 24, background: C.accent, color: C.onAccent }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qr} width={vertical ? 220 * s : 132} height={vertical ? 220 * s : 132} style={{ borderRadius: 16 }} alt="" />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
        <div style={{ fontFamily: DISPLAY, fontSize: vertical ? 64 * s : 38, fontWeight: 400, lineHeight: 1.02, textTransform: "uppercase" }}>{L.cta}</div>
        <div style={{ fontSize: vertical ? 28 * s : 18, fontWeight: 700 }}>{L.scan}</div>
      </div>
    </div>
  );

  const body = vertical ? (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: `${90 * s}px ${80 * s}px`, gap: 0 }}>
      {header}
      <div style={{ display: "flex", flexDirection: "column", gap: 34 * s, marginTop: format === "story" ? 130 * s : 80 * s }}>
        {statusPill}
        <div style={{ display: "flex", fontFamily: DISPLAY, fontSize: nameSize, fontWeight: 400, lineHeight: 1.0, color: C.fg, textTransform: "uppercase" }}>{club.name}</div>
        <div style={{ display: "flex", fontSize: 36 * s, color: C.muted, fontWeight: 500, lineHeight: 1.3 }}>📍 {address}</div>
        {minPrice && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 30 * s, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 3 }}>{priceKicker}</div>
            <div style={{ fontFamily: DISPLAY, fontSize: 112 * s, fontWeight: 400, lineHeight: 1.05, color: C.accent, textTransform: "uppercase" }}>{minPrice}</div>
          </div>
        )}
        {zoneChips}
      </div>
      {tariffs.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", marginTop: 50 * s, borderRadius: 36 * s, background: C.surface, padding: `${18 * s}px ${36 * s}px` }}>
          {tariffs.map(({ zone, t }, i) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: `${22 * s}px 0`, borderTop: i ? `2px solid ${C.line}` : "none", gap: 20 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontSize: 34 * s, fontWeight: 700, color: C.fg }}>{t.name}</div>
                <div style={{ fontSize: 26 * s, fontWeight: 600, color: zone.color ?? C.muted }}>{zone.name}</div>
              </div>
              <div style={{ fontSize: 36 * s, fontWeight: 800, color: C.accent }}>{priceLabel(t, L, lang)}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", flex: 1, minHeight: 40 * s }} />
      {qrBlock}
      <div style={{ display: "flex", justifyContent: "center", marginTop: 34 * s, fontSize: 26 * s, color: C.muted, fontWeight: 600, letterSpacing: 2 }}>{L.via.toUpperCase()}</div>
    </div>
  ) : (
    <div style={{ display: "flex", width: "100%", height: "100%", padding: "56px 64px", gap: 48 }}>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 22 }}>
        {header}
        <div style={{ display: "flex", flex: 1 }} />
        {statusPill}
        <div style={{ display: "flex", fontFamily: DISPLAY, fontSize: nameSize, fontWeight: 400, lineHeight: 1.0, color: C.fg, textTransform: "uppercase" }}>{club.name}</div>
        <div style={{ display: "flex", fontSize: 24, color: C.muted, fontWeight: 500 }}>📍 {address}</div>
        {zoneChips}
      </div>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 18, width: 340 }}>
        {minPrice && (
          <div style={{ display: "flex", flexDirection: "column", padding: 26, borderRadius: 24, background: C.surface }}>
            <div style={{ fontSize: 18, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2 }}>{priceKicker}</div>
            <div style={{ fontFamily: DISPLAY, fontSize: (minPrice?.length ?? 0) > 14 ? 40 : 50, fontWeight: 400, color: C.accent, whiteSpace: "nowrap", textTransform: "uppercase" }}>{minPrice}</div>
          </div>
        )}
        {qrBlock}
      </div>
    </div>
  );

  return new ImageResponse(
    (
      <div style={{ display: "flex", position: "relative", width: "100%", height: "100%", background: C.bg, fontFamily: "Manrope", color: C.fg }}>
        {body}
      </div>
    ),
    { width: w, height: h, fonts: await fonts(), emoji: "twemoji", headers: { "Cache-Control": "public, max-age=300" } },
  );
}

/** Server tomonda API'dan klub (Next → API to'g'ridan-to'g'ri, rewrite'siz). */
export async function fetchClub(id: string): Promise<ClubDetailPublic | null> {
  const origin = process.env.API_ORIGIN ?? "http://localhost:4900";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const res = await fetch(`${origin}/api/v1/clubs/${id}`, { next: { revalidate: 60 } }).catch(() => null);
  if (!res?.ok) return null;
  const json = (await res.json()) as { data: ClubDetailPublic };
  return json.data;
}

export const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:4910";
