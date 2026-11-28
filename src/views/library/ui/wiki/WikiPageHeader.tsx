import type { useTranslations } from "use-intl";

import { FileText } from "lucide-react";

import type { LibraryOriginalLink, VaultDoc } from "@/entities/docs-vault";
import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";

/**
 * The page's title, then one line of the sources it cites, each a press that opens it. A cited
 * file not in this folder is drawn as struck text, not a door, since a press would open a pane
 * about nothing. Who wrote the page and its state sit in the row above.
 */
export function WikiPageHeader({
  doc,
  originals,
  onOpenSource,
  compactTop = false,
  missingOriginalNamedBelow = false,
  t,
}: {
  doc: VaultDoc;
  /** The sources this page cites, resolved against the folder by `buildLibraryPairing`. */
  originals: readonly LibraryOriginalLink[];
  onOpenSource: (path: string) => void;
  /** Retained answers already sit below workspace and reader chrome. */
  compactTop?: boolean;
  /** Set when the problem card below already names the missing cited file; the header then omits it. */
  missingOriginalNamedBelow?: boolean;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  const shown = missingOriginalNamedBelow ? originals.filter((original) => original.state !== null) : originals;

  /*
   * `pb-2` gives the source line room below; `compactTop` keeps a tight top so a retained answer's
   * Summary stays above 45% of the 1040x720 window.
   */
  return (
    <header
      data-testid="library-wiki-header"
      className={`mx-auto w-full max-w-[var(--measure-doc-column)] px-6 md:px-10 ${compactTop ? "pt-3" : "pb-2 pt-8"}`}
    >
      <h2 className="text-display font-[var(--font-weight-signature)] tracking-[var(--tracking-card)] text-[color:var(--color-text-primary)] [overflow-wrap:anywhere]">
        {doc.title}
      </h2>
      {shown.length > 0 ? (
        <ul
          data-testid="library-wiki-sources"
          aria-label={t("wikiReader.citedSources")}
          className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-label leading-label"
        >
          {shown.map((original) => (
            <li key={original.path} className="min-w-0 max-w-full">
              {original.state === null ? (
                <span
                  data-testid={`library-wiki-source-missing-${original.path}`}
                  title={t("wiki.originalMissing", { name: original.name })}
                  className="inline-flex min-h-7 max-w-full items-center gap-1.5 text-[color:var(--color-text-tertiary)] line-through [overflow-wrap:anywhere]"
                >
                  <FileText size={ICON_SIZE.sm} className="flex-none opacity-60" aria-hidden />
                  {original.name}
                </span>
              ) : (
                <button
                  type="button"
                  data-testid={`library-wiki-source-${original.path}`}
                  title={original.path}
                  onClick={() => onOpenSource(original.path)}
                  className={controlClass({ shape: "link", tone: "muted", hoverInk: "strong", className: "min-h-7 max-w-full gap-1.5 [overflow-wrap:anywhere]" })}
                >
                  <FileText size={ICON_SIZE.sm} className="flex-none opacity-60" aria-hidden />
                  {original.name}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </header>
  );
}
