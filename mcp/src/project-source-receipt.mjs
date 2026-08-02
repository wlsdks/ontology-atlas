import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const PROJECT_SOURCE_RECEIPT_VERSION = 1;
export const PROJECT_SOURCE_STATE_RELATIVE_PATH = '.ontology-atlas/project-sources.json';

const RECEIPT_STATUSES = new Set(['needs_evidence', 'review_required', 'verified_current']);

function base(projectSlug, bindingCardinality, status, currentness, topGap, nextAction, receipt = null) {
  return {
    contractVersion: PROJECT_SOURCE_RECEIPT_VERSION,
    projectSlug,
    status,
    currentness,
    measuredAt: receipt?.measuredAt ?? null,
    topGap,
    nextAction,
    bindingCardinality,
    receipt,
  };
}

function malformed(projectSlug, bindingCardinality = 0) {
  return base(
    projectSlug,
    bindingCardinality,
    'invalid',
    'stale',
    { id: 'receipt_malformed' },
    { id: 'repair_source_binding' },
  );
}

function string(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function sanitizeGap(value) {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || !string(value.id)) return undefined;
  return {
    id: value.id,
    ...(string(value.nodeSlug) ? { nodeSlug: value.nodeSlug } : {}),
  };
}

function sanitizeAction(value) {
  if (!value || typeof value !== 'object' || !string(value.id)) return null;
  return {
    id: value.id,
    ...(string(value.target) ? { target: value.target } : {}),
  };
}

/** Pick only the public receipt contract. Unknown sidecar fields never reach MCP output. */
function sanitizeReceipt(value, projectSlug) {
  if (!value || typeof value !== 'object') return null;
  const topGap = sanitizeGap(value.topGap);
  const nextAction = sanitizeAction(value.nextAction);
  if (
    value.contractVersion !== PROJECT_SOURCE_RECEIPT_VERSION
    || value.projectSlug !== projectSlug
    || !string(value.sourceId)
    || !['git', 'folder'].includes(value.sourceKind)
    || !string(value.sourceRevision)
    || !string(value.sourceFingerprint)
    || !string(value.graphHash)
    || !string(value.measuredAt)
    || !RECEIPT_STATUSES.has(value.status)
    || topGap === undefined
    || !nextAction
    || !value.witnessSummary
    || !Number.isInteger(value.witnessSummary.total)
    || !Number.isInteger(value.witnessSummary.supported)
    || !Number.isInteger(value.witnessSummary.missing)
    || !Array.isArray(value.witnesses)
  ) {
    return null;
  }
  const witnesses = [];
  for (const witness of value.witnesses) {
    if (
      !witness || typeof witness !== 'object'
      || !string(witness.id)
      || !string(witness.nodeSlug)
      || !string(witness.role)
      || !string(witness.path)
      || typeof witness.supported !== 'boolean'
    ) return null;
    witnesses.push({
      id: witness.id,
      nodeSlug: witness.nodeSlug,
      role: witness.role,
      path: witness.path,
      supported: witness.supported,
    });
  }
  return {
    contractVersion: PROJECT_SOURCE_RECEIPT_VERSION,
    projectSlug,
    sourceId: value.sourceId,
    sourceKind: value.sourceKind,
    sourceRevision: value.sourceRevision,
    sourceFingerprint: value.sourceFingerprint,
    graphHash: value.graphHash,
    measuredAt: value.measuredAt,
    status: value.status,
    currentness: 'current',
    topGap,
    nextAction,
    witnessSummary: {
      total: value.witnessSummary.total,
      supported: value.witnessSummary.supported,
      missing: value.witnessSummary.missing,
    },
    witnesses,
    diagnostics: {
      dirty: typeof value.diagnostics?.dirty === 'boolean' ? value.diagnostics.dirty : null,
      truncated: value.diagnostics?.truncated === true,
    },
  };
}

/**
 * Reads the local sidecar and returns the exact public view used by agent_brief.
 * Source currentness is deliberately `unavailable`: this reader does not
 * independently rescan the private root, so it must not restamp a saved receipt
 * as current. Graph currentness is still checked against the compiled hash.
 */
export function readProjectSourceView(vaultRoot, projectSlug, graphHash) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(join(vaultRoot, PROJECT_SOURCE_STATE_RELATIVE_PATH), 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return base(
        projectSlug,
        0,
        'not_measured',
        'unavailable',
        { id: 'source_unbound' },
        { id: 'connect_source' },
      );
    }
    return malformed(projectSlug);
  }
  if (
    !parsed
    || parsed.contractVersion !== PROJECT_SOURCE_RECEIPT_VERSION
    || !Array.isArray(parsed.bindings)
  ) return malformed(projectSlug);

  const bindings = parsed.bindings.filter((binding) => binding?.projectSlug === projectSlug);
  if (bindings.length === 0) {
    return base(
      projectSlug,
      0,
      'not_measured',
      'unavailable',
      { id: 'source_unbound' },
      { id: 'connect_source' },
    );
  }
  if (bindings.length !== 1) {
    return base(
      projectSlug,
      bindings.length,
      'invalid',
      'stale',
      { id: 'multiple_active_sources' },
      { id: 'repair_source_binding' },
    );
  }
  const binding = bindings[0];
  if (
    !string(binding.sourceId)
    || !string(binding.rootPath)
    || !['git', 'folder'].includes(binding.kind)
    || !string(binding.boundAt)
  ) return malformed(projectSlug, 1);

  const receipt = sanitizeReceipt(binding.receipt, projectSlug);
  if (!receipt || receipt.sourceId !== binding.sourceId || receipt.sourceKind !== binding.kind) {
    return malformed(projectSlug, 1);
  }
  if (receipt.graphHash !== graphHash) {
    return base(
      projectSlug,
      1,
      'review_required',
      'stale',
      { id: 'ontology_changed' },
      { id: 'remeasure_source' },
      receipt,
    );
  }
  return base(
    projectSlug,
    1,
    receipt.status,
    'unavailable',
    receipt.topGap,
    receipt.nextAction,
    receipt,
  );
}
