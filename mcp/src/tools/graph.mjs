/** The compiled-graph tool handlers: `compile_ontology` and `query_ontology`. */

export { compileOntologyTool, queryOntologyTool };

import { buildCompactAgentBrief } from '../agent-brief/agent-brief-compact.mjs';
import { buildMeaningRepairReviewPage } from '../meaning/meaning-repair.mjs';
import { readOntologyAtlasIgnore } from '../vault/sidecar/ontology-atlas-ignore.mjs';
import { queryCompiledOntology, refreshAgentBriefHandoffPrompt } from '../ontology-engine.mjs';
import { deriveProjectSourceWitnessesFromDocs } from '../project-source/project-source-witnesses.mjs';
import { COMPILED_ONTOLOGY_CACHE, REPO_ROOT, REPO_ROOT_IS_GROUNDED, VAULT_ROOT } from '../server/runtime.mjs';
import {
  requireOptionalBoolean,
  requireOptionalNonNegativeInteger,
  requireOptionalPositiveInteger,
} from '../server/validate.mjs';
import { attachVaultValidation } from './result-attachments.mjs';
import { buildSummaryFreshness } from './vault-nodes.mjs';
import { scopedAgentBriefInput, privateCurrentProjectSourceAccess } from './agent-brief/agent-brief-scope.mjs';
import {
  attachMeaningReadiness,
  attachProjectMeaning,
  projectMeaningContext,
} from './agent-brief/meaning-readiness.mjs';
import { validateQueryOntologyArgs } from './query-ontology-args.mjs';

const COMPILE_SUMMARY_DELIVERY = Object.freeze({
  selection: 'summary_default',
  reason: 'No argument asked for arrays, so this is the bounded summary: counts, graphHash and aggregates.',
  fullArguments: Object.freeze({ full: true }),
  pageArguments: Object.freeze({ nodesLimit: 500, edgesLimit: 500 }),
});

function compileOntologyTool({
  includeIndexes,
  summary,
  full,
  nodesLimit,
  nodesOffset,
  edgesLimit,
  edgesOffset,
} = {}) {
  requireOptionalBoolean(includeIndexes, 'includeIndexes');
  requireOptionalBoolean(summary, 'summary');
  requireOptionalBoolean(full, 'full');
  requireOptionalPositiveInteger(nodesLimit, 'nodesLimit', { max: 500 });
  requireOptionalNonNegativeInteger(nodesOffset, 'nodesOffset');
  requireOptionalPositiveInteger(edgesLimit, 'edgesLimit', { max: 500 });
  requireOptionalNonNegativeInteger(edgesOffset, 'edgesOffset');
  const asksForArrays = full === true
    || includeIndexes === true
    || [nodesLimit, nodesOffset, edgesLimit, edgesOffset].some((value) => value !== undefined);
  const summaryOnly = summary === true || !asksForArrays;
  const artifact = COMPILED_ONTOLOGY_CACHE.get({
    includeIndexes: includeIndexes === true,
    summary: summaryOnly,
    nodesLimit: typeof nodesLimit === 'number' ? nodesLimit : undefined,
    nodesOffset: typeof nodesOffset === 'number' ? nodesOffset : undefined,
    edgesLimit: typeof edgesLimit === 'number' ? edgesLimit : undefined,
    edgesOffset: typeof edgesOffset === 'number' ? edgesOffset : undefined,
  });
  // Summary mode — the artifact is itself the count/aggregate, so the wrapper's
  // extra summary stats would duplicate it. Returned as-is.
  if (summary === true) return artifact;
  if (summaryOnly) return { delivery: COMPILE_SUMMARY_DELIVERY, ...artifact };
  return {
    ...artifact,
    summary: {
      nodes: artifact.nodeCount,
      edges: artifact.edgeCount,
      graphHash: artifact.graphHash,
      maxMtime: artifact.maxMtime,
      resolvedEdges: artifact.resolvedEdgeCount,
      externalEdges: artifact.externalEdgeCount,
      unresolvedEdges: artifact.unresolvedEdgeCount,
      aliases: artifact.aliases.length,
      ambiguousAliases: artifact.ambiguousAliases.length,
      issues: artifact.issues.length,
    },
  };
}

function analysisRecords() {
  return import('../analysis-history/analysis-records.mjs');
}

