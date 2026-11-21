/**
 * What gets attached to a result rather than asked for: the vault validation
 * every read carries, the findings a build write returns on the nodes it touched,
 * the compact post-write maintenance queue the other writes return, and the
 * summary freshness a maintenance plan is judged against.
 */

import { readOntologyAtlasIgnore } from '../vault/sidecar/ontology-atlas-ignore.mjs';
import { queryCompiledOntology } from '../ontology-engine.mjs';
import {
  COMPILED_ONTOLOGY_CACHE,
  VAULT_ROOT,
} from '../server/runtime.mjs';
import { drainNodeEligibilityFindings } from '../vault/writes/eligibility-gate.mjs';
import {
  briefVaultValidation,
  validateVaultReport,
} from './validate-vault.mjs';
import { buildSummaryFreshness } from './vault-nodes.mjs';

function attachVaultValidation(result, args = {}, loadedDocs = null, report = validateVaultReport({}, loadedDocs)) {
  const validation = briefVaultValidation(report);
  const pathsChecked = report.pathDrift?.checked !== false;
  const driftCount = report.pathDrift?.drifts?.length ?? 0;
  const errorCount = report.summary.errorFiles;
  const frontmatterWarnings = report.summary.warningFiles;
  const warningCount = frontmatterWarnings + driftCount;
  // The sentence names which check found the warnings, so frontmatter warnings and
  // code-path warnings are never merged into one unexplained number.
  const scopeTail = pathsChecked
    ? ` (frontmatter/graph refs ${frontmatterWarnings}, source paths ${driftCount}; repoRoot ${report.pathDrift?.repoRoot ?? 'unknown'})`
    : ' (frontmatter/graph refs only — source paths were NOT checked; pass repoRoot / OATLAS_REPO_ROOT to include them)';
  const check = {
    id: 'vault_validation',
    status: errorCount > 0 ? 'fail' : warningCount > 0 ? 'warn' : 'pass',
    count: errorCount + warningCount,
    pathsChecked,
    message:
      errorCount > 0
        ? `${errorCount} file(s) have blocking schema/frontmatter errors.${scopeTail}`
        : warningCount > 0
          ? `${warningCount} warning(s) require review.${scopeTail}`
          : `Vault schema and graph references validate cleanly.${scopeTail}`,
  };
  const needsAttention = check.status !== 'pass';
  const wasHealthy = result.status === 'healthy';
  const validationAction = {
    id: 'vault_validation',
    kind: 'validate_vault',
    severity: check.status === 'fail' ? 'fail' : 'warn',
    count: check.count,
    message: check.message,
  };
  const defaultLimit = result.operation === 'workspace_brief' ? 10 : 5;
  const actionLimit = typeof args.limit === 'number' ? args.limit : defaultLimit;
  const withValidationAction = (actions = []) => needsAttention
    ? [validationAction, ...actions.filter((action) => action.id !== validationAction.id)]
      .slice(0, actionLimit)
    : actions;

  if (result.operation === 'health') {
    return {
      ...result,
      status: needsAttention ? 'needs_attention' : result.status,
      checks: [...result.checks, check],
      validation,
    };
  }
  if (result.operation === 'workspace_brief') {
    return {
      ...result,
      status: needsAttention ? 'needs_attention' : result.status,
      health: {
        ...result.health,
        status: needsAttention ? 'needs_attention' : result.health.status,
        checks: [...result.health.checks, check],
        validation,
      },
      nextActions: withValidationAction(result.nextActions),
    };
  }
  if (result.operation === 'agent_brief') {
    return {
      ...result,
      status: needsAttention ? 'needs_attention' : result.status,
      readiness: {
        ...result.readiness,
        status: needsAttention && result.readiness.status === 'ready'
          ? 'needs_attention'
          : result.readiness.status,
        score: needsAttention && wasHealthy
          ? Math.max(0, result.readiness.score - 25)
          : result.readiness.score,
        healthChecks: result.readiness.healthChecks + 1,
      },
      health: {
        ...result.health,
        status: needsAttention ? 'needs_attention' : result.health.status,
        checks: [...result.health.checks, check],
        validation,
      },
      nextActions: withValidationAction(result.nextActions),
    };
  }
  return result;
}

function maintenancePlanAfterWrite(limit) {
  COMPILED_ONTOLOGY_CACHE.clear();
  const { artifact, docs: maintenanceDocs } = COMPILED_ONTOLOGY_CACHE.getWithDocs();
  const ontologyAtlasIgnorePatterns = readOntologyAtlasIgnore(VAULT_ROOT);
  // The node-eligibility gate runs inside `commitDoc` for every write door. Draining
  // here, where a write response is assembled, lets batch rows accumulate findings
  // and the batch's closing call report them once.
  const nodeEligibilityFindings = drainNodeEligibilityFindings();
  // Same signal `validate_vault` reports as `summaryFreshness`, surfaced here as an
  // action so an agent planning work sees it without running a second tool. Reading
  // history is bounded to summary nodes and degrades to silence outside a repo.
  const freshness = buildSummaryFreshness(maintenanceDocs);
  return queryCompiledOntology(artifact, {
    operation: 'maintenance_plan',
    limit,
  }, {
    ontologyAtlasIgnorePatterns,
    nodeEligibilityFindings,
    staleSummaries: freshness.checked ? freshness.stale : [],
    // The empty-bridge audit needs bodies to tell an abandoned node from a documented
    // but childless one.
    sourceDocs: maintenanceDocs,
  });
}

