/**
 * What the folder held, week by week, rewound from Git and never accumulated.
 * Derived, not recorded: recomputing from the folder and its Git history gives the same numbers, and Atlas writes
 * no time series of its own, which would be a second canonical store (`forbidden.md`). Separate counts, never one
 * score, because the signal is their divergence. No history is not zero. The walk runs backwards from the exactly
 * known present, since `git_history` returns only the last N commits. Counting uses paths, which are in the
 * commit, not frontmatter, which `git_history` reads from disk now.
 */

/** The four layers a vault folder holds. Changing what a past week counts moves `VAULT_HISTORY_RULES_VERSION`. */
export type VaultLayer = "document" | "writeUp" | "concept" | "module";

/**
 * Every layer, once. Anything that folds over the layers reads this, so a new layer cannot be missed by an
 * aggregate the way hand-written lists missed it.
 */
export const VAULT_LAYERS: readonly VaultLayer[] = ["concept", "module", "writeUp", "document"];

export interface VaultLayerCounts {
  /** Files kept verbatim under `sources/` — what the Library gathers. */
  document: number;
  /** Pages under `wiki/` — what was written from those documents. */
  writeUp: number;
  /** Markdown under `architecture/` — the implementation shape the map hangs meaning on. */
  module: number;
  /** Every other Markdown file in the folder — the ontology the map draws. */
  concept: number;
}

/** One commit as `git_history` reports it: newest first, paths vault-relative. */
export interface VaultHistoryCommit {
  hash: string;
  /** Authored/committed ISO timestamp. */
  isoTime: string;
  files: ReadonlyArray<{ path: string; status: "added" | "modified" | "deleted" | "renamed" }>;
}

export interface VaultHistoryPoint {
  /** ISO timestamp of the commit this count is *after*. */
  isoTime: string;
  /** The commit a reader recomputes from. Every point must be checkable. */
  hash: string;
  counts: VaultLayerCounts;
}

/**
 * The counting rules' version, stamped on every series so an old picture is never silently redrawn by new rules;
 * it changes whenever `classifyVaultPath` does.
 */
export const VAULT_HISTORY_RULES_VERSION = 3;

const WIKI_DIR = "wiki";
const SOURCES_DIR = "sources";
const ARCHITECTURE_DIR = "architecture";

/**
 * Which layer a vault-relative path belongs to, or `null` if not counted. Furniture is excluded: `_`-prefixed
 * files under `wiki/` and the root README.
 */