async function queryOntologyTool(args = {}) {
  validateQueryOntologyArgs(args);
  if (args.operation === 'analysis_history') {
    const { listAnalysisRecords } = await analysisRecords();
    return listAnalysisRecords(VAULT_ROOT, { limit: args.limit ?? 30, cursor: args.analysisCursor ?? null, mode: args.analysisMode ?? null, project: args.project ?? null });
  }
  if (args.operation === 'analysis_record') {
    const { readAnalysisRecord } = await analysisRecords();
    return readAnalysisRecord(VAULT_ROOT, args.recordId);
  }
  const { artifact, docs: loadedDocs } = COMPILED_ONTOLOGY_CACHE.getWithDocs();
  const ontologyAtlasIgnorePatterns = readOntologyAtlasIgnore(VAULT_ROOT);
  if (args.operation === 'meaning_repair_review') {
    const agentBrief = queryCompiledOntology(artifact, {
      operation: 'agent_brief',
      project: args.project,
    }, { ontologyAtlasIgnorePatterns });
    const validatedBrief = attachVaultValidation(agentBrief, { operation: 'agent_brief' }, loadedDocs);
    const context = projectMeaningContext(
      artifact,
      validatedBrief.projectSlug,
      validatedBrief.readiness?.status,
      null,
      loadedDocs,
    );
    return buildMeaningRepairReviewPage(context.meaningRepairInput, args);
  }
  // `maintenance_plan` alone needs Git history (summary freshness) and bodies (the
  // empty-bridge audit and meaning-gap items), which a compiled artifact lacks, so
  // only that operation loads them, sharing the documents read for compilation.
  const maintenanceDocs =
    args.operation === 'maintenance_plan' ? loadedDocs : null;
  // `growth_plan`'s `nextReads` group needs the same bodies to read each node's
  // `## Uncertainty` section; one load is shared with compilation.
  const growthDocs = args.operation === 'growth_plan' ? loadedDocs : null;
  const maintenanceFreshness = maintenanceDocs ? buildSummaryFreshness(maintenanceDocs) : null;
  const agentBriefInput = args.operation === 'agent_brief'
    ? scopedAgentBriefInput(artifact, args, ontologyAtlasIgnorePatterns, loadedDocs)
    : null;
  const queryArtifact = agentBriefInput?.scopedArtifact ?? artifact;
  const queryResult = agentBriefInput?.result ?? queryCompiledOntology(artifact, args, {
    ontologyAtlasIgnorePatterns,
    ...(args.operation === 'builder_context' ? { sourceDocs: loadedDocs } : {}),
    ...(maintenanceDocs ? { sourceDocs: maintenanceDocs } : {}),
    ...(growthDocs ? { sourceDocs: growthDocs, sourceRoot: REPO_ROOT_IS_GROUNDED ? REPO_ROOT : null } : {}),
    ...(maintenanceFreshness?.checked ? { staleSummaries: maintenanceFreshness.stale } : {}),
  });
  const validatedResult = ['health', 'workspace_brief', 'agent_brief'].includes(args.operation)
    ? attachVaultValidation(queryResult, args, loadedDocs)
    : queryResult;
  const meaningContext = args.operation === 'agent_brief'
    ? projectMeaningContext(
        artifact,
        validatedResult.projectSlug,
        validatedResult.readiness?.status,
        agentBriefInput?.scope,
      )
    : null;
  const attached = args.operation === 'agent_brief'
    ? attachProjectMeaning(validatedResult, artifact, meaningContext)
    : ['health', 'workspace_brief'].includes(args.operation)
      ? attachMeaningReadiness(validatedResult, artifact, args, loadedDocs)
      : validatedResult;
  // Count health checks once at the end rather than at each attachment site, or the
  // count drifts from the checks carried. Gate: `agentBriefFailure` in `mcp/scripts/verify/checks/agent-brief.mjs`.
  let result = Array.isArray(attached.health?.checks) && attached.readiness
    ? { ...attached, readiness: { ...attached.readiness, healthChecks: attached.health.checks.length } }
    : attached;
  if (args.operation === 'agent_brief') {
    result = refreshAgentBriefHandoffPrompt(result);
    if (args.detail === 'compact') {
      const sourceAccess = privateCurrentProjectSourceAccess(
        result.projectSlug,
        result.projectSource,
        agentBriefInput.scope.graphHash,
        { currentWitnesses: deriveProjectSourceWitnessesFromDocs({ projectSlug: result.projectSlug, docs: agentBriefInput.scope.docs }) },
      );
      result = buildCompactAgentBrief({
        brief: result,
        artifact: queryArtifact,
        docs: agentBriefInput.scope.docs,
        sourceRoot: sourceAccess?.rootPath ?? null,
        confirmSourceCurrent: sourceAccess?.confirmCurrent ?? null,
        sourceAccessRequired: (result.projectSource?.status === 'verified_current'
          && result.projectSource?.currentness === 'current')
          || result.projectSource?.live?.status === 'witnesses_supported',
        task: args.task,
      });
    }
  }
  if (result?.contract === 'agentBriefCompact:v3') return result;
  return {
    ...result,
    compiledSummary: {
      nodes: queryArtifact.nodeCount,
      edges: queryArtifact.edgeCount,
      graphHash: queryArtifact.graphHash,
      maxMtime: queryArtifact.maxMtime,
      resolvedEdges: queryArtifact.resolvedEdgeCount,
      externalEdges: queryArtifact.externalEdgeCount,
      unresolvedEdges: queryArtifact.unresolvedEdgeCount,
      issues: queryArtifact.issues.length,
    },
  };
}
