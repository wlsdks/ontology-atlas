"use client";

import { useLayoutEffect, useRef } from "react";
import { useTranslations } from "next-intl";

import { useCopyFeedback } from "@/shared/lib/clipboard/use-copy-feedback";
import { truncateMiddlePath } from "@/shared/lib/concept-display/truncate-middle-path";
import { CODE_FILE_MAX_BYTES } from "@/shared/lib/project-source/tauri-code-reader";
import type { LineCite } from "@/shared/lib/vault-document/line-cite";
import { Button, Chip, Surface, controlClass } from "@/shared/ui";

import { type CiteTrust, type CodeReaderRefusalState, type CodeReaderTarget, citeTrust, WINDOW_STEP_LINES } from "../model/code-reader-model";
import type { CodeReader as CodeReaderModel } from "../model/use-code-reader";

/** Lines kept above a cited range when it is brought into view. */
const LINES_ABOVE_IN_VIEW = 4;
const PATH_EYEBROW_CHARACTERS = 56;

export interface CodeReaderNextSteps {
  /** Offered when the file is gone. */
  askToFind?: () => void;
  /** Offered when no code folder is connected or the connected one moved. */
  openCodeFolder?: () => void;
}

export interface CodeReaderProps {
  open: boolean;
  widthPx: number;
  /** The reader stands in the concept panel's place, so it leads with the way back. */
  replacesList: boolean;
  conceptTitle: string;
  target: CodeReaderTarget;
  reader: CodeReaderModel;
  /** When the concept's document was last written, to say whether the cited lines still hold. */
  documentModifiedMs: number | null;
  nextSteps: CodeReaderNextSteps;
  onClose: () => void;
  onExited?: () => void;
}

const LIMIT_LABEL = `${CODE_FILE_MAX_BYTES / (1024 * 1024)} MiB`;

/**
 * A read-only window of the concept's entry file beside the concept panel: one chip per cited
 * range, the cited lines as a band, and a sentence on whether they still hold. It never edits,
 * searches or colours syntax.
 */
