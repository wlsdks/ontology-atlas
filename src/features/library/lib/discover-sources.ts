import {
  VAULT_SOURCES_DIR,
  discoverCandidatesInHandle,
  type SourceCandidate,
  type SourceDiscoveryReport,
} from "@/entities/docs-vault";
import { createVaultFileProjectSourceStore } from "@/shared/lib/project-source-store";
import { discoverTauriSourceCandidates } from "@/shared/lib/tauri-vault-fs";

/**
 * Proposes documents, never copies: listing metadata only, from the open folder (minus
 * its sources folder) and project roots the person bound. Nothing else is walked
 * (see .claude/rules/local-first.md).
 */

interface DiscoveryRootPlan {
  rootPath: string;
  label: string;
  skipRelative: string[];
}

export interface DiscoveryOutcome extends SourceDiscoveryReport {
  /** False in a browser, where the missing project roots are stated on screen. */
  projectRootsReachable: boolean;
  /** Bound project roots that were walked, by label. */
  walkedRoots: string[];
}

/** Newest binding per project, from the store the Architecture surface uses. */
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
        // The folder's last segment; the absolute path never reaches a label.
        label: binding.rootPath.replace(/\/+$/, "").split("/").pop() || binding.projectSlug,
        skipRelative: [],
      });
    }
    return plans;
  } catch {
    return [];
  }
}

/** Candidates from the granted roots, metadata only. */
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

/** Drops names already in `sources/`; the import still refuses by sha256. */
export function withoutImportedNames(
  candidates: readonly SourceCandidate[],
  importedNames: ReadonlySet<string>,
): SourceCandidate[] {
  return candidates.filter((candidate) => !importedNames.has(candidate.name));
}
