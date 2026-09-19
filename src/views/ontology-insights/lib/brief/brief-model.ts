/**
 * The analysis brief — "what in your understanding has to change" — across the three cores
 * (ontology, wiki, harness) plus what agents did meanwhile.
 *
 * Every line is a count with a sentence id; the sentence lives in the message catalogue so
 * the number and its wording are never written apart. A count is never a score: the brief
 * lists named facts (pages whose source moved, areas no rule reaches), and the person decides.
 *
 * The three states are the product-wide vocabulary from the cognitive-diff work
 * (2026-09-12): `current` (checked and still true), `stale` (checked and moved),
 * `unknown` (could not be checked here). A browser cannot read the code beside a vault, so
 * ontology evidence is `unknown` there rather than silently `current`.
 */
export type BriefState = 'current' | 'stale' | 'unknown';

export type BriefCoreKey = 'ontology' | 'wiki' | 'harness' | 'agent';

/**
 * Why a core's numbers are what they are. `measured` means the counts are real; `app-only`
 * means the browser cannot reach the input (dot folders, Git, code beside the vault) and
 * the installed app can; `no-data` means the input exists but is empty (no wiki, no agent
 * log yet), which is a different sentence from "cannot look".
 */
export type BriefAvailability = 'measured' | 'app-only' | 'no-data';

export interface BriefLine {
  /** Message id under `brief.line.*`. Stable; screens and tests key on it. */
  id: string;
  count: number;
  /** Which state this line's items are in. Drives the mark beside the sentence, never colour alone. */
  state: BriefState;
}

export interface BriefCore {
  core: BriefCoreKey;
  availability: BriefAvailability;
  /** Items in each state. `null` when this core cannot state that column here. */
  current: number | null;
  stale: number | null;
  unknown: number | null;
  /** Lines with a count of zero are kept: the screen decides whether a zero is worth ink. */
  lines: readonly BriefLine[];
}

/** Lines worth showing: nonzero counts, in the order the builder ranked them. */
export function visibleLines(core: BriefCore): readonly BriefLine[] {
  return core.lines.filter((line) => line.count > 0);
}

/** ISO/epoch → ms, or null for anything unparseable. Ledger and log stamps are ISO-8601. */
export function toMs(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const ms = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function isAfter(value: string | number | null | undefined, anchorMs: number): boolean {
  const ms = toMs(value);
  return ms != null && ms > anchorMs;
}