export function CodeReader({
  open,
  widthPx,
  replacesList,
  conceptTitle,
  target,
  reader,
  documentModifiedMs,
  nextSteps,
  onClose,
  onExited,
}: CodeReaderProps) {
  const t = useTranslations("codeReader");
  const copyFeedback = useCopyFeedback();
  const activeRange = reader.activeRange === null ? null : target.ranges[reader.activeRange] ?? null;
  const rangeLabel = (range: LineCite) =>
    range.startLine === range.endLine
      ? t("lines.single", { line: range.startLine })
      : t("lines.range", { start: range.startLine, end: range.endLine });
  const trust: CiteTrust | null =
    reader.text && (activeRange || target.ranges.length === 0)
      ? citeTrust({
        range: activeRange,
        totalLines: reader.text.totalLines,
        fileModifiedMs: reader.text.lastModified,
        documentModifiedMs,
      })
      : null;
  const refused = reader.status === "refused" && reader.refusal !== null;

  return (
    <Surface
      open={open}
      motion="overlay"
      onExited={onExited}
      // The width arrives first on the reflow clock; the text fades in after it.
      style={open ? { animationDelay: "var(--agent-panel-reflow-duration)", width: widthPx } : { width: widthPx }}
      data-testid="code-reader"
      data-code-reader-placement={replacesList ? "replace" : "beside"}
      data-code-reader-status={reader.status}
      // A refusal is one sentence, so the reader stays short; text keeps the full column.
      className={[
        refused ? "max-h-[var(--map-inspector-max-height)]" : "h-[var(--map-inspector-max-height)]",
        "max-w-full",
        open ? "pointer-events-auto" : "pointer-events-none",
      ].join(" ")}
    >
      <section
        aria-label={t("title", { concept: conceptTitle })}
        className="flex h-full w-full flex-col overflow-hidden rounded-[var(--map-panel-radius)] border border-[color:var(--map-panel-border)] bg-[color:var(--map-panel-surface)] shadow-[var(--map-panel-shadow)]"
      >
        {replacesList ? (
          <div className="border-b border-[color:var(--map-panel-divider)] px-2 py-1.5">
            <button
              type="button"
              onClick={onClose}
              data-testid="code-reader-back"
              className={controlClass({ shape: "row", size: "sm", tone: "secondary", scope: "panel", hoverSurface: "lift", hoverInk: "strong", truncate: true, className: "w-full text-left" })}
            >
              {t("back", { concept: conceptTitle })}
            </button>
          </div>
        ) : null}

        <header className="flex flex-col gap-2 px-[var(--map-panel-pad)] pb-2.5 pt-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span
                data-testid="code-reader-path"
                title={target.path}
                className="truncate font-mono text-label text-[color:var(--map-panel-text-tertiary)]"
              >
                {truncateMiddlePath(target.path, PATH_EYEBROW_CHARACTERS)}
              </span>
              <h2 className="truncate text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--map-panel-text-primary)]">
                {t("title", { concept: conceptTitle })}
              </h2>
            </div>
            {replacesList ? null : (
              <Button variant="ghost" size="sm" onClick={onClose} data-testid="code-reader-close" className="-mr-1.5 shrink-0">
                {t("close")}
              </Button>
            )}
          </div>
          {target.ranges.length > 0 && !refused ? (
            <div
              role="group"
              aria-label={t("row.cites", { count: target.ranges.length })}
              data-testid="code-reader-ranges"
              className="-mx-0.5 flex min-w-0 gap-1 overflow-x-auto px-0.5 pb-0.5 [scrollbar-width:none]"
            >
              {target.ranges.map((range, index) => (
                <Chip
                  key={`${range.startLine}-${range.endLine}`}
                  size="sm"
                  active={reader.activeRange === index}
                  aria-pressed={reader.activeRange === index}
                  hoverSurface="lift"
                  onClick={() => reader.selectRange(index)}
                  data-testid="code-reader-range"
                  className="shrink-0 font-mono tabular-nums"
                >
                  {rangeLabel(range)}
                </Chip>
              ))}
              <Chip
                size="sm"
                active={reader.activeRange === null}
                aria-pressed={reader.activeRange === null}
                hoverSurface="lift"
                onClick={() => reader.selectRange(null)}
                data-testid="code-reader-top"
                className="shrink-0"
              >
                {t("lines.top")}
              </Chip>
            </div>
          ) : null}
          {trust ? <TrustLine trust={trust} range={activeRange} rangeLabel={rangeLabel} lastLine={reader.text?.totalLines ?? 0} /> : null}
        </header>

        {reader.changed ? (
          <div
            role="status"
            data-testid="code-reader-changed"
            className="mx-[var(--map-panel-pad)] mb-2 flex items-center gap-3 rounded-chip border border-[color:var(--map-panel-action-border)] bg-[color:var(--map-panel-action-surface)] py-1.5 pl-3 pr-1.5 text-body text-[color:var(--map-panel-text-secondary)]"
          >
            <span className="min-w-0 flex-1">{t("state.changed")}</span>
            <Button variant="outline" size="sm" onClick={reader.readAgain} data-testid="code-reader-read-again">
              {t("state.readAgain")}
            </Button>
          </div>
        ) : null}

        <div className={`${refused ? "" : "flex-1 "}mx-[var(--map-panel-pad)] flex min-h-0 flex-col overflow-hidden rounded-chip border border-[color:var(--map-panel-divider)] bg-[color:var(--map-panel-recess-a35)]`}>
          {reader.status === "refused" && reader.refusal ? (
            <Refusal state={reader.refusal} path={target.path} nextSteps={nextSteps} />
          ) : reader.text ? (
            <CodeLines reader={reader} activeRange={activeRange} />
          ) : (
            <p
              data-testid="code-reader-reading"
              aria-live="polite"
              className="m-auto px-4 text-body text-[color:var(--map-panel-text-tertiary)]"
            >
              {reader.readingNoticeShown ? t("reading", { path: target.path }) : null}
            </p>
          )}
        </div>

        <footer className="flex shrink-0 items-center gap-2 px-[var(--map-panel-pad)] py-2.5">
          <span className="min-w-0 flex-1 truncate text-label tabular-nums text-[color:var(--map-panel-text-quaternary)]" data-testid="code-reader-extent">
            {reader.text && reader.text.lines.length > 0
              ? t("lines.range", { start: reader.text.firstLine, end: reader.text.firstLine + reader.text.lines.length - 1 })
              : null}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void copyFeedback.copy(target.path)}
            data-testid="code-reader-copy-path"
            className="shrink-0"
          >
            {copyFeedback.state === "copied" ? t("copied") : t("copyPath")}
          </Button>
        </footer>
      </section>
    </Surface>
  );
}

