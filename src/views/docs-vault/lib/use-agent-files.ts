import { useEffect, useState } from 'react';
import type { VaultManifest } from '@/entities/docs-vault';
import {
  analyzeAgentFiles,
  buildAgentFilesUiModel,
  manifestIncludesRepoRoot,
  selectAgentFileDocs,
  WEB_SCAN_ANALYZE_OPTIONS,
  type AgentFilesUiModel,
} from '@/entities/agent-files';

/**
 * Read-only agent-file detection for the sidebar. Null unless a local vault is open and it
 * includes the repo root: dot directories are invisible to the FSA walk, so a deeper vault
 * cannot honestly claim this view (the packaged sample is docs/ontology, with no root).
 */
export function useAgentFilesModel(
  manifest: VaultManifest,
  fileHandles: Map<string, FileSystemFileHandle>,
): AgentFilesUiModel | null {
  const [model, setModel] = useState<AgentFilesUiModel | null>(null);
  // When the gate closes the result is demoted to null rather than cleared, avoiding a
  // synchronous setState inside an effect.
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
        // Read failure (revoked permission, deleted file): hide the group.
        if (!cancelled) setModel(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gate, manifest, fileHandles]);

  return gate ? model : null;
}
