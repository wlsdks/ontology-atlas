"use client";

import type { useTranslations } from "next-intl";

import { FileText } from "lucide-react";

import type { LibraryOriginalLink, VaultDoc } from "@/entities/docs-vault";
import { Chip, RowButton } from "@/shared/ui";
import { Disclosure } from "@/shared/ui/controls/disclosure";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import { wikiStatusLabel, writerLabel } from "../../lib/writer-label";

/**
 * Names the open page, its writer, status and cited sources. A cited file not in this folder is
 * drawn as text, not a door, since a press would open a pane about nothing.
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
  const frontmatter = doc.frontmatter as Record<string, unknown>;
  const createdBy = typeof frontmatter.created_by === "string" ? frontmatter.created_by : null;
  const status = typeof frontmatter.status === "string" ? frontmatter.status : null;
  const only = originals.length === 1 ? originals[0] : null;

  /*
   * `pb-2` gives the byline room below; `compactTop` keeps a tight top so a retained answer's Summary
   * stays above 45% of the 1040x720 window (`library-answer-comparison-rows.spec.ts`).
   */
  return (
    <header
      data-testid="library-wiki-header"
      className={`mx-auto w-full max-w-[var(--measure-doc-column)] px-6 md:px-10 ${compactTop ? "pt-3" : "pb-2 pt-8"}`}
    >
      <h2 className="text-display font-[var(--font-weight-signature)] tracking-[var(--tracking-card)] text-[color:var(--color-text-primary)]">
        {doc.title}
      </h2>
      {/* Words, not identifiers: `agent:claude · reviewed` is the file's vocabulary; the
          reader gets the runtime's name and the status in their own language. */}
      <p className="mt-2 text-label leading-label text-[color:var(--color-text-tertiary)]">
        {t("wiki.writtenBy", { author: writerLabel(createdBy, t) })}
        {wikiStatusLabel(status, t) ? ` · ${wikiStatusLabel(status, t)}` : ""}
      </p>
      {only && only.state === null && missingOriginalNamedBelow ? null : only ? (
        <div className="mt-3">
          {only.state === null ? (
            <p
              data-testid="library-wiki-original-missing"
              className="text-caption leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all] [overflow-wrap:anywhere]"
            >
              {t("wiki.originalMissing", { name: only.name })}
            </p>
          ) : (
            <RowButton
              onClick={() => onOpenSource(only.path)}
              data-testid={`library-wiki-source-${only.path}`}
              tone="muted"
              className="hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)]"
            >
              <FileText size={ICON_SIZE.sm} className="flex-none opacity-60" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                {t("wiki.viewOriginalOne", { name: only.name })}
              </span>
            </RowButton>
          )}
        </div>
      ) : originals.length > 0 ? (
        /* Several originals fold into a `Disclosure` so the Summary stays above the fold. */
        <Disclosure
          className="mt-3"
          summaryTestId="library-wiki-originals"
          summary={t("wiki.viewOriginalCount", { count: originals.length })}
        >
          <ul className="mt-1.5 flex flex-wrap items-center gap-1 pl-5">
            {originals.map((original) => (
              <li key={original.path} className="min-w-0 max-w-full">
                {original.state === null ? (
                  <span
                    data-testid={`library-wiki-source-missing-${original.path}`}
                    className="block max-w-full truncate px-2 py-1 text-caption text-[color:var(--color-text-quaternary)] line-through"
                  >
                    {original.name}
                  </span>
                ) : (
                  <Chip
                    tone="muted"
                    hoverInk="strong"
                    data-testid={`library-wiki-source-${original.path}`}
                    onClick={() => onOpenSource(original.path)}
                    className="max-w-full"
                  >
                    <FileText size={ICON_SIZE.sm} className="flex-none opacity-60" aria-hidden />
                    <span className="min-w-0 truncate">{original.name}</span>
                  </Chip>
                )}
              </li>
            ))}
          </ul>
        </Disclosure>
      ) : null}
    </header>
  );
}
