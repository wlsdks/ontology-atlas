import type { VaultDoc } from "@/entities/docs-vault";
import { recheckBasis, type RecheckCandidate } from "@/features/library-rounds";
import { buildEvidenceConcepts, resolveEvidenceStates } from "@/shared/lib/git/evidence-states";
import { EVIDENCE_TEXT_CHUNK, movedEvidencePairs, unchangedEvidencePairs } from "@/shared/lib/git/evidence-verdict.mjs";
import { gitEvidenceTextPairs, gitPathsLastChange, type GitPathLastChange } from "@/shared/lib/git/tauri-git";

/** The kinds `validate_vault` counts: a recheck takes stale concepts of all three. */
const RECHECK_KINDS = new Set(["domain", "capability", "element"]);
/** The native walk answers this many paths per call (MAX_EVIDENCE_PATHS: src-tauri/src/git/evidence.rs). */
const WALK_PATH_LIMIT = 512;

/**
 * The concepts whose cited code changed after their document, by the rule `validate_vault` and the
 * map use (`resolveEvidenceStates` with the comment-only re-read), each with the commit that dates
 * its document. `null` when Git could not be read.
 */
export async function readStaleCandidates(rootPath: string, docs: readonly VaultDoc[]): Promise<RecheckCandidate[] | null> {
  const nodes = docs
    .filter((doc) => RECHECK_KINDS.has(String(doc.frontmatter.kind ?? "")))
    .map((doc) => ({ id: doc.slug, docSlug: doc.slug }));
  const concepts = buildEvidenceConcepts(docs, nodes);
  const vaultPaths = concepts.flatMap((concept) => (concept.docPath ? [concept.docPath] : []));
  const repoPaths = [...new Set(concepts.flatMap((concept) => concept.evidencePaths))];
  const rows: GitPathLastChange[] = [];
  for (let vaultFrom = 0, repoFrom = 0; vaultFrom < vaultPaths.length || repoFrom < repoPaths.length; ) {
    const vault = vaultPaths.slice(vaultFrom, vaultFrom + WALK_PATH_LIMIT);
    const repo = repoPaths.slice(repoFrom, repoFrom + WALK_PATH_LIMIT - vault.length);
    vaultFrom += vault.length;
    repoFrom += repo.length;
    const answer = await gitPathsLastChange(rootPath, repo, vault);
    if (!answer) return null;
    rows.push(...answer);
  }
  const changes = new Map(rows.map((row) => [row.path, row]));
  const pairs = movedEvidencePairs(concepts, changes);
  const unchanged = new Set<string>();
  for (let start = 0; start < pairs.length; start += EVIDENCE_TEXT_CHUNK) {
    const readings = await gitEvidenceTextPairs(rootPath, pairs.slice(start, start + EVIDENCE_TEXT_CHUNK)).catch(() => null);
    for (const key of unchangedEvidencePairs(readings ?? [])) unchanged.add(key);
  }
  const states = resolveEvidenceStates(concepts, changes, changes, unchanged);
  return states.rows.flatMap((row): RecheckCandidate[] => {
    if (row.verdict !== "stale" || !row.slug) return [];
    const path = `${row.slug}.md`;
    const doc = changes.get(path);
    if (!doc?.lastCommit || !doc.lastChangedAt) return [];
    const moved = row.moved.map((file) => file.path);
    return [{
      slug: row.slug,
      path,
      docCommit: doc.lastCommit,
      docChangedAt: doc.lastChangedAt,
      moved,
      basis: recheckBasis(doc.lastCommit, moved.map((file) => ({ path: file, commit: changes.get(file)?.lastCommit ?? null }))),
    }];
  });
}
