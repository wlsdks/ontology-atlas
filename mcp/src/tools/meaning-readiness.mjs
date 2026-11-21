// The meaning-readiness and project-meaning facts an agent brief carries.

import { attachMeaningRepair, buildMeaningRepair } from '../meaning/meaning-repair.mjs';
import { queryCompiledOntology } from '../ontology-engine.mjs';
import { buildProjectMeaningInventory } from '../project-meaning/project-meaning-inventory.mjs';
import {
  parseProjectCompetencyMarkdown,
  readProjectMeaningAssessment,
} from '../project-meaning/project-meaning-receipt.mjs';
import { buildProjectSourceGraphHash } from '../project-source/project-source-graph-hash.mjs';
import { pinnedCitationVerifier, readProjectSourceView } from '../project-source/project-source-receipt.mjs';
import { projectSourceRemedy } from '../project-source/project-source-remedy.mjs';
import { deriveProjectSourceWitnessesFromDocs } from '../project-source/project-source-witnesses.mjs';
import { VAULT_ROOT } from '../server/runtime.mjs';
import { loadVaultDocs } from '../vault/documents.mjs';

const MEANING_AUTHORED_NOT_FINALIZED_HINT =
  'This project\'s five competency answers are already written, but this vault '
  + 'has no finalize receipt for them. Nothing is broken. Call '
  + 'finalize_project_meaning to record the receipt.';

const MEANING_BODY_CHANGED_HINT =
  'The project document changed since its competency answers were finalized. '
  + 'Review its `## Competency answers` against the current ontology and source evidence. '
  + 'After any approved changes, validate the vault, compile the ontology, '
  + 'and call finalize_project_meaning again.';

const MEANING_NEXT_ACTION_HINTS = Object.freeze({
  // Never claim the section is missing: a vault can have it without having
  // finalised it. This text covers a section that is absent or does not parse.
  author_competency_answers:
    'This project\'s five competency answers have not been finalized yet. '
    + 'Nothing is broken. Fill in the `## Competency answers` section of the '
    + 'project document if it is missing, then call finalize_project_meaning.',
  resolve_competency_question:
    'A competency answer is incomplete: it needs concrete witnesses (concepts, '
    + 'relations, or evidence paths) that resolve in this vault. Fill the gap in '
    + 'the project document, then call finalize_project_meaning again.',
  reevaluate_competency:
    'The ontology or source evidence changed since the competency answers were finalized. '
    + 'Review the project document\'s `## Competency answers` against the current ontology and source evidence. '
    + 'After any approved changes, validate the vault, compile the ontology, '
    + 'and call finalize_project_meaning again.',
  repair_assessment_input:
    'The assessment input is malformed. Inspect the project document\'s '
    + '`## Competency answers` section and the source receipt.',
  repair_ontology_structure: 'Fix the graph problems that query_ontology health reports first.',
  repair_source_receipt:
    'The source receipt is unusable. Re-bind the project to its code folder '
    + 'with connect_project_source.',
  record_source_role:
    'No concept in this project names its code file yet. Find the file that '
    + 'carries each capability or element (find_evidence, read_source) and '
    + 'record it as that node\'s `path:` with patch_concept; leave out a '
    + 'concept whose file you cannot identify.',
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

function meaningReadinessCheck(artifact, loadedDocs) {
  const projectSlugs = (Array.isArray(artifact?.nodes) ? artifact.nodes : [])
    .filter((node) => node?.kind === 'project' && typeof node.slug === 'string')
    .map((node) => node.slug)
    .sort((left, right) => left.localeCompare(right));
  const assessments = projectSlugs.map((projectSlug) => {
    try {
      // The graph engine's health status includes semantic checks; meaning
      // assessment needs the structural readiness input only. Scope and
      // inventory failures below still fail closed via a null graph hash.
      const context = projectMeaningContext(artifact, projectSlug, 'ready', null, loadedDocs);
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
        // Keep the computed remedy so the reader gets more than an error code.
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
  const firstHint = first.topGap === 'competency_body_changed'
    ? MEANING_BODY_CHANGED_HINT
    : first.nextAction === 'author_competency_answers' && first.competencyAuthored
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

export function attachMeaningReadiness(result, artifact, args = {}, loadedDocs = null) {
  const meaning = meaningReadinessCheck(artifact, loadedDocs);
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

export function meaningSourceFromProjectSource(projectSource) {
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
 * One project's containment scope, documents and graph hash, shared by the meaning
 * assessment and the source connect tools so a receipt's hash and its checked
 * witnesses come from the same boundary. A partial scope yields `graphHash: null`,
 * which every caller treats as fail-closed.
 */
export function projectSourceScope(artifact, projectSlug, allDocs = null) {
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

export function projectMeaningContext(artifact, projectSlug, structureStatus, scopedProject = null, loadedDocs = null) {
  const { scope, docs, graphHash } = scopedProject ?? projectSourceScope(artifact, projectSlug, loadedDocs);
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
    verifyCitation: pinnedCitationVerifier(VAULT_ROOT, projectSlug),
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

export function attachProjectMeaning(agentBrief, artifact, precomputedContext = null) {
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
