/**
 * A cite of read lines in the form the build writes: a file path, then `:L` and a line number
 * (`src/billing/invoice.ts:L40-L52`). The path holds a `/` or a `.`, so prose such as `Note:L1`
 * is not a cite. O(body length).
 */
const LINE_CITE = /[^\s`'"()[\]<>,;|]*[./][^\s`'"()[\]<>,;|]*:L\d+/;

export function citesReadLines(body: string): boolean {
  return LINE_CITE.test(body);
}

export interface LineCite {
  path: string;
  startLine: number;
  endLine: number;
}

/** The build's form (`path:L40-L52`, `path:L40`); the path may hold brackets (`app/[locale]/(shop)`). */
const LINE_CITES = /([^\s`'"<>|,;]+):L(\d+)(?:\s*[-–]\s*L?(\d+))?/g;
/** The MCP parser's bound: a longer span is prose, not a cite of read lines. */
const CITE_MAX_SPAN_LINES = 400;
const CLOSERS: Record<string, string> = { "(": ")", "[": "]", "{": "}" };

function occurrences(text: string, character: string): number {
  return text.split(character).length - 1;
}

/** Prose brackets around a cite join its token; a leading bracket with no partner is shed. */
function citedPath(token: string): string {
  let path = token;
  for (;;) {
    const opener = path[0] ?? "";
    const closer = CLOSERS[opener];
    if (!closer || path.length < 2 || occurrences(path, opener) <= occurrences(path, closer)) break;
    path = path.slice(1);
  }
  return path.replace(/^(?:\.\/)+/, "");
}

/** Every distinct line range a body cites, in the order written. O(body length). */
export function citedLineRanges(body: string): LineCite[] {
  const seen = new Set<string>();
  const cites: LineCite[] = [];
  for (const match of body.matchAll(LINE_CITES)) {
    const path = citedPath(match[1] ?? "");
    if (!/[./]/.test(path)) continue;
    const first = Number(match[2]);
    const last = Number(match[3] ?? match[2]);
    const cite = { path, startLine: Math.min(first, last), endLine: Math.max(first, last) };
    const key = `${cite.path}\0${cite.startLine}\0${cite.endLine}`;
    if (cite.startLine < 1 || cite.endLine - cite.startLine >= CITE_MAX_SPAN_LINES || seen.has(key)) continue;
    seen.add(key);
    cites.push(cite);
  }
  return cites;
}
