"use client";

import type { useTranslations } from "next-intl";

import type { VaultDoc } from "@/entities/docs-vault";
import { Chip } from "@/shared/ui";

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
 */
export function WikiPageHeader({
  doc,
  onOpenSource,
  t,
}: {
  doc: VaultDoc;
  onOpenSource: (path: string) => void;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  const frontmatter = doc.frontmatter as Record<string, unknown>;
  const createdBy = typeof frontmatter.created_by === "string" ? frontmatter.created_by : null;
  const status = typeof frontmatter.status === "string" ? frontmatter.status : null;
  const sources = Array.isArray(frontmatter.sources)
    ? frontmatter.sources.filter((entry): entry is string => typeof entry === "string")
    : [];

  return (
    <header
      data-testid="library-wiki-header"
      className="mx-auto w-full max-w-[760px] px-6 pt-8 md:px-10"
    >
      <h2 className="text-display font-[var(--font-weight-signature)] leading-title tracking-[var(--tracking-card)] text-[color:var(--color-text-primary)]">
        {doc.title}
      </h2>
      <p className="mt-1.5 font-mono text-caption text-[color:var(--color-text-quaternary)]">
        {t("wiki.writtenBy", { author: createdBy ?? t("wiki.unknownAuthor") })}
        {status ? ` · ${status}` : ""}
      </p>
      {sources.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
            {t("wiki.builtFrom")}
          </span>
          {sources.map((path) => (
            <Chip
              key={path}
              tone="muted"
              data-testid={`library-wiki-source-${path}`}
              onClick={() => onOpenSource(path)}
              className="max-w-full hover:text-[color:var(--color-text-primary)]"
            >
              <span className="min-w-0 truncate">{path.replace(/^sources\//, "")}</span>
            </Chip>
          ))}
        </div>
      ) : null}
    </header>
  );
}
