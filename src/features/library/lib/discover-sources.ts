import {
  VAULT_SOURCES_DIR,
  discoverCandidatesInHandle,
  type SourceCandidate,
  type SourceDiscoveryReport,
} from "@/entities/docs-vault";
import { createVaultFileProjectSourceStore } from "@/shared/lib/project-source-store";
import { discoverTauriSourceCandidates } from "@/shared/lib/tauri-vault-fs";

/**
 * "Find documents" — **propose, never copy.**
 *
 * The whole point of the button is that it does not take anything. It walks a bounded
 * set of roots and returns what a directory listing already knows: name, extension,
 * size, mtime. No file is opened; content enters Atlas only after a person ticks a box.
 * That is the same shape decision 2026-08-21 (92) requires of every change proposal, and
 * it is what makes a walk over somebody's project folder something they can agree to.
 *
 * **Which roots, and why only these two:**
 *
 * 1. **The folder they opened**, minus `sources/` — a document already imported is not a
 *    candidate. Both surfaces can do this; the browser has the handle.
 * 2. **Project roots they bound themselves**, read from `.ontology-atlas/project-sources.json`.
 *    App only, and not by choice: a binding is an absolute path, and a browser has none.
 *    The dialog says so rather than pretending the list is complete.
 *
 * Nothing else is ever walked. `.claude/rules/local-first.md` forbids scanning arbitrary
 * files from a person's disk, and "arbitrary" means anything they did not hand over.
 */

interface DiscoveryRootPlan {
  rootPath: string;
  label: string;
  skipRelative: string[];
}

export interface DiscoveryOutcome extends SourceDiscoveryReport {
  /**
   * Whether project roots could be walked at all. False in a browser, where the absence
   * is stated on screen instead of being left as a shorter list with no explanation.
   */
  projectRootsReachable: boolean;
  /** Bound project roots that were walked, by label. */
  walkedRoots: string[];
}

/**
 * Bound project roots for this folder, newest binding per project.
 *
 * Read through the same store the Architecture surface uses, so there is one answer to
 * "which folders has this person bound" rather than two that can disagree.
 */
async function readBoundProjectRoots(
  handle: FileSystemDirectoryHandle,
): Promise<DiscoveryRootPlan[]> {
  try {
    const store = createVaultFileProjectSourceStore(handle);
    const result = await store.read();
    if (result.status !== "ok") return [];
    const seen = new Set<string>();
    const plans: DiscoveryRootPlan[] = [];
    for (const binding of result.bindings) {
      if (!binding.rootPath || seen.has(binding.rootPath)) continue;
      seen.add(binding.rootPath);
      plans.push({
        rootPath: binding.rootPath,
        // The last path segment, which is what a person calls the folder. The absolute
        // path stays in `.ontology-atlas/` where it belongs and never reaches a label.
        label: binding.rootPath.replace(/\/+$/, "").split("/").pop() || binding.projectSlug,
        skipRelative: [],
      });
    }
    return plans;
  } catch {
    return [];
  }
}

/**
 * Walk the granted roots and return candidates. Metadata only, on both surfaces.
 */
export async function discoverSources({
  handle,
  vaultRootPath,
  vaultLabel,
}: {
  handle: FileSystemDirectoryHandle;
  /** Absolute path, or null on the web. */
  vaultRootPath: string | null;
  vaultLabel: string;
}): Promise<DiscoveryOutcome> {
  if (vaultRootPath) {
    const projectRoots = await readBoundProjectRoots(handle);
    const roots = [
      { rootPath: vaultRootPath, label: vaultLabel, skipRelative: [VAULT_SOURCES_DIR] },
      ...projectRoots,
    ];
    const report = await discoverTauriSourceCandidates(roots);
    if (report) {
      return {
        ...report,
        projectRootsReachable: true,
        walkedRoots: projectRoots.map((root) => root.label),
      };
    }
  }

  // The browser half: the open folder only, and the dialog says that is the limit.
  const report = await discoverCandidatesInHandle(handle, {
    rootLabel: vaultLabel,
    skipRelative: [VAULT_SOURCES_DIR],
  });
  return { ...report, projectRootsReachable: false, walkedRoots: [] };
}

/**
 * Candidates whose name already exists in `sources/` are dropped before the dialog draws.
 *
 * A name match is not proof of sameness — the import refuses by sha256, which is the real
 * test — but proposing a file a person already has, only to refuse it one click later, is
 * a list that wastes their attention.
 */
export function withoutImportedNames(
  candidates: readonly SourceCandidate[],
  importedNames: ReadonlySet<string>,
): SourceCandidate[] {
  return candidates.filter((candidate) => !importedNames.has(candidate.name));
}
