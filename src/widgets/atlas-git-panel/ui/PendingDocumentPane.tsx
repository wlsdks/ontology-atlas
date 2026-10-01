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
 * The uncommitted changes read as documents, since a person judges whether meaning changed:
 * a header naming the concept, a chip strip of changed documents, and the whole document in
 * the reading face with changed lines marked in place.
 */
export function PendingDocumentPane({
  t,
  vaultPath,
  documents,
  others,
  summary,
  hunks,
  hunksTooLarge,
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
  hunksTooLarge: boolean;
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
  // Opens on the first document whose lines changed; a new document has nothing to mark.
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
        className="flex flex-none flex-col gap-3 border-b border-[color:var(--color-divider)] px-4 py-4"
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
                <span className={cn(!doc.kind && "font-mono")}>{doc.label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </header>

      {shown ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {/*
           * The door rides in the reader's header. Keyed by document, or an armed confirm
           * would survive a chip change and re-aim at another document.
           */}
          <DocumentChangeReader
            key={shown.entry.path}
            t={t}
            vaultPath={vaultPath}
            document={shown}
            fallback={hunks.find((h) => h.path === shown.entry.path) ?? null}
            fallbackTooLarge={hunksTooLarge}
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
 * One document, whole, in the reading face: each source line is one block, added lines on
 * the success tint and removed lines struck through on the danger tint, still readable.
 * The document comes from `git_document_diff`; when that read is unavailable the hunk diff
 * already on screen is drawn, so the pane never goes blank.
 */
export function DocumentChangeReader({
  t,
  vaultPath,
  document,
  fallback,
  fallbackTooLarge = false,
  source,
  action = null,
  heading = null,
}: {
  t: Translator;
  vaultPath: string | null;
  document: ChangedDocument;
  fallback: AtlasGitDiffFile | null;
  fallbackTooLarge?: boolean;
  /** A commit hash to read that commit's change of the document; absent = uncommitted. */
  source?: string;
  /** This document's own door, drawn in the header beside its path and counts. */
  action?: React.ReactNode;
  /** A section label drawn instead of the document's name when a card above already names it. */
  heading?: string | null;
}) {
  const { entry, label, kind } = document;
  // `undefined` = not read yet, `null` = unavailable (no folder, no bridge, a refused read).
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
  // Both draw hunks, but the header says which: too long for one pane, or unreadable whole.
  const longDocument = tooLarge && fallback !== null;
  const partial = !longDocument && (whole === null || !vaultPath) && fallback !== null;
  // Only a concept document is prose; an ignore file's `#` line is not a title and its `---`
  // is not front matter. A step's file entry may carry kind `""`, which is no kind.
  const isDocument = Boolean(kind);
  const { frontmatter, body, lines, frontmatterChanged, firstHeadingIndex } = useMemo(() => {
    const all = file?.lines ?? [];
    const split = isDocument ? splitFrontmatter(all) : { frontmatter: [] as Line[], body: [...all] };
    // The body's first heading repeats the header's name, so it is not drawn.
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
      // Focusable so a long document scrolls by keyboard, and Tab reaches it before the
      // destructive door.
      tabIndex={0}
      aria-label={label}
      className="git-fade-in flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-focus-ring)]"
    >
      {/*
        One reading measure for header, door, box and body, left-anchored at every width, so
        the door's right edge is the text's right edge.
      */}
      <div className="flex w-full max-w-[var(--measure-doc-column)] flex-col gap-4">
      <header className="flex flex-none flex-col gap-1">
        {/* Display size for the uncommitted change; inside a step, whose headline holds the
            display step, the name steps down to a panel title. */}
        {heading ? (
          <h3 className="text-label text-[color:var(--color-text-tertiary)]">{heading}</h3>
        ) : (
          <h2
            className={cn(
              "flex items-center gap-2 font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]",
              source ? "text-title" : "text-display",
            )}
          >
            {kind ? <OntologyMapKindGlyph kind={kind} size={source ? 14 : 16} /> : null}
            <span className="min-w-0 truncate">{label}</span>
          </h2>
        )}
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-caption text-[color:var(--color-text-quaternary)]">
          {/* The path, unless the name above or the step's file chooser already prints it. */}
          {entry.path === label || source ? null : <span className="min-w-0 break-all font-mono">{entry.path}</span>}
          <span className="text-[color:var(--color-text-tertiary)]">
            {t(statusKey(entry.status, isDocument))}
          </span>
          {/* A renamed document carries the name it had: "renamed" without it is half the fact. */}
          {entry.renamedFrom ? (
            <span className="min-w-0 break-all">{t("docReaderRenamedFrom", { path: entry.renamedFrom })}</span>
          ) : null}
          <span className="font-mono tabular-nums">
            <span className="text-[color:var(--color-success-text-a90)]">{`+${added}`}</span>{" "}
            <span className="text-[color:var(--color-danger-text)]">{`−${removed}`}</span>
          </span>

        </p>
        {/* Under the metadata it acts on, in the same slot and card as the restore confirm. */}
        {action ? <div className="mt-1 flex w-full flex-none flex-col">{action}</div> : null}
      </header>

      {lines.length === 0 && (whole !== undefined || !vaultPath) ? (
        <p className="text-label leading-prose text-[color:var(--color-text-quaternary)]">
          {t(fallbackTooLarge ? "diffTooLarge" : "diffEmpty")}
        </p>
      ) : null}

      {/* A fragment changes the meaning of every line below, so it is said above the body. */}
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
            className="flex flex-none flex-col rounded-[var(--radius-card)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] -mx-2 px-2 py-2 text-caption leading-label"
          >
            <p className="pb-1 text-[color:var(--color-text-quaternary)]">{t("docReaderInfoBox")}</p>
            {frontmatter.map((line, index) => (
              <p key={index} className={cn("whitespace-pre-wrap break-all -mx-1 px-1 font-mono text-[color:var(--color-text-tertiary)]", markClass(line.kind))}>
                <MarkLabel t={t} kind={line.kind} />
                {line.text}
              </p>
            ))}
          </section>
        ) : (
          /* Unchanged front matter: one quiet line opened on demand, so it never outweighs the change. */
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
 * The inline marks a vault document uses (strong, code, a link's text), drawn rather than
 * shown raw; anything else stays as written, since a guessing reader is worse.
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
      // A wikilink's target belongs to the map; this reader draws its name.
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
  // A list item keeps the document's own number; only the marker moves into its own column.
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
