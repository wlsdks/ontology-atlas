// Response-shape validators for the dogfood MCP walk: maintenance/growth
// planning tools (maintenance_plan, growth_plan, recommend_relations).
// Split out of scripts/dogfood-mcp-walk.mjs (structural decomposition, logic unchanged).
import { numericSummaryFailure } from "./shape-validators-workspace.mjs";
import {
  candidateGroupShapeFailure,
  growthCandidateRowFailure,
} from "./shape-validators-graph-analytics.mjs";

export function maintenancePlanShapeFailure(result, options = {}) {
  if (result.operation !== "maintenance_plan") {
    return `maintenance_plan response operation mismatch — ${result.operation}`;
  }
  if (result.sideEffect !== false) {
    return "maintenance_plan must be side-effect free";
  }
  if (typeof result.graphHash !== "string" || result.graphHash.length === 0) {
    return "maintenance_plan response missing graphHash";
  }
  const summaryFailure = numericSummaryFailure("maintenance_plan", result.summary, [
    "totalActions",
    "filteredActions",
    "remainingActions",
    "executableActions",
    "reviewActions",
    "compileIssues",
    "dependencyCycles",
    "canonicalizationActions",
    "danglingReferences",
    "relationRecommendations",
    "externalElementRefs",
    "externalElementRefsIgnored",
    "unassignedNodes",
    "emptyDomains",
  ]);
  if (summaryFailure) return summaryFailure;
  if (result.summary.executableActions + result.summary.reviewActions !== result.summary.totalActions) {
    return `maintenance_plan action count mismatch — executable ${result.summary.executableActions}, review ${result.summary.reviewActions}, total ${result.summary.totalActions}`;
  }
  if (result.summary.filteredActions > result.summary.totalActions) {
    return `maintenance_plan filteredActions exceeds totalActions — filtered ${result.summary.filteredActions}, total ${result.summary.totalActions}`;
  }
  if (result.summary.remainingActions > result.summary.filteredActions) {
    return `maintenance_plan remainingActions exceeds filteredActions — remaining ${result.summary.remainingActions}, filtered ${result.summary.filteredActions}`;
  }
  if (!result.filters || typeof result.filters !== "object" || Array.isArray(result.filters)) {
    return "maintenance_plan response missing filters";
  }
  if (typeof result.filters.executableOnly !== "boolean") {
    return "maintenance_plan filters missing executableOnly";
  }
  for (const key of ["phases", "severities", "kinds"]) {
    if (!Array.isArray(result.filters[key])) {
      return `maintenance_plan filters missing ${key}`;
    }
  }
  const cursorFailure = maintenanceCursorFailure(result.cursor);
  if (cursorFailure) return cursorFailure;
  if (options.expectReadyCursor) {
    if (result.cursor.found !== true) {
      return "maintenance_plan ready cursor did not report cursor.found=true";
    }
    if (result.cursor.reason !== null) {
      return "maintenance_plan ready cursor did not expose cursor.reason=null";
    }
  }
  for (const key of ["byPhase", "bySeverity", "byKind"]) {
    if (!result[key] || typeof result[key] !== "object" || Array.isArray(result[key])) {
      return `maintenance_plan response missing ${key}`;
    }
  }
  const bucketTotalFailure =
    maintenanceBucketTotalFailure(result.byPhase, result.summary.remainingActions, "byPhase") ||
    maintenanceBucketTotalFailure(result.bySeverity, result.summary.remainingActions, "bySeverity") ||
    maintenanceBucketTotalFailure(result.byKind, result.summary.remainingActions, "byKind");
  if (bucketTotalFailure) return bucketTotalFailure;
  if (typeof result.limited !== "boolean") {
    return "maintenance_plan response missing limited flag";
  }
  if (!Array.isArray(result.actions)) {
    return "maintenance_plan response missing actions array";
  }
  if (!result.limited && result.actions.length === result.summary.filteredActions) {
    const bucketFailure =
      maintenanceBucketMismatch(result.byPhase, result.actions, "phase", "byPhase") ||
      maintenanceBucketMismatch(result.bySeverity, result.actions, "severity", "bySeverity") ||
      maintenanceBucketMismatch(result.byKind, result.actions, "kind", "byKind");
    if (bucketFailure) return bucketFailure;
  }
  if (result.actions.length > result.summary.remainingActions) {
    return `maintenance_plan actions exceed remaining — actions ${result.actions.length}, remaining ${result.summary.remainingActions}`;
  }
  if (result.actions.length > 0 && result.cursor.nextAfterActionId !== result.actions[result.actions.length - 1].id) {
    return "maintenance_plan cursor nextAfterActionId does not match last action";
  }
  for (const key of ["nextExecutableAction", "nextReviewAction"]) {
    if (result[key] !== null && (!result[key] || typeof result[key] !== "object" || Array.isArray(result[key]))) {
      return `maintenance_plan malformed ${key}`;
    }
  }
  if (result.nextExecutableAction !== null) {
    const actionFailure = maintenanceActionFailure(result.nextExecutableAction, "nextExecutableAction");
    if (actionFailure) return actionFailure;
    if (result.nextExecutableAction.executable !== true) {
      return "maintenance_plan nextExecutableAction must be executable";
    }
  }
  if (result.nextReviewAction !== null) {
    const actionFailure = maintenanceActionFailure(result.nextReviewAction, "nextReviewAction");
    if (actionFailure) return actionFailure;
    if (result.nextReviewAction.executable !== false) {
      return "maintenance_plan nextReviewAction must be non-executable";
    }
  }
  if (result.cursor.found) {
    const firstExecutableAction = result.actions.find((action) => action?.executable === true);
    if (firstExecutableAction && result.nextExecutableAction?.id !== firstExecutableAction.id) {
      return "maintenance_plan nextExecutableAction does not match first executable page action";
    }
    const executablePointerFailure = maintenanceNextActionPointerFailure(
      firstExecutableAction,
      result.nextExecutableAction,
      "nextExecutableAction",
    );
    if (executablePointerFailure) return executablePointerFailure;
    if (!firstExecutableAction && result.nextExecutableAction !== null) {
      return "maintenance_plan unexpected nextExecutableAction outside current page";
    }
    const firstReviewAction = result.actions.find((action) => action?.executable === false);
    if (firstReviewAction && result.nextReviewAction?.id !== firstReviewAction.id) {
      return "maintenance_plan nextReviewAction does not match first review page action";
    }
    const reviewPointerFailure = maintenanceNextActionPointerFailure(
      firstReviewAction,
      result.nextReviewAction,
      "nextReviewAction",
    );
    if (reviewPointerFailure) return reviewPointerFailure;
    if (!firstReviewAction && result.nextReviewAction !== null) {
      return "maintenance_plan unexpected nextReviewAction outside current page";
    }
  }
  for (const [index, action] of result.actions.entries()) {
    const actionFailure = maintenanceActionFailure(action, index);
    if (actionFailure) return actionFailure;
  }
  return null;
}

