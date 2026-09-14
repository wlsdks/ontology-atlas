"use client";

import type { useTranslations } from "next-intl";

import { FileText } from "lucide-react";

import type { LibraryOriginalLink, VaultDoc } from "@/entities/docs-vault";
import { Chip, RowButton } from "@/shared/ui";
import { Disclosure } from "@/shared/ui/disclosure";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { wikiStatusLabel, writerLabel } from "../../lib/writer-label";

/**
 * **Which page is open, and what it was written from.**
 *
 * A wiki page carries no `kind:`, so none of the graph chrome Docs draws applies to it —
 * and the first build of this pane inherited that absence wholesale: the reader opened
 * straight into `## Summary` with nothing naming the file. A page whose body happens to
 * start with a heading looked identical to one that did not.
 *
 * The three facts here are the ones a wiki page's frontmatter is *required* to carry
 * (`wiki-page-schema`), so this is a rendering of the contract rather than a new one:
 * who wrote it, what state it is in, and which sources it stands on.
 *
 * **The source rows are the reason it is a header and not a caption.** The whole promise
 * of this destination is that a claim can be walked back to the file it came from; a
 * citation that only exists inside the body text as `[[src:…]]` is a promise a person has
 * to keep by hand. Pressing one opens that file's own pane, where its hash and its state
 * are.
 *
 * ## The crossing is named (owner, 2026-09-06)
 *
 * *"'view the original' and 'view the template-based write-up' must be separate."* They
 * were separate — two panes that never named each other. `Built from` labelled the
 * provenance and left the reader to guess that a chip was a door. So the control now says
 * what pressing it does: **one cited source becomes one "View original" button carrying
 * its name**, and several keep a list under the same words, because a list of four files
 * cannot be one button without hiding three of them.
 *
 * A citation naming a file that is **not in this folder** is drawn as text rather than a
 * door. Pressing it would open a pane about nothing, and a door that leads nowhere is
 * worse than a fact stated plainly.
 *
 * ## One step for one job (2026-09-06)
 *
 * These were 32px chips. The index's own rows open the very same file at 36px, and so does
 * `SourceSummary`'s `View write-up` list on the other side of the crossing, so one gesture
 * carried two heights depending on which pane a person happened to be in. All three are
 * now the `row` shape at its `md` step, which is what `.claude/rules/design.md` means by
 * one size step per role. Several sources became a vertical list for the same reason: a
 * wrapped chip cluster cannot line up with anything.
 */
export function WikiPageHeader({
  doc,
  originals,
  onOpenSource,
  compactTop = false,
  t,
}: {
  doc: VaultDoc;
  /** The sources this page cites, resolved against the folder by `buildLibraryPairing`. */
  originals: readonly LibraryOriginalLink[];
  onOpenSource: (path: string) => void;
  /** Retained answers already sit below workspace and reader chrome. */
  compactTop?: boolean;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  const frontmatter = doc.frontmatter as Record<string, unknown>;
  const createdBy = typeof frontmatter.created_by === "string" ? frontmatter.created_by : null;
  const status = typeof frontmatter.status === "string" ? frontmatter.status : null;
  const only = originals.length === 1 ? originals[0] : null;

  return (
    <header
      data-testid="library-wiki-header"
      className={`mx-auto w-full max-w-[var(--measure-doc-column)] px-6 md:px-10 ${compactTop ? "pt-3" : "pt-8"}`}
    >
      <h2 className="text-display font-[var(--font-weight-signature)] leading-title tracking-[var(--tracking-card)] text-[color:var(--color-text-primary)]">
        {doc.title}
      </h2>
      {/* Words, not identifiers: `agent:claude · reviewed` is the file's vocabulary; the
          reader gets the runtime's name and the status in their own language. */}
      <p className="mt-1.5 text-caption text-[color:var(--color-text-tertiary)]">
        {t("wiki.writtenBy", { author: writerLabel(createdBy, t) })}
        {wikiStatusLabel(status, t) ? ` · ${wikiStatusLabel(status, t)}` : ""}
      </p>
      {only ? (
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
        /*
         * Several originals fold (owner, 2026-09-07): six of them as full rows pushed the
         * Summary below the fold of the installed app, and the top of a page was a list
         * of file names nobody had asked to read. One closed line names the count; open,
         * the files are chips on a wrapping row, each still a press that opens the source.
         */
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
