/** Total relations a node holds, in either direction. */
export function nodeDegree(node) {
  return (node.inDegree || 0) + (node.outDegree || 0);
}

/** Whether a node meets every filter given to `match_nodes`; a null filter means "any". */
export function nodeMatchesFilters(
  node,
  { kind, domain, hasIncoming, hasOutgoing },
) {
  const inDegree = node.inDegree || 0;
  const outDegree = node.outDegree || 0;
  if (kind && node.kind !== kind) return false;
  if (domain && node.domain !== domain) return false;
  if (hasIncoming !== null && (inDegree > 0) !== hasIncoming) return false;
  if (hasOutgoing !== null && (outDegree > 0) !== hasOutgoing) return false;
  return true;
}

function relationCheckRecommendation({ existing, inverse, matchedPattern, fromKind, relation, toKind }) {
  if (existing.length > 0) {
    return {
      decision: 'skip_existing',
      severity: 'info',
      reason: 'Exact edge already exists; do not add another relation.',
    };
  }
  if (inverse.length > 0) {
    return {
      decision: 'review_inverse',
      severity: 'warn',
      reason: 'Reverse edge with the same relation already exists; inspect direction before adding.',
    };
  }
  if (matchedPattern) {
    return {
      decision: 'safe_to_add',
      severity: 'info',
      reason: `No exact or inverse edge found; ${fromKind} --${relation}--> ${toKind} is an existing schema pattern.`,
    };
  }
  return {
    decision: 'review_new_schema',
    severity: 'warn',
    reason: `No exact or inverse edge found; ${fromKind} --${relation}--> ${toKind} would introduce a new schema pattern.`,
  };
}

/**
 * What `relation_check` concludes about a proposed edge: whether it exists, what to do, and the
 * write that would add it. A new `dependencies` edge never carries a ready write: it needs the
 * agent to state the ability that fails without the target and a person to approve the direction.
 */
export function judgeRelationCheck({
  existing, inverse, matchedPattern, from, to, fromKind, relation, toKind, writeRelationType,
}) {
  const verdict = existing.length > 0
    ? 'already_exists'
    : matchedPattern
      ? 'matches_existing_schema'
      : 'new_schema_pattern';
  const recommendation = relationCheckRecommendation({
    existing,
    inverse,
    matchedPattern,
    fromKind,
    relation,
    toKind,
  });
  const semanticDependencyPending = existing.length === 0 && relation === 'dependencies';
  const proposedAction = existing.length > 0 || semanticDependencyPending
    ? null
    : {
        tool: 'add_relations',
        args: {
          relations: [{
            from,
            to,
            type: writeRelationType(relation),
          }],
        },
      };
  const approvalGate = semanticDependencyPending
    ? {
        status: 'semantic_approval_required',
        writeAllowed: false,
        required: [
          'observable_ability',
          'semantic_rationale',
          'explicit_human_approval',
          'why',
        ],
        next:
          'Explain which observable ability fails without the target, ask for approval of the exact direction and rationale, then call add_relations with a nonblank why on the row.',
      }
    : null;
  return { verdict, recommendation, proposedAction, approvalGate };
}

/** One page of matched rows and the numbers a caller needs to ask for the next one. */
export function pageMatchedRows(rows, { limit, offset }) {
  const page = rows.slice(offset, offset + limit);
  const hasMore = offset + page.length < rows.length;
  return {
    page,
    pagination: {
      offset,
      limit,
      returned: page.length,
      total: rows.length,
      hasMore,
      nextOffset: hasMore ? offset + page.length : null,
    },
  };
}