export function maintenanceNextActionPointerFailure(expectedAction, pointer, label) {
  if (!expectedAction || !pointer) return null;
  for (const key of ["executable", "phase", "kind", "severity"]) {
    if (pointer[key] !== expectedAction[key]) {
      return `maintenance_plan ${label} ${key} mismatch`;
    }
  }
  return null;
}

export function maintenanceBucketTotalFailure(bucket, remainingActions, bucketName) {
  const total = Object.values(bucket).reduce((sum, count) => sum + (Number.isInteger(count) ? count : 0), 0);
  if (total !== remainingActions) {
    return `maintenance_plan ${bucketName} total mismatch — remaining ${remainingActions}, bucket ${total}`;
  }
  return null;
}

export function maintenanceBucketMismatch(bucket, actions, actionKey, bucketName) {
  const expected = {};
  for (const action of actions) {
    const key = action?.[actionKey];
    if (typeof key === "string" && key.length > 0) {
      expected[key] = (expected[key] || 0) + 1;
    }
  }
  const bucketEntries = Object.entries(bucket);
  const expectedEntries = Object.entries(expected);
  if (bucketEntries.length !== expectedEntries.length) {
    return `maintenance_plan ${bucketName} mismatch`;
  }
  for (const [key, count] of expectedEntries) {
    if (bucket[key] !== count) return `maintenance_plan ${bucketName} mismatch`;
  }
  return null;
}

