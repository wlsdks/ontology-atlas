import { MAINTENANCE_KIND_VALUES, MAINTENANCE_PHASE_VALUES, MAINTENANCE_SEVERITY_VALUES } from '../server-vocabularies.mjs';

export function maintenanceBucketOutputSummary(parsed) {
  const summarize = (bucket) => {
    if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) return 'n/a';
    const entries = Object.entries(bucket)
      .filter(([, count]) => Number.isInteger(count) && count > 0)
      .sort(([leftKey, leftCount], [rightKey, rightCount]) => rightCount - leftCount || leftKey.localeCompare(rightKey));
    return entries.length > 0 ? entries.map(([key, count]) => `${key}:${count}`).join(',') : 'none';
  };
  return `phase ${summarize(parsed?.byPhase)}; severity ${summarize(parsed?.bySeverity)}; kind ${summarize(parsed?.byKind)}`;
}

export function maintenanceNextActionOutputSummary(parsed) {
  const summarize = (action) => {
    if (action === null) return 'none';
    if (!action || typeof action !== 'object' || Array.isArray(action)) return 'n/a';
    const id = typeof action.id === 'string' && action.id.length > 0 ? action.id : 'unknown';
    const phase = typeof action.phase === 'string' && action.phase.length > 0 ? action.phase : 'unknown';
    const kind = typeof action.kind === 'string' && action.kind.length > 0 ? action.kind : 'unknown';
    const severity = typeof action.severity === 'string' && action.severity.length > 0 ? action.severity : 'unknown';
    const tool = typeof action.proposedAction?.tool === 'string' && action.proposedAction.tool.length > 0
      ? `->${action.proposedAction.tool}`
      : '';
    return `${id}:${phase}/${kind}:${severity}${tool}`;
  };
  return `executable ${summarize(parsed?.nextExecutableAction)}; review ${summarize(parsed?.nextReviewAction)}`;
}

export function maintenanceMissingCursorFailure(parsed) {
  if (parsed?.operation !== 'maintenance_plan') {
    return `maintenance missing-cursor smoke returned unexpected operation: ${parsed?.operation}`;
  }
  if (parsed.sideEffect !== false) {
    return 'maintenance missing-cursor smoke must be side-effect-free';
  }
  if (parsed.cursor?.found !== false) {
    return 'maintenance missing-cursor smoke did not report cursor.found=false';
  }
  if (parsed.cursor?.reason !== 'afterActionId not found in filtered maintenance actions') {
    return 'maintenance missing-cursor smoke did not report the cursor miss reason';
  }
  if (parsed.cursor?.startIndex !== null) {
    return 'maintenance missing-cursor smoke should not expose a startIndex';
  }
  if (!Object.hasOwn(parsed.cursor || {}, 'nextAfterActionId') || parsed.cursor.nextAfterActionId !== null) {
    return 'maintenance missing-cursor smoke should expose cursor.nextAfterActionId=null';
  }
  if (parsed.cursor?.hasMore !== false) {
    return 'maintenance missing-cursor smoke should expose cursor.hasMore=false';
  }
  if (!Array.isArray(parsed.actions)) {
    return 'maintenance missing-cursor smoke response missing actions array';
  }
  if (parsed.actions.length !== 0) {
    return 'maintenance missing-cursor smoke returned actions';
  }
  const summaryFailure = maintenanceSummaryFailure(parsed.summary, 'maintenance missing-cursor smoke');
  if (summaryFailure) return summaryFailure;
  const bucketFailure = maintenanceBucketSummaryFailure(parsed, 'maintenance missing-cursor smoke');
  if (bucketFailure) return bucketFailure;
  if (parsed.summary?.remainingActions !== 0) {
    return 'maintenance missing-cursor smoke should have zero remaining actions';
  }
  if (parsed.nextExecutableAction !== null || parsed.nextReviewAction !== null) {
    return 'maintenance missing-cursor smoke should not expose next actions';
  }
  return null;
}

