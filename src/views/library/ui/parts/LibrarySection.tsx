"use client";

import type { ReactNode } from "react";
import type { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { BookText, Check, FilePlus2, FileStack, FileText, Search, Sparkles } from "lucide-react";

import { formatSourceBytes, type LibrarySourceRow } from "@/entities/docs-vault";
import { cn } from "@/shared/lib/cn";
import { badgeClass } from "@/shared/ui/badge-class";
import { writerLabel } from "../../lib/writer-label";
import { controlClass } from "@/shared/ui/control-class";
import { Chip, RowButton, Tooltip } from "@/shared/ui";
import { ICON_SIZE } from "@/shared/ui/icon-size";

import type { LibraryUiModel } from "../../lib/use-library-model";

/**
 * The library's index: **Sources** and **Wiki**, in one column that scrolls once.
 *
 * A vault holds three kinds of file and only one is the graph (`docs/DECISIONS.md`,
 * 2026-09-05). Docs draws the third kind; these two sections draw the other two, in the
 * order of the work — what a person brought in, then what was made of it.
 *
 * ## Why it is one scroller (owner, 2026-09-06)
 *
 * > *"I don't like this left panel being split into a top and a bottom like this and drawn
 * > oddly either. Improve it!"*
 *
 * It was two boxes that scrolled independently inside a 280px column, each with its own
 * overflow. The consequences were all measurable on the frame the owner sent, a folder of
 * seven sources and seven pages: whichever list was longer was **cut mid-row**, so the
 * bottom of the column showed half a file name; the two halves moved past each other when
 * either was scrolled, which is what makes a single column read as two panes; and the
 * transfer sentence was pinned under the cut, at the very bottom of a list that was still
 * going.
 *
 * So the column scrolls once — `LibraryPage` owns that scroller — and the two sections
 * stand at their natural height inside it. What replaces the boxes is a **sticky section
 * head**: the eyebrow with its count stays at the top of the scroller while its own rows
 * pass under it, so the answer to "which list am I in" is on screen without a border
 * dividing the column into halves.
 *
 * ⚠️ This also retires the `lg` / below-`lg` split. The narrow layout had already been
 * forced onto one scroller in 2026-09-06 (two lists in half a phone measured 30px and
 * **zero**); the same reasoning was always true of 280px, and keeping two answers meant
 * the width decided how the screen behaved.
 *
 * **Sources is the only list here whose rows are not documents.** A row is a file Atlas
 * has never opened: its name, its format, its size, and one word about whether anybody has
 * written it up. That last word is the whole reason the section exists — a folder of PDFs
 * with no state is a folder of PDFs.
 *
 * | State | Means | How it is drawn |
 * |---|---|---|
 * | not compiled | no wiki page cites it | a quiet chip: it is work still to do |
 * | compiled | a page cites it and its sha256 still matches | a **check**, no chip |
 * | stale | the hashes disagree, or a page cites it with no hash | an amber chip: it needs attention |
 * | checking | cited, hash recorded, not yet measured | a quiet word; a claim nothing has verified is not shown as verified |
 *
 * ⚠️ **`compiled` lost its chip on 2026-09-06** and that is the point of the table. It
 * carried the success tone, and on the owner's folder every one of seven rows wore the
 * same green pill — a badge that never varies is not a state, it is a texture, and it was
 * the loudest thing in the column. A chip is now spent only where a person can act:
 * stale, off-template, not yet written up. Success is a check in the row's own ink.
 */

export interface LibrarySectionProps {
  model: LibraryUiModel;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  /** Opens a raw source: the browser hands the file over, the app reveals it in Finder. */
  onOpenSource: (row: LibrarySourceRow) => void;
  /**
   * The source the reader is showing, if any.
   *
   * Measured 2026-09-06 (design-interaction): a selected source row was byte-identical to
   * a resting one — same ink, no fill, no `aria-current` — while the reader beside it was
   * showing that very file.
   */
  selectedSourcePath: string | null;
  /** The one-click "add files" door. */
  onAddFiles: () => void;
  /** Proposes candidates from the open folder and any bound project root. */
  onFindDocuments: () => void;
  /** Starts one in-app agent turn that writes the pages. Absent when no agent can run. */
  onCompile: (() => void) | null;
  /**
   * The brain picker, when this computer offers two and Compile can therefore be pointed
   * at either. Null draws nothing: with one brain there is no choice to make.
   */
  brainControl?: ReactNode;
  /**
   * **One caption under the Compile button, and only one** (2026-09-06).
   *
   * The column used to end with the transfer sentence, pinned under a cut-off list, three
   * hundred pixels from the button it described. The rule that replaces it is the one
   * `.claude/rules/local-first.md` actually asks for: the disclosure sits where Compile can
   * be pressed. So this slot carries whichever single fact is true of pressing it here —
   * the reason it cannot run, or what leaves this computer when it does — and it is empty
   * while the guide is open, because step two is then the surface a person is reading and
   * exactly one of the two may print it.
   */
  compileNote: string | null;
  busy: boolean;
  t: ReturnType<typeof useTranslations<"library">>;
}

/**
 * **The eyebrow keeps its own line, and now it stays put** (2026-09-05, 2026-09-06).
 *
 * The first build put the label and both action chips on one row. At the column's 280px
 * the two chips took the width and the eyebrow truncated to `SO…` — the section lost its
 * name to its buttons. Actions therefore sit on a second row.
 *
 * `sticky` is on the label row alone. It is 28px, it is the only part that answers "which
 * list is this", and pinning the action rows as well would put a 68px lid over a 280px
 * column. The actions scroll away under an opaque head; the head is `--color-panel`, which
 * is the aside's own ground, so nothing shows through it.
 */
function SectionHeader({
  icon,
  label,
  actions,
}: {
  icon: ReactNode;
  label: string;
  actions?: ReactNode;
}) {
  return (
    <>
      <div className="sticky top-0 z-10 flex items-center gap-1.5 bg-[color:var(--color-panel)] px-3 pb-1.5 pt-3">
        {icon}
        <span className="min-w-0 flex-1 truncate font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]">
          {label}
        </span>
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-1 px-3 pb-2">{actions}</div>
      ) : null}
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
  tone: "neutral" | "warning";
  children: ReactNode;
  testId?: string;
}) {
  return (
    <span
      data-testid={testId}
      className={badgeClass({
        shape: "micro",
        className: cn(
          "flex-none border",
          tone === "warning"
            ? "border-[color:var(--color-amber-source-a35)] bg-[color:var(--color-amber-source-a12)] text-[color:var(--color-amber-source-a90)]"
            : "border-[color:var(--color-border-soft)] text-[color:var(--color-text-quaternary)]",
        ),
      })}
    >
      {children}
    </span>
  );
}

