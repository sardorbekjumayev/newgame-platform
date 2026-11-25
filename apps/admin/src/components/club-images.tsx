"use client";

import { ImagePlus, RefreshCw, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Alert, Button, Card, Spinner, cx } from "@/components/ui";
import { useErrorText, useI18n } from "@/i18n/provider";
import { session } from "@/lib/session";
import type { OperatorDashboard } from "@/lib/types";

type Kind = "logo" | "photo";

/** API chegarasi (MAX_UPLOAD_BYTES). Undan kattasi umuman yuborilmaydi — proksi ulanishni uzib qo'yadi. */
const MAX_BYTES = 10 * 1024 * 1024;
/** Shundan katta rasm brauzerda kichraytiriladi: telefon rasmlari tez yuklanadi, API baribir webp'ga siqadi. */
const SHRINK_FROM = 3 * 1024 * 1024;
const SHRINK_TO_PX = 2560;
const ACCEPT = "image/jpeg,image/png,image/webp";

/** Katta rasmni JPEG'ga kichraytiradi (logo — shaffoflik uchun PNG); bo'lmasa (eski brauzer) aslini qaytaradi. */
async function shrink(file: File, kind: Kind): Promise<Blob> {
  if (file.size <= SHRINK_FROM || typeof createImageBitmap !== "function") return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, (kind === "logo" ? 1024 : SHRINK_TO_PX) / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const type = kind === "logo" ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, type, 0.9));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

/**
 * Klub sozlamalari: logotip va klub rasmi (bittadan). Mijoz saytida klub sahifasi, xarita va
 * ro'yxatlarda ko'rinadi. POST/DELETE /operator/club/:kind → yangilangan operator dashboard.
 */
export function ClubImages({ club, onSaved }: { club: OperatorDashboard["club"]; onSaved: (d: OperatorDashboard) => void }) {
  const { t } = useI18n();
  return (
    <Card className="space-y-4">
      <div>
        <div className="font-bold">{t("images.title")}</div>
        <p className="mt-1 text-sm text-muted">{t("images.subtitle")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-[200px_minmax(0,1fr)]">
        <ImageSlot kind="logo" url={club.logo_url} onSaved={onSaved} />
        <ImageSlot kind="photo" url={club.photo_url} onSaved={onSaved} />
      </div>
    </Card>
  );
}

function ImageSlot({ kind, url, onSaved }: { kind: Kind; url: string | null; onSaved: (d: OperatorDashboard) => void }) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"upload" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) return setError(t("errors.VALIDATION_ERROR.INVALID_IMAGE"));
    setBusy("upload");
    try {
      const blob = await shrink(file, kind);
      if (blob.size > MAX_BYTES) return setError(t("errors.VALIDATION_ERROR.PAYLOAD_TOO_LARGE"));
      const form = new FormData();
      form.append("file", blob, file.name);
      onSaved((await session.post<OperatorDashboard>(`/operator/club/${kind}`, form)).data);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!confirm(t(kind === "logo" ? "images.deleteLogoConfirm" : "images.deletePhotoConfirm"))) return;
    setError(null);
    setBusy("delete");
    try {
      onSaved((await session.delete<OperatorDashboard>(`/operator/club/${kind}`)).data);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  const label = t(kind === "logo" ? "images.logo" : "images.photo");
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <div className="text-[13px] font-semibold text-muted">{label}</div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={!!busy}
        aria-label={url ? t("images.replace") : t("images.upload")}
        className={cx(
          "group relative grid w-full place-items-center overflow-hidden rounded-[14px] border-2 border-dashed transition",
          kind === "logo" ? "aspect-square" : "aspect-[16/9]",
          url ? "border-transparent bg-surface-2" : "border-line bg-bg hover:border-accent/70",
        )}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- API'dagi tayyor webp, next/image optimizatsiyasi kerak emas
          <img src={url} alt={label} className={cx("h-full w-full", kind === "logo" ? "object-contain p-3" : "object-cover")} />
        ) : (
          <span className="flex flex-col items-center gap-2 px-4 text-center text-sm font-semibold text-muted group-hover:text-fg">
            <ImagePlus className="h-7 w-7" />
            {t(kind === "logo" ? "images.addLogo" : "images.addPhoto")}
          </span>
        )}
        {busy && (
          <span className="absolute inset-0 grid place-items-center bg-bg/70">
            <Spinner className="h-7 w-7" />
          </span>
        )}
      </button>
      <p className="text-xs text-muted/80">{t(kind === "logo" ? "images.logoHint" : "images.photoHint")}</p>
      {error && <Alert>{error}</Alert>}
      {url && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => input.current?.click()}>
            <RefreshCw className="h-3.5 w-3.5" />
            {t("images.replace")}
          </Button>
          <Button size="sm" variant="danger" loading={busy === "delete"} disabled={!!busy} onClick={remove}>
            <Trash2 className="h-3.5 w-3.5" />
            {t("images.delete")}
          </Button>
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void upload(f);
        }}
      />
    </div>
  );
}
