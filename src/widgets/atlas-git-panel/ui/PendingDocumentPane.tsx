"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/shared/lib/cn";
import { useRovingRadioGroup } from "@/shared/lib/use-roving-radio-group";
import { OntologyMapKindGlyph } from "@/shared/ui/map-kind-glyph";
import { controlClass, Disclosure } from "@/shared/ui";
import { gitDocumentDiff, type GitChangeEntry } from "@/shared/lib/tauri-git";
import { parseUnifiedDiff, type AtlasGitDiffFile } from "@/shared/lib/atlas-git-record";

type Translator = (key: string, values?: Record<string, string | number>) => string;

/** One changed document as the pane names it: the git entry plus the concept it carries. */
export interface ChangedDocument {
  entry: GitChangeEntry;
  /** The concept's display name, or the document's file name when no concept matches. */
  label: string;
  kind: string | null;
}

/**
 * The uncommitted changes, **read as documents** (owner direction B, 2026-09-19).
 *
 * The right column used to be a git client's inside: a list grouped by kind with a group
 * label over a single row, a header repeating the left column's row, and a patch drawn as
 * `+`/`-` lines in a terminal face floating on the page ground. Owner: *"this is really
 * hard to look at"*, *"the design itself is poor"*. An ontology document is prose, and
 * what a person judges here is whether its meaning changed for the better — so the pane
 * now reads like the document itself: one header naming the concept, the changed documents
 * as a chip strip to switch between, the whole document in the reading face with the
 * changed lines marked in place, and the document's one destructive door at its foot.
 */
