"use client";

import type { useTranslations } from "next-intl";

import { FileText } from "lucide-react";

import type { LibraryOriginalLink, VaultDoc } from "@/entities/docs-vault";
import { Chip } from "@/shared/ui";
import { controlClass } from "@/shared/ui/control-class";
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
 * **The source chips are the reason it is a header and not a caption.** The whole promise
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
 * its name**, and several keep the chip list under the same words, because a list of four
 * files cannot be one button without hiding three of them.
 *
 * A citation naming a file that is **not in this folder** is drawn as text rather than a
 * chip. Pressing it would open a pane about nothing, and a door that leads nowhere is
 * worse than a fact stated plainly.
 */
export function WikiPageHeader({
  doc,
  originals,
  onOpenSource,
  t,
}: {
  doc: VaultDoc;
  /** The sources this page cites, resolved against the folder by `buildLibraryPairing`. */
  originals: readonly LibraryOriginalLink[];
  onOpenSource: (path: string) => void;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  const frontmatter = doc.frontmatter as Record<string, unknown>;
  const createdBy = typeof frontmatter.created_by === "string" ? frontmatter.created_by : null;
  const status = typeof frontmatter.status === "string" ? frontmatter.status : null;
  const only = originals.length === 1 ? originals[0] : null;

  return (
    <header
      data-testid="library-wiki-header"
      className="mx-auto w-full max-w-[760px] px-6 pt-8 md:px-10"
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
            <button
              type="button"
              onClick={() => onOpenSource(only.path)}
              data-testid={`library-wiki-source-${only.path}`}
              className={controlClass({
                shape: "chip",
                tone: "muted",
                className: "max-w-full gap-1.5",
              })}
            >
              <FileText size={ICON_SIZE.sm} aria-hidden />
              <span className="min-w-0 truncate">
                {t("wiki.viewOriginalOne", { name: only.name })}
              </span>
            </button>
          )}
        </div>
      ) : originals.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
            {t("wiki.viewOriginal")}
          </span>
          {originals.map((original) =>
            original.state === null ? (
              <span
                key={original.path}
                data-testid={`library-wiki-source-missing-${original.path}`}
                className="max-w-full truncate text-caption text-[color:var(--color-text-quaternary)] line-through"
              >
                {original.name}
              </span>
            ) : (
              <Chip
                key={original.path}
                tone="muted"
                data-testid={`library-wiki-source-${original.path}`}
                onClick={() => onOpenSource(original.path)}
                className="max-w-full hover:text-[color:var(--color-text-primary)]"
              >
                <span className="min-w-0 truncate">{original.name}</span>
              </Chip>
            ),
          )}
        </div>
      ) : null}
    </header>
  );
}
