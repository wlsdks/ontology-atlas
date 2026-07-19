"use client";

import { useTranslations } from "next-intl";

/**
 * `OntologyEditCanvas` 의 `next/dynamic` 로딩 placeholder
 * (OntologyEditPage.tsx A4 분해 — 기능/마크업 무변, 물리 이동만).
 */
export function CanvasSkeleton() {
  const t = useTranslations("ontologyPages.edit.page");
  return (
    <div className="topology-ui-scale flex h-full items-center justify-center">
      <p className="text-xs text-[color:var(--color-text-quaternary)]">{t("canvasLoading")}</p>
    </div>
  );
}
