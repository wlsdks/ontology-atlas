/**
 * Atlas Git — the pure change-summary logic (no I/O, no React).
 *
 * Three surfaces (the CLI `cli/src/lib/git-snapshot.mjs`, Rust
 * `src-tauri/src/git.rs`, and the web panel) must report "added/modified/deleted
 * per kind, plus representative slugs" using the same formula, so the CLI's
 * parsePorcelain / classifyChange / formatSnapshotSummary are mirrored here in TS.
 * `tests/contract/atlas-git-summary.contract.test.ts` runs the same fixtures
 * through both and fails the moment either side drifts.
 *
 * The web panel's real input is `files: ChangeEntry[]` (path/status/kind/slug),
 * already classified by the Rust IPC; the porcelain parser exists for that
 * contract check and for any future raw-porcelain consumer.
 */

export type AtlasGitChangeStatus = "added" | "modified" | "deleted" | "renamed";

/** One `git status --porcelain` row. Same shape as the CLI's parsePorcelain. */
export interface AtlasGitPorcelainRow {
  index: string;
  worktree: string;
  path: string;
  renamedFrom: string | null;
}

/**
 * The minimal shape the summary formula needs — satisfied by both the Rust IPC's
 * `ChangeEntry` (camelCase) and the CLI's `buildChangeSummary` result.
 */
export interface AtlasGitChangeLike {
  status: AtlasGitChangeStatus | string;
  kind?: string | null;
  slug: string;
}

export interface AtlasGitStatusCounts {
  added: number;
  modified: number;
  deleted: number;
  renamed: number;
  total: number;
}

/** All changes for one kind — the panel's "A/M/D per kind + representative slugs" row. */
export interface AtlasGitKindGroup<T extends AtlasGitChangeLike = AtlasGitChangeLike> {
  /** The frontmatter kind. Null for non-markdown or unknown files, which the panel labels "other". */
  kind: string | null;
  counts: AtlasGitStatusCounts;
  /** The group's representative slugs, in order of appearance; the caller truncates. */
  slugs: string[];
  /**
   * The original change entries, in order of appearance. `slugs` is the short list
   * for the summary sentence; this is what **per-entry rendering** needs, because a
   * row also has to show the status and the path. Returning slugs alone would force
   * consumers to walk the source array again and look entries up by slug — which is
   * wrong whenever the same slug exists under two kinds.
   */
  entries: T[];
}

/**
 * Mirror of the CLI's parsePorcelain — `git status --porcelain -z` output → rows.
 *
 * `-z` (NUL-separated, no quoting) matches the CLI, which moved off the newline
 * form because git's default `core.quotePath` C-quotes any non-ASCII path and a
 * Korean filename broke the whole snapshot (bug sweep 2026-09-01). A rename
 * record is `XY new\0orig\0` — new path first, no ` -> `.
 */
export function parsePorcelainStatus(out: string): AtlasGitPorcelainRow[] {
  const tokens = out.split("\0");
  const rows: AtlasGitPorcelainRow[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token) continue;
    const index = token[0] ?? " ";
    const worktree = token[1] ?? " ";
    const path = token.slice(3);
    let renamedFrom: string | null = null;
    if (index === "R" || index === "C" || worktree === "R" || worktree === "C") {
      renamedFrom = tokens[i + 1] || null;
      i += 1;
    }
    rows.push({ index, worktree, path, renamedFrom });
  }
  return rows;
}

/** Mirror of the CLI's classifyChange — a porcelain row → a status. */
export function classifyPorcelainChange(
  row: Pick<AtlasGitPorcelainRow, "index" | "worktree">,
): AtlasGitChangeStatus {
  if (row.index === "D" || row.worktree === "D") return "deleted";
  if (row.index === "R") return "renamed";
  if ((row.index === "?" && row.worktree === "?") || row.index === "A") return "added";
  return "modified";
}

/** Counts per status — same formula as the Rust `SnapshotCounts`. */
export function countChangesByStatus(
  changes: readonly AtlasGitChangeLike[],
): AtlasGitStatusCounts {
  const counts = { added: 0, modified: 0, deleted: 0, renamed: 0, total: changes.length };
  for (const change of changes) {
    if (change.status === "added") counts.added += 1;
    else if (change.status === "deleted") counts.deleted += 1;
    else if (change.status === "renamed") counts.renamed += 1;
    else counts.modified += 1;
  }
  return counts;
}

/**
 * Group by kind, preserving order of appearance, with the unknown-kind (null)
 * group always last. The panel renders it as "capability +2 ~1 / element ~3 /
 * other 1".
 */
export function groupChangesByKind<T extends AtlasGitChangeLike>(
  changes: readonly T[],
): AtlasGitKindGroup<T>[] {
  const groups = new Map<string | null, T[]>();
  for (const change of changes) {
    const key = change.kind ?? null;
    const list = groups.get(key);
    if (list) list.push(change);
    else groups.set(key, [change]);
  }
  const named: AtlasGitKindGroup<T>[] = [];
  let other: AtlasGitKindGroup<T> | null = null;
  for (const [kind, list] of groups) {
    const group: AtlasGitKindGroup<T> = {
      kind,
      counts: countChangesByStatus(list),
      slugs: list.map((c) => c.slug),
      entries: list,
    };
    if (kind === null) other = group;
    else named.push(group);
  }
  return other ? [...named, other] : named;
}

/**
 * Mirror of the CLI's formatSnapshotSummary — a one-line commit summary in meaning
 * units, e.g. `ontology snapshot: +2 concepts, ~1 updated (capabilities/foo,
 * elements/bar, +1)`. The snapshot confirmation step shows it as the "this is what
 * will be committed" preview.
 */
export function formatSnapshotSummary(changes: readonly AtlasGitChangeLike[]): string {
  const { added, modified, deleted, renamed } = countChangesByStatus(changes);

  const parts: string[] = [];
  if (added > 0) parts.push(`+${added} concept${added === 1 ? "" : "s"}`);
  if (modified > 0) parts.push(`~${modified} updated`);
  if (renamed > 0) parts.push(`→${renamed} renamed`);
  if (deleted > 0) parts.push(`-${deleted} removed`);

  const headline =
    parts.length > 0
      ? `ontology snapshot: ${parts.join(", ")}`
      : "ontology snapshot: no concept changes";

  const slugs = changes.map((c) => c.slug);
  const shown = slugs.slice(0, 3);
  const overflow = slugs.length - shown.length;
  const slugText =
    shown.length > 0 ? ` (${shown.join(", ")}${overflow > 0 ? `, +${overflow}` : ""})` : "";

  return `${headline}${slugText}`;
}