export function maintenanceReadyCursorFailure(parsed) {
  if (parsed?.operation !== 'maintenance_plan') {
    return `maintenance ready-cursor smoke returned unexpected operation: ${parsed?.operation}`;
  }
  if (parsed.sideEffect !== false) {
    return 'maintenance ready-cursor smoke must be side-effect-free';
  }
  if (parsed.cursor?.found !== true) {
    return 'maintenance ready-cursor smoke did not report cursor.found=true';
  }
  if (!Object.hasOwn(parsed.cursor || {}, 'reason') || parsed.cursor.reason !== null) {
    return 'maintenance ready-cursor smoke did not expose cursor.reason=null';
  }
  if (parsed.cursor?.afterActionId !== null) {
    return 'maintenance ready-cursor smoke should start without afterActionId';
  }
  if (parsed.cursor?.startIndex !== 0) {
    return 'maintenance ready-cursor smoke should start at index 0';
  }
  if (typeof parsed.cursor?.hasMore !== 'boolean') {
    return 'maintenance ready-cursor smoke should expose cursor.hasMore';
  }
  if (!Array.isArray(parsed.actions)) {
    return 'maintenance ready-cursor smoke response missing actions array';
  }
  const summaryFailure = maintenanceSummaryFailure(parsed.summary, 'maintenance ready-cursor smoke');
  if (summaryFailure) return summaryFailure;
  const bucketFailure = maintenanceBucketSummaryFailure(parsed, 'maintenance ready-cursor smoke');
  if (bucketFailure) return bucketFailure;
  if (parsed.actions.length > parsed.summary.remainingActions) {
    return 'maintenance ready-cursor smoke actions exceed remainingActions';
  }
  const expectedNextAfterActionId = parsed.actions.length > 0
    ? parsed.actions[parsed.actions.length - 1]?.id
    : null;
  if (parsed.cursor?.nextAfterActionId !== expectedNextAfterActionId) {
    return 'maintenance ready-cursor smoke cursor.nextAfterActionId did not match last page action';
  }
  if (parsed.cursor?.hasMore !== (parsed.summary.remainingActions > parsed.actions.length)) {
    return 'maintenance ready-cursor smoke cursor.hasMore did not match remaining page state';
  }
  if (!Object.hasOwn(parsed, 'nextExecutableAction') || !Object.hasOwn(parsed, 'nextReviewAction')) {
    return 'maintenance ready-cursor smoke missing next action pointers';
  }
  const nextExecutableFailure = maintenanceNextActionFailure(
    parsed.actions.find((action) => action?.executable === true) ?? null,
    parsed.nextExecutableAction,
    'nextExecutableAction',
    true,
    'maintenance ready-cursor smoke',
  );
  if (nextExecutableFailure) return nextExecutableFailure;
  const nextReviewFailure = maintenanceNextActionFailure(
    parsed.actions.find((action) => action?.executable === false) ?? null,
    parsed.nextReviewAction,
    'nextReviewAction',
    false,
    'maintenance ready-cursor smoke',
  );
  if (nextReviewFailure) return nextReviewFailure;
  return null;
}

export function maintenanceResumeCursorFailure(previousPage, parsed, afterActionId) {
  if (parsed?.operation !== 'maintenance_plan') {
    return `maintenance resume-cursor smoke returned unexpected operation: ${parsed?.operation}`;
  }
  if (parsed.sideEffect !== false) {
    return 'maintenance resume-cursor smoke must be side-effect-free';
  }
  if (parsed.cursor?.afterActionId !== afterActionId) {
    return 'maintenance resume-cursor smoke did not preserve afterActionId';
  }
  if (parsed.cursor?.found !== true) {
    return 'maintenance resume-cursor smoke did not report cursor.found=true';
  }
  if (!Object.hasOwn(parsed.cursor || {}, 'reason') || parsed.cursor.reason !== null) {
    return 'maintenance resume-cursor smoke did not expose cursor.reason=null';
  }
  if (parsed.cursor?.startIndex !== 1) {
    return 'maintenance resume-cursor smoke should start after the resumed action';
  }
  if (!Array.isArray(parsed.actions)) {
    return 'maintenance resume-cursor smoke response missing actions array';
  }
  const summaryFailure = maintenanceSummaryFailure(parsed.summary, 'maintenance resume-cursor smoke');
  if (summaryFailure) return summaryFailure;
  const expectedRemaining = Math.max(0, (previousPage?.summary?.remainingActions ?? 0) - 1);
  if (parsed.summary.remainingActions !== expectedRemaining) {
    return 'maintenance resume-cursor smoke remainingActions did not advance past afterActionId';
  }
  const bucketFailure = maintenanceBucketSummaryFailure(parsed, 'maintenance resume-cursor smoke');
  if (bucketFailure) return bucketFailure;
  if (parsed.actions.some((action) => action?.id === afterActionId)) {
    return 'maintenance resume-cursor smoke repeated the afterActionId action';
  }
  if (parsed.actions.length > parsed.summary.remainingActions) {
    return 'maintenance resume-cursor smoke actions exceed remainingActions';
  }
  const expectedNextAfterActionId = parsed.actions.length > 0
    ? parsed.actions[parsed.actions.length - 1]?.id
    : null;
  if (parsed.cursor?.nextAfterActionId !== expectedNextAfterActionId) {
    return 'maintenance resume-cursor smoke cursor.nextAfterActionId did not match last page action';
  }
  if (parsed.cursor?.hasMore !== (parsed.summary.remainingActions > parsed.actions.length)) {
    return 'maintenance resume-cursor smoke cursor.hasMore did not match remaining page state';
  }
  const nextExecutableFailure = maintenanceNextActionFailure(
    parsed.actions.find((action) => action?.executable === true) ?? null,
    parsed.nextExecutableAction,
    'nextExecutableAction',
    true,
    'maintenance resume-cursor smoke',
  );
  if (nextExecutableFailure) return nextExecutableFailure;
  const nextReviewFailure = maintenanceNextActionFailure(
    parsed.actions.find((action) => action?.executable === false) ?? null,
    parsed.nextReviewAction,
    'nextReviewAction',
    false,
    'maintenance resume-cursor smoke',
  );
  if (nextReviewFailure) return nextReviewFailure;
  return null;
}

