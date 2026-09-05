"use client";

import type { useTranslations } from "next-intl";
import { BookText, FilePlus2, FileStack, FileText, Search, Sparkles } from "lucide-react";

import { formatSourceBytes, type LibrarySourceRow } from "@/entities/docs-vault";
import { cn } from "@/shared/lib/cn";
import { badgeClass } from "@/shared/ui/badge-class";
import { Chip, RowButton, Tooltip } from "@/shared/ui";
import { ICON_SIZE } from "@/shared/ui/icon-size";

import type { LibraryUiModel } from "../../lib/use-library-model";

/**
 * The library, above the graph tree: **Sources** and **Wiki**.
 *
 * A vault holds three kinds of file and only one is the graph (`docs/DECISIONS.md`,
 * 2026-09-05). The tree below this has always drawn the third kind. These two sections
 * draw the other two, and they sit here — under the review queue, above the tree —
 * because that is the order of the work: what a person brought in, what was made of it,
 * then what it became.
 *
 * **Sources is the only list in this sidebar whose rows are not documents.** A row is a
 * file Atlas has never opened: its name, its format, its size, and one word about
 * whether anybody has written it up. That last word is the whole reason the section
 * exists — a folder of PDFs with no state is a folder of PDFs.
 *
 * | State | Means | Why it reads that way |
 * |---|---|---|
 * | not compiled | no wiki page cites it | nothing is wrong; nobody has written it up |
 * | compiled | a page cites it and its sha256 still matches | the write-up describes *this* file |
 * | stale | the hashes disagree, or a page cites it with no hash | the write-up may describe an older file |
 * | checking | cited, hash recorded, not yet measured | a claim nothing has verified is not shown as verified |
 *
 * Only `stale` and `off-template` are coloured, and both use the warning tone the agent
 * files group already uses for an unresolved state. `compiled` earns the success tone
 * because it is a real completed state, and `not compiled` stays neutral: it is the
 * ordinary state of a document nobody has got to yet, and painting it as a problem would
 * make an untouched folder look broken.
 */

export interface LibrarySectionProps {
  model: LibraryUiModel;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  /** Opens a raw source: the browser hands the file over, the app reveals it in Finder. */
  onOpenSource: (row: LibrarySourceRow) => void;
  /** The one-click "add files" door. */
  onAddFiles: () => void;
  /** Proposes candidates from the open folder and any bound project root. */
  onFindDocuments: () => void;
  /** Starts one in-app agent turn that writes the pages. Absent when no agent can run. */
  onCompile: (() => void) | null;
  /**
   * What leaves this computer when Compile runs, stated beside the button that starts it.
   *
   * The coding agent talks to its own provider; Atlas is not in the path and its transfer
   * log does not record it (`.claude/rules/local-first.md`: ACP is a separate provider
   * boundary and `llm-audit.jsonl` must not be claimed to cover it). Null when no agent
   * can run, because there is then nothing to disclose.
   */
  transferNote: string | null;
  /** How the drop hint names the folder — an absolute path in the app, the name on web. */
  vaultLabel: string;
  busy: boolean;
  t: ReturnType<typeof useTranslations<"docsLibrary">>;
}

/**
 * **The eyebrow keeps its own line** (measured 2026-09-05).
 *
 * The first build put the label and both action chips on one row. At the sidebar's 280px
 * the two chips took the width and the eyebrow truncated to `SO…` — the section lost its
 * name to its buttons. Actions therefore sit on a second row, where both keep their
 * words: an icon-only pair would have fitted, but these two are a brand-new capability
 * and a tooltip is not a label a person finds before they need it.
 */
function SectionHeader({
  icon,
  label,
  actions,
}: {
  icon: React.ReactNode;
  label: string;
  actions?: React.ReactNode;
}) {
  return (
    <>
      <div className="flex items-center gap-1.5 px-3 pb-1.5 pt-3">
        {icon}
        <span className="min-w-0 flex-1 truncate font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]">
          {label}
        </span>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-1 px-3 pb-2">{actions}</div> : null}
    </>
  );
}

/**
 * One state word. Geometry comes from the badge primitive; the colour is this site's own
 * verdict, which is the split `badge-class.ts` documents in its own header.
 */
