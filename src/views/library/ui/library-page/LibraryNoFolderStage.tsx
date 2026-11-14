"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { OpenVaultCta } from "@/features/docs-vault-local";
import { MOTION } from "@/shared/motion";
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
        art={({ arriving, reduced }) => (
          <>
            {/* A mask, not a painted vignette: the stage's plate shows through the object's rim. */}
            <div data-testid="library-empty-object" className="relative aspect-square w-full [mask-image:radial-gradient(closest-side,black_62%,transparent)]">
              {/* Building the 3D object blocks the main thread once, so it waits for the stage to come to rest and then fades in. */}
              {arriving ? null : (
                <motion.div
                  className="absolute inset-0"
                  initial={reduced ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ ...MOTION.expressive, delay: MOTION.slow.duration }}
                >
                  <LibraryConstellation />
                </motion.div>
              )}
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
            tone="accent"
            className="border-[color:var(--color-indigo-line-a35)] bg-[color:var(--color-indigo-a10)] hover:border-[color:var(--color-indigo-line-a54)] hover:bg-[color:var(--color-indigo-a16)]"
          />
        }
      />
    </main>
  );
}
