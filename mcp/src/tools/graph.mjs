/**
 * The compiled-graph workflow: `compile_ontology`, every `query_ontology`
 * operation, the agent-brief project scoping, and the meaning-readiness and
 * project-meaning facts a brief carries.
 */
import {
  AGENT_BRIEF_TASK_MAX_CHARS,
  buildCompactAgentBrief,
  projectSourceSnapshotUnchanged,
} from '../agent-brief-compact.mjs';
import {
  listAnalysisRecords,
  readAnalysisRecord,
} from '../analysis-records.mjs';
import {
  attachMeaningRepair,
  buildMeaningRepair,
  buildMeaningRepairReviewPage,
} from '../meaning-repair.mjs';
import { loadOntologyAtlasIgnore } from '../ontology-atlas-ignore.mjs';
import { compileOntology } from '../ontology-compiler.mjs';
import {
  EDGE_TARGET_KIND_VALUES,
  MAINTENANCE_KIND_VALUES,
  MAINTENANCE_PHASE_VALUES,
  MAINTENANCE_SEVERITY_VALUES,
  NODE_KIND_VALUES,
  QUERY_ONTOLOGY_OPERATIONS,
  QUERY_PLAN_TARGET_OPERATIONS,
  RELATION_TYPE_VALUES,
  queryCompiledOntology,
  refreshAgentBriefHandoffPrompt,
} from '../ontology-engine.mjs';
import { buildProjectMeaningInventory } from '../project-meaning-inventory.mjs';
import {
  parseProjectCompetencyMarkdown,
  readProjectMeaningAssessment,
} from '../project-meaning-receipt.mjs';
import { buildProjectSourceGraphHash } from '../project-source-graph-hash.mjs';
import {
  readProjectSourceBindings,
  readProjectSourceView,
} from '../project-source-receipt.mjs';
import { projectSourceRemedy } from '../project-source-remedy.mjs';
import { deriveProjectSourceWitnessesFromDocs } from '../project-source-witnesses.mjs';
import {
  COMPILED_ONTOLOGY_CACHE,
  VAULT_ROOT,
} from '../server/runtime.mjs';
import {
  requireNonBlankString,
  requireOptionalBoolean,
  requireOptionalDirection,
  requireOptionalEnum,
  requireOptionalNonBlankString,
  requireOptionalNonNegativeInteger,
  requireOptionalPositiveInteger,
  requireOptionalStringArray,
} from '../server/validate.mjs';
import { loadVaultDocs } from '../vault.mjs';
import {
  attachVaultValidation,
  buildSummaryFreshness,
} from './maintenance.mjs';

