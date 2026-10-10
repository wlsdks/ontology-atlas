import { useTranslations } from "next-intl";
import { OpenVaultCta } from "@/features/docs-vault-local";
import { PAGE_COLUMN_STAGE, PAGE_LEDE, PAGE_TITLE } from "@/shared/ui/page-frame";
import { libraryEyebrowClass } from "../../lib/page-eyebrow";
import { LibraryConstellation } from "../parts/LibraryConstellation";

export function LibraryNoFolderStage({
  t, locale,
}: {
  t: ReturnType<typeof useTranslations<"library">>;
  locale: string;
}) {
  return (
    <main
      id="main"
      tabIndex={-1}
      data-testid="library-page"
      data-library-state="no-folder"
      className="relative flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-5 py-10 max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+24px)]"
    >
      <div className="flex w-full max-w-[var(--library-empty-max)] flex-col items-center gap-8 lg:flex-row lg:items-center lg:gap-12">
      <div className={`${PAGE_COLUMN_STAGE} relative shrink-0`}>
        <p className={libraryEyebrowClass(locale)}>
          {t("title")}
        </p>
        <h1 className={`mt-1 break-keep ${PAGE_TITLE}`}>
          {t("emptyTitle")}
        </h1>
        <p className={`mt-2 ${PAGE_LEDE}`}>
          {t("emptyBody")}
        </p>
        <dl
          aria-label={t("kindsAria")}
          data-testid="library-kinds"
          className="mt-5 flex flex-col gap-3 border-t border-[color:var(--color-border-soft)] pt-4"
        >
          <div>
            <dt className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
              {t("kindSourcesTitle")}
            </dt>
            <dd className="mt-0.5 text-label leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]">
              {t("kindSourcesBody")}
            </dd>
          </div>
          <div>
            <dt className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
              {t("kindWikiTitle")}
            </dt>
            <dd className="mt-0.5 text-label leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]">
              {t("kindWikiBody")}
            </dd>
          </div>
        </dl>
        <div className="mt-5">
          <OpenVaultCta
            testId="library-open-vault"
            tone="accentOnTint"
            className="border-[color:var(--color-indigo-line-a35)] bg-[color:var(--color-indigo-a10)] hover:border-[color:var(--color-indigo-line-a54)] hover:bg-[color:var(--color-indigo-a16)]"
          />
        </div>
      </div>
      <div
        data-testid="library-empty-object"
        className="relative aspect-square w-full max-w-[var(--library-empty-object-max)] shrink-0"
      >
        <LibraryConstellation />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_42%,var(--color-canvas-a70)_82%,var(--color-canvas)_100%)]"
        />
      </div>
      </div>
    </main>
  );
}
