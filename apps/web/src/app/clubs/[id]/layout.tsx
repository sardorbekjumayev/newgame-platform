import type { Metadata } from "next";
import { fetchClub } from "@/lib/share-card";

/** Klub sahifasi meta (sarlavha, tavsif) — havola preview'lari uchun; sahifaning o'zi client. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const club = await fetchClub(id);
  if (!club) return { title: "Klub topilmadi" };
  const zones = club.zones.map((z) => z.name).join(", ");
  const description = [club.address ?? club.city, zones && `Zonalar: ${zones}`].filter(Boolean).join(" · ");
  return {
    title: club.name,
    description,
    openGraph: { type: "website", title: `${club.name} — Zonup`, description, url: `/clubs/${id}` },
    twitter: { card: "summary_large_image", title: `${club.name} — Zonup`, description },
  };
}

export default function ClubLayout({ children }: { children: React.ReactNode }) {
  return children;
}
