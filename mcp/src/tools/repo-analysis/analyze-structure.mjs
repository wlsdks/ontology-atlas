import { cachedSurvey } from '../../analyze/survey/breadth-map.mjs';
import { fitSourceReads, renderSourceReads } from '../../analyze/survey/source-reads-text.mjs';
import { recordSourceEvidence } from '../../construction/session-reads.mjs';
import { readSourceEvidence, validateSourceReadSelectors } from '../../evidence-search/source-evidence.mjs';
import { REPO_ROOT, VAULT_ROOT, assertScanRootAllowed } from '../../server/runtime.mjs';
import { IGNORE_ARRAY_MAX_ITEMS } from '../../server/tool-schemas/array-limits.mjs';
import { requireOptionalBoolean, requireOptionalNonBlankString, requireOptionalStringArray } from '../../server/validate.mjs';

/** The reads alone, as text: only the rows sent are recorded as read. */
function sourceOnlyAnswer(target, sourceReads, ignore) {
  const read = readSourceEvidence(target, sourceReads, { ignore, sentAsText: true });
  const sourceEvidence = fitSourceReads(target, read);
  recordSourceEvidence(target, sourceEvidence);
  const answer = { rootPath: target, delivery: 'source_only', canWrite: false, sourceEvidence };
  return { ...answer, text: renderSourceReads(answer) };
}

export function analyzeRepoStructureTool({ rootPath, ignore, sourceReads, sourceOnly } = {}) {
  requireOptionalNonBlankString(rootPath, 'rootPath');
  requireOptionalStringArray(ignore, 'ignore', { max: IGNORE_ARRAY_MAX_ITEMS });
  requireOptionalBoolean(sourceOnly, 'sourceOnly');
  if (sourceOnly && sourceReads === undefined) {
    throw new Error('sourceOnly requires sourceReads with 1–16 exact selectors.');
  }
  const target = rootPath ? assertScanRootAllowed(rootPath) : REPO_ROOT;
  if (sourceReads !== undefined) {
    validateSourceReadSelectors(sourceReads);
    // The map was already sent once; repeating it on every outline call cost more than the outlines.
    return sourceOnlyAnswer(target, sourceReads, ignore);
  }
  return cachedSurvey(target, { ignore, vaultRoot: VAULT_ROOT }).survey;
}