function TrustLine({
  trust,
  range,
  rangeLabel,
  lastLine,
}: {
  trust: CiteTrust;
  range: LineCite | null;
  rangeLabel: (range: LineCite) => string;
  lastLine: number;
}) {
  const t = useTranslations("codeReader");
  const sentence =
    trust === "beyond" && range ? t("cite.beyond", { lines: rangeLabel(range), last: lastLine }) : t(`cite.${trust === "beyond" ? "unknown" : trust}`);
  const warns = trust === "stale" || trust === "beyond";
  return (
    <p
      data-testid="code-reader-trust"
      data-cite-trust={trust}
      className={[
        "text-body",
        warns ? "text-[color:var(--color-status-warning)]" : "text-[color:var(--map-panel-text-tertiary)]",
      ].join(" ")}
    >
      {sentence}
    </p>
  );
}

function Refusal({ state, path, nextSteps }: { state: CodeReaderRefusalState; path: string; nextSteps: CodeReaderNextSteps }) {
  const t = useTranslations("codeReader");
  const sentence =
    state === "otherSystem" ? t("state.otherSystem") : state === "tooLarge" ? t("state.tooLarge", { path, limit: LIMIT_LABEL }) : t(`state.${state}`, { path });
  const step =
    state === "gone" && nextSteps.askToFind
      ? { label: t("state.askToFind"), run: nextSteps.askToFind }
      : state === "notConnected" && nextSteps.openCodeFolder
        ? { label: t("state.connect"), run: nextSteps.openCodeFolder }
        : state === "accessLost" && nextSteps.openCodeFolder
          ? { label: t("state.chooseAgain"), run: nextSteps.openCodeFolder }
          : null;
  return (
    <div data-testid="code-reader-refusal" data-code-reader-refusal={state} className="m-auto flex max-w-[44ch] flex-col items-start gap-3 px-5 py-6">
      <p className="text-body text-[color:var(--map-panel-text-secondary)] [overflow-wrap:anywhere]">{sentence}</p>
      {step ? (
        <Button variant="outline" size="sm" onClick={step.run} data-testid="code-reader-next-step">
          {step.label}
        </Button>
      ) : null}
    </div>
  );
}

