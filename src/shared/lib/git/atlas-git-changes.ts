/**
 * Mirrors the change summary of `src-tauri/src/git/changes.rs`; `atlas-git-summary.contract.test.ts`
 * pins the fixtures the Rust unit tests also run. The panel's input arrives classified by Rust; the porcelain parser serves the
 * contract.
 */

export type AtlasGitChangeStatus = "added" | "modified" | "deleted" | "renamed";

/** One `git status --porcelain` row. */
export interface AtlasGitPorcelainRow {
  index: string;
  worktree: string;
  path: string;
  renamedFrom: string | null;
}

/**
 * The minimal shape the summary formula needs — satisfied by the Rust IPC's
 * `ChangeEntry` (camelCase).
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
  /** For per-entry rendering: a lookup by slug is wrong when one slug exists under two kinds. */
  entries: T[];
}

/**
 * `-z` (NUL-separated, no quoting) matches Rust: git's default quoting C-quotes non-ASCII paths.
 * A rename record is `XY new\0orig\0`, new path first.
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

export function classifyPorcelainChange(
  row: Pick<AtlasGitPorcelainRow, "index" | "worktree">,
): AtlasGitChangeStatus {
  if (row.index === "D" || row.worktree === "D") return "deleted";
  if (row.index === "R") return "renamed";
  if ((row.index === "?" && row.worktree === "?") || row.index === "A") return "added";
  return "modified";
}

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
 * The snapshot summary line, e.g. `ontology snapshot: +2 concepts, ~1 updated
 * (capabilities/foo, elements/bar, +1)`.
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