function compileOntologyTool({
  includeIndexes,
  summary,
  nodesLimit,
  nodesOffset,
  edgesLimit,
  edgesOffset,
} = {}) {
  requireOptionalBoolean(includeIndexes, 'includeIndexes');
  requireOptionalBoolean(summary, 'summary');
  requireOptionalPositiveInteger(nodesLimit, 'nodesLimit', { max: 500 });
  requireOptionalNonNegativeInteger(nodesOffset, 'nodesOffset');
  requireOptionalPositiveInteger(edgesLimit, 'edgesLimit', { max: 500 });
  requireOptionalNonNegativeInteger(edgesOffset, 'edgesOffset');
  const artifact = compileOntology(loadVaultDocs(VAULT_ROOT), {
    includeIndexes: includeIndexes === true,
    summary: summary === true,
    nodesLimit: typeof nodesLimit === 'number' ? nodesLimit : undefined,
    nodesOffset: typeof nodesOffset === 'number' ? nodesOffset : undefined,
    edgesLimit: typeof edgesLimit === 'number' ? edgesLimit : undefined,
    edgesOffset: typeof edgesOffset === 'number' ? edgesOffset : undefined,
  });
  // Summary mode — the artifact is itself the count/aggregate, so the wrapper's
  // extra summary stats would duplicate it. Returned as-is.
  if (summary === true) return artifact;
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

function resolveAgentBriefProject(artifact, requestedProject) {
  if (typeof requestedProject === 'string' && requestedProject.trim()) {
    return queryCompiledOntology(artifact, {
      operation: 'project_scope',
      project: requestedProject,
      limit: 1,
    }).project;
  }
  const projects = (Array.isArray(artifact?.nodes) ? artifact.nodes : [])
    .filter((node) => node?.kind === 'project' && typeof node.slug === 'string')
    .map((node) => node.slug)
    .sort((left, right) => left.localeCompare(right));
  if (projects.length === 1) return projects[0];
  if (projects.length === 0) return null;
  throw new Error(
    `project is required when the vault contains multiple project nodes. Choose one of: ${projects.join(', ')}.`,
  );
}

function completeAgentBriefProjectScope(artifact, projectSlug) {
  const nodes = Array.isArray(artifact?.nodes) ? artifact.nodes : [];
  const edges = Array.isArray(artifact?.edges) ? artifact.edges : [];
  const nodeBySlug = new Map(nodes.map((node) => [node.slug, node]));
  const included = new Set([projectSlug]);
  const queue = [projectSlug];
  const downward = new Set(['domains', 'capabilities', 'elements', 'contains']);
  const childrenByParent = new Map();
  const appendChild = (parent, child) => {
    if (!childrenByParent.has(parent)) childrenByParent.set(parent, []);
    childrenByParent.get(parent).push(child);
  };
  for (const edge of edges) {
    if (edge?.resolved !== true) continue;
    if (downward.has(edge.via)) appendChild(edge.from, edge.to);
    if (edge.via === 'domain') appendChild(edge.to, edge.from);
  }
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    for (const child of childrenByParent.get(current) ?? []) {
      if (included.has(child) || !nodeBySlug.has(child)) continue;
      included.add(child);
      queue.push(child);
    }
  }
  const rows = [...included]
    .map((slug) => nodeBySlug.get(slug))
    .filter(Boolean)
    .sort((left, right) => left.slug.localeCompare(right.slug));
  const docs = loadVaultDocs(VAULT_ROOT).filter((doc) => included.has(doc.slug));
  if (rows.length !== included.size || docs.length !== included.size) {
    throw new Error(
      `agent_brief blocked: selected project "${projectSlug}" contains a compiled node without one readable vault document. Run validate_vault and repair the missing document before using the handoff.`,
    );
  }
  const internalEdges = edges.filter((edge) => (
    edge?.resolved === true && included.has(edge.from) && included.has(edge.to)
  )).length;
  return {
    scope: {
      operation: 'project_scope',
      project: projectSlug,
      nodes: {
        total: rows.length,
        limited: false,
        rows: rows.map((node) => ({
          uid: node.uid,
          slug: node.slug,
          kind: node.kind,
          title: node.title,
          domain: node.domain,
          inDegree: node.inDegree ?? 0,
          outDegree: node.outDegree ?? 0,
        })),
      },
      summary: { nodes: rows.length, internalEdges },
    },
    docs,
    graphHash: buildProjectSourceGraphHash(projectSlug, docs),
  };
}

function scopedAgentBriefInput(artifact, args, ontologyAtlasIgnorePatterns) {
  const projectSlug = resolveAgentBriefProject(artifact, args.project);
  if (projectSlug === null) {
    if (args.detail === 'compact') {
      throw new Error('agent_brief detail "compact" requires one selected kind: project node; this vault has none.');
    }
    const engineArgs = { ...args };
    delete engineArgs.detail;
    delete engineArgs.task;
    return {
      projectSlug: null,
      scope: null,
      scopedArtifact: artifact,
      result: queryCompiledOntology(artifact, engineArgs, { ontologyAtlasIgnorePatterns }),
    };
  }
  const scope = completeAgentBriefProjectScope(artifact, projectSlug);
  const scopedArtifact = compileOntology(scope.docs, { includeIndexes: true });
  const engineArgs = { ...args, project: projectSlug };
  delete engineArgs.detail;
  delete engineArgs.task;
  const result = queryCompiledOntology(scopedArtifact, engineArgs, {
    ontologyAtlasIgnorePatterns,
    sourceDocs: scope.docs,
  });
  return { projectSlug, scope, scopedArtifact, result };
}

