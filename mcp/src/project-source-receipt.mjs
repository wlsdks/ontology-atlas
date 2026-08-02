import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const PROJECT_SOURCE_RECEIPT_VERSION = 1;
export const PROJECT_SOURCE_STATE_RELATIVE_PATH = '.ontology-atlas/project-sources.json';

const RECEIPT_STATUSES = new Set(['needs_evidence', 'review_required', 'verified_current']);
const GAP_IDS = new Set([
  'source_unbound',
  'multiple_active_sources',
  'receipt_missing',
  'receipt_malformed',
  'source_role_evidence_missing',
  'declared_source_path_missing',
  'source_inventory_truncated',
  'ontology_changed',
  'source_changed',
]);
const ACTION_IDS = new Set([
  'connect_source',
  'repair_source_binding',
  'measure_source',
  'record_source_role',
  'repair_source_path',
  'review_inventory_limit',
  'remeasure_source',
  'use_current_evidence',
]);

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
  if (!value || typeof value !== 'object' || !GAP_IDS.has(value.id)) return undefined;
  return {
    id: value.id,
    ...(string(value.nodeSlug) ? { nodeSlug: value.nodeSlug } : {}),
  };
}

function sanitizeAction(value) {
  if (!value || typeof value !== 'object' || !ACTION_IDS.has(value.id)) return null;
  return {
    id: value.id,
    ...(string(value.target) ? { target: value.target } : {}),
  };
}

function safeRelativePath(value) {
  const path = string(value);
  if (!path) return false;
  const normalized = path.replaceAll('\\', '/');
  return !normalized.startsWith('/')
    && !/^[A-Za-z]:\//.test(normalized)
    && !normalized.split('/').includes('..');
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
    || value.witnessSummary.total < 0
    || value.witnessSummary.supported < 0
    || value.witnessSummary.missing < 0
    || value.witnessSummary.total
      !== value.witnessSummary.supported + value.witnessSummary.missing
    || !Array.isArray(value.witnesses)
    || value.witnesses.length !== value.witnessSummary.total
    || !value.diagnostics
    || !(typeof value.diagnostics.dirty === 'boolean' || value.diagnostics.dirty === null)
    || typeof value.diagnostics.truncated !== 'boolean'
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
      || !safeRelativePath(witness.path)
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
  if (witnesses.filter((witness) => witness.supported).length !== value.witnessSummary.supported) {
    return null;
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
      dirty: value.diagnostics.dirty,
      truncated: value.diagnostics.truncated,
    },
  };
}

/**
 * Reads the local sidecar and returns the exact public view used by agent_brief.
 * Source currentness is deliberately `unavailable`: this reader does not
 * independently rescan the private root, so it must not restamp a saved receipt
 * as current. Graph currentness is checked only when the caller could derive a
 * complete project-scoped hash; a bounded/unknown scope is not evidence of drift.
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
  if (typeof graphHash === 'string' && receipt.graphHash !== graphHash) {
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
