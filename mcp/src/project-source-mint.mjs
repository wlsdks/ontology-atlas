/**
 * Minting a project source receipt, the pure half. No node imports, so the
 * browser workbench (`src/shared/lib/project-source-receipt.ts`), the CLI and
 * the MCP server share this one copy and mint byte-identical output.
 */

export const PROJECT_SOURCE_RECEIPT_VERSION = 1;

function normalizedRelativePath(value) {
  return String(value ?? '').replaceAll('\\', '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

/**
 * Every path a probe inventory supports: each file plus every ancestor folder,
 * so `path: src/features/x` counts when any file beneath exists. Minting and the
 * live re-check share it so they agree on "supported".
 */
export function witnessInventoryPaths(probe) {
  const files = new Set(['.']);
  for (const sourcePath of probe?.files ?? []) {
    const normalized = normalizedRelativePath(sourcePath);
    files.add(normalized);
    const segments = normalized.split('/');
    for (let index = 1; index < segments.length; index += 1) {
      files.add(segments.slice(0, index).join('/'));
    }
  }
  return files;
}

/**
 * Mints a receipt from a bounded probe and the declared source-role
 * claims. `tests/contract/project-source-connect.contract.test.ts` pins the app and MCP
 * entry points to byte-identical output.
 */
export function buildProjectSourceReceipt(input) {
  const files = witnessInventoryPaths(input.probe);
  const witnesses = (input.witnesses ?? []).map((candidate) => {
    const path = normalizedRelativePath(candidate.path);
    return { ...candidate, path, supported: files.has(path) };
  });
  const missing = witnesses.filter((candidate) => !candidate.supported);

  let status = 'verified_current';
  let topGap = null;
  let nextAction = { id: 'use_current_evidence' };
  if (witnesses.length === 0) {
    status = 'needs_evidence';
    topGap = { id: 'source_role_evidence_missing' };
    nextAction = { id: 'record_source_role' };
  } else if (input.probe.truncated) {
    status = 'review_required';
    topGap = { id: 'source_inventory_truncated' };
    nextAction = { id: 'review_inventory_limit' };
  } else if (missing.length > 0) {
    status = 'review_required';
    topGap = { id: 'declared_source_path_missing', nodeSlug: missing[0]?.nodeSlug };
    nextAction = { id: 'repair_source_path', target: missing[0]?.nodeSlug };
  }

  return {
    contractVersion: PROJECT_SOURCE_RECEIPT_VERSION,
    projectSlug: input.projectSlug,
    sourceId: input.probe.sourceId,
    sourceKind: input.probe.kind,
    sourceRevision: input.probe.revision,
    sourceFingerprint: input.probe.fingerprint,
    graphHash: input.graphHash,
    measuredAt: input.measuredAt ?? new Date().toISOString(),
    status,
    currentness: 'current',
    topGap,
    nextAction,
    witnessSummary: {
      total: witnesses.length,
      supported: witnesses.length - missing.length,
      missing: missing.length,
    },
    witnesses,
    diagnostics: { dirty: input.probe.dirty ?? null, truncated: Boolean(input.probe.truncated) },
  };
}