function privateCurrentProjectSourceAccess(projectSlug, projectSource, graphHash, viewOptions = {}) {
  const receiptCurrent = projectSource?.status === 'verified_current'
    && projectSource?.currentness === 'current';
  // A receipt behind the source still opens the bound root when the live
  // probe confirms every recorded witness resolves: coordinates are then
  // verified against the live files, and the response says which revision.
  const liveSupported = !receiptCurrent
    && ['source_changed', 'ontology_changed'].includes(projectSource?.topGap?.id)
    && projectSource?.live?.status === 'witnesses_supported'
    && typeof projectSource?.live?.sourceFingerprint === 'string';
  if ((!receiptCurrent && !liveSupported) || typeof projectSource?.receipt?.sourceId !== 'string') return null;
  const sidecar = readProjectSourceBindings(VAULT_ROOT);
  if (sidecar.status !== 'ok') return null;
  const matches = sidecar.bindings.filter((binding) => (
    binding?.projectSlug === projectSlug
    && binding?.sourceId === projectSource.receipt.sourceId
    && typeof binding?.rootPath === 'string'
    && binding.rootPath.trim()
  ));
  if (matches.length !== 1) return null;
  return {
    rootPath: matches[0].rootPath,
    mode: liveSupported ? 'live' : 'receipt',
    confirmCurrent() {
      const refreshed = readProjectSourceView(VAULT_ROOT, projectSlug, graphHash, viewOptions);
      if (liveSupported) {
        return refreshed?.live?.status === 'witnesses_supported'
          && refreshed.live.sourceFingerprint === projectSource.live.sourceFingerprint
          && refreshed.live.sourceRevision === projectSource.live.sourceRevision;
      }
      return projectSourceSnapshotUnchanged(projectSource, refreshed);
    },
  };
}

