"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { useTranslations } from "next-intl";
import { FileText, FolderOpen } from "lucide-react";

import { passageLabelText } from "@/features/library";
import { passageLabelFor, type SourceUnit } from "@/shared/lib/library/source-passage";
import { cn } from "@/shared/lib/cn";
import { Surface } from "@/shared/ui";
import { controlClass } from "@/shared/ui/control-class";
import { transientSurface } from "@/shared/ui/surfaces/transient-surface";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import { useCitedPassage } from "../../../lib/sources/use-cited-passage";
import { changedSinceWritten } from "../../../model/reader/wiki-reader-facts";

/** Lines of the cited unit shown at most; the rest is one press away, in the source. */
export const POPOVER_CITED_LINES = 12;
/** Characters of one cited line shown at most, so a single enormous line cannot fill the page. */
export const POPOVER_LINE_CHARS = 400;
/** A source listed above this many bytes is not read on a press; the source pane is one press away. */
export const POPOVER_READ_LIMIT_BYTES = 5_000_000;
const GAP = 8;
const INSET = 16;
const WIDTH = 440;
const BOUNDARY_SELECTOR = '[data-testid="library-reader"]';

/** A pressed citation as the viewer resolved it; `path` is null when the folder lacks the file. */
export interface ReaderCitation {
  path: string | null;
  rawPath: string;
  anchor?: string;
}

export interface WikiCitationPopoverHandle {
  open: (citation: ReaderCitation, button: HTMLButtonElement) => void;
}

interface Entry {
  id: number;
  citation: ReaderCitation;
  button: HTMLButtonElement;
  open: boolean;
}

interface Props {
  sourceHandles: ReadonlyMap<string, FileSystemFileHandle>;
  /** The sha256 this page recorded for the file when it was written, or null when it recorded none. */
  recordedHash: (path: string) => string | null;
  /** Each listed source's byte length, from the directory entry. */
  listedBytes: ReadonlyMap<string, number>;
  canReveal: boolean;
  onOpenSource: (path: string, anchor?: string) => void;
  onReveal: (path: string) => void;
  t: ReturnType<typeof useTranslations<"library">>;
}

/**
 * The passage a citation names, beside the citation. It owns its state, so opening one renders
 * this and never the page body; the citation's `aria-expanded` is set on the button directly for
 * the same reason. Each press is its own entry, so two citations after one sentence never merge
 * and the closing one leaves with its own exit while the next rises.
 */
export const WikiCitationPopover = forwardRef<WikiCitationPopoverHandle, Props>(function WikiCitationPopover(props, ref) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const entriesRef = useRef(entries);
  useEffect(() => { entriesRef.current = entries; }, [entries]);
  const nextId = useRef(0);
  /* Entries whose panel has shown; one closed before that has no exit to play and leaves at once. */
  const shown = useRef(new Set<number>());
  const onShown = useCallback((id: number) => { shown.current.add(id); }, []);
  const closed = useCallback((list: readonly Entry[], ids: ReadonlySet<number>) => list.flatMap((one) => {
    if (!ids.has(one.id)) return [one];
    return shown.current.has(one.id) ? [{ ...one, open: false }] : [];
  }), []);

  const close = useCallback((id: number, returnFocus: boolean) => {
    const entry = entriesRef.current.find((one) => one.id === id && one.open);
    if (!entry) return;
    entry.button.setAttribute("aria-expanded", "false");
    if (returnFocus) entry.button.focus({ preventScroll: true });
    setEntries((current) => closed(current, new Set([id])));
  }, [closed]);

  useImperativeHandle(ref, () => ({
    open(citation, button) {
      const current = entriesRef.current;
      const same = current.find((entry) => entry.open && entry.button === button);
      // A press on a citation whose read is still in flight changes nothing and reads nothing again.
      if (same && !shown.current.has(same.id)) return;
      for (const entry of current) if (entry.open) entry.button.setAttribute("aria-expanded", "false");
      const rest = closed(current, new Set(current.filter((entry) => entry.open).map((entry) => entry.id)));
      // A second press on the open citation closes it, as a toggle does.
      if (same) {
        setEntries(rest);
        return;
      }
      button.setAttribute("aria-expanded", "true");
      nextId.current += 1;
      setEntries([...rest, { id: nextId.current, citation, button, open: true }]);
    },
  }), [closed]);

  const remove = useCallback((id: number) => {
    shown.current.delete(id);
    setEntries((current) => current.filter((entry) => entry.id !== id));
  }, []);

  // A page change or unmount takes the open popover with it.
  useEffect(() => () => {
    for (const entry of entriesRef.current) entry.button.setAttribute("aria-expanded", "false");
  }, []);

  if (typeof document === "undefined") return null;
  return <>{entries.map((entry) => (
    <CitationPanel key={entry.id} entry={entry} onClose={close} onShown={onShown} onExited={remove} {...props} />
  ))}</>;
});

