import { BookOpen, FileText, Sparkles } from "lucide-react";
import type { useTranslations } from "use-intl";

import { cn } from "@/shared/lib/cn";
import { Sheet } from "@/shared/ui/marks/sheet";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";

import { RECENT_PAGE_COUNT, type RecentPages } from "../model/recent-pages";

/** One recent row's height in px; the list reserves five of them so an arriving page moves nothing. */
const RECENT_ROW_PX = 52;

function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function formatOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1) : "";
}

/**
 * The five pages with the latest recorded date, newest first, each with the source it came from; a
 * press opens the page. Before any page exists the space says what a wiki page is and what the write
 * button does, in three plain steps (`firstSource` names the first file the button would send).
 */
export function RecentlyWritten({
  recent,
  dayText,
  sourceExists,
  onOpenPage,
  firstStep,
  reserve,
  t,
}: {
  recent: RecentPages;
  dayText: (day: number) => string;
  sourceExists: (path: string) => boolean;
  onOpenPage: (slug: string) => void;
  /** The write button's label, when the app can press it; null on the web. */
  firstStep: string | null;
  /** Keep five rows of height while pages may still arrive. */
  reserve: boolean;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  const { pages, anyPage } = recent;
  return (
    <section aria-labelledby="sources-recent-title" data-testid="sources-recent" className="mt-6 flex-none">
      <div className="flex items-baseline gap-2.5 border-b border-[color:var(--color-divider)] px-4 pb-2">
        <h3 id="sources-recent-title" className="text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
          {t("sourcesHome.recent.title")}
        </h3>
        <span className="text-label leading-label text-[color:var(--color-text-tertiary)]">{t("sourcesHome.recent.order")}</span>
      </div>
      {pages.length > 0 || reserve ? (
        <ol className="flex flex-col" style={{ minHeight: reserve ? RECENT_PAGE_COUNT * RECENT_ROW_PX : undefined }}>
          {pages.map(({ page, day }) => {
            const [source] = page.sourcePaths;
            const more = Math.max(0, page.sourcePaths.length - 1);
            const missing = source !== undefined && !sourceExists(source);
            return (
              <li key={page.slug}>
                <button
                  type="button"
                  data-testid="sources-recent-row"
                  onClick={() => onOpenPage(page.slug)}
                  className="flex h-13 w-full min-w-0 items-center gap-3.5 rounded-card px-4 text-left transition-colors hover:bg-[color:var(--color-overlay-1)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--color-indigo-focus-ring)]"
                >
                  <Sheet variant="page" name={page.title} format={source !== undefined ? formatOf(fileName(source)) : null} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span title={page.title} className="truncate text-body-lg leading-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
                      {page.title}
                    </span>
                    <span className="flex min-w-0 items-baseline gap-1.5 text-body leading-body text-[color:var(--color-text-tertiary)]">
                      {source !== undefined ? (
                        <>
                          <span title={missing ? t("wikiReader.sourceMissing") : source} className={cn("min-w-0 truncate", missing && "line-through")}>
                            {t("sourcesHome.recent.from", { source: fileName(source), more })}
                          </span>
                          <span aria-hidden className="flex-none">·</span>
                        </>
                      ) : null}
                      <span data-testid="sources-recent-day" className="flex-none tabular-nums">{dayText(day)}</span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      ) : anyPage ? (
        <p className="px-4 py-4 text-body leading-body text-[color:var(--color-text-tertiary)]">{t("sourcesHome.recent.empty")}</p>
      ) : firstStep !== null ? (
        <FirstPageSteps action={firstStep} t={t} />
      ) : (
        <p className="max-w-[62ch] px-4 py-4 text-body leading-body text-[color:var(--color-text-tertiary)]">{t("sourcesHome.recent.none")}</p>
      )}
    </section>
  );
}

/** Three steps side by side: the press, the agent reading, and the page that lands here. */
function FirstPageSteps({ action, t }: { action: string; t: ReturnType<typeof useTranslations<"library">> }) {
  const steps = [
    { Icon: Sparkles, text: t("sourcesHome.recent.steps.press", { action }) },
    { Icon: FileText, text: t("sourcesHome.recent.steps.read") },
    { Icon: BookOpen, text: t("sourcesHome.recent.steps.write") },
  ];
  return (
    <ol data-testid="sources-recent-steps" className="grid grid-cols-3 gap-x-6 px-4 pt-7">
      {steps.map(({ Icon, text }, i) => (
        <li key={i} className="flex min-w-0 flex-col gap-4">
          {/* The marker row joins each step to the next with a hairline, so the three read as one sequence. */}
          <span aria-hidden className="flex items-center gap-3 text-label leading-label tabular-nums text-[color:var(--color-text-tertiary)]">
            <span className="flex size-8 flex-none items-center justify-center rounded-full border border-[color:var(--color-border-strong)] bg-[color:var(--color-panel)] text-[color:var(--color-text-secondary)]">
              <Icon size={ICON_SIZE.lg} className={i === 2 ? "text-[color:var(--color-source-page)]" : undefined} />
            </span>
            {i + 1}
            {i < steps.length - 1 ? <span className="h-px flex-1 bg-[color:var(--color-divider)]" /> : null}
          </span>
          <p className="max-w-[34ch] text-body-lg leading-body-lg text-pretty text-[color:var(--color-text-secondary)]">{text}</p>
        </li>
      ))}
    </ol>
  );
}
