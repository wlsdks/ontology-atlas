/**
 * Pure reading-hierarchy logic for the vault git record screen (no I/O, no React).
 *
 * **Why this is separate from `atlas-git-changes.ts`.** That file decides *what
 * gets recorded* — the commit arithmetic, a contract shared with the CLI and the
 * Rust side, so it cannot move. This file decides how a person reads it, and
 * screen copy has to be free to change.
 *
 * Everything here reduces to "keep only what the reader needs to judge":
 *
 * 1. **Concepts apart from other files.** The judgement on this screen is "what
 *    changed in my concepts", not a file list, so `.gitignore` and `package.json`
 *    still appear but fold away.
 * 2. **Path split into name and place.** Drawing
 *    `capabilities/map-label-budget` whole in mono gives 15 rows identical
 *    weight; the name takes the body ramp and the place drops to the label ramp.
 * 3. **Git plumbing stripped.** `diff --git`, `index 4a1c0de..8b71f92` and
 *    `@@ -12,6 +12,9 @@` are tools talking to tools; the reader judges on added
 *    and removed lines.
 * 4. **Our own commit subjects are read back into plain language.** Leaving
 *    `ontology snapshot: +3 concepts, ~2 updated (...)` on a Korean screen means
 *    we failed to translate a string we wrote ourselves. Commits not in our
 *    format — hand-written, or from another tool — are shown verbatim.
 */

import type { AtlasGitChangeLike } from "./atlas-git-changes";

/** Minimal shape a record row needs — Rust's `ChangeEntry` satisfies it. */

/** A `kind` means the file is a vault node (Rust reads its frontmatter and attaches it). */
export function splitConceptChanges<T extends AtlasGitChangeLike>(
  changes: readonly T[],
): { concepts: T[]; others: T[] } {
  const concepts: T[] = [];
  const others: T[] = [];
  for (const change of changes) {
    if (change.kind) concepts.push(change);
    else others.push(change);
  }
  return { concepts, others };
}

/**
 * Path → `{ name, place }`. The `.md` extension is stripped from concepts, where
 * it is noise, but kept on other files, where it is part of the identity.
 */
export function describeChangePath(
  raw: string,
  options: { isConcept?: boolean } = {},
): { name: string; place: string } {
  const trimmed = raw.replace(/\/+$/, "");
  const cut = trimmed.lastIndexOf("/");
  const last = cut === -1 ? trimmed : trimmed.slice(cut + 1);
  const place = cut === -1 ? "" : trimmed.slice(0, cut);
  const name = options.isConcept ? last.replace(/\.md$/i, "") : last;
  return { name: name || trimmed, place };
}

export type AtlasGitDiffLineKind = "added" | "removed" | "context" | "skip";

export interface AtlasGitDiffLine {
  kind: AtlasGitDiffLineKind;
  text: string;
}

export interface AtlasGitDiffFile {
  /** The new path (`b/…`), or the old one for a deletion. */
  path: string;
  lines: AtlasGitDiffLine[];
  added: number;
  removed: number;
}

/**
 * File-header plumbing. `+++`/`---` start with `+`/`-`, so this **must** be
 * filtered before classifying line kinds: reverse the order and the two path
 * header lines are counted as one added and one removed line.
 */
const DIFF_PLUMBING =
  /^(index |new file mode |deleted file mode |old mode |new mode |similarity index |dissimilarity index |rename from |rename to |copy from |copy to |Binary files |GIT binary patch|--- |\+\+\+ |\\)/;

export function parseUnifiedDiff(diffText: string): AtlasGitDiffFile[] {
  const files: AtlasGitDiffFile[] = [];
  let current: AtlasGitDiffFile | null = null;

  for (const line of diffText.split("\n")) {
    const header = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (header) {
      current = { path: header[2] ?? header[1] ?? "", lines: [], added: 0, removed: 0 };
      files.push(current);
      continue;
    }
    if (!current) continue;
    if (DIFF_PLUMBING.test(line)) continue;

    if (line.startsWith("@@")) {
      // `@@` becomes a `skip` line rather than being dropped: that lines were
      // omitted is something the reader must know (hiding it makes the diff
      // lie), while the coordinates are not. No marker before the first hunk —
      // that just means the file starts here.
      if (current.lines.length > 0) current.lines.push({ kind: "skip", text: "" });
      continue;
    }

    if (line.startsWith("+")) {
      current.lines.push({ kind: "added", text: line.slice(1) });
      current.added += 1;
    } else if (line.startsWith("-")) {
      current.lines.push({ kind: "removed", text: line.slice(1) });
      current.removed += 1;
    } else if (line.startsWith(" ")) {
      current.lines.push({ kind: "context", text: line.slice(1) });
    }
    // Everything else is dropped. A blank line inside a document arrives as
    // context (`" "`) and is caught above; blanks reaching here are split tails.
  }

  // Trailing blank context lines are the file's final newline — nothing to show.
  for (const file of files) {
    while (
      file.lines.length > 0 &&
      file.lines[file.lines.length - 1]!.kind === "context" &&
      file.lines[file.lines.length - 1]!.text === ""
    ) {
      file.lines.pop();
    }
  }

  return files;
}

export interface AtlasGitStepSummary {
  /** False means the subject is not ours; show `raw` verbatim. */
  matched: boolean;
  added: number;
  updated: number;
  renamed: number;
  removed: number;
  slugs: string[];
  /** The `+N` in parentheses: names not spelled out. */
  overflow: number;
  raw: string;
}

const SUBJECT_PREFIX = "ontology snapshot:";

/**
 * Reads back a subject we generated, e.g. `ontology snapshot: +2 concepts,
 * ~1 updated, →1 renamed, -1 removed (capabilities/foo, elements/bar, +3)`.
 * Anything else returns `matched:false` and is left alone — in a hand-written or
 * third-party commit the subject already is a person's own words.
 */
export function describeSnapshotSubject(subject: string): AtlasGitStepSummary {
  const base: AtlasGitStepSummary = {
    matched: false,
    added: 0,
    updated: 0,
    renamed: 0,
    removed: 0,
    slugs: [],
    overflow: 0,
    raw: subject,
  };
  if (!subject.startsWith(SUBJECT_PREFIX)) return base;

  let rest = subject.slice(SUBJECT_PREFIX.length).trim();

  const slugs: string[] = [];
  let overflow = 0;
  const paren = /\(([^()]*)\)\s*$/.exec(rest);
  if (paren) {
    rest = rest.slice(0, paren.index).trim();
    for (const piece of (paren[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
      const more = /^\+(\d+)$/.exec(piece);
      if (more) overflow = Number(more[1]);
      else slugs.push(piece);
    }
  }

  const counts = { added: 0, updated: 0, renamed: 0, removed: 0 };
  for (const piece of rest.split(",").map((s) => s.trim()).filter(Boolean)) {
    const added = /^\+(\d+) concepts?$/.exec(piece);
    if (added) {
      counts.added = Number(added[1]);
      continue;
    }
    const updated = /^~(\d+) updated$/.exec(piece);
    if (updated) {
      counts.updated = Number(updated[1]);
      continue;
    }
    const renamed = /^→(\d+) renamed$/.exec(piece);
    if (renamed) {
      counts.renamed = Number(renamed[1]);
      continue;
    }
    const removed = /^-(\d+) removed$/.exec(piece);
    if (removed) counts.removed = Number(removed[1]);
  }

  return { ...base, ...counts, slugs, overflow, matched: true };
}
