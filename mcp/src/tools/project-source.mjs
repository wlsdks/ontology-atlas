/**
 * Binding a project node to the code it describes, and releasing it:
 * `connect_project_source`, `disconnect_project_source`, and the
 * `finalize_project_meaning` receipt.
 */

import {
  competencyDepthRefusals,
  measureBuildDepth,
  repositorySurvey,
} from '../construction/build-depth.mjs';
import { sessionReads } from '../construction/session-reads.mjs';
import { COMPETENCY_ANSWERS_HINT_EN } from '../construction/construction-card.mjs';
import {
  MEANING_COMPETENCY_CONTRACT,
  MEANING_COMPETENCY_EVALUATOR,
  unresolvedCompetencyRows,
} from '../meaning/meaning-assessment.mjs';
import { queryCompiledOntology } from '../ontology-engine.mjs';
import { renderCompetencyAnswers, withCompetencySection } from '../project-meaning/competency-answers.mjs';
import { buildProjectMeaningInventory } from '../project-meaning/project-meaning-inventory.mjs';
import {
  finalizeProjectMeaningReceipt,
  parseProjectCompetencyMarkdown,
  readProjectMeaningAssessment,
} from '../project-meaning/project-meaning-receipt.mjs';
import { collectProjectSourceCandidates } from '../project-source/project-source-discovery.mjs';
import { inferProjectSourceProposal } from '../project-source/project-source-inference.mjs';
import { inspectProjectSource } from '../project-source/project-source-inspection.mjs';
import {
  PROJECT_SOURCE_STATE_RELATIVE_PATH,
  buildProjectSourceReceipt,
  pinnedCitationVerifier,
  readProjectSourceBindings,
  readProjectSourceView,
  removeProjectSourceBindings,
  writeProjectSourceBinding,
} from '../project-source/project-source-receipt.mjs';
import {
  projectSourceRemedy,
  undoPlan,
} from '../project-source/project-source-remedy.mjs';
import { deriveProjectSourceWitnessesFromDocs } from '../project-source/project-source-witnesses.mjs';
import {
  COMPILED_ONTOLOGY_CACHE,
  REPO_ROOT,
  REPO_ROOT_IS_GROUNDED,
  VAULT_ROOT,
} from '../server/runtime.mjs';
import {
  requireOptionalNonBlankString,
  requireOptionalNonNegativeNumber,
} from '../server/validate.mjs';
import { loadVaultDocs, readDoc } from '../vault/documents/document-cache.mjs';
import { VaultConflictError } from '../vault/writes/atomic-writes.mjs';
import { updateDoc } from '../vault/writes/doc-writes.mjs';
import { logWrite } from '../server/write-log.mjs';
import { projectMeaningContext, projectSourceScope } from './meaning-readiness.mjs';
import { attachVaultValidation } from './result-attachments.mjs';
import { validateVaultReport } from './validate-vault.mjs';
import { requireNodeNotReservedForHuman, resolveExistingVaultSlug } from './vault-nodes.mjs';
import { isAbsolute } from 'node:path';

const PROJECT_SOURCE_CONNECT_CONTRACT = 'projectSourceConnect:v1';

const PROJECT_SOURCE_DISCONNECT_CONTRACT = 'projectSourceDisconnect:v1';

/**
 * Probes one folder with the app's bounded probe and mints the receipt for the
 * project's declared source claims; the caller decides whether to persist it.
 */
function measureSource({ projectSlug, graphHash, rootPath, scopedDocs }) {
  const probe = inspectProjectSource(rootPath, { excludePath: VAULT_ROOT });
  const measuredAt = new Date().toISOString();
  const receipt = buildProjectSourceReceipt({
    projectSlug,
    graphHash,
    probe,
    witnesses: deriveProjectSourceWitnessesFromDocs({ projectSlug, docs: scopedDocs }),
    measuredAt,
  });
  const binding = {
    projectSlug,
    sourceId: probe.sourceId,
    rootPath: probe.rootPath,
    kind: probe.kind,
    boundAt: measuredAt,
  };
  return { probe, receipt, binding };
}

