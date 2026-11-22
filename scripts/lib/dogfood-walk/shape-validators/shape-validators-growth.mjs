// Growth-plan row validation is shared by workspace next actions, planning,
// and graph analytics. It owns no graph/workspace imports by design.
export function growthCandidateRowFailure(label, row, index, { requireProposedAction = false } = {}) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return `${label} malformed row at index ${index}`;
  }
  if (typeof row.kind !== "string" || row.kind.length === 0) {
    return `${label} row missing kind at index ${index}`;
  }
  if (typeof row.score !== "number" || !Number.isFinite(row.score) || row.score < 0) {
    return `${label} row missing score: ${row.kind}`;
  }
  if (typeof row.reason !== "string" || row.reason.length === 0) {
    return `${label} row missing reason: ${row.kind}`;
  }
  if (requireProposedAction && (!row.proposedAction || typeof row.proposedAction !== "object" || Array.isArray(row.proposedAction))) {
    return `${label} row missing proposedAction: ${row.kind}`;
  }
  if (row.proposedAction) {
    if (typeof row.proposedAction.tool !== "string" || row.proposedAction.tool.length === 0) {
      return `${label} proposedAction missing tool: ${row.kind}`;
    }
    if (!row.proposedAction.args || typeof row.proposedAction.args !== "object" || Array.isArray(row.proposedAction.args)) {
      return `${label} proposedAction missing args: ${row.kind}`;
    }
    const actionFailure = growthProposedActionFailure(label, row);
    if (actionFailure) return actionFailure;
  }
  return null;
}


function growthProposedActionFailure(label, row) {
  const { tool, args } = row.proposedAction;
  if (row.kind === "missing_domain_containment") {
    if (tool !== "add_relation") {
      return `${label} proposedAction tool mismatch: ${row.kind}`;
    }
    if (args.from !== row.from || args.to !== row.to || args.type !== row.relation) {
      return `${label} proposedAction relation args mismatch: ${row.kind}`;
    }
  }
  if (row.kind === "materialize_external_element") {
    if (tool !== "add_concept") {
      return `${label} proposedAction tool mismatch: ${row.kind}`;
    }
    if (args.slug !== row.suggestedSlug) {
      return `${label} proposedAction slug mismatch: ${row.kind}`;
    }
    if (args.kind !== "element") {
      return `${label} proposedAction kind mismatch: ${row.kind}`;
    }
  }
  if (row.kind === "resolve_dangling_reference") {
    if (tool !== "add_concept") {
      return `${label} proposedAction tool mismatch: ${row.kind}`;
    }
    if (args.slug !== row.suggestedSlug) {
      return `${label} proposedAction slug mismatch: ${row.kind}`;
    }
    if (args.kind !== row.inferredKind) {
      return `${label} proposedAction kind mismatch: ${row.kind}`;
    }
  }
  return null;
}
