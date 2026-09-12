/**
 * What gets attached to a result rather than asked for: the vault validation
 * every read carries, the compact post-write maintenance queue, and the summary
 * freshness a maintenance plan is judged against.
 */
import { collectNodeRevisions } from '../git-tools.mjs';
import { loadOntologyAtlasIgnore } from '../ontology-atlas-ignore.mjs';
import { queryCompiledOntology } from '../ontology-engine.mjs';
import {
  COMPILED_ONTOLOGY_CACHE,
  REPO_ROOT,
  VAULT_ROOT,
} from '../server/runtime.mjs';
import {
  SUMMARY_KINDS,
  describeStaleParent,
  findStaleParentSummaries,
  staleParentScore,
} from '../stale-parent.mjs';
import {
  drainNodeEligibilityFindings,
  loadVaultDocs,
} from '../vault.mjs';
import { validateVaultTool } from './validate-vault.mjs';

function attachVaultValidation(result, args = {}) {
  const validation = validateVaultTool({});
  const pathsChecked = validation.pathDrift?.checked !== false;
  const driftCount = validation.pathDrift?.drifts?.length ?? 0;
  const errorCount = validation.summary.errorFiles;
  const frontmatterWarnings = validation.summary.warningFiles;
  const warningCount = frontmatterWarnings + driftCount;
  // **The sentence states what this check looked at.** It used to merge two kinds
  // of warning into one number and say only "validator or source-path warning(s)".
  // So when `health` reported warn:13 on a vault that `validate` called clean, the
  // user had no way to tell whether those 13 were frontmatter or code paths.
  const scopeTail = pathsChecked
    ? ` (frontmatter/graph refs ${frontmatterWarnings}, source paths ${driftCount}; repoRoot ${validation.pathDrift?.repoRoot ?? 'unknown'})`
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

function compactPostWriteMaintenance(limit = 5) {
  COMPILED_ONTOLOGY_CACHE.clear();
  const artifact = COMPILED_ONTOLOGY_CACHE.get({ includeIndexes: true });
  const ontologyAtlasIgnorePatterns = loadOntologyAtlasIgnore(VAULT_ROOT);
  // Node-eligibility gate hand-off (2026-07-31 council). The gate runs inside
  // `commitDoc`, so it has already fired for every door — add_concept,
  // patch_concept, add_relation, and the batch variants alike. Draining here,
  // at the one place a write response is assembled, is what gives batch tools
  // the "skip per row, summarize once at the end" behaviour for free: each row
  // writes with `includePostWriteMaintenance: false`, findings accumulate, and
  // the batch's single closing call collects all of them.
  const nodeEligibilityFindings = drainNodeEligibilityFindings();
  const maintenanceDocs = loadVaultDocs(VAULT_ROOT);
  // Same signal `validate_vault` reports as `summaryFreshness`, surfaced here as an
  // action so an agent planning work sees it without running a second tool. Reading
  // history is bounded to summary nodes and degrades to silence outside a repo.
  const freshness = buildSummaryFreshness(maintenanceDocs);
  const result = queryCompiledOntology(artifact, {
    operation: 'maintenance_plan',
    limit,
  }, {
    ontologyAtlasIgnorePatterns,
    nodeEligibilityFindings,
    staleSummaries: freshness.checked ? freshness.stale : [],
    // The empty-bridge audit needs bodies to tell "created and abandoned" from
    // "documented but childless" — and without that distinction it would fire on
    // 20 of this vault's 38 capabilities. The compiled-cache read above already
    // loads every doc, so this second pass is the same disk we just touched.
    sourceDocs: maintenanceDocs,
  });
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

// validate_vault — one call gives an agent the whole vault's health, in the same
// shape as CLI `ontology-atlas validate --json`. It fills the gap between per-doc
// `warnings` (get_concept) and the vault aggregate (`vaultWarnings` in
// list_concepts): a detailed report combining both.
/**
 * Builds the summary-freshness section of `validate_vault`.
 *
 * Reports domains and projects whose containment list changed after their
 * description was last written — the update path nothing else in this tool checks.
 * `pathDrift` asks whether a node still points at real code; this asks whether a
 * node still describes what it holds.
 *
 * Advisory only. A stale description blocks nothing and is never rewritten here:
 * the body is a human judgement, so the tool asks for a re-judgement and stops.
 *
 * Degrades to `checked: false` outside a repository rather than reporting a clean
 * bill, because not looking is not the same as finding nothing. History reading is
 * bounded to summary nodes (8 of 83 in the dogfood vault), so a vault of ordinary
 * size pays well under a second.
 */
function buildSummaryFreshness(docs) {
  const summarySlugs = docs
    .filter((doc) => SUMMARY_KINDS.includes(doc?.frontmatter?.kind))
    .map((doc) => doc.slug);
  if (summarySlugs.length === 0) {
    return {
      checked: true,
      summaryNodes: 0,
      stale: [],
      hint: 'no domain or project nodes to check.',
    };
  }
  const revisions = collectNodeRevisions({
    repoRoot: REPO_ROOT,
    vaultRoot: VAULT_ROOT,
    slugs: summarySlugs,
  });
  if (!revisions.ok) {
    return {
      checked: false,
      summaryNodes: summarySlugs.length,
      stale: [],
      hint: `Summary freshness was NOT checked (${revisions.reason}). This comparison reads Git history, so a vault outside a repository cannot be judged — read each domain against the nodes it contains by hand.`,
    };
  }
  const stale = findStaleParentSummaries({
    docs,
    revisionsOf: (slug) => revisions.revisionsBySlug.get(slug) ?? [],
  }).map((row) => ({ ...row, score: staleParentScore(row), hint: describeStaleParent(row) }));

  return {
    checked: true,
    summaryNodes: summarySlugs.length,
    stale,
    hint:
      stale.length > 0
        ? `${stale.length} summary node(s) declare a membership that changed after their description was last written. Nothing is blocked; read each against the nodes it contains and re-judge the body.`
        : `all ${summarySlugs.length} summary node(s) were described after their membership last changed.`,
  };
}

export {
  attachVaultValidation,
  compactPostWriteMaintenance,
  compactMaintenanceAction,
  compactMaintenanceNodes,
  buildSummaryFreshness,
};
