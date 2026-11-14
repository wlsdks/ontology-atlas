"use client";

import { useTranslations } from "next-intl";
import { OpenVaultCta } from "@/features/docs-vault-local";
import { FeatureStage } from "@/shared/ui";
import { LibraryConstellation } from "../parts/first-run/LibraryConstellation";

export function LibraryNoFolderStage({ t }: { t: ReturnType<typeof useTranslations<"library">> }) {
  return (
    <main
      id="main"
      tabIndex={-1}
      data-testid="library-page"
      data-library-state="no-folder"
      className="relative flex min-h-0 flex-1 overflow-y-auto px-5 py-10 max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+24px)]"
    >
      <FeatureStage
        titleAs="h1"
        art={() => (
          <>
            <div data-testid="library-empty-object" className="relative aspect-square w-full">
              <LibraryConstellation />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_42%,var(--color-canvas-a70)_82%,var(--color-canvas)_100%)]"
              />
            </div>
            {/* The object's two marks, named: a cube is a source, a sphere the wiki page that cites it. */}
            <div className="mt-2 flex items-center justify-center gap-5 text-label text-[color:var(--color-text-tertiary)]">
              <span className="flex items-center gap-2"><span className="size-2 rotate-12 bg-[color:var(--color-text-secondary)]" />{t("kindSourcesTitle")}</span>
              <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-[color:var(--color-indigo-accent)]" />{t("kindWikiTitle")}</span>
            </div>
          </>
        )}
        title={t("stageTitle")}
        body={t("stageBody")}
        action={
          <OpenVaultCta
            testId="library-open-vault"
            tone="accentOnTint"
            className="border-[color:var(--color-indigo-line-a35)] bg-[color:var(--color-indigo-a10)] hover:border-[color:var(--color-indigo-line-a54)] hover:bg-[color:var(--color-indigo-a16)]"
          />
        }
      />
    </main>
  );
}
