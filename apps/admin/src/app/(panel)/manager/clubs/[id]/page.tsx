"use client";

import { ArrowLeft, Clock, ExternalLink, Layers, MapPin, MapPinOff, Phone, User } from "lucide-react";
import Link from "next/link";
import { use } from "react";
import { ZonesView, HoursView } from "@/components/club-offer";
import { ShareClub } from "@/components/share-club";
import { Alert, Badge, Card, Heading, Spinner } from "@/components/ui";
import { type MessageKey, useI18n } from "@/i18n/provider";
import { fmtDateTime, fmtPublicId } from "@/lib/format";
import type { ManagerClubDetail } from "@/lib/types";
import { useApi } from "@/lib/use-api";

/** Menejer: biriktirilgan klub — zonalar va tariflar, ish vaqti, joy, operator (faqat ko'rish). */
export default function ManagerClubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, locale } = useI18n();
  const club = useApi<ManagerClubDetail>(`/manager/clubs/${id}`);

  if (club.error) return <Alert>{club.error}</Alert>;
  if (!club.data) return <Spinner />;
  const c = club.data;
  const tariffsTotal = c.zones.reduce((n, z) => n + z.tariffs.length, 0);

  return (
    <div className="space-y-6">
      <Link href="/manager" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" />
        {t("nav.myClubs")}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Heading>{c.name}</Heading>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              {[c.address, c.city].filter(Boolean).join(", ")}
            </span>
            {c.phone && (
              <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 hover:text-fg">
                <Phone className="h-4 w-4" />
                {c.phone}
              </a>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ShareClub clubId={c.id} clubName={c.name} />
          {c.is_open_now !== null && <Badge tone={c.is_open_now ? "green" : "neutral"}>{t(c.is_open_now ? "managerPanel.openNow" : "managerPanel.closedNow")}</Badge>}
          <Badge tone={c.status === "ACTIVE" ? "green" : "red"}>{t(`club.status.${c.status}` as MessageKey)}</Badge>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <section className="space-y-4">
          <div className="flex items-center gap-2 font-display text-xl font-bold">
            <Layers className="h-5 w-5 text-accent" />
            {t("nav.zones")}
            <span className="text-sm font-semibold text-muted">
              · {c.zones.length} / {tariffsTotal}
            </span>
          </div>
          <ZonesView zones={c.zones} />
        </section>

        <aside className="space-y-4">
          <Card className="space-y-2">
            <div className="flex items-center gap-2 font-bold">
              <Clock className="h-4 w-4 text-accent" />
              {t("nav.hours")}
            </div>
            <HoursView wh={c.working_hours} />
          </Card>
          <Card className="space-y-2 text-sm">
            <div className="flex items-center gap-2 font-bold">
              <MapPin className="h-4 w-4 text-accent" />
              {t("nav.location")}
            </div>
            {c.latitude !== null && c.longitude !== null ? (
              <a
                href={`https://yandex.uz/maps/?pt=${c.longitude},${c.latitude}&z=17&l=map`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-accent hover:underline"
              >
                {t("location.openMap")}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-warn">
                <MapPinOff className="h-4 w-4" />
                {t("location.notSetLong")}
              </span>
            )}
          </Card>
          <Card className="space-y-1 text-sm">
            <div className="flex items-center gap-2 font-bold">
              <User className="h-4 w-4 text-accent" />
              {t("role.OPERATOR")}
            </div>
            {c.operator ? (
              <>
                <div className="font-semibold">{[c.operator.first_name, c.operator.last_name].filter(Boolean).join(" ") || c.operator.username}</div>
                <div className="font-mono text-xs text-muted">ID {fmtPublicId(c.operator.public_id)}</div>
                <div className="text-xs text-muted">
                  {t("common.lastLogin")}: {c.operator.last_login_at ? fmtDateTime(c.operator.last_login_at, locale) : t("common.never")}
                </div>
              </>
            ) : (
              <span className="text-muted">{t("club.noOperator")}</span>
            )}
            <div className="pt-2 text-xs text-muted">{t("removal.linkedAt", { at: fmtDateTime(c.linked_at, locale) })}</div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
