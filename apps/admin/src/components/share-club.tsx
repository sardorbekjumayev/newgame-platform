"use client";

import { Check, Download, Link2, Share2 } from "lucide-react";
import { useState } from "react";
import { Alert, Button, Modal } from "@/components/ui";
import { useI18n } from "@/i18n/provider";

type Format = "story" | "post";
const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? "http://localhost:4910";

/**
 * Klubni Zonup uslubidagi rasm (story/post: nom, manzil, zonalar, tariflar, QR) sifatida ulashish — operator va menejer.
 * Rasm mijoz saytida yasaladi (`/clubs/:id/share`), panel `/share-card/:id` orqali proksi qiladi.
 * Klub ommaga ko'rinmasa (joyi belgilanmagan yoki to'xtatilgan) — rasm yo'q, sabab ko'rsatiladi.
 */
export function ShareClub({ clubId, clubName, size = "md" }: { clubId: string; clubName: string; size?: "sm" | "md" }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size={size} onClick={() => setOpen(true)}>
        <Share2 className="h-4 w-4" />
        {t("share.button")}
      </Button>
      {open && <ShareSheet clubId={clubId} clubName={clubName} onClose={() => setOpen(false)} />}
    </>
  );
}

function ShareSheet({ clubId, clubName, onClose }: { clubId: string; clubName: string; onClose: () => void }) {
  const { t, locale } = useI18n();
  const [format, setFormat] = useState<Format>("story");
  const [state, setState] = useState<{ format: Format; status: "ok" | "error" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const pageUrl = `${WEB_URL}/clubs/${clubId}`;
  const imgUrl = `/share-card/${clubId}?format=${format}&lang=${locale}`;
  const text = t("share.text", { name: clubName });
  const failed = state?.format === format && state.status === "error";

  async function shareNative() {
    setBusy(true);
    setNote(null);
    try {
      const blob = await fetch(imgUrl).then((r) => {
        if (!r.ok) throw new Error("image");
        return r.blob();
      });
      const file = new File([blob], `zonup-${format}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: clubName, text: `${text}\n${pageUrl}` });
      else if (navigator.share) await navigator.share({ title: clubName, text, url: pageUrl });
      else setNote(t("share.noNative"));
    } catch (e) {
      if ((e as Error).name !== "AbortError") setNote(t("share.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setNote(pageUrl);
    }
  }

  return (
    <Modal title={t("share.title")} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex gap-2">
          {(["story", "post"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              className={`h-9 rounded-xl border px-4 text-sm font-semibold transition ${format === f ? "border-accent bg-accent/10 text-accent" : "border-line bg-surface hover:border-muted/60"}`}
            >
              {t(f === "story" ? "share.story" : "share.post")}
            </button>
          ))}
        </div>
        {failed ? (
          <Alert tone="info">{t("share.notPublic")}</Alert>
        ) : (
          <div className="relative mx-auto overflow-hidden rounded-2xl border border-line-soft bg-surface-2" style={{ aspectRatio: format === "story" ? "9 / 16" : "4 / 5", maxHeight: "52vh" }}>
            {state?.format !== format && <div className="absolute inset-0 animate-pulse bg-surface-2" />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={imgUrl}
              src={imgUrl}
              alt={clubName}
              onLoad={() => setState({ format, status: "ok" })}
              onError={() => setState({ format, status: "error" })}
              className="h-full w-full object-contain"
            />
          </div>
        )}
        <Button className="w-full" size="lg" loading={busy} disabled={failed} onClick={shareNative}>
          <Share2 className="h-5 w-5" />
          {t("share.native")}
        </Button>
        <p className="text-center text-xs text-muted">{t("share.instagramHint")}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <a href={`https://t.me/share/url?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" className="flex h-11 items-center justify-center rounded-xl bg-[#229ED9] text-sm font-bold text-white hover:brightness-110">
            Telegram
          </a>
          <a href={`https://wa.me/?text=${encodeURIComponent(`${text} ${pageUrl}`)}`} target="_blank" rel="noopener noreferrer" className="flex h-11 items-center justify-center rounded-xl bg-[#25D366] text-sm font-bold text-black hover:brightness-110">
            WhatsApp
          </a>
          <a
            href={failed ? undefined : `${imgUrl}&download=1`}
            download
            aria-disabled={failed}
            className={`flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-surface text-sm font-semibold hover:border-muted/60 ${failed ? "pointer-events-none opacity-50" : ""}`}
          >
            <Download className="h-4 w-4" />
            {t("share.download")}
          </a>
          <button onClick={copy} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-surface text-sm font-semibold hover:border-muted/60">
            {copied ? <Check className="h-4 w-4 text-accent" /> : <Link2 className="h-4 w-4" />}
            {copied ? t("share.copied") : t("share.copy")}
          </button>
        </div>
        {note && <p className="break-all text-center text-sm text-muted">{note}</p>}
      </div>
    </Modal>
  );
}
