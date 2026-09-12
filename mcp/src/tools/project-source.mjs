/**
 * Binding a project node to the code it describes, and releasing it:
 * `connect_project_source`, `disconnect_project_source`, and the
 * `finalize_project_meaning` receipt.
 */

import {
  MEANING_COMPETENCY_CONTRACT,
  MEANING_COMPETENCY_EVALUATOR,
  deriveMeaningAssessment,
} from '../meaning-assessment.mjs';
import { queryCompiledOntology } from '../ontology-engine.mjs';
import {
  finalizeProjectMeaningReceipt,
  parseProjectCompetencyMarkdown,
  readProjectMeaningAssessment,
} from '../project-meaning-receipt.mjs';
import { collectProjectSourceCandidates } from '../project-source-discovery.mjs';
import { inferProjectSourceProposal } from '../project-source-inference.mjs';
import { inspectProjectSource } from '../project-source-inspection.mjs';
import {
  PROJECT_SOURCE_STATE_RELATIVE_PATH,
  buildProjectSourceReceipt,
  readProjectSourceBindings,
  readProjectSourceView,
  removeProjectSourceBindings,
  writeProjectSourceBinding,
} from '../project-source-receipt.mjs';
import {
  projectSourceRemedy,
  undoPlan,
} from '../project-source-remedy.mjs';
import { deriveProjectSourceWitnessesFromDocs } from '../project-source-witnesses.mjs';
import {
  COMPILED_ONTOLOGY_CACHE,
  VAULT_ROOT,
} from '../server/runtime.mjs';
import {
  requireOptionalNonBlankString,
  requireOptionalNonNegativeNumber,
} from '../server/validate.mjs';
import {
  VaultConflictError,
  loadVaultDocs,
} from '../vault.mjs';
import {
  meaningSourceFromProjectSource,
  projectMeaningContext,
  projectSourceScope,
} from './graph.mjs';
import { attachVaultValidation } from './maintenance.mjs';
import { validateVaultTool } from './validate-vault.mjs';
import { resolveExistingVaultSlug } from './vault-nodes.mjs';
import { isAbsolute } from 'node:path';

const PROJECT_SOURCE_CONNECT_CONTRACT = 'projectSourceConnect:v1';

const PROJECT_SOURCE_DISCONNECT_CONTRACT = 'projectSourceDisconnect:v1';

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
  const artifact = COMPILED_ONTOLOGY_CACHE.get({ includeIndexes: true });
  const { docs, graphHash } = projectSourceScope(artifact, canonicalSlug, allDocs);
  if (!graphHash) {
    throw new Error(
      `connect_project_source blocked: the project scope for "${canonicalSlug}" is incomplete, so no receipt could detect later ontology drift. Repair the project containment first (query_ontology({operation:"project_scope", project:"${canonicalSlug}"})).`,
    );
  }
  const witnesses = deriveProjectSourceWitnessesFromDocs({ projectSlug: canonicalSlug, docs });

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

  let probe;
  try {
    probe = inspectProjectSource(selectedRoot);
  } catch (err) {
    throw new Error(
      `connect_project_source could not measure "${selectedRoot}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const measuredAt = new Date().toISOString();
  const receipt = buildProjectSourceReceipt({
    projectSlug: canonicalSlug,
    graphHash,
    probe,
    witnesses,
    measuredAt,
  });
  if (inference) {
    inference = inferProjectSourceProposal({
      vaultRootPath: VAULT_ROOT,
      candidates: inference.candidates,
      witnessSummary: receipt.witnessSummary,
    });
  }

  const binding = {
    projectSlug: canonicalSlug,
    sourceId: probe.sourceId,
    rootPath: probe.rootPath,
    kind: probe.kind,
    boundAt: measuredAt,
  };
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

  const written = writeProjectSourceBinding(VAULT_ROOT, { ...binding, receipt }, { repair: repair === true });
  if (written.status === 'blocked_unsafe_path') {
    throw new Error(
      `connect_project_source blocked: ${PROJECT_SOURCE_STATE_RELATIVE_PATH} is behind an unsafe sidecar path. repair: true cannot bypass a symlink or junction boundary.`,
    );
  }
  if (written.status === 'blocked_malformed') {
    throw new Error(
      `connect_project_source blocked: ${PROJECT_SOURCE_STATE_RELATIVE_PATH} is malformed. Re-run with repair: true to discard and rewrite it.`,
    );
  }
  if (written.status !== 'written') {
    throw new Error(
      `connect_project_source could not persist the binding (${written.status}).`,
    );
  }
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

function finalizeProjectMeaningTool({ projectSlug, expected_mtime } = {}) {
  requireOptionalNonBlankString(projectSlug, 'projectSlug');
  requireOptionalNonNegativeNumber(expected_mtime, 'expected_mtime');
  if (typeof projectSlug !== 'string') throw new Error('projectSlug is required.');
  if (typeof expected_mtime !== 'number') throw new Error('expected_mtime is required.');

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
  if (projectDoc.mtime !== expected_mtime) {
    throw new VaultConflictError(canonicalSlug, expected_mtime, projectDoc.mtime);
  }

  const validation = validateVaultTool({});
  if (validation.summary.errorFiles > 0) {
    throw new Error(
      `finalize_project_meaning blocked: validate_vault found ${validation.summary.errorFiles} file(s) with errors. Repair them before finalizing.`,
    );
  }

  const artifact = COMPILED_ONTOLOGY_CACHE.get({ includeIndexes: true });
  const brief = attachVaultValidation(
    queryCompiledOntology(artifact, {
      operation: 'agent_brief',
      project: canonicalSlug,
    }),
    { operation: 'agent_brief', project: canonicalSlug },
  );
  const context = projectMeaningContext(artifact, canonicalSlug, brief.readiness?.status);
  if (!context.graphHash || context.inventoryResult.status !== 'ready') {
    throw new Error(
      `finalize_project_meaning blocked: current project witness inventory is unavailable (${context.inventoryResult.reason ?? 'unknown'}).`,
    );
  }
  const sourceReceipt = context.projectSource.receipt;
  if (!sourceReceipt) {
    throw new Error('finalize_project_meaning blocked: a valid project source receipt is required first.');
  }

  const competency = parseProjectCompetencyMarkdown(context.projectDoc.body);
  const witnessAssessment = deriveMeaningAssessment({
    projectSlug: canonicalSlug,
    graphHash: context.graphHash,
    structure: { status: brief.readiness?.status },
    source: meaningSourceFromProjectSource(context.projectSource),
    competency: {
      contract: MEANING_COMPETENCY_CONTRACT,
      receiptVersion: 1,
      evaluator: MEANING_COMPETENCY_EVALUATOR,
      graphHash: context.graphHash,
      inventory: context.inventoryResult.inventory,
      questions: competency.questions,
    },
  });
  const unresolvedAnswered = witnessAssessment.dimensions.competency.questions.find(
    (row) => row.status === 'answered' && row.witnessStatus !== 'resolved',
  );
  if (unresolvedAnswered) {
    throw new Error(
      `finalize_project_meaning blocked: competency "${unresolvedAnswered.id}" is marked answered but its current witnesses do not resolve.`,
    );
  }

  const receipt = finalizeProjectMeaningReceipt({
    vaultRoot: VAULT_ROOT,
    projectSlug: canonicalSlug,
    projectBody: context.projectDoc.body,
    graphHash: context.graphHash,
    sourceFingerprint: sourceReceipt.sourceFingerprint,
    measuredAt: new Date().toISOString(),
  });
  const meaningAssessment = readProjectMeaningAssessment(context.assessmentInput);
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
