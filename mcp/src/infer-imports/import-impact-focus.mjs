import { isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';

/**
 * A bounded, path-focused static import neighbourhood from one scan. Source
 * evidence only: no runtime, behaviour or ontology claim. The cursor is stable
 * for unchanged evidence.
 */
export function buildImportImpactFocus(
  edges,
  {
    focusPath,
    direction = 'both',
    limit = 50,
    afterEdgeId = null,
  } = {},
) {
  if (typeof focusPath !== 'string' || focusPath.length === 0 || focusPath.trim() !== focusPath) {
    throw new Error('focusPath must be a nonblank repository-relative path without surrounding whitespace.');
  }
  const normalizedFocusPath = focusPath.replaceAll('\\', '/').replace(/^\.\//, '');
  if (
    isAbsolute(focusPath) ||
    normalizedFocusPath === '..' ||
    normalizedFocusPath.startsWith('../') ||
    normalizedFocusPath.includes('/../')
  ) {
    throw new Error('focusPath must be a repository-relative path that stays inside the repository.');
  }
  if (!['incoming', 'outgoing', 'both'].includes(direction)) {
    throw new Error('direction must be one of: incoming, outgoing, both.');
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('limit must be an integer between 1 and 100.');
  }
  if (
    afterEdgeId !== null &&
    (typeof afterEdgeId !== 'string' || afterEdgeId.length === 0 || afterEdgeId.trim() !== afterEdgeId)
  ) {
    throw new Error('afterEdgeId must be null or a nonblank string without surrounding whitespace.');
  }

  const rows = Array.isArray(edges) ? edges : [];
  const incoming = rows.filter((edge) => edge?.to === normalizedFocusPath);
  const outgoing = rows.filter((edge) => edge?.from === normalizedFocusPath);
  const selected = rows
    .filter((edge) => {
      if (direction === 'incoming') return edge?.to === normalizedFocusPath;
      if (direction === 'outgoing') return edge?.from === normalizedFocusPath;
      return edge?.from === normalizedFocusPath || edge?.to === normalizedFocusPath;
    })
    .sort(compareFocusedImportEdges);
  const duplicateCounts = new Map();
  const identified = selected.map((edge) => {
    const basis = JSON.stringify([
      edge.from,
      edge.to,
      edge.kind,
      edge.sourceRole,
      edge.importUsage,
    ]);
    const duplicateIndex = duplicateCounts.get(basis) ?? 0;
    duplicateCounts.set(basis, duplicateIndex + 1);
    return {
      edgeId: `import-impact:${createHash('sha256')
        .update(`${basis}:${duplicateIndex}`)
        .digest('hex')
        .slice(0, 20)}`,
      ...edge,
    };
  });

  let start = 0;
  if (afterEdgeId !== null) {
    const previous = identified.findIndex((edge) => edge.edgeId === afterEdgeId);
    if (previous === -1) {
      throw new Error(
        `afterEdgeId was not found in the current focused import evidence: ${afterEdgeId}. ` +
        'Omit afterEdgeId to restart from the first current edge.',
      );
    }
    start = previous + 1;
  }
  const page = identified.slice(start, start + limit);
  const remaining = Math.max(0, identified.length - start - page.length);

  return {
    contract: 'importImpactFocus:v1',
    focusPath: normalizedFocusPath,
    direction,
    sourceQualification: 'observed_static_imports_not_runtime_or_semantic_impact',
    writeAllowed: false,
    summary: {
      incoming: incoming.length,
      outgoing: outgoing.length,
      selected: identified.length,
      returned: page.length,
      limited: remaining > 0,
    },
    edges: page,
    cursor: {
      afterEdgeId,
      total: identified.length,
      remaining,
      hasMore: remaining > 0,
      nextAfterEdgeId: page.at(-1)?.edgeId ?? null,
    },
    interpretation:
      'These are bounded supported static import receipts around the exact file path. ' +
      'An empty or partial result does not prove no impact; inspect symbols, tests, dynamic behavior, and ontology meaning separately before changing code or approving a semantic relation.',
  };
}

function compareFocusedImportEdges(a, b) {
  return JSON.stringify([
    a?.from ?? '',
    a?.to ?? '',
    a?.kind ?? '',
    a?.sourceRole ?? '',
    a?.importUsage ?? '',
  ]).localeCompare(JSON.stringify([
    b?.from ?? '',
    b?.to ?? '',
    b?.kind ?? '',
    b?.sourceRole ?? '',
    b?.importUsage ?? '',
  ]));
}