function maintenanceSummaryFailure(summary, label) {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
    return `${label} missing summary`;
  }
  for (const key of [
    'totalActions',
    'filteredActions',
    'remainingActions',
    'executableActions',
    'reviewActions',
    'compileIssues',
    'dependencyCycles',
    'canonicalizationActions',
    'danglingReferences',
    'relationRecommendations',
    'externalElementRefs',
    'externalElementRefsIgnored',
    'unassignedNodes',
    'emptyDomains',
    'capabilitiesWithoutEvidence',
  ]) {
    if (!Number.isInteger(summary[key]) || summary[key] < 0) {
      return `${label} summary missing non-negative integer ${key}`;
    }
  }
  if (summary.executableActions + summary.reviewActions !== summary.totalActions) {
    return `${label} summary executable/review counts do not add up`;
  }
  if (summary.filteredActions > summary.totalActions) {
    return `${label} summary filteredActions exceeds totalActions`;
  }
  if (summary.remainingActions > summary.filteredActions) {
    return `${label} summary remainingActions exceeds filteredActions`;
  }
  return null;
}

function maintenanceBucketSummaryFailure(parsed, label) {
  for (const key of ['byPhase', 'bySeverity', 'byKind']) {
    const bucket = parsed?.[key];
    if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) {
      return `${label} missing ${key}`;
    }
    let total = 0;
    for (const [bucketKey, count] of Object.entries(bucket)) {
      if (!Number.isInteger(count) || count < 0) {
        return `${label} ${key} missing non-negative integer count: ${bucketKey}`;
      }
      total += count;
    }
    if (total !== parsed.summary.remainingActions) {
      return `${label} ${key} total does not match remainingActions`;
    }
  }
  return null;
}

function maintenanceNextActionFailure(expectedAction, pointer, label, executable, context = 'maintenance ready-cursor smoke') {
  if (!expectedAction) {
    if (pointer !== null) {
      return `${context} unexpected ${label}`;
    }
    return null;
  }
  if (!pointer || typeof pointer !== 'object' || Array.isArray(pointer)) {
    return `${context} missing ${label}`;
  }
  if (pointer.id !== expectedAction.id) {
    return `${context} ${label} did not match first page action`;
  }
  if (pointer.executable !== executable) {
    return `${context} ${label} executable flag mismatch`;
  }
  for (const key of ['phase', 'kind', 'severity']) {
    if (
      typeof expectedAction[key] === 'string' &&
      expectedAction[key].length > 0 &&
      pointer[key] !== expectedAction[key]
    ) {
      return `${context} ${label} ${key} mismatch`;
    }
  }
  return null;
}

export function maintenanceFilterEnumSummary() {
  return [
    `phases=${MAINTENANCE_PHASE_VALUES.join('/')}`,
    `severities=${MAINTENANCE_SEVERITY_VALUES.join('/')}`,
    `kinds=${MAINTENANCE_KIND_VALUES.join('/')}`,
  ].join('; ');
}
