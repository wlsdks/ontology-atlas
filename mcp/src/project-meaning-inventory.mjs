import {
  MEANING_WITNESS_INVENTORY_CONTRACT,
} from './meaning-assessment.mjs';
import { WRITE_RELATION_TYPE_VALUES } from './ontology-engine.mjs';
import { extractProjectMeaningEvidencePaths } from './project-meaning-evidence.mjs';

const MAX_SCOPE_NODES = 500;
const ALLOWED_RELATION_TYPES = new Set(WRITE_RELATION_TYPE_VALUES);
const SOURCE_KINDS = new Set(['git', 'folder']);
const SOURCE_STATUSES = new Set(['needs_evidence', 'review_required', 'verified_current']);
const SOURCE_VIEW_CURRENTNESS = new Set(['current', 'stale', 'unavailable']);
const SOURCE_GAP_IDS = new Set([
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
const SOURCE_ACTION_IDS = new Set([
  'connect_source',
  'repair_source_binding',
  'measure_source',
  'record_source_role',
  'repair_source_path',
  'review_inventory_limit',
  'remeasure_source',
  'use_current_evidence',
]);

function unavailable(reason) {
  return { status: 'unavailable', reason };
}

function safeSlug(value, maxLength = 300) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= maxLength
    && value.trim() === value
    && !value.startsWith('/')
    && !/^[A-Za-z]:[\\/]/.test(value)
    && !value.includes('\\')
    && !/[\u0000-\u001f\u007f]/u.test(value)
    && value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function safeGraphHash(value) {
  return typeof value === 'string' && /^project-graph-v1:[a-f0-9]{8}$/.test(value);
}

function safeOpaque(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 200
    && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
}

function nonBlank(value, maxLength = 500) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= maxLength
    && value.trim() === value
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function safeRelativePath(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 500
    && value.trim() === value
    && !value.startsWith('/')
    && !/^[A-Za-z]:[\\/]/.test(value)
    && !value.includes('\\')
    && !/[\u0000-\u001f\u007f]/u.test(value)
    && value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function normalizeRelationType(value) {
  return value === 'dependencies' ? 'depends_on' : value;
}

function relationKey(value) {
  return `${value.from}\0${value.to}\0${value.type}`;
}

function sanitizeSourceReceipt(projectSource, projectSlug) {
  const receipt = projectSource?.receipt;
  if (
    (projectSource?.contractVersion !== undefined && projectSource.contractVersion !== 1)
    || (projectSource?.projectSlug !== undefined && projectSource.projectSlug !== projectSlug)
    || (projectSource?.bindingCardinality !== undefined && projectSource.bindingCardinality !== 1)
    || (projectSource?.status !== undefined && !SOURCE_STATUSES.has(projectSource.status))
    || (projectSource?.currentness !== undefined && !SOURCE_VIEW_CURRENTNESS.has(projectSource.currentness))
  ) return null;
  if (
    !receipt
    || typeof receipt !== 'object'
    || receipt.contractVersion !== 1
    || receipt.projectSlug !== projectSlug
    || !safeGraphHash(receipt.graphHash)
    || !nonBlank(receipt.sourceId, 200)
    || !SOURCE_KINDS.has(receipt.sourceKind)
    || !nonBlank(receipt.sourceRevision, 200)
    || !safeOpaque(receipt.sourceFingerprint)
    || !nonBlank(receipt.measuredAt, 100)
    || !SOURCE_STATUSES.has(receipt.status)
    || receipt.currentness !== 'current'
    || !receipt.nextAction
    || !SOURCE_ACTION_IDS.has(receipt.nextAction.id)
    || (receipt.topGap !== null && (
      !receipt.topGap
      || !SOURCE_GAP_IDS.has(receipt.topGap.id)
    ))
    || !receipt.witnessSummary
    || !Number.isInteger(receipt.witnessSummary.total)
    || !Number.isInteger(receipt.witnessSummary.supported)
    || !Number.isInteger(receipt.witnessSummary.missing)
    || receipt.witnessSummary.total < 0
    || receipt.witnessSummary.supported < 0
    || receipt.witnessSummary.missing < 0
    || receipt.witnessSummary.total !== receipt.witnessSummary.supported + receipt.witnessSummary.missing
    || !Array.isArray(receipt.witnesses)
    || receipt.witnesses.length !== receipt.witnessSummary.total
    || !receipt.diagnostics
    || !(typeof receipt.diagnostics.dirty === 'boolean' || receipt.diagnostics.dirty === null)
    || typeof receipt.diagnostics.truncated !== 'boolean'
  ) return null;
  let supported = 0;
  for (const witness of receipt.witnesses) {
    if (
      !witness
      || typeof witness !== 'object'
      || !nonBlank(witness.id, 200)
      || !safeSlug(witness.nodeSlug)
      || !nonBlank(witness.role, 200)
      || !safeRelativePath(witness.path)
      || typeof witness.supported !== 'boolean'
    ) return null;
    if (witness.supported) supported += 1;
  }
  if (supported !== receipt.witnessSummary.supported) return null;
  return receipt;
}

/**
 * Builds the exact evidence inventory that competency answers may cite.
 * Unknown or incomplete inputs fail closed instead of synthesizing witnesses.
 */
export function buildProjectMeaningInventory({
  projectSlug,
  graphHash,
  projectScope,
  artifactEdges,
  scopedDocs,
  projectSource,
} = {}) {
  if (!safeSlug(projectSlug, 200)) return unavailable('invalid_project');
  if (!safeGraphHash(graphHash)) return unavailable('invalid_graph_hash');
  if (
    projectScope?.operation !== 'project_scope'
    || projectScope.project !== projectSlug
    || projectScope.nodes?.limited !== false
    || !Number.isInteger(projectScope.nodes?.total)
    || !Array.isArray(projectScope.nodes?.rows)
    || projectScope.nodes.total !== projectScope.nodes.rows.length
    || projectScope.nodes.total > MAX_SCOPE_NODES
  ) return unavailable('incomplete_project_scope');

  const concepts = projectScope.nodes.rows.map((row) => row?.slug);
  if (
    concepts.length === 0
    || !concepts.every((slug) => safeSlug(slug))
    || new Set(concepts).size !== concepts.length
    || !concepts.includes(projectSlug)
  ) return unavailable('invalid_project_scope');

  const receipt = sanitizeSourceReceipt(projectSource, projectSlug);
  if (!receipt) return unavailable('source_receipt_unavailable');
  if (!Array.isArray(artifactEdges) || !Array.isArray(scopedDocs)) {
    return unavailable('evidence_inputs_unavailable');
  }

  const scope = new Set(concepts);
  const kinds = Object.fromEntries(projectScope.nodes.rows
    .filter((row) => safeSlug(row?.slug) && nonBlank(row?.kind, 100))
    .map((row) => [row.slug, row.kind]));
  const relationsByKey = new Map();
  for (const edge of artifactEdges) {
    const type = normalizeRelationType(edge?.via);
    if (
      edge?.resolved !== true
      || edge.external !== false
      || !scope.has(edge.from)
      || !scope.has(edge.to)
      || !ALLOWED_RELATION_TYPES.has(type)
    ) continue;
    const relation = { from: edge.from, to: edge.to, type };
    relationsByKey.set(relationKey(relation), relation);
  }

  const claims = new Set();
  for (const doc of scopedDocs) {
    const path = doc?.frontmatter?.path;
    if (scope.has(doc?.slug) && safeRelativePath(path)) {
      claims.add(`${doc.slug}\0${path}`);
    }
    if (
      scope.has(doc?.slug)
      && doc?.frontmatter?.kind === 'project'
      && (doc.slug === projectSlug || doc.frontmatter?.slug === projectSlug)
    ) {
      for (const evidencePath of extractProjectMeaningEvidencePaths(doc.body)) {
        claims.add(`${doc.slug}\0${evidencePath}`);
      }
    }
  }
  const evidence = new Set();
  const evidenceClaims = new Map();
  const sourceGraphCurrent = receipt.graphHash === graphHash;
  for (const witness of sourceGraphCurrent ? receipt.witnesses : []) {
    if (
      witness?.supported === true
      && scope.has(witness.nodeSlug)
      && safeRelativePath(witness.path)
      && claims.has(`${witness.nodeSlug}\0${witness.path}`)
    ) {
      evidence.add(witness.path);
      const key = `${witness.nodeSlug}\0${witness.path}`;
      evidenceClaims.set(key, { concept: witness.nodeSlug, path: witness.path });
    }
  }

  return {
    status: 'ready',
    evidenceClaims: [...evidenceClaims.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, claim]) => claim),
    inventory: {
      contract: MEANING_WITNESS_INVENTORY_CONTRACT,
      graphHash,
      sourceFingerprint: receipt.sourceFingerprint,
      concepts: [...concepts].sort((a, b) => a.localeCompare(b)),
      ...(Object.keys(kinds).length > 0 ? { kinds } : {}),
      relations: [...relationsByKey.values()].sort((a, b) => relationKey(a).localeCompare(relationKey(b))),
      evidence: [...evidence].sort((a, b) => a.localeCompare(b)),
      paths: [...evidence].sort((a, b) => a.localeCompare(b)),
    },
  };
}
