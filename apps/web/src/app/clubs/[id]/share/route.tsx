import { type CardFormat, CARD_SIZES, fetchClub, renderShareCard, siteUrl } from "@/lib/share-card";

/** GET /clubs/:id/share?format=story|post|og&lang=uz|ru|en[&download=1] → PNG. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = new URL(req.url).searchParams;
  const format = (q.get("format") ?? "story") as CardFormat;
  const lang = (["uz", "ru", "en"].includes(q.get("lang") ?? "") ? q.get("lang") : "uz") as "uz" | "ru" | "en";
  if (!(format in CARD_SIZES)) return new Response("Bad format", { status: 400 });
  const club = await fetchClub(id);
  if (!club) return new Response("Not found", { status: 404 });
  const img = await renderShareCard(club, format, lang, `${siteUrl()}/clubs/${id}`);
  if (q.get("download") === "1") {
    const slug = club.name.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "club";
    img.headers.set("Content-Disposition", `attachment; filename="zonup-${slug}-${format}.png"`);
  }
  return img;
}
