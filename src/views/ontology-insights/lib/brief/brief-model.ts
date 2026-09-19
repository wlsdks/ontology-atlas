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

type BriefCoreKey = 'ontology' | 'wiki' | 'harness' | 'agent';

/**
 * Why a core's numbers are what they are. `measured` means the counts are real; `app-only`
 * means the browser cannot reach the input (dot folders, Git, code beside the vault) and
 * the installed app can; `no-data` means the input exists but is empty (no wiki, no agent
 * log yet), which is a different sentence from "cannot look".
 */
type BriefAvailability = 'measured' | 'app-only' | 'no-data';

export interface BriefLine {
  /** Message id under `brief.line.*`. Stable; screens and tests key on it. */
  id: string;
  count: number;
  /**
   * What the line means for the reader. `stale`: something they believed is now wrong.
   * `unknown`: something nobody has checked or that nothing reaches. `current`: something
   * that happened, worth knowing, contradicting nothing. The headline sums the first two.
   */
  state: BriefState;
}

export interface BriefCore {
  core: BriefCoreKey;
  availability: BriefAvailability;
  /**
   * The core's magnitude — concepts, pages, guide files, calls since the anchor — so the card
   * says how big the thing is before it says what moved. `null` when this session cannot count it.
   */
  headline: number | null;
  /** Items in each state. `null` when this core cannot state that column here. */
  current: number | null;
  stale: number | null;
  unknown: number | null;
  /** Lines with a count of zero are kept: the screen decides whether a zero is worth ink. */
  lines: readonly BriefLine[];
}

/**
 * The one line above the cards: what a reader now has to learn (items in the stale state)
 * and what could not be checked (items in the unknown state). Two sums of named things,
 * never combined into one, and never a score.
 */
export function briefTotals(cores: readonly BriefCore[]): { stale: number; unknown: number } {
  let stale = 0;
  let unknown = 0;
  for (const core of cores) {
    for (const line of core.lines) {
      if (line.state === 'stale') stale += line.count;
      else if (line.state === 'unknown') unknown += line.count;
    }
  }
  return { stale, unknown };
}

/** Lines worth showing: nonzero counts, in the order the builder ranked them. */
export function visibleLines(core: BriefCore): readonly BriefLine[] {
  return core.lines.filter((line) => line.count > 0);
}

/** ISO/epoch → ms, or null for anything unparseable. Ledger and log stamps are ISO-8601. */
function toMs(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const ms = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function isAfter(value: string | number | null | undefined, anchorMs: number): boolean {
  const ms = toMs(value);
  return ms != null && ms > anchorMs;
}