function persistBinding(written, toolName) {
  if (written.status === 'blocked_unsafe_path') {
    throw new Error(
      `${toolName} blocked: ${PROJECT_SOURCE_STATE_RELATIVE_PATH} is behind an unsafe sidecar path. repair: true cannot bypass a symlink or junction boundary.`,
    );
  }
  if (written.status === 'blocked_malformed') {
    throw new Error(
      `${toolName} blocked: ${PROJECT_SOURCE_STATE_RELATIVE_PATH} is malformed. Re-run connect_project_source with repair: true to discard and rewrite it.`,
    );
  }
  if (written.status !== 'written') {
    throw new Error(`${toolName} could not persist the binding (${written.status}).`);
  }
}

function resolveProjectNodeSlug(projectSlug, allDocs) {
  const canonicalSlug = resolveExistingVaultSlug(projectSlug, allDocs);
  if (!canonicalSlug) {
    throw new Error(
      `Project slug does not exist in vault: "${projectSlug}". Use list_concepts({kind:"project"}) to choose an exact project slug.`,
    );
  }
  const projectDoc = allDocs.find((doc) => doc.slug === canonicalSlug);
  if (projectDoc?.frontmatter?.kind !== 'project') {
    throw new Error(
      `connect_project_source requires a kind: project node; received "${canonicalSlug}".`,
    );
  }
  return canonicalSlug;
}

