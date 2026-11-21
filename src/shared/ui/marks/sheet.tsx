import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/shared/lib/cn";

/** One sheet's paper in px: `text-label` DOCX, the widest common format, measures 31.1px inside its 32px. */
const SHEET_W = 34;
const SHEET_H = 42;
const FOLD = 10;
const LINE_INSET = 5;
const LINE_H = 2;
const LINE_STEP = 4;
const FIRST_LINE_TOP = 7;
const PAGE_TITLE_H = 3;
const PAGE_BODY_LINES = 4;
/** The scan passes over the lines (five at most) and stops above the format word, so it never strikes it through. */
const SCAN_H = FIRST_LINE_TOP + 5 * LINE_STEP + LINE_H;
/** A format longer than this is cut, so the word always fits the paper. */
const FORMAT_CHARS = 4;

/** A stack draws 1 + round(log10(n) × 1.3) sheets, at most this many: 1, 10, 100 and 1,000 files read apart. */
const STACK_MAX = 5;
const STACK_STEP = 3;
/** Below this many px a written share is drawn at this length, so a first page never reads as a stray tick. */
const STACK_FILL_MIN_PX = 5;

const PAPER_CUT: CSSProperties = {
  clipPath: `polygon(0 0, calc(100% - ${FOLD}px) 0, 100% ${FOLD}px, 100% 100%, 0 100%)`,
};
const FOLD_CUT: CSSProperties = {
  width: FOLD,
  height: FOLD,
  clipPath: "polygon(0 0, 0 100%, 100% 100%)",
};

/** A stable 31-multiplier string hash, so a name always draws the same lines. */
function hashOf(text: string): number {
  let hash = 7;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

function formatWord(format: string): string {
  return format.replace(/^\./, "").slice(0, FORMAT_CHARS).toUpperCase();
}

/** Line widths as fractions of the paper's inner width: the last line half, the rest 72% to 99%. */
function lineWidths(seed: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? 0.5 : 0.72 + ((seed >> (i * 2)) % 28) / 100));
}

/** The number of sheets a stack of `count` files draws: one per order of magnitude, roughly. */
function stackSheetCount(count: number): number {
  return Math.max(1, Math.min(STACK_MAX, 1 + Math.round(Math.log10(Math.max(1, count)) * 1.3)));
}

/** The drawn fill of a stack's edge in px: none at 0, at least `STACK_FILL_MIN_PX` above it, all of it at 1. */
function stackFillPx(share: number, edgePx: number): number {
  if (!(share > 0)) return 0;
  return Math.min(edgePx, Math.max(STACK_FILL_MIN_PX, share * edgePx));
}

function Lines({ widths, top, ink, paperW = SHEET_W }: { widths: readonly number[]; top: number; ink: string; paperW?: number }) {
  const inner = paperW - 2 * LINE_INSET;
  return widths.map((width, i) => (
    <span
      key={i}
      className={cn("absolute rounded-full", ink)}
      style={{ left: LINE_INSET, top: top + i * LINE_STEP, height: LINE_H, width: Math.round(inner * Math.min(1, width)) }}
    />
  ));
}

function Paper({ page, children }: { page: boolean; children: ReactNode }) {
  return (
    <>
      <span
        className={cn(
          "absolute inset-0 overflow-hidden rounded-micro border",
          page
            ? "border-[color:var(--color-indigo-accent-a32)] bg-[color:var(--color-paper-page)]"
            : "border-[color:var(--color-paper-edge)] bg-[color:var(--color-paper-source)]",
        )}
        style={PAPER_CUT}
      >
        {children}
      </span>
      <span
        className={cn(
          "absolute top-0 right-0",
          page ? "bg-[color:var(--color-indigo-accent-a32)]" : "bg-[color:var(--color-paper-fold)]",
        )}
        style={FOLD_CUT}
      />
    </>
  );
}

type SheetProps = { className?: string } & (
  | {
      variant: "source";
      /** The file name: it seeds the lines, 2 to 5, so one file always looks the same. */
      name: string;
      /** The file's format, written on the paper (PDF, MD, CSV...). */
      format: string;
      /** While the agent reads it, one line of page ink passes down the paper. */
      reading?: boolean;
    }
  | {
      variant: "page";
      /** The page's title: it seeds the body lines. */
      name: string;
      /** The cited source's format, on a tab at the corner; none when the page cites nothing. */
      format: string | null;
    }
  | {
      variant: "stack";
      /** Files in the folder: 1 to 5 sheets on a log scale. */
      count: number;
      /** The share with a wiki page, 0 to 1, filled up the stack's left edge. */
      share: number;
      /** Every file has a page: the edge turns the complete ink. */
      done: boolean;
    }
);

/**
 * A file drawn as paper: a source is a folded sheet with its format written on it, a wiki page the
 * same sheet tinted and titled with a tab naming its source's format, a folder a stack. It is
 * decoration beside the name text, which carries the meaning, so it is hidden from assistive tech.
 */