async function queryOntologyTool(args = {}) {
  validateQueryOntologyArgs(args);
  if (args.operation === 'analysis_history') {
    return listAnalysisRecords(VAULT_ROOT, { limit: args.limit ?? 30, cursor: args.analysisCursor ?? null, mode: args.analysisMode ?? null, project: args.project ?? null });
  }
  if (args.operation === 'analysis_record') return readAnalysisRecord(VAULT_ROOT, args.recordId);
  const artifact = COMPILED_ONTOLOGY_CACHE.get({ includeIndexes: true });
  const ontologyAtlasIgnorePatterns = loadOntologyAtlasIgnore(VAULT_ROOT);
  if (args.operation === 'meaning_repair_review') {
    const agentBrief = queryCompiledOntology(artifact, {
      operation: 'agent_brief',
      project: args.project,
    }, { ontologyAtlasIgnorePatterns });
    const validatedBrief = attachVaultValidation(agentBrief, { operation: 'agent_brief' });
    const context = projectMeaningContext(
      artifact,
      validatedBrief.projectSlug,
      validatedBrief.readiness?.status,
    );
    return buildMeaningRepairReviewPage(context.meaningRepairInput, args);
  }
  // `maintenance_plan` is the one read operation that needs Git history: summary
  // freshness compares a node's description against the membership it describes,
  // and a compiled artifact carries neither clock. Computed only for that
  // operation so every other query stays a pure snapshot read.
  const maintenanceFreshness =
    args.operation === 'maintenance_plan' ? buildSummaryFreshness(loadVaultDocs(VAULT_ROOT)) : null;
  const agentBriefInput = args.operation === 'agent_brief'
    ? scopedAgentBriefInput(artifact, args, ontologyAtlasIgnorePatterns)
    : null;
  const queryArtifact = agentBriefInput?.scopedArtifact ?? artifact;
  const queryResult = agentBriefInput?.result ?? queryCompiledOntology(artifact, args, {
    ontologyAtlasIgnorePatterns,
    ...(args.operation === 'builder_context' ? { sourceDocs: loadVaultDocs(VAULT_ROOT) } : {}),
    ...(maintenanceFreshness?.checked ? { staleSummaries: maintenanceFreshness.stale } : {}),
  });
  const validatedResult = ['health', 'workspace_brief', 'agent_brief'].includes(args.operation)
    ? attachVaultValidation(queryResult, args)
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
      ? attachMeaningReadiness(validatedResult, artifact, args)
      : validatedResult;
  /*
   * **Count it, do not maintain it** (measured 2026-08-17).
   *
   * Two places attach checks (`attachVaultValidation`, `attachProjectMeaning`) and
   * only the first hand-incremented `healthChecks`. So one response said
   * "7 health checks" while carrying 8.
   *
   * Asking every attachment site to keep a counter in step means the next person
   * forgets again — so count once, at the end, and the whole class disappears.
   * Gate: `cli/src/lib/brief-self-consistency.test.mjs`.
   */
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
  if (result?.contract === 'agentBriefCompact:v2') return result;
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

/**
 * Translates a remedy id into **something the reader can act on**.
 *
 * A bare code like `assessment_input_invalid` used to be the whole message. The
 * reader is a person or an agent, and neither can do anything with a code alone.
 * A vault straight out of `init` in particular received "invalid" here, so
 * someone who had done nothing wrong concluded they had broken something.
 */
// One gap id, two different situations (2026-08-17 (28) named the missing
// receipt `competency_not_authored` in both). When the project document already
// carries a parseable `## Competency answers` section, the only missing thing
// is the finalize receipt, and the instruction must say exactly that: a person
// who wrote all five answers must never be told to write them. The generic
// hint below stays for the case where the section is absent or does not parse.
const MEANING_AUTHORED_NOT_FINALIZED_HINT =
  'This project\'s five competency answers are already written, but this vault '
  + 'has no finalize receipt for them. Nothing is broken. Call '
  + 'finalize_project_meaning to record the receipt.';


const MEANING_NEXT_ACTION_HINTS = Object.freeze({
  // Never assert "the section is missing" — a vault can have the section and
  // simply not have finalised it (this repository is one), and telling that user
  // to "add it" is wrong guidance. The parseable-section case is answered by
  // MEANING_AUTHORED_NOT_FINALIZED_HINT above, so this text covers a section
  // that is absent or does not parse.
  author_competency_answers:
    'This project\'s five competency answers have not been finalized yet. '
    + 'Nothing is broken. Fill in the `## Competency answers` section of the '
    + 'project document if it is missing, then call finalize_project_meaning.',
  resolve_competency_question:
    'A competency answer is incomplete: it needs concrete witnesses (concepts, '
    + 'relations, or evidence paths) that resolve in this vault. Fill the gap in '
    + 'the project document, then call finalize_project_meaning again.',
  reevaluate_competency:
    'The graph moved since the answers were finalized. Re-check the competency '
    + 'answers against the current graph, then call finalize_project_meaning again.',
  repair_assessment_input:
    'The assessment input is malformed. Inspect the project document\'s '
    + '`## Competency answers` section and the source receipt.',
  repair_ontology_structure: 'Fix the graph problems that query_ontology health reports first.',
  repair_source_receipt:
    'The source receipt is unusable. Re-bind the project to its code folder '
    + 'with connect_project_source.',
  record_source_role:
    'A source file is bound but its role (production / test) is unrecorded. '
    + 'Record it so evidence counts mean the same thing everywhere.',
  review_inventory_limit:
    'The source inventory hit its bound, so this evidence is partial. Narrow '
    + 'the bound source folder, or read the limit before trusting the counts.',
  connect_source: 'Bind this project to its source with connect_project_source.',
  repair_source_binding:
    'The source binding is unusable. Re-bind with connect_project_source '
    + '({repair: true} if the sidecar is malformed).',
  repair_source_path:
    'A declared evidence path no longer resolves inside the bound source. Fix '
    + 'the path on the node, or re-bind if the folder moved.',
  measure_source: 'Measure the bound source with connect_project_source.',
  remeasure_source: 'The source changed since it was measured. Re-run connect_project_source.',
  verify_source_currentness:
    'The source measurement is stale or unavailable. Re-run connect_project_source '
    + 'before treating this evidence as current.',
  review_source_evidence:
    'The source moved in a way the receipt cannot judge. Look at what changed '
    + 'before relying on the evidence.',
  use_current_evidence: 'Nothing to repair — the measured evidence is current.',
});

function meaningReadinessCheck(artifact) {
  const projectSlugs = (Array.isArray(artifact?.nodes) ? artifact.nodes : [])
    .filter((node) => node?.kind === 'project' && typeof node.slug === 'string')
    .map((node) => node.slug)
    .sort((left, right) => left.localeCompare(right));
  const assessments = projectSlugs.map((projectSlug) => {
    try {
      // The graph engine's health status includes semantic checks; meaning
      // assessment needs the structural readiness input only. Scope and
      // inventory failures below still fail closed via a null graph hash.
      const context = projectMeaningContext(artifact, projectSlug, 'ready');
      return {
        projectSlug,
        status: context.meaningAssessment?.status ?? 'invalid',
        topGap: context.meaningAssessment?.topGap?.id ?? 'assessment_input_invalid',
        // What the changed source says right now about the recorded witnesses,
        // so "source changed" is not the whole story a person gets.
        ...(context.projectSource?.live
          ? {
              sourceLive: {
                status: context.projectSource.live.status,
                sourceRevision: String(context.projectSource.live.sourceRevision ?? '').slice(0, 12),
                witnessSummary: context.projectSource.live.witnessSummary,
              },
            }
          : {}),
        // The remedy was already computed and was being discarded here
        // (2026-08-17), so the reader — person or agent — got only an error code.
        nextAction: context.meaningAssessment?.nextAction?.id ?? 'repair_assessment_input',
        // Whether the `## Competency answers` section parses. This picks the
        // honest hint when the receipt is missing: written-but-not-finalized
        // gets "call finalize_project_meaning", not "write the answers".
        competencyAuthored: Boolean(context.meaningRepairInput?.competency),
      };
    } catch {
      return {
        projectSlug,
        status: 'invalid',
        topGap: 'assessment_input_invalid',
        nextAction: 'repair_assessment_input',
        competencyAuthored: false,
      };
    }
  });
  const unresolved = assessments.filter((assessment) => assessment.status !== 'verified_current');
  if (unresolved.length === 0) {
    return {
      status: 'pass',
      count: assessments.length,
      message: assessments.length === 0
        ? 'No project meaning assessments are in scope.'
        : `Meaning assessments are current for ${assessments.length} project(s).`,
      assessments,
    };
  }
  const first = unresolved[0];
  const firstHint = first.nextAction === 'author_competency_answers' && first.competencyAuthored
    ? MEANING_AUTHORED_NOT_FINALIZED_HINT
    : MEANING_NEXT_ACTION_HINTS[first.nextAction] ?? `Next: ${first.nextAction}.`;
  const liveNote = first.sourceLive
    ? first.sourceLive.status === 'witnesses_supported'
      ? ` All ${first.sourceLive.witnessSummary?.total ?? 0} recorded witness paths still resolve at ${first.sourceLive.sourceRevision}; the receipt is behind the source, not broken.`
      : first.sourceLive.status === 'witnesses_missing'
        ? ` ${first.sourceLive.witnessSummary?.missing ?? 0} of ${first.sourceLive.witnessSummary?.total ?? 0} recorded witness paths no longer resolve at ${first.sourceLive.sourceRevision}.`
        : ''
    : '';
  return {
    status: 'warn',
    count: unresolved.length,
    // A diagnosis without a remedy leaves the reader with nothing to do — above
    // all when the reader is an agent rather than a person (`workspace-brief`).
    message:
      `${unresolved.length} project meaning assessment(s) require review; `
      + `first ${first.projectSlug}: ${first.status} (${first.topGap}). `
      + `${firstHint}${liveNote}`,
    assessments,
  };
}

function attachMeaningReadiness(result, artifact, args = {}) {
  const meaning = meaningReadinessCheck(artifact);
  if (meaning.status === 'pass') return result;
  const check = {
    id: 'meaning_assessment',
    status: meaning.status,
    count: meaning.count,
    message: meaning.message,
  };
  const action = {
    id: 'meaning_assessment',
    kind: 'meaning_assessment',
    severity: 'warn',
    count: meaning.count,
    message: meaning.message,
  };
  const actionLimit = typeof args.limit === 'number' ? args.limit : result.operation === 'workspace_brief' ? 10 : 5;
  if (result.operation === 'health') {
    return {
      ...result,
      status: 'needs_attention',
      checks: [...(Array.isArray(result.checks) ? result.checks : []), check],
    };
  }
  if (result.operation === 'workspace_brief') {
    return {
      ...result,
      status: 'needs_attention',
      health: {
        ...result.health,
        status: 'needs_attention',
        checks: [...(Array.isArray(result.health?.checks) ? result.health.checks : []), check],
      },
      nextActions: [action, ...(Array.isArray(result.nextActions) ? result.nextActions : [])]
        .slice(0, actionLimit),
    };
  }
  return result;
}

function meaningSourceFromProjectSource(projectSource) {
  const receipt = projectSource?.receipt;
  return {
    status: projectSource?.status,
    currentness: projectSource?.currentness,
    topGapId: projectSource?.topGap?.id ?? null,
    ...(receipt ? {
      receiptContractVersion: receipt.contractVersion,
      graphHash: receipt.graphHash,
      sourceId: receipt.sourceId,
      sourceRevision: receipt.sourceRevision,
      sourceFingerprint: receipt.sourceFingerprint,
      measuredAt: receipt.measuredAt,
    } : {}),
  };
}

/**
 * One project's containment scope, its documents, and its graph hash.
 * Shared by the meaning assessment and the source connect tools so the two can
 * never disagree about what "this project" contains — the hash stamped into a
 * receipt and the witnesses checked against the source must come from the same
 * boundary. A bounded/partial scope yields `graphHash: null`, which every
 * caller treats as fail-closed.
 */
function projectSourceScope(artifact, projectSlug, allDocs = null) {
  let scope = null;
  let docs = [];
  let graphHash = null;
  try {
    scope = queryCompiledOntology(artifact, {
      operation: 'project_scope',
      project: projectSlug,
      limit: 500,
    });
    if (!scope.nodes.limited && scope.nodes.total === scope.nodes.rows.length) {
      const scopedSlugs = new Set(scope.nodes.rows.map((node) => node.slug));
      docs = (allDocs ?? loadVaultDocs(VAULT_ROOT)).filter((doc) => scopedSlugs.has(doc.slug));
      graphHash = buildProjectSourceGraphHash(projectSlug, docs);
    }
  } catch {
    // A partial or invalid scope is represented by the fail-closed assessment.
  }
  return { scope, docs, graphHash };
}

function projectMeaningContext(artifact, projectSlug, structureStatus, scopedProject = null) {
  const { scope, docs, graphHash } = scopedProject ?? projectSourceScope(artifact, projectSlug);
  const projectSource = readProjectSourceView(VAULT_ROOT, projectSlug, graphHash, {
    currentWitnesses: deriveProjectSourceWitnessesFromDocs({ projectSlug, docs }),
  });
  const inventoryResult = buildProjectMeaningInventory({
    projectSlug,
    graphHash,
    projectScope: scope,
    artifactEdges: artifact?.edges,
    scopedDocs: docs,
    projectSource,
  });
  const projectDoc = docs.find((doc) => doc.slug === projectSlug && doc.frontmatter?.kind === 'project') ?? null;
  const assessmentInput = {
    vaultRoot: VAULT_ROOT,
    projectSlug,
    projectBody: projectDoc?.body,
    graphHash,
    structure: { status: structureStatus },
    source: meaningSourceFromProjectSource(projectSource),
    inventory: inventoryResult.status === 'ready' ? inventoryResult.inventory : null,
  };
  const meaningAssessment = readProjectMeaningAssessment(assessmentInput);
  let competency = null;
  try {
    competency = parseProjectCompetencyMarkdown(projectDoc?.body);
  } catch {
    // The repair projection fails closed when the human-editable competency block is unavailable.
  }
  const meaningRepairInput = {
    projectSlug,
    graphHash,
    meaningAssessment,
    competency,
    inventoryResult,
    scopedDocs: docs,
  };
  const meaningRepair = buildMeaningRepair(meaningRepairInput);
  return {
    scope,
    docs,
    graphHash,
    projectDoc,
    projectSource,
    inventoryResult,
    assessmentInput,
    meaningAssessment,
    meaningRepair,
    meaningRepairInput,
  };
}

function attachProjectMeaning(agentBrief, artifact, precomputedContext = null) {
  const context = precomputedContext ?? projectMeaningContext(
    artifact,
    agentBrief.projectSlug,
    agentBrief.readiness?.status,
  );
  const meaningIsCurrent = context.meaningAssessment?.status === 'verified_current';
  const meaningAction = meaningIsCurrent
    ? null
    : {
      id: 'meaning_assessment',
      kind: 'meaning_assessment',
      // An unbuilt/uncalibrated ontology is an actionable review state, not a
      // transport failure. Keep the agent out of the green lane without
      // making first-contact MCP verification impossible on a fresh vault.
      severity: 'warn',
      count: 1,
      target: context.meaningAssessment?.topGap?.id ?? 'assessment_input_invalid',
      message:
        'Meaning evidence is not current and complete; review the assessment before treating structural readiness as ontology readiness.',
    };
  const adjustedBrief = meaningIsCurrent
    ? {
      ...agentBrief,
      projectSource: context.projectSource,
      projectSourceRemedy: projectSourceRemedy(context.projectSource),
      meaningAssessment: context.meaningAssessment,
    }
    : {
      ...agentBrief,
      status: 'needs_attention',
      readiness: {
        ...agentBrief.readiness,
        status: agentBrief.readiness?.status === 'ready'
          ? 'needs_attention'
          : agentBrief.readiness?.status,
        score: Math.min(agentBrief.readiness?.score ?? 0, 75),
      },
      health: {
        ...agentBrief.health,
        status: 'needs_attention',
        checks: [
          ...(Array.isArray(agentBrief.health?.checks) ? agentBrief.health.checks : []),
          {
            id: 'meaning_assessment',
            status: 'warn',
            count: 1,
            message: meaningAction.message,
          },
        ],
      },
      nextActions: [
        meaningAction,
        ...(Array.isArray(agentBrief.nextActions) ? agentBrief.nextActions : []),
      ],
      projectSource: context.projectSource,
      projectSourceRemedy: projectSourceRemedy(context.projectSource),
      meaningAssessment: context.meaningAssessment,
    };
  return attachMeaningRepair({
    ...adjustedBrief,
  }, context.meaningRepair);
}

function validateQueryOntologyArgs(args = {}) {
  requireNonBlankString(args.operation, 'operation');
  requireOptionalEnum(args.operation, 'operation', QUERY_ONTOLOGY_OPERATIONS);
  requireOptionalNonBlankString(args.targetOperation, 'targetOperation');
  requireOptionalEnum(args.targetOperation, 'targetOperation', QUERY_PLAN_TARGET_OPERATIONS);
  requireOptionalNonBlankString(args.recordId, 'recordId');
  requireOptionalNonBlankString(args.analysisCursor, 'analysisCursor');
  requireOptionalEnum(args.analysisMode, 'analysisMode', ['meaning', 'architecture']);
  if (args.operation === 'analysis_record') requireNonBlankString(args.recordId, 'recordId');
  if (args.recordId !== undefined && args.operation !== 'analysis_record') throw new Error('recordId is only valid for analysis_record.');
  if ((args.analysisMode !== undefined || args.analysisCursor !== undefined) && args.operation !== 'analysis_history') throw new Error('Analysis history filters require analysis_history.');
  if (args.operation === 'analysis_history' && args.limit !== undefined && (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 100)) throw new Error('Analysis history limit must be between 1 and 100 scanned files.');

  for (const key of [
    'slug',
    'seed',
    'candidateSlug',
    'title',
    'task',
    'from',
    'project',
    'to',
    'type',
    'kind',
    'domain',
    'slugContains',
    'fromKind',
    'toKind',
    'relation',
    'afterActionId',
    'expectedGraphHash',
    'expectedSourceFingerprint',
    'reviewRevision',
    'cursor',
  ]) {
    requireOptionalNonBlankString(args[key], key);
  }
  requireOptionalEnum(args.detail, 'detail', ['compact', 'full']);
  if (args.detail !== undefined && args.operation !== 'agent_brief') {
    throw new Error('detail is only valid for operation "agent_brief".');
  }
  if (args.task !== undefined && (args.operation !== 'agent_brief' || args.detail !== 'compact')) {
    throw new Error('task is only valid for operation "agent_brief" with detail "compact".');
  }
  if (args.operation === 'agent_brief' && args.detail === 'compact' && args.task === undefined) {
    throw new Error('agent_brief detail "compact" requires task.');
  }
  if (typeof args.task === 'string' && args.task.length > AGENT_BRIEF_TASK_MAX_CHARS) {
    throw new Error(`task must contain at most ${AGENT_BRIEF_TASK_MAX_CHARS} characters.`);
  }
  for (const key of [
    'limit',
    'itemLimit',
    'nodeLimit',
    'componentLimit',
    'cycleLimit',
    'recommendationLimit',
    'orderLimit',
  ]) {
    requireOptionalPositiveInteger(args[key], key, { max: 500 });
  }
  requireOptionalPositiveInteger(args.iterations, 'iterations', { max: 100 });
  requireOptionalNonNegativeInteger(args.maxHops, 'maxHops', { max: 20 });
  requireOptionalNonNegativeInteger(args.depth, 'depth', { max: 20 });
  for (const key of ['minDegree', 'maxDegree', 'minInDegree', 'minOutDegree']) {
    requireOptionalNonNegativeInteger(args[key], key);
  }
  requireOptionalDirection(args.direction, 'direction', ['incoming', 'outgoing', 'both', 'undirected']);
  requireOptionalEnum(args.sort, 'sort', ['degree', 'inDegree', 'outDegree', 'slug']);
  if (args.operation === 'recommend_relations') {
    requireOptionalEnum(args.kind, 'kind', ['capability', 'element']);
  } else if (args.operation === 'match_nodes') {
    requireOptionalEnum(args.kind, 'kind', NODE_KIND_VALUES);
  }
  if (args.operation === 'match_edges') {
    requireOptionalEnum(args.fromKind, 'fromKind', NODE_KIND_VALUES);
    requireOptionalEnum(args.toKind, 'toKind', EDGE_TARGET_KIND_VALUES);
  }
  for (const key of [
    'includeExternal',
    'includeUnresolved',
    'includeIsolated',
    'includeOrphans',
    'executableOnly',
    'hasIncoming',
    'hasOutgoing',
  ]) {
    requireOptionalBoolean(args[key], key);
  }
  requireOptionalStringArray(args.types, 'types', { max: RELATION_TYPE_VALUES.length });
  requireOptionalStringArray(args.pattern, 'pattern', { max: RELATION_TYPE_VALUES.length });
  requireOptionalStringArray(args.phases, 'phases', { max: MAINTENANCE_PHASE_VALUES.length });
  requireOptionalStringArray(args.severities, 'severities', { max: MAINTENANCE_SEVERITY_VALUES.length });
  requireOptionalStringArray(args.kinds, 'kinds', { max: MAINTENANCE_KIND_VALUES.length });
  requireOptionalStringArray(args.dependencyTypes, 'dependencyTypes', { max: RELATION_TYPE_VALUES.length });
  requireOptionalStringArray(args.componentTypes, 'componentTypes', { max: RELATION_TYPE_VALUES.length });
  if (args.operation === 'meaning_repair_review') {
    requireNonBlankString(args.project, 'project');
    requireNonBlankString(args.reviewRevision, 'reviewRevision');
    if (args.cursor === undefined) {
      requireNonBlankString(args.expectedGraphHash, 'expectedGraphHash');
      requireNonBlankString(args.expectedSourceFingerprint, 'expectedSourceFingerprint');
    }
    if (args.expectedGraphHash !== undefined && !/^project-graph-v1:[a-f0-9]{8}$/.test(args.expectedGraphHash)) {
      throw new Error('expectedGraphHash must be a project-graph-v1 hash.');
    }
    if (!/^sha256:[a-f0-9]{64}$/.test(args.reviewRevision)) {
      throw new Error('reviewRevision must be a sha256 digest.');
    }
    if (args.expectedSourceFingerprint !== undefined && args.expectedSourceFingerprint.length > 200) {
      throw new Error('expectedSourceFingerprint must contain at most 200 characters.');
    }
    if (args.cursor !== undefined && args.cursor.length > 4096) {
      throw new Error('cursor must contain at most 4096 characters.');
    }
    if (args.cursor !== undefined && !/^mrp1\.[a-f0-9]{32}$/.test(args.cursor)) {
      throw new Error('cursor must be an opaque meaning repair cursor returned by nextCall.');
    }
  }
}

export {
  compileOntologyTool,
  resolveAgentBriefProject,
  completeAgentBriefProjectScope,
  scopedAgentBriefInput,
  privateCurrentProjectSourceAccess,
  queryOntologyTool,
  MEANING_AUTHORED_NOT_FINALIZED_HINT,
  MEANING_NEXT_ACTION_HINTS,
  meaningReadinessCheck,
  attachMeaningReadiness,
  meaningSourceFromProjectSource,
  projectSourceScope,
  projectMeaningContext,
  attachProjectMeaning,
  validateQueryOntologyArgs,
};