function CodeLines({ reader, activeRange }: { reader: CodeReaderModel; activeRange: LineCite | null }) {
  const t = useTranslations("codeReader");
  const boxRef = useRef<HTMLDivElement | null>(null);
  const shownFirstLine = useRef<number | null>(null);
  const text = reader.text!;
  const lastLine = text.firstLine + text.lines.length - 1;
  const numberWidth = `${String(text.totalLines).length + 1}ch`;
  const aboveCount = Math.min(WINDOW_STEP_LINES, text.firstLine - 1);
  const belowCount = Math.min(WINDOW_STEP_LINES, text.totalLines - lastLine);
  const band = activeRange && activeRange.endLine >= text.firstLine && activeRange.startLine <= lastLine ? activeRange : null;

  // Lines read above keep the lines in view where they were, before the frame paints.
  useLayoutEffect(() => {
    const box = boxRef.current;
    const previous = shownFirstLine.current;
    shownFirstLine.current = text.firstLine;
    if (!box || previous === null || previous <= text.firstLine) return;
    const row = box.querySelector<HTMLElement>(`[data-line="${previous}"]`);
    const firstRow = box.querySelector<HTMLElement>(`[data-line="${text.firstLine}"]`);
    if (row && firstRow) box.scrollTop += row.offsetTop - firstRow.offsetTop;
  }, [text.firstLine]);

  // The cited range is in view in the first painted frame; a later choice scrolls to it.
  const scroll = reader.scroll;
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box || !scroll) return;
    const row = box.querySelector<HTMLElement>(`[data-line="${scroll.line}"]`);
    if (!row) return;
    const top = Math.max(0, row.offsetTop - row.offsetHeight * LINES_ABOVE_IN_VIEW);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    box.scrollTo({ top, behavior: scroll.smooth && !reduce ? "smooth" : "auto" });
  }, [scroll]);

  return (
    <div ref={boxRef} data-testid="code-reader-code" className="min-h-0 flex-1 overflow-auto overscroll-contain">
      <div className="relative w-max min-w-full py-1.5 font-mono text-body">
        {aboveCount > 0 ? (
          <MoreLines label={t("more.above", { count: aboveCount })} busy={reader.more === "above"} onPress={reader.showAbove} testId="code-reader-more-above" />
        ) : null}
        <div className="relative">
          {band ? (
            <div
              key={`${band.startLine}-${band.endLine}`}
              aria-hidden
              data-testid="code-reader-band"
              className="map-overlay-in pointer-events-none absolute inset-x-0 bg-[color:var(--map-panel-row-active)] [animation-duration:var(--motion-settle)]"
              style={{
                top: `calc(var(--leading-body) * ${Math.max(band.startLine, text.firstLine) - text.firstLine})`,
                height: `calc(var(--leading-body) * ${Math.min(band.endLine, lastLine) - Math.max(band.startLine, text.firstLine) + 1})`,
              }}
            />
          ) : null}
          {text.lines.map((line, index) => {
            const number = text.firstLine + index;
            const cited = band !== null && number >= band.startLine && number <= band.endLine;
            return (
              <div key={number} data-line={number} data-cited={cited ? "true" : undefined} className="relative flex">
                <span
                  aria-hidden
                  style={{ width: numberWidth }}
                  className={[
                    "box-content shrink-0 select-none pl-3 pr-4 text-right tabular-nums",
                    cited ? "text-[color:var(--map-panel-text-secondary)]" : "text-[color:var(--map-panel-text-quaternary)]",
                  ].join(" ")}
                >
                  {number}
                </span>
                <span className="whitespace-pre pr-4 text-[color:var(--map-panel-text-primary)]">{line || " "}</span>
              </div>
            );
          })}
        </div>
        {belowCount > 0 ? (
          <MoreLines label={t("more.below", { count: belowCount })} busy={reader.more === "below"} onPress={reader.showBelow} testId="code-reader-more-below" />
        ) : null}
      </div>
    </div>
  );
}

function MoreLines({ label, busy, onPress, testId }: { label: string; busy: boolean; onPress: () => void; testId: string }) {
  return (
    <div className="sticky left-0 w-fit px-2 py-1">
      <button
        type="button"
        onClick={onPress}
        aria-busy={busy}
        disabled={busy}
        data-testid={testId}
        className={controlClass({ shape: "chip", size: "sm", tone: "secondary", scope: "panel", hoverSurface: "lift", hoverInk: "strong", className: "font-sans" })}
      >
        {label}
      </button>
    </div>
  );
}
