import type { GitChangeEntry } from "@/shared/lib/git/tauri-git";
import type { AtlasGitDiffFile } from "@/shared/lib/git/atlas-git-record";

/** A concept a step changed, as a chip: its node id, display label and kind. */
export interface CommitConcept {
  id: string;
  label: string;
  kind: string;
}

/**
 * Does this changed file carry that concept? Kind and slug tail are both compared, as the
 * forward `matchNodeId` does: `domains/orders.md` and `capabilities/orders.md` share a tail, and
 * matching the tail alone would aim the restore door at the wrong file.
 */
export function fileCarriesNode(file: { slug: string; kind: string | null }, nodeId: string): boolean {
  if (!file.kind) return false;
  const tail = file.slug.split("/").pop() ?? file.slug;
  return nodeId === `${file.kind}:${tail}`;
}

/**
 * The name a changed document goes by in the files lens: its concept's label, else its file name.
 * A document without a concept drops `.md` like the uncommitted chips; config keeps its name.
 */
export function changedDocumentLabel(
  entry: Pick<GitChangeEntry, "path" | "slug" | "kind">,
  concepts: readonly CommitConcept[],
): string {
  const concept = concepts.find((candidate) => fileCarriesNode(entry, candidate.id));
  if (concept) return concept.label;
  const fileName = entry.path.split("/").pop() ?? entry.path;
  return entry.kind ? fileName.replace(/\.md$/i, "") : fileName;
}

/**
 * Find a patch by file path, exact first, then by tail: list paths are vault-relative and
 * patch paths repository-relative.
 */
export function patchOf(perFile: readonly AtlasGitDiffFile[], path: string | null): AtlasGitDiffFile | null {
  if (!path) return null;
  return (
    perFile.find((file) => file.path === path) ??
    perFile.find((file) => file.path.endsWith(path) || path.endsWith(file.path)) ??
    null
  );
}

/** One-character file status: the letter carries the meaning, not the colour. */
export function statusMark(status: string): string {
  switch (status) {
    case "added":
      return "A";
    case "deleted":
      return "D";
    case "renamed":
      return "R";
    default:
      return "M";
  }
}
