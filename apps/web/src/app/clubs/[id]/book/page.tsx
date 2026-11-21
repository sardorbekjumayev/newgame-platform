"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect } from "react";
import { BookingFlow } from "@/components/booking-flow";
import { Spinner, buttonClass } from "@/components/ui";
import { useI18n } from "@/i18n/provider";
import { useAuth } from "@/lib/session";
import type { ClubDetailPublic } from "@/lib/types";
import { useApi } from "@/lib/use-api";

/**
 * Bron sahifasi — klub sahifasidagi «BRON QILISH» tugmasidan ochiladi.
 * Faqat kirgan mijoz uchun: kirmagan bo'lsa login'ga (`next` — shu sahifa), kirgach shu yerga qaytadi.
 */
export default function BookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useI18n();
  const { me, loading } = useAuth();
  const router = useRouter();
  const club = useApi<ClubDetailPublic>(`/clubs/${id}`);

  useEffect(() => {
    if (!loading && !me) router.replace(`/login?next=${encodeURIComponent(`/clubs/${id}/book`)}&reason=book`);
  }, [loading, me, router, id]);

  if (loading || !me || club.loading) return <Spinner className="mx-auto my-24 h-7 w-7" />;
  if (!club.data)
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-5 px-5 py-20 text-center">
        <h1 className="font-display text-[44px] uppercase leading-none">{club.error ?? t("catalog.notFound")}</h1>
        <Link href="/map" className={buttonClass("primary", "lg")}>
          {t("nav.map")}
        </Link>
      </main>
    );

  return <BookingFlow club={club.data} />;
}