function StateBadge({
  tone,
  children,
  testId,
}: {
  tone: "neutral" | "warning" | "success";
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <span
      data-testid={testId}
      className={badgeClass({
        shape: "micro",
        className: cn(
          "flex-none border",
          tone === "warning" &&
            "border-[color:var(--color-amber-source-a35)] bg-[color:var(--color-amber-source-a12)] text-[color:var(--color-amber-source-a90)]",
          tone === "success" &&
            "border-[color:var(--color-success-a35)] bg-[color:var(--color-success-a12)] text-[color:var(--color-success-text-a90)]",
          tone === "neutral" &&
            "border-[color:var(--color-border-soft)] text-[color:var(--color-text-quaternary)]",
        ),
      })}
    >
      {children}
    </span>
  );
}

export function LibrarySection({
  model,
  selectedSlug,
  onSelect,
  onOpenSource,
  onAddFiles,
  onFindDocuments,
  onCompile,
  transferNote,
  vaultLabel,
  busy,
  t,
}: LibrarySectionProps) {
  const hasSources = model.sources.length > 0;
  const hasWiki = model.wikiPages.length > 0;
  // Nothing to say and nothing to do would still be worth drawing once — this is the
  // only place that explains where project documents go — so the section stays, and its
  // empty state carries the two doors rather than a sentence about absence.
  const stateTone = {
    "not-compiled": "neutral",
    compiled: "success",
    stale: "warning",
    checking: "neutral",
  } as const;

  return (
    <>
      <section
        data-testid="docs-library-sources"
        className="flex-none border-b border-[color:var(--color-overlay-2)] pb-1"
      >
        <SectionHeader
          icon={
            <FileStack
              size={ICON_SIZE.sm}
              className="flex-none text-[color:var(--color-text-quaternary)]"
              aria-hidden
            />
          }
          label={t("sources.header", { count: model.sources.length })}
          actions={
            <>
              <Tooltip content={t("sources.addTooltip")}>
                <Chip
                  data-testid="docs-library-add-files"
                  onClick={onAddFiles}
                  disabled={busy}
                  tone="muted"
                  className="flex-none hover:text-[color:var(--color-text-primary)]"
                  aria-label={t("sources.addTooltip")}
                >
                  <FilePlus2 size={ICON_SIZE.sm} aria-hidden />
                  <span className="min-w-0 truncate">{t("sources.add")}</span>
                </Chip>
              </Tooltip>
              <Tooltip content={t("sources.findTooltip")}>
                <Chip
                  data-testid="docs-library-find-documents"
                  onClick={onFindDocuments}
                  disabled={busy}
                  tone="muted"
                  className="flex-none hover:text-[color:var(--color-text-primary)]"
                  aria-label={t("sources.findTooltip")}
                >
                  <Search size={ICON_SIZE.sm} aria-hidden />
                  <span className="min-w-0 truncate">{t("sources.find")}</span>
                </Chip>
              </Tooltip>
            </>
          }
        />

        {hasSources ? (
          <>
            <ul
              data-testid="docs-library-source-list"
              aria-label={t("sources.listAria")}
              className="flex max-h-[26vh] flex-col gap-0.5 overflow-auto px-2"
            >
              {model.sources.map((row) => (
                <li key={row.path}>
                  <RowButton
                    data-testid={`docs-library-source-${row.path}`}
                    onClick={() => onOpenSource(row)}
                    // The full name first: a 280px column truncates, and the row's own
                    // hover text is the only place the rest of the name exists.
                    title={`${row.name}\n${t(`sources.state.${row.state}.hint`, {
                      pages: row.citedBy.join(", ") || t("sources.state.nobody"),
                    })}`}
                    className="group relative hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)]"
                  >
                    {/* The same leading glyph the tree, pinned and recent rows carry, so
                        the sidebar keeps one left edge from top to bottom. */}
                    <FileText size={ICON_SIZE.sm} className="flex-none opacity-60" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{row.name}</span>
                    {/* Format and size are the two facts a directory listing already
                        holds, and the reason the row can exist without opening the file. */}
                    <span className="flex-none font-mono text-caption tabular-nums text-[color:var(--color-text-quaternary)]">
                      {row.format ? row.format.toUpperCase() : t("sources.noFormat")} ·{" "}
                      {formatSourceBytes(row.bytes)}
                    </span>
                    <StateBadge
                      tone={stateTone[row.state]}
                      testId={`docs-library-source-state-${row.state}`}
                    >
                      {t(`sources.state.${row.state}.label`)}
                    </StateBadge>
                  </RowButton>
                </li>
              ))}
            </ul>
            {model.needsCompileCount > 0 ? (
              <p
                data-testid="docs-library-needs-compile"
                className="px-3 pt-1 text-caption text-[color:var(--color-text-quaternary)]"
              >
                {t("sources.needsCompile", { count: model.needsCompileCount })}
              </p>
            ) : null}
          </>
        ) : (
          <p
            data-testid="docs-library-sources-empty"
            className="px-3 pb-1 text-caption text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
          >
            {t("sources.empty")}
          </p>
        )}
        {/* The folder is the interface. Saying so is not a footnote: a person who drags a
            file in and sees the list change has learned that this is their folder, which
            no button teaches. */}
        <p className="px-3 pb-1 pt-1 text-caption text-[color:var(--color-text-quaternary)] [word-break:keep-all]">
          {t("sources.dropHint", { folder: vaultLabel })}
        </p>
      </section>

      <section
        data-testid="docs-library-wiki"
        className="flex-none border-b border-[color:var(--color-overlay-2)] pb-1"
      >
        <SectionHeader
          icon={
            <BookText
              size={ICON_SIZE.sm}
              className="flex-none text-[color:var(--color-text-quaternary)]"
              aria-hidden
            />
          }
          label={t("wiki.header", { count: model.wikiPages.length })}
          actions={
            onCompile ? (
              <Tooltip content={t("wiki.compileTooltip")}>
                <Chip
                  data-testid="docs-library-compile"
                  onClick={onCompile}
                  disabled={busy || model.needsCompileCount === 0}
                  tone="muted"
                  className="flex-none hover:text-[color:var(--color-text-primary)]"
                  aria-label={t("wiki.compileTooltip")}
                >
                  <Sparkles size={ICON_SIZE.sm} aria-hidden />
                  <span className="min-w-0 truncate">{t("wiki.compile")}</span>
                </Chip>
              </Tooltip>
            ) : null
          }
        />

        {hasWiki ? (
          <ul
            data-testid="docs-library-wiki-list"
            aria-label={t("wiki.listAria")}
            className="flex max-h-[26vh] flex-col gap-0.5 overflow-auto px-2"
          >
            {model.wikiPages.map((page) => {
              const active = page.slug === selectedSlug;
              const verdict = model.verdicts.get(page.slug);
              return (
                <li key={page.slug}>
                  <RowButton
                    active={active}
                    aria-current={active ? "true" : undefined}
                    data-testid={`docs-library-wiki-${page.slug}`}
                    onClick={() => onSelect(page.slug)}
                    className="group relative hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)]"
                  >
                    <BookText size={ICON_SIZE.sm} className="flex-none opacity-60" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{page.title}</span>
                    <span className="flex-none font-mono text-caption text-[color:var(--color-text-quaternary)]">
                      {page.createdBy ?? t("wiki.unknownAuthor")}
                    </span>
                    {verdict && !verdict.ok ? (
                      // The problem code, not a paraphrase. It is what `wiki-validate`
                      // prints and what an agent branches on, so one word means one
                      // thing on every surface.
                      <StateBadge tone="warning" testId="docs-library-wiki-off-template">
                        {verdict.firstProblem ?? t("wiki.offTemplate")}
                      </StateBadge>
                    ) : null}
                  </RowButton>
                </li>
              );
            })}
          </ul>
        ) : (
          <p
            data-testid="docs-library-wiki-empty"
            className="px-3 pb-1 text-caption text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
          >
            {t("wiki.empty")}
          </p>
        )}
        {transferNote ? (
          <p
            data-testid="docs-library-transfer"
            className="px-3 pb-1 text-caption text-[color:var(--color-text-quaternary)] [word-break:keep-all]"
          >
            {transferNote}
          </p>
        ) : null}
        {model.offTemplateCount > 0 ? (
          <p
            data-testid="docs-library-off-template-count"
            className="px-3 pt-1 text-caption text-[color:var(--color-text-quaternary)]"
          >
            {t("wiki.offTemplateCount", { count: model.offTemplateCount })}
          </p>
        ) : null}
      </section>
    </>
  );
}
