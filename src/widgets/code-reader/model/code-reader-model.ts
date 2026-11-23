import {
  CODE_READER_REFUSALS,
  CODE_WINDOW_MAX_LINES,
  type CodeReaderRefusal,
} from "@/shared/lib/project-source/tauri-code-reader";
import { citedLineRanges, type LineCite } from "@/shared/lib/vault-document/line-cite";

/** The file the reader opens for a concept and the ranges its document cites in that file. */
export interface CodeReaderTarget {
  path: string;
  ranges: LineCite[];
}

/** One path form: forward slashes, no `./` or trailing slash, one Unicode form for Hangul. */
export function normalizeCodePath(path: string): string {
  return path
    .normalize("NFC")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^(?:\.\/)+/, "")
    .replace(/\/+$/, "");
}

function frontmatterPath(value: unknown): string | null {
  const first = Array.isArray(value) ? value.find((item) => typeof item === "string") : value;
  if (typeof first !== "string") return null;
  const path = normalizeCodePath(first);
  return path || null;
}

/**
 * The concept's entry file: `path:`, or the first cited file inside it when `path:` names a folder,
 * or the first cited file when there is no `path:`. Null when the document names no code.
 */
export function codeReaderTarget(pathValue: unknown, body: string): CodeReaderTarget | null {
  const cites = citedLineRanges(body).map((cite) => ({ ...cite, path: normalizeCodePath(cite.path) }));
  const declared = frontmatterPath(pathValue);
  const entry = declared
    ? cites.find((cite) => cite.path === declared || cite.path.startsWith(`${declared}/`))?.path ?? declared
    : cites[0]?.path;
  if (!entry) return null;
  return { path: entry, ranges: cites.filter((cite) => cite.path === entry) };
}

/** Lines shown above a cited range, so the rule's surroundings are in view. */
export const LINES_ABOVE_CITE = 12;
/** Lines read when a range is opened, or when the person asks for more. */
export const WINDOW_STEP_LINES = 120;

export interface WindowRequest {
  firstLine: number;
  lineCount: number;
}

/** The window that holds `range` with context above it, or the file's top. */
export function windowAround(range: LineCite | null): WindowRequest {
  if (!range) return { firstLine: 1, lineCount: WINDOW_STEP_LINES };
  const firstLine = Math.max(1, range.startLine - LINES_ABOVE_CITE);
  const needed = range.endLine - firstLine + 1;
  return { firstLine, lineCount: Math.min(CODE_WINDOW_MAX_LINES, Math.max(WINDOW_STEP_LINES, needed + LINES_ABOVE_CITE)) };
}

/** What the reader can say about whether the cited lines are the ones the document meant. */
export type CiteTrust = "current" | "stale" | "unknown" | "beyond" | "none";

/**
 * Two files copied together (a clone, a checkout) carry times seconds apart in either order, so a
 * difference this small says nothing about which was written first.
 */
export const SAME_WRITE_SLACK_MS = 5_000;

export function citeTrust(input: {
  range: LineCite | null;
  totalLines: number;
  fileModifiedMs: number;
  documentModifiedMs: number | null;
}): CiteTrust {
  const { range, totalLines, fileModifiedMs, documentModifiedMs } = input;
  if (!range) return "none";
  if (range.endLine > totalLines) return "beyond";
  if (!documentModifiedMs || !fileModifiedMs) return "unknown";
  const fileLater = fileModifiedMs - documentModifiedMs;
  if (Math.abs(fileLater) <= SAME_WRITE_SLACK_MS) return "unknown";
  return fileLater > 0 ? "stale" : "current";
}

export type CodeReaderRefusalState =
  | "notConnected"
  | "accessLost"
  | "otherSystem"
  | "gone"
  | "secret"
  | "outside"
  | "tooLarge"
  | "notText";

const REFUSAL_STATES: Record<CodeReaderRefusal, CodeReaderRefusalState> = {
  "code-reader-not-connected": "notConnected",
  "code-reader-access-lost": "accessLost",
  "code-reader-other-system": "otherSystem",
  "code-reader-gone": "gone",
  "code-reader-secret": "secret",
  "code-reader-outside": "outside",
  "code-reader-too-large": "tooLarge",
  "code-reader-not-text": "notText",
};

function isRefusal(code: string): code is CodeReaderRefusal {
  return (CODE_READER_REFUSALS as readonly string[]).includes(code);
}

/** The state a failed read shows. A failure Rust did not name is reported as not read. */
export function refusalState(code: string | null): CodeReaderRefusalState {
  return code && isRefusal(code) ? REFUSAL_STATES[code] : "outside";
}

/** The map keeps this much width beside the reader. */
export const MAP_MIN_WIDTH_PX = 480;
export const READER_MIN_WIDTH_PX = 480;
export const READER_MAX_WIDTH_PX = 640;

export type ReaderPlacement =
  | { mode: "beside"; widthPx: number }
  | { mode: "replace"; widthPx: number };

/**
 * Where the reader stands in a map slot `slotWidthPx` wide: left of the concept panel while both
 * fit beside the map's floor, otherwise in the panel's place. `rightInsetPx` is the panel's
 * distance from the slot's right edge; `listReachPx` adds the panel and the gap before the reader.
 */
export function readerPlacement(slotWidthPx: number, listReachPx: number, rightInsetPx: number): ReaderPlacement {
  const besideList = slotWidthPx - listReachPx - MAP_MIN_WIDTH_PX;
  if (besideList >= READER_MIN_WIDTH_PX) {
    return { mode: "beside", widthPx: Math.min(READER_MAX_WIDTH_PX, Math.floor(besideList)) };
  }
  const alone = slotWidthPx - rightInsetPx - MAP_MIN_WIDTH_PX;
  return { mode: "replace", widthPx: Math.max(0, Math.min(READER_MAX_WIDTH_PX, Math.floor(alone))) };
}
