import type { useTranslations } from "use-intl";

import type { SourceCandidate } from "@/entities/docs-vault";
import { controlClass } from "@/shared/ui/control-class";
import { Sheet } from "@/shared/ui/marks/sheet";

type LibraryT = ReturnType<typeof useTranslations<"library">>;

/** At most this many sheets, two to a row; past it the dialog lists them all. */
export const SUGGESTION_SHEETS = 4;

/**
 * Files only a connected code folder holds: a quiet suggestion below the folder line, never the
 * lead, since a repository's files may be anything. All shown files are selected.
 */
export function FoundSuggestion({
  candidates,
  busy,
  onAdd,
  onHide,
  onSeeAll,
  t,
}: {
  candidates: readonly SourceCandidate[];
  busy: boolean;
  onAdd: (shown: SourceCandidate[]) => void;
  onHide: (shown: SourceCandidate[]) => void;
  onSeeAll: () => void;
  t: LibraryT;
}) {
  const shown = candidates.slice(0, SUGGESTION_SHEETS);
  const folders = [...new Set(candidates.map((candidate) => candidate.rootLabel))].join(", ");
  return (
    <section data-testid="library-found-suggestion" data-found-count={candidates.length} className="motion-stagger-fade flex w-full flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h2 className="text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-secondary)]">
          {t("start.found.title", { count: candidates.length, folders })}
        </h2>
        <span className="text-label text-[color:var(--color-text-tertiary)]">{t("start.found.basis")}</span>
      </div>
      <ul className="grid grid-cols-2 gap-2">
        {shown.map((candidate) => (
          <li
            key={`${candidate.rootPath}/${candidate.relativePath}`}
            className="flex h-16 min-w-0 items-center gap-3 rounded-card border border-[color:var(--color-border-soft)] px-3"
          >
            <Sheet variant="source" name={candidate.name} format={candidate.extension} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-body text-[color:var(--color-text-primary)]">{candidate.name.normalize("NFC")}</span>
              <span className="truncate text-label text-[color:var(--color-text-tertiary)]">{candidate.relativePath.normalize("NFC")}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onAdd(shown)}
          data-testid="library-found-suggestion-add"
          className={controlClass({ shape: "chip", size: "lg", tone: "strong", hoverSurface: "lift", hoverBorder: "strong" })}
        >
          {t("find.add", { count: shown.length })}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onHide(shown)}
          data-testid="library-found-suggestion-hide"
          className={controlClass({ shape: "chip", size: "lg", tone: "default", hoverInk: "strong", hoverBorder: "strong" })}
        >
          {t("start.found.hide")}
        </button>
        {candidates.length > SUGGESTION_SHEETS ? (
          <button
            type="button"
            onClick={onSeeAll}
            data-testid="library-found-suggestion-more"
            className={controlClass({ shape: "link", tone: "accent", hoverInk: "strong" })}
          >
            {t("start.found.more", { count: candidates.length })}
          </button>
        ) : null}
      </div>
    </section>
  );
}