function connectProjectSourceTool({ projectSlug, rootPath, confirm, repair } = {}) {
  requireOptionalNonBlankString(projectSlug, 'projectSlug');
  requireOptionalNonBlankString(rootPath, 'rootPath');
  if (typeof projectSlug !== 'string') throw new Error('projectSlug is required.');
  if (typeof rootPath === 'string' && !isAbsolute(rootPath)) {
    throw new Error(`rootPath must be an absolute local path; received "${rootPath}".`);
  }

  const allDocs = loadVaultDocs(VAULT_ROOT);
  const canonicalSlug = resolveProjectNodeSlug(projectSlug, allDocs);
  const artifact = COMPILED_ONTOLOGY_CACHE.get({ docs: allDocs });
  const { docs, graphHash } = projectSourceScope(artifact, canonicalSlug, allDocs);
  if (!graphHash) {
    throw new Error(
      `connect_project_source blocked: the project scope for "${canonicalSlug}" is incomplete, so no receipt could detect later ontology drift. Repair the project containment first (query_ontology({operation:"project_scope", project:"${canonicalSlug}"})).`,
    );
  }
  const sidecar = readProjectSourceBindings(VAULT_ROOT);
  if (sidecar.status === 'malformed' && repair !== true) {
    throw new Error(
      `connect_project_source blocked: ${PROJECT_SOURCE_STATE_RELATIVE_PATH} is malformed. Inspect it, then re-run with repair: true to discard and rewrite it.`,
    );
  }
  const bound = sidecar.status === 'ok'
    ? sidecar.bindings.filter((binding) => binding.projectSlug === canonicalSlug)
    : [];

  let inference = null;
  let selectedRoot = null;
  let mode = bound.length > 0 ? 'replace' : 'connect';
  if (typeof rootPath === 'string') {
    selectedRoot = rootPath;
  } else if (bound.length === 1) {
    selectedRoot = bound[0].rootPath;
    mode = 'remeasure';
  } else {
    const { vaultRootPath, candidates } = collectProjectSourceCandidates(VAULT_ROOT);
    inference = inferProjectSourceProposal({ vaultRootPath, candidates });
    if (inference.status !== 'proposed') {
      throw new Error(
        'connect_project_source found no enclosing code folder for this vault (no git repository and no project manifest above it). '
        + 'Pass rootPath with the absolute folder that holds the code this ontology describes.',
      );
    }
    selectedRoot = inference.candidate.rootPath;
    inference = { ...inference, candidates };
  }

  let measured;
  try {
    measured = measureSource({ projectSlug: canonicalSlug, graphHash, rootPath: selectedRoot, scopedDocs: docs });
  } catch (err) {
    throw new Error(
      `connect_project_source could not measure "${selectedRoot}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const { probe, receipt, binding } = measured;
  if (inference) {
    inference = inferProjectSourceProposal({
      vaultRootPath: VAULT_ROOT,
      candidates: inference.candidates,
      witnessSummary: receipt.witnessSummary,
    });
  }

  const bindingView = {
    rootPath: probe.rootPath,
    kind: probe.kind,
    sourceId: probe.sourceId,
    dirty: probe.dirty,
    truncated: probe.truncated,
    inventoryFiles: probe.files.length,
  };

  if (confirm !== true) {
    return {
      ok: true,
      changed: false,
      confirmed: false,
      contract: PROJECT_SOURCE_CONNECT_CONTRACT,
      projectSlug: canonicalSlug,
      mode,
      binding: bindingView,
      inference,
      previewReceipt: receipt,
      previousBindingCount: bound.length,
      nextCall: {
        tool: 'connect_project_source',
        arguments: { projectSlug: canonicalSlug, rootPath: probe.rootPath, confirm: true },
      },
      undo: undoPlan(canonicalSlug),
    };
  }

  persistBinding(
    writeProjectSourceBinding(VAULT_ROOT, { ...binding, receipt }, { repair: repair === true }),
    'connect_project_source',
  );
  const projectSource = readProjectSourceView(VAULT_ROOT, canonicalSlug, graphHash);
  return {
    ok: true,
    changed: true,
    confirmed: true,
    contract: PROJECT_SOURCE_CONNECT_CONTRACT,
    projectSlug: canonicalSlug,
    mode,
    binding: bindingView,
    inference,
    projectSource,
    remedy: projectSourceRemedy(projectSource),
    previousBindingCount: bound.length,
    undo: undoPlan(canonicalSlug),
  };
}

function disconnectProjectSourceTool({ projectSlug, confirm } = {}) {
  requireOptionalNonBlankString(projectSlug, 'projectSlug');
  if (typeof projectSlug !== 'string') throw new Error('projectSlug is required.');

  const allDocs = loadVaultDocs(VAULT_ROOT);
  // A binding can outlive its project node. Disconnect must still be able to
  // clear it, so an unresolvable slug falls back to the literal value.
  const canonicalSlug = resolveExistingVaultSlug(projectSlug, allDocs) ?? projectSlug;
  const sidecar = readProjectSourceBindings(VAULT_ROOT);
  if (sidecar.status === 'unsafe_path') {
    throw new Error(
      `disconnect_project_source blocked: ${PROJECT_SOURCE_STATE_RELATIVE_PATH} is behind an unsafe sidecar path. Replace the symlink or junction with a real vault-local directory first.`,
    );
  }
  if (sidecar.status === 'malformed') {
    throw new Error(
      `disconnect_project_source blocked: ${PROJECT_SOURCE_STATE_RELATIVE_PATH} is malformed. Inspect it by hand, or re-connect with repair: true to rewrite it.`,
    );
  }
  const bound = sidecar.status === 'ok'
    ? sidecar.bindings.filter((binding) => binding.projectSlug === canonicalSlug)
    : [];
  const removable = bound.map((binding) => ({
    rootPath: binding.rootPath,
    kind: binding.kind,
    boundAt: binding.boundAt,
    measuredAt: binding.receipt?.measuredAt ?? null,
  }));

  if (confirm !== true) {
    return {
      ok: true,
      changed: false,
      confirmed: false,
      contract: PROJECT_SOURCE_DISCONNECT_CONTRACT,
      projectSlug: canonicalSlug,
      removed: 0,
      bindings: removable,
      nextCall: {
        tool: 'disconnect_project_source',
        arguments: { projectSlug: canonicalSlug, confirm: true },
      },
    };
  }

  const result = removeProjectSourceBindings(VAULT_ROOT, canonicalSlug);
  if (result.status === 'blocked_unsafe_path') {
    throw new Error(
      `disconnect_project_source blocked: ${PROJECT_SOURCE_STATE_RELATIVE_PATH} is behind an unsafe sidecar path.`,
    );
  }
  if (result.status === 'persistence_failed') {
    throw new Error('disconnect_project_source could not persist the sidecar update.');
  }
  const projectSource = readProjectSourceView(VAULT_ROOT, canonicalSlug, undefined);
  return {
    ok: true,
    changed: result.removed > 0,
    confirmed: true,
    contract: PROJECT_SOURCE_DISCONNECT_CONTRACT,
    projectSlug: canonicalSlug,
    removed: result.removed,
    bindings: removable,
    projectSource,
    remedy: projectSourceRemedy(projectSource),
  };
}

/**
 * Whether the stored source receipt measured every path the project now claims,
 * against the current graph, as the witness inventory counts it: a path is measured
 * when a witness for one of its claims was. A path cited since (a competency
 * Evidence file no `path:` names) or a moved graph leaves evidence unmeasured.
 */
function receiptMeasuresEveryClaim(receipt, graphHash, claims) {
  if (receipt.graphHash !== graphHash) return false;
  const claimKeys = new Set(claims.map((claim) => `${claim.nodeSlug}\0${claim.path}`));
  const measuredPaths = new Set(receipt.witnesses
    .filter((witness) => claimKeys.has(`${witness.nodeSlug}\0${witness.path}`))
    .map((witness) => witness.path));
  return claims.every((claim) => measuredPaths.has(claim.path));
}

/**
 * Re-measures the folder this project is already bound to, as
 * `connect_project_source({confirm:true})` without `rootPath` does; it never chooses
 * or infers a folder. A failure is returned, not thrown: the stored receipt may
 * still resolve every answered row.
 */
function remeasureBoundSource(projectSlug, graphHash, scopedDocs) {
  const sidecar = readProjectSourceBindings(VAULT_ROOT);
  const bound = sidecar.status === 'ok'
    ? sidecar.bindings.filter((binding) => binding.projectSlug === projectSlug)
    : [];
  if (bound.length !== 1) return { failure: `"${projectSlug}" has no single connected source folder` };
  try {
    return { measured: measureSource({ projectSlug, graphHash, rootPath: bound[0].rootPath, scopedDocs }) };
  } catch (error) {
    return { failure: `the connected source folder could not be measured (${error instanceof Error ? error.message : String(error)})` };
  }
}

const UNRESOLVED_FIELD = [
  [/^no `- (Concepts|Relations|Evidence|Paths):` row/, (match) => match[1].toLowerCase()],
  [/^concept /, () => 'concepts'],
  [/relation/, () => 'relations'],
  [/^evidence /, () => 'evidence'],
  [/^path /, () => 'paths'],
];

function unresolvedFields(problems) {
  const fields = new Set();
  for (const problem of problems) {
    for (const [pattern, field] of UNRESOLVED_FIELD) {
      const match = pattern.exec(problem);
      if (match) {
        fields.add(field(match));
        break;
      }
    }
  }
  return [...fields];
}

/**
 * One refusal for every answered row whose witnesses do not resolve: the row, each
 * reason, and the argument to change, so one corrected call succeeds. Unless the
 * measurement failed, the source was measured for this call, so an unresolved file
 * is one the folder lacks.
 */
function competencyRefusal(rows, answerIndexes, measurementFailure) {
  const lines = rows.map(({ id, problems }) => {
    const reasons = (measurementFailure
      ? problems
      : problems.map((problem) => problem.replace(/ is not a measured source witness/g, ' is not a file in the connected source folder')))
      .join('; ');
    if (!answerIndexes) return `- ${id}: ${reasons}. Repair that row, or pass \`answers\` and finalize rewrites the section.`;
    const row = `answers[${answerIndexes.get(id)}]`;
    const fields = unresolvedFields(problems).map((field) => `${row}.${field}`);
    return `- ${row} ${id}: ${reasons}. Change ${fields.join(' or ') || row}, or set its status "partial" with a gap.`;
  });
  return [
    `finalize_project_meaning blocked: ${rows.length} answered row(s) cite witnesses that do not resolve. Nothing was written.`,
    ...(measurementFailure ? [`Newly cited files were not measured: ${measurementFailure}. Call connect_project_source with the folder's rootPath and confirm: true.`] : []),
    ...lines,
  ].join('\n');
}

