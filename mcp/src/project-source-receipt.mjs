import { inspectProjectSource } from './project-source-inspection.mjs';
import { witnessInventoryPaths } from './project-source-mint.mjs';
import {
  SidecarPathError,
  createVaultSidecarTextExclusive,
  readVaultSidecarText,
  replaceVaultSidecarText,
} from './vault-sidecar.mjs';
// The vocabulary is declared in one place. This list used to exist twice, here
// and in `project-meaning-inventory.mjs`, and editing one left the other quietly
// rejecting (2026-08-17).
import {
  PROJECT_SOURCE_ACTION_IDS as ACTION_IDS,
  PROJECT_SOURCE_GAP_IDS as GAP_IDS,
} from './project-source-vocabulary.mjs';
import {
  PROJECT_SOURCE_RECEIPT_VERSION,
  buildProjectSourceReceipt,
} from './project-source-mint.mjs';

export { PROJECT_SOURCE_RECEIPT_VERSION, buildProjectSourceReceipt };
export const PROJECT_SOURCE_STATE_RELATIVE_PATH = '.ontology-atlas/project-sources.json';
const PROJECT_SOURCE_STATE_FILENAME = 'project-sources.json';
/** Keeps the private absolute root out of git. Mirrors the app's sidecar guard. */
const SIDECAR_IGNORE_CONTENT = '# Ontology Atlas local runtime state: not for commit.\n*\n';

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
 * A bound private root is used only to reproduce the app's bounded source probe;
 * neither the root nor raw inspection data crosses this public boundary. Graph
 * currentness is checked only when the caller could derive a complete
 * project-scoped hash; a bounded/unknown scope is not evidence of drift.
 */