/** Candidates each maintenance check scans before the plan is narrowed to the written nodes. */
const FINDING_SCAN_LIMIT = 100;
/** Further subjects a grouped finding line names before it counts the rest. */
const FINDING_SUBJECTS_MAX = 8;

/**
 * Review prompts that judge a settled map (a wide parent, an empty domain, a node
 * nothing contains yet): in the middle of a build they name work the next batch does.
 */
const SETTLED_MAP_REVIEW_KINDS = new Set([
  'empty_domain',
  'fold_bulk_siblings',
  'rejudge_summary_membership',
  'retire_starter_example',
  'retire_unearned_node',
  'unassigned_node',
]);

function actionSlugs(action) {
  const nodes = Array.isArray(action.nodes) ? action.nodes : Object.values(action.nodes ?? {});
  return [action.node?.slug, ...nodes.map((node) => node?.slug), ...(action.cycle?.nodes ?? [])];
}

function actionSubject(action) {
  const args = action.proposedAction?.args ?? {};
  return args.slug ?? args.to ?? action.node?.slug ?? action.id;
}

function findingLine(action) {
  const cycle = Array.isArray(action.cycle?.nodes) ? ` ${action.cycle.nodes.join(' -> ')}.` : '';
  const next = action.executable
    ? ` Next: ${action.proposedAction.tool}(${JSON.stringify(action.proposedAction.args)})`
    : '';
  return `${action.reason}${cycle}${next}`;
}

function groupedFindingLine([first, ...rest]) {
  if (rest.length === 0) return findingLine(first);
  const subjects = rest.slice(0, FINDING_SUBJECTS_MAX).map(actionSubject).join(', ');
  const unnamed = rest.length - FINDING_SUBJECTS_MAX;
  return `${findingLine(first)} Same for ${rest.length} more: ${subjects}${unnamed > 0 ? ` and ${unnamed} others` : ''}.`;
}

/**
 * What the maintenance plan says about the nodes a build write just touched: one
 * plain line per kind, with the call that settles it. The vault's whole queue stays
 * with `validate_vault` and `query_ontology({operation:"maintenance_plan"})`.
 */
function findingsOnWrittenNodes(writtenSlugs) {
  const written = new Set(writtenSlugs);
  const byKind = new Map();
  for (const action of maintenancePlanAfterWrite(FINDING_SCAN_LIMIT).actions) {
    if (SETTLED_MAP_REVIEW_KINDS.has(action.kind)) continue;
    if (!actionSlugs(action).some((slug) => written.has(slug))) continue;
    byKind.set(action.kind, [...(byKind.get(action.kind) ?? []), action]);
  }
  return [...byKind.values()].map(groupedFindingLine);
}

function compactPostWriteMaintenance(limit = 5) {
  const result = maintenancePlanAfterWrite(limit);
  return {
    operation: result.operation,
    sideEffect: result.sideEffect,
    graphHash: result.graphHash,
    summary: result.summary,
    filters: result.filters,
    cursor: result.cursor,
    byPhase: result.byPhase,
    bySeverity: result.bySeverity,
    byKind: result.byKind,
    limited: result.limited,
    nextExecutableAction: compactMaintenanceAction(result.nextExecutableAction),
    nextReviewAction: compactMaintenanceAction(result.nextReviewAction),
    actions: result.actions.map(compactMaintenanceAction),
  };
}

function compactMaintenanceAction(action) {
  if (!action) return null;
  return {
    id: action.id,
    phase: action.phase,
    kind: action.kind,
    severity: action.severity,
    score: action.score,
    executable: action.executable,
    reason: action.reason,
    proposedAction: action.proposedAction,
    node: action.node
      ? {
          slug: action.node.slug,
          kind: action.node.kind,
          title: action.node.title,
        }
      : undefined,
    nodes: compactMaintenanceNodes(action.nodes),
  };
}

function compactMaintenanceNodes(nodesValue) {
  if (!nodesValue) return undefined;
  const compactNode = (node) => ({
    slug: node.slug,
    kind: node.kind,
    title: node.title,
  });
  if (Array.isArray(nodesValue)) {
    return nodesValue.map(compactNode);
  }
  if (typeof nodesValue === 'object') {
    return Object.fromEntries(
      Object.entries(nodesValue).map(([key, node]) => [key, compactNode(node)]),
    );
  }
  return undefined;
}

export {
  attachVaultValidation,
  compactPostWriteMaintenance,
  findingsOnWrittenNodes,
};
