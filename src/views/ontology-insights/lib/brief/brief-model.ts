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
 * log yet), which is a different sentence from "cannot look"; `reading` means the app is
 * still walking the folder, `unreadable` means it tried and could not, and `no-source` means
 * nothing is bound to read: the harness lives in a code repository this vault has not been
 * connected to. Inside the app
 * those last two used to read "measured in the app only", which told a person standing in
 * the app to go and get the app (measured on this repository's own vault, 2026-09-19).
 */
type BriefAvailability = 'measured' | 'app-only' | 'no-data' | 'reading' | 'unreadable' | 'no-source';

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

/**
 * One named thing under a line: which concept, which path, when it moved, and when the
 * concept's own document last moved. The screen renders these instead of sending a reader
 * to another screen that counts something else.
 */
export interface BriefLineDetail {
  name: string;
  /** The concept's vault document slug — what `get_concept` takes. `null` when it owns no document. */
  slug: string | null;
  path: string;
  /** When the path moved. `null` for a path that is simply gone. */
  at: string | null;
  /** When the concept document last moved, for the comparison the verdict rests on. */
  docAt: string | null;
  href: string;
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