export function PendingDocumentPane({
  t,
  vaultPath,
  documents,
  others,
  summary,
  hunks,
  selectedPath,
  setSelectedPath,
  stagedOutsideCount,
  discard,
}: {
  t: Translator;
  vaultPath: string | null;
  documents: readonly ChangedDocument[];
  /** Files that carry no concept (`.gitignore`, config): committed too, listed after the documents. */
  others: readonly GitChangeEntry[];
  /** "1 added · 2 edited" — the one line of totals. */
  summary: string;
  /** The hunk diff already read for the whole vault; the reader's fallback when the whole document cannot be read. */
  hunks: readonly AtlasGitDiffFile[];
  selectedPath: string | null;
  setSelectedPath: (path: string | null) => void;
  stagedOutsideCount: number;
  /** The discard door for the shown document, or `null` when that door must not exist. */
  discard: (document: ChangedDocument) => React.ReactNode;
}) {
  const all = useMemo<ChangedDocument[]>(
    () => [
      ...documents,
      ...others.map((entry) => ({ entry, label: fileName(entry.path), kind: null })),
    ],
    [documents, others],
  );
  /*
   * Default: the first document whose lines changed. A newly created document has no lines
   * to compare, and opening on it would show a whole document with nothing marked — the
   * "empty pane nobody asked for" the old default already avoided.
   */
  const fallbackPath =
    all.find((doc) => (hunks.find((h) => h.path === doc.entry.path)?.lines.length ?? 0) > 0)?.entry.path ??
    all[0]?.entry.path ??
    null;
  const shownPath = selectedPath && all.some((doc) => doc.entry.path === selectedPath) ? selectedPath : fallbackPath;
  const shown = all.find((doc) => doc.entry.path === shownPath) ?? null;

  const group = useRovingRadioGroup({
    value: shownPath,
    values: all.map((doc) => doc.entry.path),
    onChange: (path) => setSelectedPath(path),
  });

  return (
    <div data-testid="atlas-git-pending-pane" className="flex min-h-0 flex-1 flex-col">
      <header
        data-testid="atlas-git-change-groups"
        className="flex flex-none flex-col gap-3 border-b border-[color:var(--color-divider)] px-5 py-4"
      >
        <p className="flex flex-wrap items-baseline gap-x-2 text-label text-[color:var(--color-text-secondary)]">
          <span>{summary}</span>
          {stagedOutsideCount > 0 ? (
            <span className="text-caption text-[color:var(--color-text-quaternary)]">
              {t("stagedOutsideNotice", { count: stagedOutsideCount })}
            </span>
          ) : null}
        </p>
        {all.length > 0 ? (
          <div {...group.groupProps} aria-label={t("changedDocsAria")} className="flex flex-wrap gap-1.5">
            {all.map((doc, index) => (
              <button
                key={doc.entry.path}
                {...group.itemProps(index)}
                type="button"
                data-testid="atlas-git-change-row"
                title={doc.entry.path}
                className={controlClass({
                  shape: "chip",
                  size: "md",
                  tone: "secondary",
                  active: shownPath === doc.entry.path,
                  hoverInk: "strong",
                  hoverBorder: "strong",
                  className: cn(shownPath !== doc.entry.path && "border-[color:var(--color-border-soft)]"),
                })}
              >
                <StatusGlyph status={doc.entry.status} />
                {doc.kind ? <OntologyMapKindGlyph kind={doc.kind} size={12} /> : null}
                <span className={cn(!doc.kind && "font-mono text-caption")}>{doc.label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </header>

      {shown ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {/*
           * The door rides in the reader's header, beside the path and the +/− counts.
           * Under the whole document it sat where nobody looks and read as a footnote
           * rather than a control (2026-09-21); the header is where the eye already is,
           * and it names the same document the counts do. Keyed by document, because an
           * armed confirm must not survive a chip change and re-aim at another document
           * (interaction seat, 2026-09-19).
           */}
          <DocumentChangeReader
            key={shown.entry.path}
            t={t}
            vaultPath={vaultPath}
            document={shown}
            fallback={hunks.find((h) => h.path === shown.entry.path) ?? null}
            action={discard(shown)}
          />
        </div>
      ) : null}
    </div>
  );
}

/** `+` new · `~` edited · `−` deleted · `→` renamed, the same marks the list has always used. */
function StatusGlyph({ status }: { status: string }) {
  const glyph = status === "added" ? "+" : status === "deleted" ? "−" : status === "renamed" ? "→" : "~";
  return (
    <span aria-hidden className="font-mono text-caption text-[color:var(--color-text-quaternary)]">
      {glyph}
    </span>
  );
}

function fileName(path: string): string {
  return path.split("/").pop() ?? path;
}

/**
 * One document, whole, in the reading face, with its changed lines marked where they are.
 *
 * git's unit is the line, so each source line is one block: a heading, a list item, a
 * paragraph, or a row of the frontmatter box. An added line sits on the success tint; a
 * removed line sits on the danger tint and is struck through, still readable — what was
 * taken away is part of the judgement. Unchanged lines wear the ordinary reading ink. No
 * `+`, no `-`, no monospace face for prose: the terminal grammar was the complaint.
 *
 * The whole document comes from `git_document_diff` (the file with its changes, every line
 * as context). When that read is unavailable (the web, a stub, a failed read) the hunk
 * diff already on screen is drawn instead, so the pane never goes blank.
 */
export function DocumentChangeReader({
  t,
  vaultPath,
  document,
  fallback,
  source,
  action = null,
}: {
  t: Translator;
  vaultPath: string | null;
  document: ChangedDocument;
  fallback: AtlasGitDiffFile | null;
  /** A commit hash to read that commit's change of the document; absent = uncommitted. */
  source?: string;
  /** This document's own door, drawn in the header beside its path and counts. */
  action?: React.ReactNode;
}) {
  const { entry, label, kind } = document;
  /*
   * `undefined` = not read yet, `null` = the whole document is unavailable (no folder, no
   * bridge, a refused read), otherwise the document with its changes. Without a folder the
   * effect never runs and the fallback is drawn from the first render.
   */
  const [whole, setWhole] = useState<AtlasGitDiffFile | null | undefined>(undefined);
  /** The document is past the command's ceiling, so its hunks are what there is to draw. */
  const [tooLarge, setTooLarge] = useState(false);
  useEffect(() => {
    if (!vaultPath) return;
    let cancelled = false;
    void gitDocumentDiff(vaultPath, entry.path, source, entry.renamedFrom)
      .then((result) => {
        if (cancelled) return;
        setTooLarge(result?.tooLarge ?? false);
        const parsed = result && !result.tooLarge ? parseUnifiedDiff(result.diff)[0] ?? null : null;
        setWhole(parsed);
      })
      .catch(() => {
        if (!cancelled) {
          setTooLarge(false);
          setWhole(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [vaultPath, entry.path, entry.renamedFrom, source]);

  const file = whole ?? fallback;
  /*
   * Two different sentences, because they are two different facts: the document is longer
   * than one pane may carry, or this screen could not read it whole at all (the web, a
   * refused read). Either way what is drawn is the same hunks, and the header says which.
   */
  const longDocument = tooLarge && fallback !== null;
  const partial = !longDocument && (whole === null || !vaultPath) && fallback !== null;
  /*
   * Only a concept document is prose. A file that rides along in the commit — an ignore
   * file, a config — is characters, and reading it as Markdown misnames them: an ignore
   * file's first line is a comment (`# Serena MCP project cache`), and the prose reader drew
   * it as the document's title. Such a file has no front matter either; its leading `---`,
   * if any, is three hyphens.
   *
   * An empty kind is no kind (round four, 2026-09-25): a step's file entry can carry `""`
   * for a non-concept file, and `!== null` let `config/atlas.json` read as prose in the
   * document font, labelled "Edited document".
   */
  const isDocument = Boolean(kind);
  const { frontmatter, body, lines, frontmatterChanged, firstHeadingIndex } = useMemo(() => {
    const all = file?.lines ?? [];
    const split = isDocument ? splitFrontmatter(all) : { frontmatter: [] as Line[], body: [...all] };
    // The body's first heading repeats the header's name; drawn twice at the same size,
    // 280px apart, it was the pane's second mass (lead seat).
    const firstHeading = split.body.findIndex((line) => /^#{1,3}\s+/.test(line.text));
    return {
      ...split,
      lines: all,
      frontmatterChanged: split.frontmatter.some((line) => line.kind !== "context"),
      firstHeadingIndex: firstHeading,
    };
  }, [file, isDocument]);
  const added = file?.added ?? 0;
  const removed = file?.removed ?? 0;

  return (
    <article
      data-testid="atlas-git-diff-pre"
      /*
       * Focusable so a long document scrolls by keyboard and Tab from the chips lands on
       * the document before it lands on the destructive door (interaction seat). Below `xl`
       * the columns stack, and the reader keeps the evidence cap the old patch had.
       */
      tabIndex={0}
      aria-label={label}
      className="git-fade-in flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-focus-ring)]"
    >
      {/*
        One reading measure for the whole reader — header, door, box and body — left-anchored
        at every width (responsive seat): at 1920 the marked sentence ran ~145 characters
        across the column; `--measure-doc-column` is the measure the Library's documents read
        at. The header used to span the column while the text stopped at the measure, so the
        discard door stood 366px right of the last word it acted on (review 2026-09-25); now
        the door's right edge is the text's right edge.
      */}
      <div className="flex w-full max-w-[var(--measure-doc-column)] flex-col gap-4">
      <header className="flex flex-none flex-col gap-1">
        {/* The concept's name wins the pane (lead seat) when the pane is the uncommitted
            change: display size, so the largest thing here is the subject, not the metadata
            box. Inside a step the step's own headline holds the display step, and a document
            is one part of it, so its name steps down to a panel title (review 2026-09-25:
            two 23px headlines on one screen, and the selection was neither). */}
        <h2
          className={cn(
            "flex items-center gap-2 font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]",
            source ? "text-title" : "text-display",
          )}
        >
          {kind ? <OntologyMapKindGlyph kind={kind} size={source ? 14 : 16} /> : null}
          <span className="min-w-0 truncate">{label}</span>
        </h2>
        {/* The metadata line and this document's door share one row: the door acts on the
            document these counts describe, so it stands where they do. */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
        <p className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 font-mono text-caption text-[color:var(--color-text-quaternary)]">
          {/* The path, unless it is the name already shown above it — a file at the folder's
              root would otherwise read its own name twice, at two sizes, in two lines. */}
          {/* Inside a step the file chooser's highlighted row above already prints the path,
              so the reader does not print it a second time (round three, 2026-09-25). */}
          {entry.path === label || source ? null : <span className="min-w-0 break-all">{entry.path}</span>}
          <span className="text-[color:var(--color-text-tertiary)]">
            {t(statusKey(entry.status, isDocument))}
          </span>
          {/* A renamed document carries the name it had: "renamed" without it is half the fact. */}
          {entry.renamedFrom ? (
            <span className="min-w-0 break-all">{t("docReaderRenamedFrom", { path: entry.renamedFrom })}</span>
          ) : null}
          <span className="tabular-nums">
            <span className="text-[color:var(--color-success-text-a90)]">{`+${added}`}</span>{" "}
            <span className="text-[color:var(--color-danger-text)]">{`−${removed}`}</span>
          </span>

        </p>
        {action ? <div className="flex-none">{action}</div> : null}
        </div>
      </header>

      {lines.length === 0 ? (
        <p className="text-label leading-prose text-[color:var(--color-text-quaternary)]">{t("diffEmpty")}</p>
      ) : null}

      {/*
        What follows is a fragment, not the document, and that changes the meaning of every
        line below it — so it is said in the reader's own voice above the body, in the same
        cut grammar the skipped stretches use, rather than as a fourth token in the metadata
        line where it read as one more number (measured on screen, 2026-09-19).
      */}
      {longDocument || partial ? (
        <p
          data-testid="atlas-git-doc-fragment"
          className="flex items-center gap-2 text-caption leading-label text-[color:var(--color-text-quaternary)]"
        >
          <span aria-hidden className="w-4 border-t border-dashed border-[color:var(--color-border-strong)]" />
          <span className="min-w-0">{longDocument ? t("docReaderLong") : t("docReaderPartial")}</span>
          <span aria-hidden className="min-w-4 flex-1 border-t border-dashed border-[color:var(--color-border-strong)]" />
        </p>
      ) : null}
      {frontmatter.length > 0 ? (
        frontmatterChanged ? (
          <section
            data-testid="atlas-git-doc-frontmatter"
            className="flex flex-none flex-col rounded-[var(--radius-card)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] -mx-2 px-2 py-2 font-mono text-caption leading-label"
          >
            <p className="pb-1 text-[color:var(--color-text-quaternary)]">{t("docReaderInfoBox")}</p>
            {frontmatter.map((line, index) => (
              <p key={index} className={cn("whitespace-pre-wrap break-all -mx-1 px-1 text-[color:var(--color-text-tertiary)]", markClass(line.kind))}>
                <MarkLabel t={t} kind={line.kind} />
                {line.text}
              </p>
            ))}
          </section>
        ) : (
          /* Nothing in the front matter changed: one quiet line, opened on demand. Drawn
             as a bordered box it was the brightest, largest mass on the pane — the eye went
             to an unchanged uid before it found the one changed sentence (lead seat). */
          <Disclosure
            summary={t("docReaderInfoBoxUnchanged")}
            className="flex-none"
            data-testid="atlas-git-doc-frontmatter"
          >
            <div className="mt-1 flex flex-col font-mono text-caption leading-label text-[color:var(--color-text-tertiary)]">
              {frontmatter.map((line, index) => (
                <p key={index} className="whitespace-pre-wrap break-all px-1">{line.text}</p>
              ))}
            </div>
          </Disclosure>
        )
      ) : null}

      <div className="flex flex-col">
        {body.map((line, index) =>
          isDocument ? (
            <ProseLine key={index} t={t} line={line} hideHeadingText={index === firstHeadingIndex ? label : null} />
          ) : (
            <FileLine key={index} t={t} line={line} />
          ),
        )}
      </div>
      </div>
    </article>
  );
}

type Line = { kind: "added" | "removed" | "context" | "skip"; text: string };

/** What the reader is looking at, in the noun it deserves: a concept document, or a file. */
function statusKey(status: string, isDocument: boolean): string {
  const noun = isDocument ? "" : "File";
  if (status === "added") return `docReader${noun}New`;
  if (status === "deleted") return `docReader${noun}Deleted`;
  if (status === "renamed") return `docReader${noun}Renamed`;
  return `docReader${noun}Changed`;
}

/** The leading `---` block, when the document has one, kept apart as the information box. */
function splitFrontmatter(lines: readonly Line[]): { frontmatter: Line[]; body: Line[] } {
  if (lines.length === 0 || lines[0].text.trim() !== "---") return { frontmatter: [], body: [...lines] };
  const close = lines.findIndex((line, index) => index > 0 && line.text.trim() === "---");
  if (close === -1) return { frontmatter: [], body: [...lines] };
  return { frontmatter: lines.slice(1, close), body: lines.slice(close + 1) };
}

function markClass(kind: Line["kind"]): string {
  if (kind === "added") return "rounded-[var(--radius-micro)] bg-[color:var(--color-success-a12)]";
  if (kind === "removed")
    return "rounded-[var(--radius-micro)] bg-[color:var(--color-danger-a10)] line-through decoration-[color:var(--color-danger-text)]";
  return "";
}

function MarkLabel({ t, kind }: { t: Translator; kind: Line["kind"] }) {
  if (kind === "added") return <span className="sr-only">{t("docReaderAddedLine")} </span>;
  if (kind === "removed") return <span className="sr-only">{t("docReaderRemovedLine")} </span>;
  return null;
}

/**
 * The inline marks an ontology document actually carries, drawn rather than shown raw.
 *
 * Measured in the installed app on a real vault (2026-09-19): a document's body read
 * `**receive, install, attach**` and `` `/agents/` `` with the asterisks and backticks on
 * screen. A person judging a meaning should read the meaning, not its markup. Only the three
 * marks a vault document uses are handled — strong, code, and a link's text — and anything
 * else stays exactly as written, because a reader that guesses is worse than one that shows.
 */
function inlineMarkdown(text: string): React.ReactNode {
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]*\))/g;
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const piece = match[0];
    const key = `${at}`;
    if (piece.startsWith("**")) {
      out.push(
        <b key={key} className="font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
          {piece.slice(2, -2)}
        </b>,
      );
    } else if (piece.startsWith("`")) {
      out.push(
        <code key={key} className="rounded-[var(--radius-micro)] bg-[color:var(--color-overlay-1)] px-1 font-mono text-caption">
          {piece.slice(1, -1)}
        </code>,
      );
    } else if (piece.startsWith("[[")) {
      // A wikilink names another document; its target is a concern of the map, not of this
      // reader, so the name is what is drawn.
      out.push(
        <span key={key} className="text-[color:var(--color-text-primary)]">
          {(piece.slice(2, -2).split("|").pop() ?? "").trim()}
        </span>,
      );
    } else {
      const label = /^\[([^\]]+)\]/.exec(piece);
      out.push(
        <span key={key} className="text-[color:var(--color-text-primary)]">
          {label ? label[1] : piece}
        </span>,
      );
    }
    last = at + piece.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length > 0 ? out : text;
}

/** A stretch the diff left out, drawn rather than left as blank space: hiding the cut
 *  would make the reading a lie. */
function SkipRule({ t }: { t: Translator }) {
  return (
    <p className="my-1 flex items-center gap-2 text-caption text-[color:var(--color-text-quaternary)]">
      <span aria-hidden className="flex-1 border-t border-dashed border-[color:var(--color-border-strong)]" />
      <span aria-hidden>⋯</span>
      <span aria-hidden className="flex-1 border-t border-dashed border-[color:var(--color-border-strong)]" />
      <span className="sr-only">{t("diffSkippedHint")}</span>
    </p>
  );
}

/** One line of a file that is not a document: its own characters, in the file face. */
function FileLine({ t, line }: { t: Translator; line: Line }) {
  if (line.kind === "skip") return <SkipRule t={t} />;
  return (
    <p
      className={cn(
        "-mx-2 px-2 font-mono text-caption leading-label break-all whitespace-pre-wrap text-[color:var(--color-text-tertiary)]",
        markClass(line.kind),
      )}
    >
      <MarkLabel t={t} kind={line.kind} />
      {line.text === "" ? " " : line.text}
    </p>
  );
}

/** One source line as the block Markdown would make of it. */
function ProseLine({
  t,
  line,
  hideHeadingText = null,
}: {
  t: Translator;
  line: Line;
  /** When this line is a heading whose text equals this, it is the header's name again and is not drawn. */
  hideHeadingText?: string | null;
}) {
  const mark = markClass(line.kind);
  if (line.kind === "skip") return <SkipRule t={t} />;
  const text = line.text;
  if (text.trim() === "") {
    // A blank line is rhythm; an added or removed blank line is still a change and keeps its tint.
    return <div className={cn("h-3", mark && "my-0.5 h-2")} aria-hidden={mark === ""} />;
  }
  const heading = /^(#{1,3})\s+(.*)$/.exec(text);
  if (heading) {
    if (hideHeadingText !== null && heading[2].trim() === hideHeadingText.trim() && line.kind === "context") return null;
    const level = heading[1].length;
    const Tag = level === 1 ? "h3" : "h4";
    return (
      <Tag
        className={cn(
          "-mx-2 mt-4 mb-1 px-2 font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)] first:mt-0",
          level === 1 ? "text-title" : level === 2 ? "text-body-lg" : "text-body",
          mark,
        )}
      >
        <MarkLabel t={t} kind={line.kind} />
        {inlineMarkdown(heading[2])}
      </Tag>
    );
  }
  /*
   * A list item, bulleted or numbered. A numbered item keeps its own number — it is the
   * document's, and renumbering someone's list while showing them a change would be a small
   * lie — and only the marker moves into its own column so the text lines up.
   */
  const item = /^\s*([-*]|\d+[.)])\s+(.*)$/.exec(text);
  if (item) {
    const bullet = item[1] === "-" || item[1] === "*" ? "•" : item[1];
    return (
      <p className={cn("-mx-2 flex gap-2 px-2 pl-5 text-reading leading-prose text-[color:var(--color-text-secondary)]", mark)}>
        <span aria-hidden className="shrink-0 tabular-nums text-[color:var(--color-text-quaternary)]">{bullet}</span>
        <MarkLabel t={t} kind={line.kind} />
        <span className="min-w-0 break-words">{inlineMarkdown(item[2])}</span>
      </p>
    );
  }
  return (
    <p className={cn("-mx-2 break-words px-2 text-reading leading-prose text-[color:var(--color-text-secondary)]", mark)}>
      <MarkLabel t={t} kind={line.kind} />
      {inlineMarkdown(text)}
    </p>
  );
}
