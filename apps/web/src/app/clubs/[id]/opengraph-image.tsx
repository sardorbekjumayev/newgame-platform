import { fetchClub, renderShareCard, siteUrl } from "@/lib/share-card";

export const alt = "Zonup";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Telegram/Instagram'da havola ulashilganda ko'rinadigan rasm. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const club = await fetchClub(id);
  if (!club) return new Response("Not found", { status: 404 });
  return renderShareCard(club, "og", "uz", `${siteUrl()}/clubs/${id}`);
}