function CitationPanel({ entry, onClose, onShown, onExited, sourceHandles, recordedHash, listedBytes, canReveal, onOpenSource, onReveal, t }: Props & {
  entry: Entry;
  onClose: (id: number, returnFocus: boolean) => void;
  onShown: (id: number) => void;
  onExited: (id: number) => void;
}) {
  const { citation, button, open, id } = entry;
  const tooLarge = citation.path !== null && (listedBytes.get(citation.path) ?? 0) > POPOVER_READ_LIMIT_BYTES;
  const readPath = tooLarge ? null : citation.path;
  const passage = useCitedPassage({
    citation: readPath && citation.anchor ? { path: readPath, anchor: citation.anchor } : null,
    handle: readPath ? sourceHandles.get(readPath) : undefined,
    enabled: readPath !== null,
  });
  const panelRef = useRef<HTMLElement | null>(null);
  const [box, setBox] = useState<{ top: number; left: number; width: number; above: boolean } | null>(null);
  /* Waits for the read, so the popover arrives once with its passage instead of growing. */
  const ready = readPath === null || !citation.anchor || (passage !== null && passage.phase !== "reading");
  useLayoutEffect(() => {
    if (ready) onShown(id);
  }, [id, onShown, ready]);

  const place = useCallback(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const rect = button.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
    const pane = button.closest<HTMLElement>(BOUNDARY_SELECTOR)?.getBoundingClientRect();
    const floor = Math.max(INSET, (pane?.left ?? 0) + INSET);
    const ceiling = Math.min(window.innerWidth, pane?.right ?? window.innerWidth) - INSET;
    const bottomEdge = Math.min(window.innerHeight, pane?.bottom ?? window.innerHeight) - INSET;
    const topEdge = Math.max(0, pane?.top ?? 0) + INSET;
    const width = Math.max(0, Math.min(WIDTH, ceiling - floor));
    const height = panel.offsetHeight;
    const roomBelow = bottomEdge - (rect.bottom + GAP);
    const roomAbove = rect.top - GAP - topEdge;
    const above = height > roomBelow && roomAbove > roomBelow;
    const next = {
      top: above ? rect.top - GAP - height : rect.bottom + GAP,
      left: Math.min(Math.max(rect.left, floor), ceiling - width),
      width,
      above,
    };
    setBox((current) => current && current.top === next.top && current.left === next.left
      && current.width === next.width && current.above === next.above ? current : next);
  }, [button]);

  /* Measured before paint: the first frame already stands where it belongs. */
  useLayoutEffect(() => {
    if (ready) place();
  });

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Before the popover shows, Escape drops the pending read and stays the reader's.
      if (!ready) {
        onClose(id, false);
        return;
      }
      // The reader closes its page on Escape; with a popover up, the press is the popover's.
      event.preventDefault();
      event.stopPropagation();
      onClose(id, true);
    };
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || button.contains(target)) return;
      const focusable = target instanceof Element && target.closest("button, a, input, textarea, select, [tabindex]");
      onClose(id, !focusable);
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onDown);
    };
  }, [button, id, onClose, open, ready]);

  const focused = useRef(false);
  useEffect(() => {
    if (!open || focused.current || box === null) return;
    focused.current = true;
    panelRef.current?.focus({ preventScroll: true });
  }, [box, open]);

  if (!ready) return null;

  const file = (citation.path ?? citation.rawPath).split("/").pop() || citation.rawPath;
  const label = citation.anchor ? passageLabelFor(citation.anchor, passage?.passage?.cited ?? []) : null;
  const where = !label || !citation.anchor ? file
    : label.kind === "line" ? t("wikiReader.citationAt", { file, line: label.number })
      : `${file} · ${passageLabelText(label, citation.anchor, t)}`;
  const resolved = passage?.phase === "ready" && passage.passage?.state === "resolved" ? passage.passage : null;
  const changed = resolved !== null && readPath !== null && changedSinceWritten(recordedHash(readPath), passage?.hash);
  const citedLines = resolved ? clipLines(resolved.cited, POPOVER_CITED_LINES) : null;

  return createPortal(
    <div className="pointer-events-none fixed z-40" style={{
      top: box?.top ?? 0, left: box?.left ?? 0, width: box?.width ?? WIDTH,
      visibility: box ? undefined : "hidden",
    }}>
      <Surface
        open={open}
        as="aside"
        ref={panelRef}
        motion="chrome"
        origin={box?.above ? "bottom left" : "top left"}
        tabIndex={-1}
        role="group"
        aria-label={where}
        onExited={() => onExited(id)}
        {...transientSurface("anchored")}
        data-testid="wiki-citation-popover"
        data-side={box?.above ? "above" : "below"}
        data-state={citation.path === null ? "missing" : tooLarge ? "too-large" : resolved ? (changed ? "changed" : "resolved") : passage?.passage?.state ?? passage?.phase ?? "none"}
        className={cn(
          "pointer-events-auto flex max-h-[min(28rem,70vh)] w-full flex-col overflow-hidden rounded-panel focus:outline-none",
          "border border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)] shadow-[var(--shadow-elevation-2)]",
        )}
      >
        <p className="flex min-w-0 flex-none items-center gap-1.5 px-4 pt-3 text-label leading-label text-[color:var(--color-text-tertiary)]">
          <FileText size={ICON_SIZE.sm} className="flex-none opacity-60" aria-hidden />
          <span className="min-w-0 [overflow-wrap:anywhere]">{where}</span>
        </p>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-2">
          {citation.path === null ? (
            <p data-testid="wiki-citation-missing" className="text-body leading-body text-[color:var(--color-text-secondary)] [word-break:keep-all]">
              {t("wikiReader.sourceMissing")}
            </p>
          ) : null}
          {tooLarge ? (
            <p data-testid="wiki-citation-too-large" className="text-body leading-body text-[color:var(--color-text-secondary)]">
              {t("wikiReader.sourceTooLarge")}
            </p>
          ) : null}
          {changed && resolved ? (
            <p data-testid="wiki-citation-changed" className="mb-2 text-label leading-label text-[color:var(--color-amber-source-text-a95)]">
              {t("wikiReader.sourceChanged")}
            </p>
          ) : null}
          {resolved && citedLines ? (
            <div className="flex flex-col gap-1.5">
              {resolved.before.slice(-1).map((unit) => <ContextLine key={`b-${unit.anchor}`} unit={unit} />)}
              <p data-testid="wiki-citation-cited" className="whitespace-pre-wrap rounded-micro bg-[color:var(--color-indigo-line-a06)] px-2 py-1 -mx-2 text-body leading-body text-[color:var(--color-text-primary)] [overflow-wrap:break-word]">
                {citedLines.clipped ? `${citedLines.text}\n…` : citedLines.text}
              </p>
              {resolved.after.slice(0, 1).map((unit) => <ContextLine key={`a-${unit.anchor}`} unit={unit} />)}
            </div>
          ) : null}
          {passage?.phase === "ready" && passage.passage?.state === "unresolved" ? (
            <p className="text-body leading-body text-[color:var(--color-text-secondary)] [overflow-wrap:break-word]">
              {t("source.passage.missing", { anchor: citation.anchor ?? "" })}
            </p>
          ) : null}
          {passage?.phase === "ready" && passage.passage?.state === "no-text" && label && citation.anchor ? (
            <p data-testid="wiki-citation-no-text" className="text-body leading-body text-[color:var(--color-text-secondary)] [overflow-wrap:break-word]">
              {t("source.passage.noText", { label: passageLabelText(label, citation.anchor, t) })}
            </p>
          ) : null}
          {passage?.phase === "failed" ? (
            <p className="text-body leading-body text-[color:var(--color-text-secondary)] [overflow-wrap:break-word]">
              {passage.error ? t("source.passage.unreadable", { reason: passage.error }) : t("source.passage.unreadableUnknown")}
            </p>
          ) : null}
        </div>
        {citation.path !== null ? (
          <div className="flex flex-none flex-wrap items-center gap-2 border-t border-[color:var(--color-border-soft)] px-4 py-2.5">
            {passage?.phase === "ready" && passage.passage?.state === "no-text" && canReveal ? (
              <button type="button" data-testid="wiki-citation-reveal" onClick={() => onReveal(citation.path!)}
                className={controlClass({ shape: "chip", tone: "default", className: "gap-2" })}>
                <FolderOpen size={ICON_SIZE.sm} aria-hidden />
                {t("source.reveal")}
              </button>
            ) : null}
            <button type="button" data-testid="wiki-citation-open-source"
              onClick={() => { onClose(id, false); onOpenSource(citation.path!, citation.anchor); }}
              className={controlClass({ shape: "link", tone: "accent", hoverInk: "strong" })}>
              {t("wikiReader.openSource")}
            </button>
          </div>
        ) : null}
      </Surface>
    </div>,
    document.body,
  );
}

function ContextLine({ unit }: { unit: SourceUnit }) {
  return (
    <p className="whitespace-pre-wrap text-label leading-body text-[color:var(--color-text-tertiary)] [overflow-wrap:break-word]">
      {unit.text}
    </p>
  );
}

/** One line cut at `POPOVER_LINE_CHARS`, never inside a surrogate pair, then an ellipsis. */
function clipLine(line: string): string {
  if (line.length <= POPOVER_LINE_CHARS) return line;
  const last = line.charCodeAt(POPOVER_LINE_CHARS - 1);
  const end = last >= 0xd800 && last <= 0xdbff ? POPOVER_LINE_CHARS - 1 : POPOVER_LINE_CHARS;
  return `${line.slice(0, end)}…`;
}

/** The cited units' text, cut after `limit` lines; `clipped` counts the lines left in the source. */
export function clipLines(units: readonly SourceUnit[], limit: number): { text: string; clipped: number } {
  const lines = units.map((unit) => unit.text).join("\n").split("\n");
  return { text: lines.slice(0, limit).map(clipLine).join("\n"), clipped: Math.max(0, lines.length - limit) };
}