export function Sheet(props: SheetProps) {
  if (props.variant === "stack") return <SheetStack {...props} />;
  const page = props.variant === "page";
  const seed = hashOf(props.name);
  const format = props.format ? formatWord(props.format) : "";
  return (
    <span
      aria-hidden
      data-sheet={props.variant}
      className={cn("relative block flex-none [filter:var(--shadow-paper)]", props.className)}
      style={{ width: SHEET_W, height: SHEET_H }}
    >
      <Paper page={page}>
        {page ? (
          <>
            <span
              className="absolute rounded-full bg-[color:var(--color-indigo-accent-a50)]"
              style={{ left: LINE_INSET, top: FIRST_LINE_TOP, height: PAGE_TITLE_H, width: Math.round((SHEET_W - 2 * LINE_INSET) * 0.66) }}
            />
            <Lines widths={lineWidths(seed, PAGE_BODY_LINES)} top={FIRST_LINE_TOP + PAGE_TITLE_H + LINE_STEP} ink="bg-[color:var(--color-paper-line-page)]" />
          </>
        ) : (
          <Lines widths={lineWidths(seed, 2 + (seed % 4))} top={FIRST_LINE_TOP} ink="bg-[color:var(--color-paper-line)]" />
        )}
        {props.variant === "source" && props.reading ? (
          <span className="absolute inset-x-0 top-0 overflow-hidden" style={{ height: SCAN_H }}>
            <span className="motion-sheet-scan" />
          </span>
        ) : null}
      </Paper>
      {format && !page ? (
        <span className="absolute inset-x-0 bottom-px text-center text-label leading-label font-[var(--font-weight-strong)] whitespace-nowrap text-[color:var(--color-text-tertiary)]">
          {format}
        </span>
      ) : null}
      {format && page ? (
        <span className="absolute -right-1.5 -bottom-1.5 flex h-4 items-center rounded-micro border border-[color:var(--color-indigo-accent-a32)] bg-[color:var(--color-canvas)] px-1 text-label leading-label font-[var(--font-weight-strong)] whitespace-nowrap text-[color:var(--color-indigo-text-soft)]">
          {format}
        </span>
      ) : null}
    </span>
  );
}

const STACK_PAPER_W = 18;
const STACK_PAPER_H = 22;
const STACK_EDGE_W = 2;
const STACK_GAP = 2;

/** Back sheets step up and right and fade with depth; a new one slides out from behind the front. */
function SheetStack({ count, share, done, className }: { count: number; share: number; done: boolean; className?: string }) {
  const sheets = stackSheetCount(count);
  const fillPx = stackFillPx(share, STACK_PAPER_H);
  const left = STACK_EDGE_W + STACK_GAP;
  const bottom = STACK_GAP;
  return (
    <span
      aria-hidden
      data-sheet="stack"
      data-sheets={sheets}
      className={cn("relative block flex-none [filter:var(--shadow-paper)]", className)}
      style={{ width: left + STACK_PAPER_W + (STACK_MAX - 1) * STACK_STEP, height: bottom + STACK_PAPER_H + (STACK_MAX - 1) * STACK_STEP }}
    >
      {Array.from({ length: STACK_MAX - 1 }, (_, i) => {
        const depth = STACK_MAX - 1 - i;
        const shown = depth < sheets;
        return (
          <span
            key={depth}
            className="absolute rounded-micro border border-[color:var(--color-paper-edge)] bg-[color:var(--color-paper-source)] transition-[transform,opacity] duration-[var(--motion-slow)] ease-[var(--motion-ease)]"
            style={{
              left,
              bottom,
              width: STACK_PAPER_W,
              height: STACK_PAPER_H,
              opacity: shown ? Math.max(0.35, 1 - depth * 0.18) : 0,
              transform: shown ? `translate(${depth * STACK_STEP}px, ${-depth * STACK_STEP}px)` : "none",
            }}
          />
        );
      })}
      <span
        className="absolute overflow-hidden rounded-micro border border-[color:var(--color-paper-edge)] bg-[color:var(--color-paper-source)]"
        style={{ left, bottom, width: STACK_PAPER_W, height: STACK_PAPER_H }}
      >
        <Lines widths={[0.9, 0.9, 0.6]} top={5} ink="bg-[color:var(--color-paper-line)]" paperW={STACK_PAPER_W} />
      </span>
      <span
        className="absolute overflow-hidden rounded-full bg-[color:var(--color-overlay-2)]"
        style={{ left: 0, bottom, width: STACK_EDGE_W, height: STACK_PAPER_H }}
      >
        <span
          data-testid="sheet-stack-fill"
          className={cn(
            "absolute inset-x-0 bottom-0 origin-bottom transition-[transform,background-color] duration-[var(--motion-slow)] ease-[var(--motion-ease)]",
            done ? "bg-[color:var(--color-source-complete)]" : "bg-[color:var(--color-source-page)]",
          )}
          style={{ height: STACK_PAPER_H, transform: `scaleY(${fillPx / STACK_PAPER_H})` }}
        />
      </span>
    </span>
  );
}
