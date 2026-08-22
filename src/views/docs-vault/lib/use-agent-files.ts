import { useEffect, useState } from 'react';
import type { VaultManifest } from '@/entities/docs-vault';
import {
  analyzeAgentFiles,
  buildAgentFilesUiModel,
  manifestIncludesRepoRoot,
  selectAgentFileDocs,
  WEB_SCAN_ANALYZE_OPTIONS,
  type AgentFilesUiModel,
} from './agent-files';

/**
 * Read-only agent-file detection for the docs workbench sidebar.
 *
 * Reads the few root-level agent docs (CLAUDE.md / AGENTS.md / GEMINI.md …)
 * through the vault file handles, runs the shared pure analysis
 * (`./agent-files`), and returns a compact UI model — or `null` when the
 * picked vault does not include the repo root (dot-dirs are invisible to the
 * FSA walk, so a deeper vault cannot honestly claim this view) or when no
 * writable local vault is loaded (packaged sample = docs/ontology, no root).
 */
export function useAgentFilesModel(
  manifest: VaultManifest,
  fileHandles: Map<string, FileSystemFileHandle>,
): AgentFilesUiModel | null {
  const [model, setModel] = useState<AgentFilesUiModel | null>(null);
  // The gate: only when a local vault is open (file handles exist) and CLAUDE.md/AGENTS.md are
  // visible at the manifest root. When the gate closes, the return value is demoted to null rather
  // than clearing state (avoiding a synchronous setState inside an effect).
  const gate = fileHandles.size > 0 && manifestIncludesRepoRoot(manifest.docs);

  useEffect(() => {
    if (!gate) return;
    let cancelled = false;
    (async () => {
      try {
        const agentDocs = selectAgentFileDocs(manifest.docs);
        const files = await Promise.all(
          agentDocs.map(async (doc) => {
            const handle = fileHandles.get(doc.slug);
            if (!handle) return { path: doc.path, content: null };
            const file = await handle.getFile();
            return { path: doc.path, content: await file.text() };
          }),
        );
        const analysis = analyzeAgentFiles({
          files,
          existingPaths: manifest.docs.map((doc) => doc.path),
          unverifiablePrefixes: [...WEB_SCAN_ANALYZE_OPTIONS.unverifiablePrefixes],
          verifiableExtensions: [...WEB_SCAN_ANALYZE_OPTIONS.verifiableExtensions],
        });
        if (!cancelled) setModel(buildAgentFilesUiModel(analysis, manifest.docs));
      } catch {
        // read failure (revoked permission, deleted file) — hide the group
        if (!cancelled) setModel(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gate, manifest, fileHandles]);

  return gate ? model : null;
}