function depthRefusal(depthRefusals, answersGiven) {
  const fallback = answersGiven
    ? 'Make the call each row names and finalize again, or set that row\'s status "partial" with a gap.'
    : 'Make the call each row names and finalize again; marking a row partial is the fallback when the map cannot be repaired.';
  return [
    `finalize_project_meaning blocked: ${depthRefusals.length} answered row(s) claim more than the map holds. Nothing was written.`,
    ...depthRefusals,
    fallback,
  ].join('\n');
}

function parsedCompetency(body, answersGiven) {
  try {
    return parseProjectCompetencyMarkdown(body);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (answersGiven) throw new Error(`finalize_project_meaning could not render \`answers\`: ${reason}`);
    throw new Error(`${reason}. ${COMPETENCY_ANSWERS_HINT_EN}`);
  }
}

function finalizeProjectMeaningTool({ projectSlug, expected_mtime, answers } = {}) {
  requireOptionalNonBlankString(projectSlug, 'projectSlug');
  requireOptionalNonNegativeNumber(expected_mtime, 'expected_mtime');
  if (typeof projectSlug !== 'string') throw new Error('projectSlug is required.');
  if (typeof expected_mtime !== 'number') throw new Error('expected_mtime is required.');
  const answersGiven = answers !== undefined;
  const section = answersGiven ? renderCompetencyAnswers(answers) : null;

  const allDocs = loadVaultDocs(VAULT_ROOT);
  const canonicalSlug = resolveExistingVaultSlug(projectSlug, allDocs);
  if (!canonicalSlug) {
    throw new Error(
      `Project slug does not exist in vault: "${projectSlug}". Use list_concepts({kind:"project"}) to choose an exact project slug.`,
    );
  }
  const projectDoc = allDocs.find((doc) => doc.slug === canonicalSlug);
  if (projectDoc?.frontmatter?.kind !== 'project') {
    throw new Error(`finalize_project_meaning requires a kind: project node; received "${canonicalSlug}".`);
  }
  // With `answers` the server replaces only its own section in the body as it is now, so the
  // caller's view of the file cannot overwrite an edit; a relation write just before this call
  // moves the project's mtime and is no conflict.
  if (!answersGiven && projectDoc.mtime !== expected_mtime) {
    throw new VaultConflictError(canonicalSlug, expected_mtime, projectDoc.mtime);
  }
  if (answersGiven) requireNodeNotReservedForHuman(projectDoc, 'finalize_project_meaning');

  const validation = validateVaultReport({}, allDocs);
  if (validation.summary.errorFiles > 0) {
    throw new Error(
      `finalize_project_meaning blocked: validate_vault found ${validation.summary.errorFiles} file(s) with errors. Repair them before finalizing.`,
    );
  }

  // The section is evidence text, not graph structure: the compiled artifact and the
  // project graph hash stay those of the files on disk.
  const projectBody = answersGiven ? withCompetencySection(projectDoc.body, section) : projectDoc.body;
  const docs = answersGiven
    ? allDocs.map((doc) => (doc === projectDoc ? { ...doc, body: projectBody } : doc))
    : allDocs;
  const artifact = COMPILED_ONTOLOGY_CACHE.get({ docs: allDocs });
  const brief = attachVaultValidation(
    queryCompiledOntology(artifact, {
      operation: 'agent_brief',
      project: canonicalSlug,
    }),
    { operation: 'agent_brief', project: canonicalSlug },
    allDocs,
    validation,
  );
  const context = projectMeaningContext(artifact, canonicalSlug, brief.readiness?.status, null, docs);
  if (!context.graphHash || context.inventoryResult.status !== 'ready') {
    throw new Error(
      `finalize_project_meaning blocked: current project witness inventory is unavailable (${context.inventoryResult.reason ?? 'unknown'}).`,
    );
  }
  if (!context.projectSource.receipt) {
    throw new Error(`finalize_project_meaning blocked: a valid project source receipt is required first. Call connect_project_source({projectSlug:"${canonicalSlug}", confirm:true}).`);
  }
  const competency = parsedCompetency(projectBody, answersGiven);

  const claims = deriveProjectSourceWitnessesFromDocs({ projectSlug: canonicalSlug, docs: context.docs });
  let remeasured = null;
  let measurementFailure = null;
  let { inventoryResult } = context;
  if (!receiptMeasuresEveryClaim(context.projectSource.receipt, context.graphHash, claims)) {
    const measurement = remeasureBoundSource(canonicalSlug, context.graphHash, context.docs);
    remeasured = measurement.measured ?? null;
    measurementFailure = measurement.failure ?? null;
  }
  if (remeasured) {
    inventoryResult = buildProjectMeaningInventory({
      projectSlug: canonicalSlug,
      graphHash: context.graphHash,
      projectScope: context.scope,
      artifactEdges: artifact?.edges,
      scopedDocs: context.docs,
      projectSource: { receipt: remeasured.receipt },
      verifyCitation: pinnedCitationVerifier(VAULT_ROOT, canonicalSlug),
    });
    if (inventoryResult.status !== 'ready') {
      throw new Error(`finalize_project_meaning blocked: the measured witness inventory is unavailable (${inventoryResult.reason}).`);
    }
  }

  const answerIndexes = answersGiven ? new Map(answers.map((row, index) => [row.id, index])) : null;
  const unresolvedRows = unresolvedCompetencyRows({
    competency: {
      contract: MEANING_COMPETENCY_CONTRACT,
      receiptVersion: 1,
      evaluator: MEANING_COMPETENCY_EVALUATOR,
      graphHash: context.graphHash,
      inventory: inventoryResult.inventory,
      questions: competency.questions,
    },
  });
  if (unresolvedRows.length > 0) {
    throw new Error(competencyRefusal(unresolvedRows, answerIndexes, measurementFailure));
  }
  // An `answered` the map contradicts: most entry files never read this session,
  // units or entry points no node places, or almost no dependency recorded.
  const grounded = REPO_ROOT_IS_GROUNDED ? REPO_ROOT : null;
  const depth = measureBuildDepth(docs, repositorySurvey(grounded, VAULT_ROOT), grounded ? sessionReads(grounded) : null);
  const depthRefusals = competencyDepthRefusals(competency.questions, depth);
  if (depthRefusals.length > 0) {
    throw new Error(depthRefusal(depthRefusals, answersGiven));
  }

  let storedBody = projectBody;
  if (answersGiven && projectBody !== projectDoc.body) {
    const { filePath } = updateDoc(VAULT_ROOT, canonicalSlug, { body: projectBody, expectedMtime: projectDoc.mtime });
    storedBody = readDoc(VAULT_ROOT, filePath).body;
    // The body is now on disk whatever the receipt write does, so it is logged here.
    logWrite('finalize_project_meaning', { projectSlug: canonicalSlug }, { bodyWritten: true });
  }
  if (remeasured) {
    persistBinding(
      writeProjectSourceBinding(VAULT_ROOT, { ...remeasured.binding, receipt: remeasured.receipt }),
      'finalize_project_meaning',
    );
  }
  const sourceReceipt = remeasured?.receipt ?? context.projectSource.receipt;
  const receipt = finalizeProjectMeaningReceipt({
    vaultRoot: VAULT_ROOT,
    projectSlug: canonicalSlug,
    projectBody: storedBody,
    graphHash: context.graphHash,
    sourceFingerprint: sourceReceipt.sourceFingerprint,
    measuredAt: new Date().toISOString(),
  });
  const assessmentInput = remeasured
    ? projectMeaningContext(artifact, canonicalSlug, brief.readiness?.status, null, loadVaultDocs(VAULT_ROOT)).assessmentInput
    : { ...context.assessmentInput, projectBody: storedBody };
  const meaningAssessment = readProjectMeaningAssessment(assessmentInput);
  return {
    ok: true,
    changed: true,
    contract: 'projectMeaningReceipt:v1',
    projectSlug: canonicalSlug,
    bodyDigest: receipt.bodyDigest,
    graphHash: receipt.graphHash,
    sourceFingerprint: receipt.sourceFingerprint,
    measuredAt: receipt.measuredAt,
    meaningAssessment,
  };
}

export {
  connectProjectSourceTool,
  disconnectProjectSourceTool,
  finalizeProjectMeaningTool,
};