export function maintenancePlanMissingCursorShapeFailure(result) {
  const shapeFailure = maintenancePlanShapeFailure(result);
  if (shapeFailure) return `missing-cursor smoke: ${shapeFailure}`;
  if (result.cursor?.found !== false) {
    return "maintenance_plan missing-cursor smoke did not report cursor.found=false";
  }
  if (result.cursor?.reason !== "afterActionId not found in filtered maintenance actions") {
    return "maintenance_plan missing-cursor smoke did not report the cursor miss reason";
  }
  if (result.cursor?.startIndex !== null) {
    return "maintenance_plan missing-cursor smoke should not expose a startIndex";
  }
  if ((result.actions || []).length !== 0) {
    return "maintenance_plan missing-cursor smoke returned actions";
  }
  if (result.summary?.remainingActions !== 0) {
    return "maintenance_plan missing-cursor smoke should have zero remaining actions";
  }
  if (result.nextExecutableAction !== null || result.nextReviewAction !== null) {
    return "maintenance_plan missing-cursor smoke should not expose next actions";
  }
  return null;
}

export function maintenanceCursorFailure(cursor) {
  if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) {
    return "maintenance_plan response missing cursor";
  }
  if (cursor.afterActionId !== null && typeof cursor.afterActionId !== "string") {
    return "maintenance_plan cursor missing afterActionId";
  }
  if (typeof cursor.found !== "boolean") {
    return "maintenance_plan cursor missing found flag";
  }
  if (cursor.reason !== null && typeof cursor.reason !== "string") {
    return "maintenance_plan cursor missing reason";
  }
  if (!cursor.found && !cursor.reason) {
    return "maintenance_plan cursor not found without reason";
  }
  if (cursor.startIndex !== null && (!Number.isInteger(cursor.startIndex) || cursor.startIndex < 0)) {
    return "maintenance_plan cursor missing startIndex";
  }
  if (cursor.nextAfterActionId !== null && typeof cursor.nextAfterActionId !== "string") {
    return "maintenance_plan cursor missing nextAfterActionId";
  }
  if (typeof cursor.hasMore !== "boolean") {
    return "maintenance_plan cursor missing hasMore flag";
  }
  return null;
}

export function maintenanceActionFailure(action, index) {
  if (!action || typeof action !== "object" || Array.isArray(action)) {
    return `maintenance_plan malformed action at index ${index}`;
  }
  for (const key of ["id", "phase", "kind", "severity", "reason"]) {
    if (typeof action[key] !== "string" || action[key].length === 0) {
      return `maintenance_plan action missing ${key} at index ${index}`;
    }
  }
  if (typeof action.score !== "number" || !Number.isFinite(action.score) || action.score < 0) {
    return `maintenance_plan action missing score: ${action.id}`;
  }
  if (typeof action.executable !== "boolean") {
    return `maintenance_plan action missing executable flag: ${action.id}`;
  }
  if (action.executable && (!action.proposedAction || typeof action.proposedAction !== "object" || Array.isArray(action.proposedAction))) {
    return `maintenance_plan executable action missing proposedAction: ${action.id}`;
  }
  if (action.proposedAction) {
    if (typeof action.proposedAction.tool !== "string" || action.proposedAction.tool.length === 0) {
      return `maintenance_plan proposedAction missing tool: ${action.id}`;
    }
    if (!action.proposedAction.args || typeof action.proposedAction.args !== "object" || Array.isArray(action.proposedAction.args)) {
      return `maintenance_plan proposedAction missing args: ${action.id}`;
    }
    const actionFailure = maintenanceProposedActionFailure(action);
    if (actionFailure) return actionFailure;
  }
  return null;
}

export function maintenanceProposedActionFailure(action) {
  const { tool, args } = action.proposedAction;
  if (action.kind === "add_missing_relation") {
    if (tool !== "add_relation") {
      return `maintenance_plan proposedAction tool mismatch: ${action.id}`;
    }
    if (!action.nodes?.from?.slug || !action.nodes?.to?.slug) {
      return `maintenance_plan add_missing_relation missing node summaries: ${action.id}`;
    }
    if (args.from !== action.nodes.from.slug || args.to !== action.nodes.to.slug) {
      return `maintenance_plan proposedAction endpoint mismatch: ${action.id}`;
    }
    if (typeof args.type !== "string" || args.type.length === 0) {
      return `maintenance_plan proposedAction missing relation type: ${action.id}`;
    }
  }
  if (action.kind === "canonicalize_graph_arrays") {
    if (tool !== "patch_concept") {
      return `maintenance_plan proposedAction tool mismatch: ${action.id}`;
    }
    if (action.node?.slug && args.slug !== action.node.slug) {
      return `maintenance_plan proposedAction slug mismatch: ${action.id}`;
    }
  }
  if (action.kind === "materialize_external_element" || action.kind === "resolve_dangling_reference") {
    if (tool !== "add_concept") {
      return `maintenance_plan proposedAction tool mismatch: ${action.id}`;
    }
    if (typeof args.slug !== "string" || args.slug.length === 0) {
      return `maintenance_plan proposedAction missing slug: ${action.id}`;
    }
    if (action.kind === "materialize_external_element" && args.kind !== "element") {
      return `maintenance_plan proposedAction kind mismatch: ${action.id}`;
    }
  }
  return null;
}

