import { cachedSurvey } from '../../analyze/survey/breadth-map.mjs';
import { fitSourceReads, renderSourceReads } from '../../analyze/survey/source-reads-text.mjs';
import { noteReadFamilies } from '../../construction/read-family.mjs';
import { recordSourceEvidence, sessionReads } from '../../construction/session-reads.mjs';
import { analyzeRepoStructure } from '../../analyze/candidates/repo-structure.mjs';
import { inferImports } from '../../infer-imports.mjs';
import { inspectProjectSource } from '../../project-source/project-source-inspection.mjs';
import {
  composeSourceDigest,
  readSourceEvidence,
  validateSourceReadSelectors,
} from '../../evidence-search/source-evidence.mjs';
import { REPO_ROOT, VAULT_ROOT, assertScanRootAllowed } from '../../server/runtime.mjs';
import { IGNORE_ARRAY_MAX_ITEMS } from '../../server/tool-schemas/array-limits.mjs';
import {
  requireOptionalBoolean,
  requireOptionalNonBlankString,
  requireOptionalNonNegativeInteger,
  requireOptionalStringArray,
} from '../../server/validate.mjs';

/** Each symbol read that belongs to a family gets one line saying how many members the analysed folder holds and how many this session read. */
function noteFamilies(target, sourceEvidence, ignore, reads = sessionReads(target)) {
  try {
    noteReadFamilies(sourceEvidence, { root: target, ignore: ignore ?? [], reads });
  } catch {
    // The line is a fact beside the read; a folder that cannot be walked leaves the read as it is.
  }
}

/** This session's reads with a packet's own ranges added, the ranges recording it adds. */
function readsWith(target, sourceEvidence) {
  const reads = new Map(sessionReads(target));
  for (const row of sourceEvidence.rows) {
    if (row.status !== 'read') continue;
    for (const range of [{ path: row.path, ...row.actualRange }, ...(row.context ?? [])]) {
      reads.set(range.path, [...(reads.get(range.path) ?? []), range]);
    }
  }
  return reads;
}

/**
 * Reads alone, as text: the family lines are written first so the text that is
 * fitted to the response bound is the text sent, and only the rows sent are
 * recorded as read.
 */
function sourceOnlyAnswer(target, sourceReads, ignore) {
  const read = readSourceEvidence(target, sourceReads, { ignore, sentAsText: true });
  noteFamilies(target, read, ignore, readsWith(target, read));
  const sourceEvidence = fitSourceReads(target, read);
  recordSourceEvidence(target, sourceEvidence);
  const answer = { rootPath: target, delivery: 'source_only', canWrite: false, sourceEvidence };
  return { ...answer, text: renderSourceReads(answer) };
}

export function analyzeRepoStructureTool({ rootPath, maxDepth, ignore, sourceReads, sourceOnly, proposal, qualification, view } = {}) {
  requireOptionalNonBlankString(rootPath, 'rootPath');
  if (view !== undefined && view !== 'breadth' && view !== 'analysis') {
    throw new Error('view must be "breadth" or "analysis".');
  }
  requireOptionalNonNegativeInteger(maxDepth, 'maxDepth', { max: 10 });
  requireOptionalStringArray(ignore, 'ignore', { max: IGNORE_ARRAY_MAX_ITEMS });
  requireOptionalBoolean(sourceOnly, 'sourceOnly');
  if (sourceOnly && (proposal !== undefined || qualification !== undefined)) {
    throw new Error('sourceOnly cannot be combined with proposal or qualification; omit sourceOnly for full analysis and lifecycle replay.');
  }
  if (sourceOnly && sourceReads === undefined) {
    throw new Error('sourceOnly requires sourceReads with 1–16 exact selectors.');
  }
  const target = rootPath ? assertScanRootAllowed(rootPath) : REPO_ROOT;
  if (sourceReads !== undefined) validateSourceReadSelectors(sourceReads);
  const reviewing = proposal != null || qualification != null;
  // Reads without a proposal return the reads alone: the map was already sent once,
  // and repeating it on every outline call cost more than the outlines.
  if (sourceOnly || (sourceReads !== undefined && !reviewing)) return sourceOnlyAnswer(target, sourceReads, ignore);
  // A caller asks for the structural analysis by name; an agent gets the map that
  // writes and validate_vault then measure against.
  if (!reviewing && view !== 'analysis') {
    return cachedSurvey(target, { ignore, vaultRoot: VAULT_ROOT }).survey;
  }
  if (sourceReads !== undefined && (proposal != null || qualification != null)) {
    const missingHash = sourceReads.findIndex((row) => row?.expectedSha256 === undefined);
    if (missingHash >= 0) {
      throw new Error(`sourceReads[${missingHash}].expectedSha256 is required with proposal or qualification.`);
    }
  }
  const sourceBefore = proposal == null ? undefined : inspectProjectSource(target).fingerprint;
  const sourceEvidence = sourceReads === undefined
    ? undefined
    : readSourceEvidence(target, sourceReads, { ignore });
  if (sourceEvidence) {
    recordSourceEvidence(target, sourceEvidence);
    noteFamilies(target, sourceEvidence, ignore);
  }
  const sourceDigest = proposal == null
    ? undefined
    : composeSourceDigest(sourceBefore, sourceEvidence);
  // A proposal may cite up to four exact endpoints observable through infer_imports;
  // recompute that bounded receipt here so validation never depends on hidden state
  // from an earlier call.
  const proposalImportEvidence = proposal == null
    ? undefined
    : inferImports(target, { ignore });
  const result = analyzeRepoStructure(target, {
    maxDepth,
    ignore,
    ...(proposalImportEvidence === undefined
      ? {}
      : { precomputedPythonImports: proposalImportEvidence }),
    proposal,
    qualification,
    sourceDigest,
    sourceEvidence,
  });
  const sourceAfter = proposal != null && sourceReads !== undefined
    ? inspectProjectSource(target).fingerprint
    : sourceBefore;
  if (sourceReads !== undefined && sourceBefore !== sourceAfter) {
    throw new Error('Repository source changed during source-sensitive proposal analysis; retry against one stable snapshot.');
  }
  return reviewing ? result : analysisView(result);
}

/**
 * The structural analysis a caller asks for by name. Relations that only restate
 * "the project contains every candidate" or connect folder-named element candidates
 * are not sent (infer_imports carries the import edges with their evidence), and a
 * scan that found no ability says so in one line.
 */
function analysisView(result) {
  const proposable = new Set([
    ...result.domains.map((row) => row.slug),
    ...result.capabilities.map((row) => row.slug),
  ]);
  const suggestedRelations = result.suggestedRelations
    .filter((row) => proposable.has(row.from) && proposable.has(row.to));
  const note = result.capabilities.length === 0
    ? `No capability candidate: folder and package names are not abilities. Outline the entry points with sourceReads mode:"outline" and propose capabilities from what the code does; the ${result.elements.length} element candidates are folder names, not roles.`
    : null;
  return { ...result, suggestedRelations, ...(note ? { note } : {}) };
}