export function readProjectSourceView(vaultRoot, projectSlug, graphHash) {
  let parsed;
  try {
    const stored = readVaultSidecarText(vaultRoot, PROJECT_SOURCE_STATE_FILENAME);
    if (!stored) {
      return base(
        projectSlug,
        0,
        'not_measured',
        'unavailable',
        { id: 'source_unbound' },
        { id: 'connect_source' },
      );
    }
    parsed = JSON.parse(stored.text);
  } catch {
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
  let probe = null;
  try {
    probe = inspectProjectSource(binding.rootPath);
  } catch {
    // A transient permission, filesystem, or Git failure must not erase a
    // previously valid receipt. It stays usable with unavailable currentness.
  }
  if (!probe) {
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
  if (
    probe.kind !== receipt.sourceKind
    || probe.sourceId !== receipt.sourceId
    || probe.fingerprint !== receipt.sourceFingerprint
    || probe.revision !== receipt.sourceRevision
  ) {
    return {
      ...base(
        projectSlug,
        1,
        'review_required',
        'stale',
        { id: 'source_changed' },
        { id: 'remeasure_source' },
        receipt,
      ),
      live: liveWitnessCheck(probe, receipt),
    };
  }
  return base(
    projectSlug,
    1,
    receipt.status,
    'current',
    receipt.topGap,
    receipt.nextAction,
    receipt,
  );
}

/**
 * What the changed source says *right now* about the receipt's witnesses.
 *
 * A receipt goes stale on the first commit after it was measured, which on an
 * actively developed repository is every day. The receipt stays stale — only
 * `connect_project_source` may restamp it — but the same bounded probe that
 * detected the change already holds the live inventory, so the witnesses are
 * re-checked against it here, in memory. `agent_brief` uses the answer to
 * verify reviewed coordinates against the live files instead of returning
 * `Primary: unknown` while every declared path still resolves (2026-09-04).
 *
 * Only relative witness paths and the probe's revision cross this boundary;
 * the absolute root never does.
 */
function liveWitnessCheck(probe, receipt) {
  const files = witnessInventoryPaths(probe);
  const witnesses = Array.isArray(receipt?.witnesses) ? receipt.witnesses : [];
  const missing = witnesses
    .filter((witness) => typeof witness?.path !== 'string' || !files.has(witness.path))
    .map((witness) => witness?.path ?? '')
    .sort((left, right) => left.localeCompare(right));
  const status = witnesses.length === 0
    ? 'no_witnesses'
    : probe.truncated
      ? 'inventory_truncated'
      : missing.length === 0
        ? 'witnesses_supported'
        : 'witnesses_missing';
  return {
    contract: 'projectSourceLiveWitnesses:v1',
    status,
    sourceRevision: probe.revision,
    sourceFingerprint: probe.fingerprint,
    witnessSummary: {
      total: witnesses.length,
      supported: witnesses.length - missing.length,
      missing: missing.length,
    },
    missingPaths: missing.slice(0, 5),
  };
}

// ── Minting and persisting a binding ──────────────────────────────────────
// Until 2026-08-04 only the installed macOS app could do this, so the CLI and
// every MCP agent could read `nextAction: connect_source` and had nothing to
// call. These are the write half: same receipt shape, same sidecar file, same
// bounded probe.

function validBindingEnvelope(binding) {
  return Boolean(
    binding
    && typeof binding === 'object'
    && string(binding.projectSlug)
    && string(binding.sourceId)
    && string(binding.rootPath)
    && ['git', 'folder'].includes(binding.kind)
    && string(binding.boundAt),
  );
}

/**
 * Whole-sidecar read. `malformed` is never treated as empty — overwriting an
 * unreadable file would silently destroy another project's measurement.
 */
export function readProjectSourceBindings(vaultRoot) {
  let stored;
  try {
    stored = readVaultSidecarText(vaultRoot, PROJECT_SOURCE_STATE_FILENAME);
  } catch (error) {
    if (error instanceof SidecarPathError) {
      return { status: 'unsafe_path', bindings: [], revision: null, error };
    }
    return { status: 'malformed', bindings: [], revision: null, error };
  }
  if (!stored) return { status: 'missing', bindings: [], revision: null };
  let parsed;
  try {
    parsed = JSON.parse(stored.text);
  } catch {
    return { status: 'malformed', bindings: [], revision: stored.revision };
  }
  if (
    !parsed
    || parsed.contractVersion !== PROJECT_SOURCE_RECEIPT_VERSION
    || !Array.isArray(parsed.bindings)
    || !parsed.bindings.every(validBindingEnvelope)
  ) return { status: 'malformed', bindings: [], revision: stored.revision };
  return { status: 'ok', bindings: parsed.bindings, revision: stored.revision };
}

export function serializeProjectSourceState(bindings) {
  return `${JSON.stringify({
    contractVersion: PROJECT_SOURCE_RECEIPT_VERSION,
    bindings,
  }, null, 2)}\n`;
}

function commitState(vaultRoot, bindings, expectedRevision) {
  createVaultSidecarTextExclusive(vaultRoot, '.gitignore', SIDECAR_IGNORE_CONTENT);
  replaceVaultSidecarText(
    vaultRoot,
    PROJECT_SOURCE_STATE_FILENAME,
    serializeProjectSourceState(bindings),
    { expectedRevision },
  );
}

/**
 * Replace this project's binding, preserving every other project's. A malformed
 * sidecar blocks the write instead of being clobbered — `repair` opts into
 * discarding it, which is the only way out and must be a stated intent.
 */
export function writeProjectSourceBinding(vaultRoot, binding, { repair = false } = {}) {
  const current = readProjectSourceBindings(vaultRoot);
  if (current.status === 'unsafe_path') {
    return { status: 'blocked_unsafe_path', bindings: [], replaced: 0, error: current.error };
  }
  if (current.status === 'malformed' && !repair) {
    return { status: 'blocked_malformed', bindings: [], replaced: 0 };
  }
  const existing = current.status === 'ok' ? current.bindings : [];
  const retained = existing.filter((candidate) => candidate.projectSlug !== binding.projectSlug);
  const bindings = [...retained, binding];
  try {
    commitState(vaultRoot, bindings, current.revision);
  } catch (error) {
    if (error instanceof SidecarPathError) {
      return { status: 'blocked_unsafe_path', bindings: existing, replaced: 0, error };
    }
    return { status: 'persistence_failed', bindings: existing, replaced: 0, error };
  }
  return { status: 'written', bindings, replaced: existing.length - retained.length };
}

/** Undo. Removes every binding for one project and leaves the rest untouched. */
export function removeProjectSourceBindings(vaultRoot, projectSlug) {
  const current = readProjectSourceBindings(vaultRoot);
  if (current.status === 'unsafe_path') {
    return { status: 'blocked_unsafe_path', bindings: [], removed: 0, error: current.error };
  }
  if (current.status === 'malformed') return { status: 'blocked_malformed', bindings: [], removed: 0 };
  if (current.status === 'missing') return { status: 'not_bound', bindings: [], removed: 0 };
  const retained = current.bindings.filter((candidate) => candidate.projectSlug !== projectSlug);
  const removed = current.bindings.length - retained.length;
  if (removed === 0) return { status: 'not_bound', bindings: current.bindings, removed: 0 };
  try {
    commitState(vaultRoot, retained, current.revision);
  } catch (error) {
    if (error instanceof SidecarPathError) {
      return { status: 'blocked_unsafe_path', bindings: current.bindings, removed: 0, error };
    }
    return { status: 'persistence_failed', bindings: current.bindings, removed: 0, error };
  }
  return { status: 'removed', bindings: retained, removed };
}
