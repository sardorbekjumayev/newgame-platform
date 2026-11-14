import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import { formatMoney } from "@ng/types";
import type { ClubDetailPublic } from "./types";

/**
 * Klub "share card" — Zonup uslubida (qora fon, lime aksent, setka, glow) PNG.
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

const C = { bg: "#0e0f13", surface: "#171922", surface2: "#1e212b", line: "#2b3040", fg: "#edeef2", muted: "#a3a9ba", accent: "#c6ff3d", onAccent: "#0e0f13" };

let fontsCache: Promise<{ name: string; data: Buffer; weight: 500 | 600 | 700 | 800; style: "normal" }[]> | null = null;
function fonts() {
  const dir = join(process.cwd(), "src/assets/fonts");
  return (fontsCache ??= Promise.all([
    readFile(join(dir, "Manrope-500.ttf")).then((data) => ({ name: "Manrope", data, weight: 500 as const, style: "normal" as const })),
    readFile(join(dir, "Manrope-700.ttf")).then((data) => ({ name: "Manrope", data, weight: 700 as const, style: "normal" as const })),
    readFile(join(dir, "Manrope-800.ttf")).then((data) => ({ name: "Manrope", data, weight: 800 as const, style: "normal" as const })),
    readFile(join(dir, "ChakraPetch-Bold.ttf")).then((data) => ({ name: "Chakra", data, weight: 700 as const, style: "normal" as const })),
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
    <div style={{ display: "flex", fontFamily: "Chakra", fontSize: size, fontWeight: 700, letterSpacing: size * 0.06, color: C.accent }}>
      ZON<span style={{ color: C.fg }}>UP</span>
    </div>
  );
}

function Background({ w, h }: { w: number; h: number }) {
  return (
    <>
      {/* setka */}
      <div
        style={{
          position: "absolute", inset: 0, display: "flex", opacity: 0.55,
          backgroundImage: `linear-gradient(${C.surface2} 2px, transparent 2px), linear-gradient(90deg, ${C.surface2} 2px, transparent 2px)`,
          backgroundSize: "72px 72px",
        }}
      />
      {/* lime glow */}
      <div style={{ position: "absolute", top: -h * 0.18, left: w * 0.15, width: w * 0.9, height: w * 0.9, borderRadius: 9999, background: "rgba(198,255,61,0.16)", filter: "blur(120px)", display: "flex" }} />
      <div style={{ position: "absolute", bottom: -h * 0.1, right: -w * 0.25, width: w * 0.7, height: w * 0.7, borderRadius: 9999, background: "rgba(125,255,179,0.08)", filter: "blur(120px)", display: "flex" }} />
    </>
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
  const tariffs = club.zones.flatMap((z) => z.tariffs.map((t) => ({ zone: z, t }))).slice(0, format === "story" ? 5 : 0); // post (4:5) — joy kam, faqat eng arzon narx
  const money = club.price_from != null ? formatMoney(club.price_from, lang) : null;
  // "25 000 so'm dan" (uz) / "от 25 000 сум" (ru) / "from 25,000 UZS" (en)
  const minPrice = money ? (lang === "uz" ? `${money} ${L.from}` : `${L.from} ${money}`) : null;
  const priceKicker = club.price_unit === "HOUR" ? L.perHour : L.perPkg;
  // Geokoder manzili "Oʻzbekiston, Toshkent, ..." — mamlakat ortiqcha, shahar takrorlanmasin
  const address = (() => {
    const a = (club.address ?? "").replace(/^(O[ʻ'‘`]?zbekiston|Узбекистан|Uzbekistan),\s*/i, "");
    return a && a.toLowerCase().includes(club.city.toLowerCase()) ? a : [a, club.city].filter(Boolean).join(", ");
  })();
  const nameSize = Math.round((club.name.length > 22 ? 88 : 112) * s * (format === "story" ? 1 : format === "post" ? 0.9 : 0.62));

  const header = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <Logo size={vertical ? 64 * s : 40} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: vertical ? "14px 26px" : "8px 18px", borderRadius: 999, border: `2px solid rgba(198,255,61,0.35)`, background: "rgba(198,255,61,0.08)", color: C.accent, fontSize: vertical ? 30 * s : 20, fontWeight: 700 }}>
        zonup.uz
      </div>
    </div>
  );

  const statusPill = status && (
    <div style={{ display: "flex", alignItems: "center", gap: 14, alignSelf: "flex-start", padding: vertical ? "14px 28px" : "8px 18px", borderRadius: 999, background: club.is_open_now === false ? C.surface2 : "rgba(198,255,61,0.14)", color: club.is_open_now === false ? C.muted : C.accent, fontSize: vertical ? 32 * s : 22, fontWeight: 700 }}>
      <div style={{ width: vertical ? 16 : 10, height: vertical ? 16 : 10, borderRadius: 99, background: club.is_open_now === false ? C.muted : C.accent, display: "flex" }} />
      {status}
    </div>
  );

  const zoneChips = zones.length > 0 && (
    <div style={{ display: "flex", flexWrap: "wrap", gap: vertical ? 16 : 10 }}>
      {zones.map((z) => (
        <div key={z.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: vertical ? "14px 26px" : "8px 16px", borderRadius: vertical ? 22 : 14, background: C.surface2, border: `2px solid ${C.line}`, color: C.fg, fontSize: vertical ? 34 * s : 22, fontWeight: 700 }}>
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
        <div style={{ fontFamily: "Chakra", fontSize: vertical ? 54 * s : 32, fontWeight: 700, lineHeight: 1.05 }}>{L.cta}</div>
        <div style={{ fontSize: vertical ? 28 * s : 18, fontWeight: 600, opacity: 0.75 }}>{L.scan}</div>
      </div>
    </div>
  );

  const body = vertical ? (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: `${90 * s}px ${80 * s}px`, gap: 0 }}>
      {header}
      <div style={{ display: "flex", flexDirection: "column", gap: 34 * s, marginTop: format === "story" ? 170 * s : 90 * s }}>
        {statusPill}
        <div style={{ display: "flex", fontFamily: "Chakra", fontSize: nameSize, fontWeight: 700, lineHeight: 1.0, color: C.fg, letterSpacing: -1 }}>{club.name}</div>
        <div style={{ display: "flex", fontSize: 36 * s, color: C.muted, fontWeight: 500, lineHeight: 1.3 }}>📍 {address}</div>
        {minPrice && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 30 * s, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 3 }}>{priceKicker}</div>
            <div style={{ fontFamily: "Chakra", fontSize: 96 * s, fontWeight: 700, color: C.accent }}>{minPrice}</div>
          </div>
        )}
        {zoneChips}
      </div>
      {tariffs.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", marginTop: 50 * s, borderRadius: 36 * s, background: "rgba(23,25,34,0.92)", border: `2px solid ${C.line}`, padding: `${18 * s}px ${36 * s}px` }}>
          {tariffs.map(({ zone, t }, i) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: `${22 * s}px 0`, borderTop: i ? `2px solid ${C.line}` : "none", gap: 20 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontSize: 34 * s, fontWeight: 700, color: C.fg }}>{t.name}</div>
                <div style={{ fontSize: 26 * s, fontWeight: 600, color: zone.color ?? C.muted }}>{zone.name}</div>
              </div>
              <div style={{ fontFamily: "Chakra", fontSize: 38 * s, fontWeight: 700, color: C.accent }}>{priceLabel(t, L, lang)}</div>
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
        <div style={{ display: "flex", fontFamily: "Chakra", fontSize: nameSize, fontWeight: 700, lineHeight: 1.0, color: C.fg }}>{club.name}</div>
        <div style={{ display: "flex", fontSize: 24, color: C.muted, fontWeight: 500 }}>📍 {address}</div>
        {zoneChips}
      </div>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 18, width: 340 }}>
        {minPrice && (
          <div style={{ display: "flex", flexDirection: "column", padding: 26, borderRadius: 24, background: C.surface, border: `2px solid ${C.line}` }}>
            <div style={{ fontSize: 18, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2 }}>{priceKicker}</div>
            <div style={{ fontFamily: "Chakra", fontSize: (minPrice?.length ?? 0) > 14 ? 34 : 42, fontWeight: 700, color: C.accent, whiteSpace: "nowrap" }}>{minPrice}</div>
          </div>
        )}
        {qrBlock}
      </div>
    </div>
  );

  return new ImageResponse(
    (
      <div style={{ display: "flex", position: "relative", width: "100%", height: "100%", background: C.bg, fontFamily: "Manrope", color: C.fg }}>
        <Background w={w} h={h} />
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