export function growthPlanShapeFailure(result) {
  if (result.operation !== "growth_plan") {
    return `growth_plan response operation mismatch — ${result.operation}`;
  }
  const summaryFailure = numericSummaryFailure("growth_plan", result.summary, [
    "relationRecommendations",
    "externalElementRefs",
    "externalElementRefsIgnored",
    "danglingReferences",
    "unassignedNodes",
    "emptyDomains",
    "totalActions",
  ]);
  if (summaryFailure) return summaryFailure;
  const totalActions = result.summary.relationRecommendations + result.summary.externalElementRefs + result.summary.danglingReferences;
  if (result.summary.totalActions !== totalActions) {
    return `growth_plan totalActions mismatch — summary ${result.summary.totalActions}, computed ${totalActions}`;
  }
  const recommendationsFailure = relationRecommendationsShapeFailure(result.relationRecommendations, result.summary.relationRecommendations);
  if (recommendationsFailure) return recommendationsFailure;
  for (const [key, total] of [
    ["externalElementRefs", result.summary.externalElementRefs],
    ["danglingReferences", result.summary.danglingReferences],
    ["unassignedNodes", result.summary.unassignedNodes],
    ["emptyDomains", result.summary.emptyDomains],
  ]) {
    const groupFailure = candidateGroupShapeFailure(`growth_plan.${key}`, result[key], total);
    if (groupFailure) return groupFailure;
  }
  if ((result.externalElementRefs.ignored ?? 0) !== result.summary.externalElementRefsIgnored) {
    return `growth_plan ignored external refs mismatch — summary ${result.summary.externalElementRefsIgnored}, group ${result.externalElementRefs.ignored ?? 0}`;
  }
  return null;
}

export function relationRecommendationsShapeFailure(group, expectedTotal) {
  if (!group || typeof group !== "object" || Array.isArray(group)) {
    return "growth_plan response missing relationRecommendations";
  }
  if (group.operation !== "recommend_relations") {
    return `growth_plan relationRecommendations operation mismatch — ${group.operation}`;
  }
  if (group.mode !== "domain_containment") {
    return `growth_plan relationRecommendations mode mismatch — ${group.mode}`;
  }
  if (!Number.isInteger(group.totalRecommendations) || group.totalRecommendations < 0) {
    return "growth_plan relationRecommendations missing totalRecommendations";
  }
  if (group.totalRecommendations !== expectedTotal) {
    return `growth_plan relationRecommendations total mismatch — summary ${expectedTotal}, group ${group.totalRecommendations}`;
  }
  if (typeof group.limited !== "boolean") {
    return "growth_plan relationRecommendations missing limited flag";
  }
  if (!Array.isArray(group.recommendations)) {
    return "growth_plan relationRecommendations missing recommendations";
  }
  if (group.recommendations.length > group.totalRecommendations) {
    return `growth_plan relationRecommendations rows exceed total — rows ${group.recommendations.length}, total ${group.totalRecommendations}`;
  }
  if (!group.limited && group.recommendations.length !== group.totalRecommendations) {
    return `growth_plan relationRecommendations row count mismatch — rows ${group.recommendations.length}, total ${group.totalRecommendations}`;
  }
  for (const [index, row] of group.recommendations.entries()) {
    const rowFailure = growthCandidateRowFailure("growth_plan relationRecommendations", row, index, { requireProposedAction: true });
    if (rowFailure) return rowFailure;
  }
  return null;
}

export function recommendRelationsShapeFailure(result) {
  const failure = relationRecommendationsShapeFailure(result, result?.totalRecommendations);
  if (failure) {
    return failure.replace(/^growth_plan relationRecommendations/, "recommend_relations");
  }
  return null;
}