export function classifyVaultPath(path: string): VaultLayer | null {
  const clean = String(path ?? "").trim().replace(/^\.\//, "");
  if (!clean || clean.startsWith(".")) return null;
  // Match a folder by path segment, not prefix: the bundled sample's manifest carries repo-relative paths
  // (`samples/storefront/architecture/...`).
  const segments = clean.split("/");
  // A trailing slash is a directory, not a file in it: `sources/` names the folder itself.
  if (!segments.at(-1)) return null;
  const dirs = segments.slice(0, -1);
  const inFolder = (dir: string) => dirs.includes(dir);
  if (inFolder(SOURCES_DIR)) return "document"; // Any format counts under sources/.
  if (!clean.endsWith(".md")) return null;
  const name = segments.at(-1) ?? "";
  if (name.startsWith("_")) return null;
  // The root README is the vault's front page, not a concept; the summary card never counts `kind: vault-readme`,
  // so counting it here would make the chart and card disagree. Root only: `elements/README.md` is a real node.
  if (dirs.length === 0 && /^readme\.md$/i.test(name)) return null;
  if (inFolder(WIKI_DIR)) return "writeUp";
  if (inFolder(ARCHITECTURE_DIR)) return "module";
  return "concept";
}

const emptyCounts = (): VaultLayerCounts => ({ document: 0, writeUp: 0, module: 0, concept: 0 });

/** Takes paths rather than documents so the present and the past are counted by the same rule. */
export function countVaultPaths(paths: readonly string[]): VaultLayerCounts {
  const counts = emptyCounts();
  for (const path of paths) {
    const layer = classifyVaultPath(path);
    if (layer) counts[layer] += 1;
  }
  return counts;
}

/**
 * Rewinds `commits` (newest first) from `present`, one point per commit, returned oldest first; each point names
 * the commit it is true after. Only additions and deletions change a count. O(total files in the commits).
 */
export function replayVaultHistory(
  present: VaultLayerCounts,
  commits: readonly VaultHistoryCommit[],
): VaultHistoryPoint[] {
  const points: VaultHistoryPoint[] = [];
  const running: VaultLayerCounts = { ...present };

  for (const commit of commits) {
    points.push({ isoTime: commit.isoTime, hash: commit.hash, counts: { ...running } });
    for (const file of commit.files ?? []) {
      const layer = classifyVaultPath(file.path);
      if (!layer) continue;
      // Undo the commit: what it added did not exist before it, what it deleted did.
      if (file.status === "added") running[layer] -= 1;
      else if (file.status === "deleted") running[layer] += 1;
    }
  }

  // The present comes from disk and the window from commits, so the rewind can pass zero (a deletion not yet
  // committed, an add whose earlier state is outside the window); clamp rather than draw negative files.
  for (const point of points) {
    for (const layer of VAULT_LAYERS) {
      if (point.counts[layer] < 0) point.counts[layer] = 0;
    }
  }
  return points.reverse();
}

export interface VaultHistoryWeek {
  /** ISO date (UTC) of the Monday that starts this week. */
  week: string;
  /** The commit the week's count is taken from — its last within the week. */
  hash: string;
  counts: VaultLayerCounts;
}

/** The Monday (UTC) that starts the week containing `iso`. */
function weekStart(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const utc = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  utc.setUTCDate(utc.getUTCDate() - ((utc.getUTCDay() + 6) % 7));
  return utc.toISOString().slice(0, 10);
}

/** One point per week: what the folder held at the end of that week. Weeks without commits are absent, not zero. */
export function weeklyVaultHistory(
  points: readonly VaultHistoryPoint[],
): VaultHistoryWeek[] {
  const byWeek = new Map<string, VaultHistoryWeek>();
  for (const point of points) {
    const week = weekStart(point.isoTime);
    if (!week) continue;
    // Points arrive oldest first, so the last write for a week is that week's end state.
    byWeek.set(week, { week, hash: point.hash, counts: { ...point.counts } });
  }
  return [...byWeek.values()].sort((a, b) => a.week.localeCompare(b.week));
}

/** The largest count any layer reaches, which a shared baseline scales to. */
export function vaultHistoryPeak(weeks: readonly VaultHistoryWeek[]): number {
  let peak = 0;
  for (const week of weeks) {
    for (const layer of VAULT_LAYERS) peak = Math.max(peak, week.counts[layer]);
  }
  return peak;
}

/**
 * The dates a picture cannot state: the week a layer first existed and the week it grew most, read off the same
 * weekly points the chart draws so they cannot disagree.
 */
export interface VaultLayerMilestones {
  layer: VaultLayer;
  /** The first week this layer held anything at all, or null if it never has. */
  began: { week: string; count: number } | null;
  /** The week this layer grew the most, and by how much. Null when it never grew. */
  grew: { week: string; delta: number } | null;
  /** What it holds at the end of the window. */
  latest: number;
}

/**
 * Milestones per layer over an ascending weekly series. The window's first week is never a beginning: a beginning
 * is a layer empty in one week and not in the next.
 */
export function vaultLayerMilestones(
  weeks: readonly VaultHistoryWeek[],
  layer: VaultLayer,
): VaultLayerMilestones {
  let began: { week: string; count: number } | null = null;
  let grew: { week: string; delta: number } | null = null;
  for (let i = 1; i < weeks.length; i += 1) {
    const previous = weeks[i - 1]?.counts[layer] ?? 0;
    const point = weeks[i];
    if (!point) continue;
    const current = point.counts[layer];
    if (!began && previous === 0 && current > 0) began = { week: point.week, count: current };
    const delta = current - previous;
    if (delta > 0 && (!grew || delta > grew.delta)) grew = { week: point.week, delta };
  }
  // A layer that began and grew most in the same week reports only the beginning.
  if (began && grew && began.week === grew.week) grew = null;
  return { layer, began, grew, latest: weeks.at(-1)?.counts[layer] ?? 0 };
}
