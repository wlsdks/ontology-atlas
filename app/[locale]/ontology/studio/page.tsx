import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { OntologyStudioPage } from "@/views/ontology-studio";
import { RouteLoadingFallback } from "@/shared/ui";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return { title: t("pages.ontologyStudio") };
}

/**
 * /ontology/studio — 공방, the 나침 무대 (Compass Stage). The vault WRITE
 * surface: one node at the center, the four relation types nailed to fixed
 * compass bearings, and every missing relation a dashed line-art socket you
 * fill through an inline picker.
 *
 * Restrained, no exceptions. The old "game-styled surface (sanctioned scoped
 * design exception)" was RETIRED on 2026-07-24 — glow / rarity / particle /
 * gem are forbidden here exactly as they are app-wide, and the `--studio-*`
 * game token block was deleted (see `.claude/rules/design.md` and
 * `.claude/rules/forbidden.md`). The pull comes from the loop, not from bling.
 *
 * Static-export compatible (no server APIs).
 */
export default function Page() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <OntologyStudioPage />
    </Suspense>
  );
}