/** One line of counting under a list. `text-caption`, because it is a footnote to rows. */
function ListNote({ testId, children }: { testId: string; children: ReactNode }) {
  return (
    <p
      data-testid={testId}
      className="px-3 pt-1 text-caption leading-body text-[color:var(--color-text-quaternary)] [word-break:keep-all]"
    >
      {children}
    </p>
  );
}

export function LibrarySection({
  model,
  selectedSlug,
  onSelect,
  onOpenSource,
  selectedSourcePath,
  onAddFiles,
  onFindDocuments,
  onCompile,
  brainControl,
  compileNote,
  busy,
  t,
}: LibrarySectionProps) {
  const hasSources = model.sources.length > 0;
  const hasWiki = model.wikiPages.length > 0;

  return (
    <>
      {/* No `min-h-0` and no overflow: the column above owns the one scroller, and a
          section that could shrink is a section that can cut a row in half. */}
      <section data-testid="library-sources" className="flex flex-col pb-1">
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
                  data-testid="library-add-files"
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
                  data-testid="library-find-documents"
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
              data-testid="library-source-list"
              aria-label={t("sources.listAria")}
              className="flex flex-col gap-0.5 px-2"
            >
              {model.sources.map((row) => {
                const active = row.path === selectedSourcePath;
                const stateLabel = t(`sources.state.${row.state}.label`);
                return (
                  <li key={row.path}>
                    <RowButton
                      active={active}
                      aria-current={active ? "true" : undefined}
                      data-testid={`library-source-${row.path}`}
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
                      {row.state === "compiled" ? (
                        /*
                         * A check, not a pill. The word is still announced — the glyph is
                         * `aria-hidden` and the label rides with it in `sr-only`, so a
                         * screen reader hears "compiled" exactly as it did before, while
                         * the eye is left to find the rows that are **not** done.
                         */
                        <span
                          data-testid="library-source-state-compiled"
                          className="flex flex-none items-center text-[color:var(--color-text-quaternary)]"
                        >
                          <Check size={ICON_SIZE.sm} aria-hidden />
                          <span className="sr-only">{stateLabel}</span>
                        </span>
                      ) : row.state === "checking" ? (
                        <span
                          data-testid="library-source-state-checking"
                          className="flex-none text-caption text-[color:var(--color-text-quaternary)]"
                        >
                          {stateLabel}
                        </span>
                      ) : (
                        <StateBadge
                          tone={row.state === "stale" ? "warning" : "neutral"}
                          testId={`library-source-state-${row.state}`}
                        >
                          {stateLabel}
                        </StateBadge>
                      )}
                    </RowButton>
                  </li>
                );
              })}
            </ul>
            {model.needsCompileCount > 0 ? (
              <ListNote testId="library-needs-compile">
                {model.staleCount > 0 && model.notCompiledCount > 0
                  ? t("sources.needsCompileSplit", {
                      notCompiled: model.notCompiledCount,
                      stale: model.staleCount,
                    })
                  : model.staleCount > 0
                    ? t("sources.staleOnly", { count: model.staleCount })
                    : t("sources.needsCompile", { count: model.notCompiledCount })}
              </ListNote>
            ) : null}
          </>
        ) : (
          <p
            data-testid="library-sources-empty"
            className="px-3 pb-1 text-caption leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
          >
            {t("sources.empty")}
          </p>
        )}
      </section>

      <section data-testid="library-wiki" className="flex flex-col pb-1">
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
              <>
                <Tooltip content={t("wiki.compileTooltip")}>
                  <Chip
                    data-testid="library-compile"
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
                {/* The picker sits in the action row rather than on a line of its own: it
                    is what the button beside it will run on, and a control on its own row
                    reads as a setting rather than as part of the press. */}
                {brainControl ? (
                  <span data-testid="library-brain-control" className="min-w-0 flex-1">
                    {brainControl}
                  </span>
                ) : null}
              </>
            ) : null
          }
        />

        {/*
          **Compile is app-only, so the web says so instead of describing it.** The
          degradation grammar in `.claude/rules/surfaces.md`: why it is unavailable, where
          it works, and what still works here (the pages read and edit exactly as they do
          in the app). It is the same slot as `compileNote`, and only one can be true.
        */}
        {onCompile === null ? (
          <p
            data-testid="library-compile-web-limit"
            className="px-3 pb-1 text-label leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
          >
            {t("wiki.compileWebLimit")}{" "}
            <Link
              href="/download"
              data-testid="library-compile-web-get-app"
              className={controlClass({
                shape: "link",
                hoverInk: "strong",
                className: "rounded-chip px-1.5 py-0.5",
              })}
            >
              {t("wiki.compileWebGetApp")}
            </Link>
          </p>
        ) : compileNote ? (
          <p
            data-testid="library-transfer"
            className="px-3 pb-1 text-label leading-body text-[color:var(--color-text-quaternary)] [word-break:keep-all] [overflow-wrap:anywhere]"
          >
            {compileNote}
          </p>
        ) : null}

        {hasWiki ? (
          <>
            <ul
              data-testid="library-wiki-list"
              aria-label={t("wiki.listAria")}
              className="flex flex-col gap-0.5 px-2"
            >
              {model.wikiPages.map((page) => {
                const active = page.slug === selectedSlug;
                const verdict = model.verdicts.get(page.slug);
                const reason =
                  verdict && !verdict.ok && verdict.firstProblem
                    ? t("wiki.offTemplateReason", { code: verdict.firstProblem })
                    : undefined;
                return (
                  <li key={page.slug}>
                    <RowButton
                      active={active}
                      aria-current={active ? "true" : undefined}
                      data-testid={`library-wiki-${page.slug}`}
                      onClick={() => onSelect(page.slug)}
                      /*
                       * The pill says one fixed word; **which** rule the page missed lives
                       * here until the page's own block carries it on screen.
                       * `aria-description` rather than a bare title: a screen reader
                       * announces it with the row, so the reason is not reachable only by
                       * a pointer that hovers.
                       */
                      aria-description={reason}
                      title={reason}
                      className="group relative hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)]"
                    >
                      <BookText size={ICON_SIZE.sm} className="flex-none opacity-60" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{page.title}</span>
                      <span className="flex-none text-caption text-[color:var(--color-text-quaternary)]">
                        {writerLabel(page.createdBy, t)}
                      </span>
                      {verdict && !verdict.ok ? (
                        <StateBadge tone="warning" testId="library-wiki-off-template">
                          {t("wiki.offTemplate")}
                        </StateBadge>
                      ) : null}
                    </RowButton>
                  </li>
                );
              })}
            </ul>
            {model.offTemplateCount > 0 ? (
              <ListNote testId="library-off-template-count">
                {t("wiki.offTemplateCount", { count: model.offTemplateCount })}
              </ListNote>
            ) : null}
          </>
        ) : (
          <p
            data-testid="library-wiki-empty"
            className="px-3 pb-1 text-caption leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
          >
            {t("wiki.empty")}
          </p>
        )}
      </section>
    </>
  );
}
