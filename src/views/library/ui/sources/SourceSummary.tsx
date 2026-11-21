"use client";

import type { useTranslations } from "next-intl";
import { FolderOpen, Download } from "lucide-react";

import type { LibrarySourceRow, LibraryWriteUpLink } from "@/entities/docs-vault";
import { cn } from "@/shared/lib/cn";
import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import type { CitedPassageState } from "../../lib/sources/use-cited-passage";
import type { SourceOutlineState } from "../../lib/sources/use-source-outline";
import { citationKey, openedSentenceKey, sourceFacts } from "../../model/sources/source-summary-facts";
import { SourceOutlineSection } from "./SourceOutlineSection";
import { SourcePassageSection } from "./SourcePassageSection";
import { SourceWriteUps } from "./SourceWriteUps";

/**
 * Shows what Atlas holds about a raw source without opening it; text is read only when a person
 * presses a citation, never converted, and dropped on close (`docs/DECISIONS.md`).
 * The door reveals in Finder in the app (never opens) and hands over the bytes in a browser.
 */
export function SourceSummary({
  row,
  hash,
  passage,
  outline,
  canReveal,
  writeUps,
  onOpen,
  onOpenPassage,
  onOpenWiki,
  onCompile,
  compileNote,
  compileBlocked,
  agentDoor,
  indexShowsState = false,
  busy,
  t,
}: {
  row: LibrarySourceRow;
  /** The measured sha256, or null when nothing has asked for one yet. */
  hash: string | null;
  /** The passage a citation named; `null` when the file was opened from the index and never read. */
  passage: CitedPassageState | null;
  /**
   * The file's own shape, read once when this pane opened; `null` while the folder is not open or the read
   * is not wanted, and the section is then absent. Choosing this row is naming this file, which is why
   * `use-source-outline.ts` may read it.
   */
  outline: SourceOutlineState | null;
  /** True in the installed app, where the door reveals rather than downloads. */
  canReveal: boolean;
  /** Pages citing this file, and whether each still matches its bytes. */
  writeUps: readonly LibraryWriteUpLink[];
  onOpen: () => void;
  /** Opens this pane at one address inside the file; sets the same `{path, anchor}` as a citation. */
  onOpenPassage?: (anchor: string) => void;
  onOpenWiki: (slug: string) => void;
  onCompile: () => void;
  /** The one fact true of pressing Compile: why it cannot run, or what leaves this computer. */
  compileNote: string | null;
  /** Whether the press is refused; the note above says why. */
  compileBlocked: boolean;
  /**
   * Whether that refusal earns a door to `/agents`: `LibraryPage` decides on the route, and it is false on
   * the web and while an agent is still being looked for.
   */
  agentDoor: boolean;
  /**
   * The index beside this pane is the Sources list, whose row for this file already
   * wears its state badge at `lg` and up; the pane's own state fact steps aside there.
   */
  indexShowsState?: boolean;
  busy: boolean;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  const facts = sourceFacts({ row, hash, passageHash: passage?.hash, indexShowsState }, t);

  return (
    <div
      data-testid="library-source-summary"
      /* `pb-8` mirrors `pt-8` so the last block is not flush with the bottom of the window. */
      className="mx-auto w-full max-w-[var(--measure-doc-column)] px-6 pb-8 pt-8 md:px-10"
    >
      <h2 className="break-all text-display font-[var(--font-weight-signature)] tracking-[var(--tracking-card)] text-[color:var(--color-text-primary)]">
        {row.name}
      </h2>
      {/* `ch` resolves at the element's own size, so `max-w-[var(--measure-prose)]` here would cut the line
         short of the table's right edge. */}
      <p
        data-testid="library-source-opened-state"
        className="mt-2 text-label leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
      >
        {t(openedSentenceKey(passage, outline))}
      </p>

      <dl className="mt-5 flex flex-col gap-2 border-t border-[color:var(--color-border-soft)] pt-4">
        {facts.map((fact) => (
          <div
            key={fact.key}
            data-fact={fact.key}
            className={cn("flex flex-wrap items-baseline gap-x-3 gap-y-0.5", fact.wideHidden && "lg:hidden")}
          >
            <dt className="w-full flex-none font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)] sm:w-[148px]">
              {fact.label}
            </dt>
            <dd
              /* `truncate` rather than a character count alone: the elision is sized for
                 the 1040 column, and below `sm` the value cell drops under its own label
                 and is narrower than any fixed length could allow for. One line at every
                 width, and the whole value on the cell. */
              title={fact.title}
              className={cn(
                "min-w-0 flex-1 text-label text-[color:var(--color-text-secondary)]",
                fact.oneLine ? "truncate" : "break-all",
                fact.mono && "font-mono",
              )}
            >
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>

      <SourceWriteUps
        writeUps={writeUps}
        onOpenWiki={onOpenWiki}
        onCompile={onCompile}
        compileNote={compileNote}
        compileBlocked={compileBlocked}
        agentDoor={agentDoor}
        busy={busy}
        t={t}
      />
      {outline ? <SourceOutlineSection outline={outline} onOpenPassage={onOpenPassage} t={t} /> : null}
      {passage ? <SourcePassageSection key={citationKey(passage)} passage={passage} t={t} /> : null}

      <div className="mt-5">
        <button
          type="button"
          onClick={onOpen}
          data-testid="library-source-open"
          className={controlClass({ shape: "chip", tone: "muted", className: "gap-2" })}
        >
          {canReveal ? (
            <FolderOpen size={ICON_SIZE.sm} aria-hidden />
          ) : (
            <Download size={ICON_SIZE.sm} aria-hidden />
          )}
          {canReveal ? t("source.reveal") : t("source.download")}
        </button>
      </div>
    </div>
  );
}
