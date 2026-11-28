import { controlClass } from "@/shared/ui";
import type { Lens } from "../../lib/document-follow";
import type { CopyTranslate } from "../../lib/translator";

const LENSES = ["concepts", "files"] as const;

/**
 * Concepts and Files are two views of one chosen step, so they are tabs; the history list has none,
 * since a tab there would hide repository state.
 */
export function CommitLensTabs({
  t,
  lens,
  onSelectLens,
  conceptCount,
  fileCount,
}: {
  t: CopyTranslate;
  lens: Lens;
  onSelectLens: (lens: Lens) => void;
  conceptCount: number;
  fileCount: number;
}) {
  return (
    <div
      role="tablist"
      aria-label={t("lensLabel")}
      className="flex flex-none items-center gap-1 border-b border-[color:var(--color-divider)] pl-1.5 pr-4"
    >
      {LENSES.map((id) => {
        const count = id === "concepts" ? conceptCount : fileCount;
        return (
          <button
            key={id}
            // eslint-disable-next-line no-restricted-syntax -- hand-built tabs not yet moved to TabBar
            role="tab"
            type="button"
            data-testid={`atlas-git-lens-${id}`}
            aria-selected={lens === id}
            disabled={count === 0}
            onClick={() => onSelectLens(id)}
            className={controlClass({ shape: "segment", size: "md", tone: "muted", className: "-mb-px min-h-9 gap-1.5 text-body rounded-none border-b-2 border-transparent px-2.5 hover:text-[color:var(--color-text-primary)] aria-selected:border-[color:var(--color-indigo-brand)] aria-selected:font-[var(--font-weight-signature)] aria-selected:text-[color:var(--color-text-primary)]" })}
          >
            {id === "concepts" ? t("changedConcepts") : t("changedFiles")}
            <b className="font-normal tabular-nums text-[color:var(--color-text-quaternary)]">{count}</b>
          </button>
        );
      })}
    </div>
  );
}
