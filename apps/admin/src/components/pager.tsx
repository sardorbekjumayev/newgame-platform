"use client";

import { Button } from "@/components/ui";
import { useI18n } from "@/i18n/provider";

export function Pager({ page, limit, total, onPage }: { page: number; limit: number; total?: number; onPage: (p: number) => void }) {
  const { t } = useI18n();
  const pages = Math.max(1, Math.ceil((total ?? 0) / limit));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 pt-2 text-sm">
      <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        {t("common.prev")}
      </Button>
      <span className="tabular-nums text-muted">
        {page} / {pages}
      </span>
      <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        {t("common.next")}
      </Button>
    </div>
  );
}
