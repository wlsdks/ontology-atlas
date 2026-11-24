import { NODE_UID_RE, hasNonEmptyString } from '../value-checks.mjs';

export function vaultWarningsFailure(parsed) {
  const warnings = parsed?.vaultWarnings;
  if (!warnings) return null;
  if (typeof warnings !== 'object' || Array.isArray(warnings)) {
    return 'list_concepts vaultWarnings malformed';
  }
  if (!Number.isInteger(warnings.errorCount) || warnings.errorCount < 0) {
    return 'list_concepts vaultWarnings missing errorCount';
  }
  if (!Number.isInteger(warnings.warningCount) || warnings.warningCount < 0) {
    return 'list_concepts vaultWarnings missing warningCount';
  }
  const errorCount = warnings.errorCount;
  if (errorCount === 0) return null;
  return `list_concepts vaultWarnings present: errors ${errorCount}, warnings ${warnings.warningCount}. Run validate_vault for file-level diagnostics before writing.`;
}

/**
 * Warning-level diagnostics do not fail verification, matching
 * `ontology-atlas validate` exiting 0 on the same vault; they are still printed.
 */
export function vaultWarningsNotice(parsed) {
  const warnings = parsed?.vaultWarnings;
  if (!warnings || typeof warnings !== 'object' || Array.isArray(warnings)) return null;
  if (warnings.errorCount !== 0 || !Number.isInteger(warnings.warningCount) || warnings.warningCount <= 0) return null;
  return `list_concepts vaultWarnings: ${warnings.warningCount} warning(s), 0 errors. Run validate_vault for file-level diagnostics; warnings do not block verification.`;
}

export function listConceptsFailure(parsed) {
  if (!Number.isInteger(parsed?.total) || parsed.total < 0) {
    return 'list_concepts response missing total count';
  }
  if (typeof parsed.vaultRoot !== 'string' || parsed.vaultRoot.length === 0) {
    return 'list_concepts response missing vaultRoot';
  }
  if (!Array.isArray(parsed.nodes)) {
    return 'list_concepts response missing nodes array';
  }
  if (parsed.nodes.length > parsed.total) {
    return `list_concepts response node count exceeds total: nodes ${parsed.nodes.length}, total ${parsed.total}`;
  }
  if (!Number.isInteger(parsed.returned) || parsed.returned < 0 || parsed.returned !== parsed.nodes.length) {
    return `list_concepts response returned mismatch: returned ${parsed.returned}, nodes ${parsed.nodes.length}`;
  }
  if (typeof parsed.limited !== 'boolean') {
    return 'list_concepts response missing limited flag';
  }
  const pagination = parsed.pagination;
  if (!pagination || typeof pagination !== 'object' || Array.isArray(pagination)) {
    return 'list_concepts response missing pagination metadata';
  }
  if (
    !Number.isInteger(pagination.offset) || pagination.offset < 0 ||
    !Number.isInteger(pagination.limit) || pagination.limit < 1 ||
    !Number.isInteger(pagination.total) || pagination.total < 0 ||
    !Number.isInteger(pagination.returned) || pagination.returned < 0 ||
    typeof pagination.hasMore !== 'boolean' ||
    !(pagination.nextOffset === null || (Number.isInteger(pagination.nextOffset) && pagination.nextOffset >= 0))
  ) {
    return 'list_concepts response malformed pagination metadata';
  }
  if (pagination.total !== parsed.total || pagination.returned !== parsed.returned || pagination.offset + pagination.returned > parsed.total) {
    return 'list_concepts response pagination counts drift';
  }
  const expectedHasMore = pagination.offset + pagination.returned < pagination.total;
  if (pagination.hasMore !== expectedHasMore || parsed.limited !== expectedHasMore) {
    return 'list_concepts response pagination hasMore/limited drift';
  }
  const expectedNextOffset = expectedHasMore ? pagination.offset + pagination.returned : null;
  if (pagination.nextOffset !== expectedNextOffset) {
    return 'list_concepts response pagination nextOffset drift';
  }
  for (const [index, node] of parsed.nodes.entries()) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      return `list_concepts response malformed node at index ${index}`;
    }
    if (typeof node.slug !== 'string' || node.slug.length === 0) {
      return `list_concepts response missing node slug at index ${index}`;
    }
    if (typeof node.uid !== 'string' || !NODE_UID_RE.test(node.uid)) {
      return `list_concepts response missing node uid: ${node.slug}`;
    }
    if (typeof node.kind !== 'string' || node.kind.length === 0) {
      return `list_concepts response missing node kind: ${node.slug}`;
    }
    if (typeof node.title !== 'string' || node.title.length === 0) {
      return `list_concepts response missing node title: ${node.slug}`;
    }
    if (!Number.isFinite(node.mtime) || node.mtime < 0) {
      return `list_concepts response missing node mtime: ${node.slug}`;
    }
  }
  return vaultWarningsFailure(parsed);
}

export function getConceptsFailure(parsed) {
  if (!Array.isArray(parsed?.concepts)) {
    return 'get_concepts response missing concepts array';
  }
  if (parsed.concepts.length < 1) {
    return 'get_concepts response missing partial smoke row';
  }
  const successRows = parsed.concepts.slice(0, -1);
  const missing = parsed.concepts.at(-1);
  for (const [index, row] of successRows.entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      return `get_concepts response malformed success row at index ${index}`;
    }
    if (row.ok !== true) {
      return `get_concepts response expected success row at index ${index}`;
    }
    if (!hasNonEmptyString(row.slug)) {
      return `get_concepts response missing success slug at index ${index}`;
    }
    if (!hasNonEmptyString(row.uid) || !NODE_UID_RE.test(row.uid)) {
      return `get_concepts response missing success uid at index ${index}`;
    }
    if (!row.frontmatter || typeof row.frontmatter !== 'object' || Array.isArray(row.frontmatter)) {
      return `get_concepts response missing frontmatter: ${row.slug}`;
    }
    if (typeof row.excerpt !== 'string') {
      return `get_concepts response missing excerpt: ${row.slug}`;
    }
    if (!row.neighbors || typeof row.neighbors !== 'object' || Array.isArray(row.neighbors)) {
      return `get_concepts response missing neighbors: ${row.slug}`;
    }
    if (!Number.isFinite(row.mtime) || row.mtime < 0) {
      return `get_concepts response missing mtime: ${row.slug}`;
    }
  }
  if (!missing || typeof missing !== 'object' || Array.isArray(missing)) {
    return `get_concepts response malformed partial row at index ${parsed.concepts.length - 1}`;
  }
  if (missing.ok !== false) {
    return 'get_concepts response expected partial row to be ok:false';
  }
  if (missing.slug !== 'missing-verify-slug') {
    return `get_concepts response partial row slug mismatch: ${missing.slug}`;
  }
  if (typeof missing.error !== 'string' || !/not found/i.test(missing.error)) {
    return 'get_concepts response missing partial row error';
  }
  return null;
}

export function conceptRowFailure(parsed, expectedSlug) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return 'single get_concepts row malformed';
  }
  if (parsed.slug !== expectedSlug) {
    return `single get_concepts row slug mismatch: expected ${expectedSlug}, got ${parsed.slug}`;
  }
  if (!hasNonEmptyString(parsed.uid) || !NODE_UID_RE.test(parsed.uid)) {
    return `single get_concepts row missing uid: ${expectedSlug}`;
  }
  if (!parsed.frontmatter || typeof parsed.frontmatter !== 'object' || Array.isArray(parsed.frontmatter)) {
    return `single get_concepts row missing frontmatter: ${expectedSlug}`;
  }
  if (typeof parsed.excerpt !== 'string') {
    return `single get_concepts row missing excerpt: ${expectedSlug}`;
  }
  if (!parsed.neighbors || typeof parsed.neighbors !== 'object' || Array.isArray(parsed.neighbors)) {
    return `single get_concepts row missing neighbors: ${expectedSlug}`;
  }
  for (const key of ['domains', 'capabilities', 'elements', 'dependencies', 'relates', 'contains', 'describes']) {
    if (!Array.isArray(parsed.neighbors[key])) {
      return `single get_concepts row missing neighbors.${key}: ${expectedSlug}`;
    }
  }
  if (!(parsed.neighbors.domain == null || typeof parsed.neighbors.domain === 'string')) {
    return `single get_concepts row malformed neighbors.domain: ${expectedSlug}`;
  }
  if (!Array.isArray(parsed.outgoingEdges)) {
    return `single get_concepts row missing outgoingEdges: ${expectedSlug}`;
  }
  for (const [index, edge] of parsed.outgoingEdges.entries()) {
    if (!edge || typeof edge !== 'object' || Array.isArray(edge)) {
      return `single get_concepts row malformed outgoing edge at index ${index}`;
    }
    if (typeof edge.to !== 'string' || edge.to.length === 0) {
      return `single get_concepts row missing outgoing edge target at index ${index}`;
    }
    if (typeof edge.via !== 'string' || edge.via.length === 0) {
      return `single get_concepts row missing outgoing edge relation at index ${index}`;
    }
  }
  if (!Number.isFinite(parsed.mtime) || parsed.mtime < 0) {
    return `single get_concepts row missing mtime: ${expectedSlug}`;
  }
  if (parsed.warnings != null && !Array.isArray(parsed.warnings)) {
    return `single get_concepts row malformed warnings: ${expectedSlug}`;
  }
  return null;
}

function readMatchRowFailure(label, row, index, { evidence = false, backlinks = false } = {}) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return `${label} response malformed match at index ${index}`;
  }
  if (typeof row.slug !== 'string' || row.slug.length === 0) {
    return `${label} response missing match slug at index ${index}`;
  }
  if (evidence || backlinks) {
    if (typeof row.isNode !== 'boolean') {
      return `${label} response missing isNode: ${row.slug}`;
    }
    if (row.isNode) {
      if (evidence && (typeof row.uid !== 'string' || row.uid.length === 0)) {
        return `${label} response missing node uid: ${row.slug}`;
      }
      if (typeof row.kind !== 'string' || row.kind.length === 0) {
        return `${label} response missing node kind: ${row.slug}`;
      }
    } else if (row.uid !== undefined || row.kind !== undefined) {
      return `${label} response non-node exposes graph identity: ${row.slug}`;
    }
  } else if (typeof row.kind !== 'string' || row.kind.length === 0) {
    return `${label} response missing match kind: ${row.slug}`;
  }
  if (typeof row.title !== 'string' || row.title.length === 0) {
    return `${label} response missing match title: ${row.slug}`;
  }
  if (!Number.isFinite(row.mtime) || row.mtime < 0) {
    return `${label} response missing match mtime: ${row.slug}`;
  }
  if (evidence) {
    if (!['frontmatter', 'body'].includes(row.matchedIn)) {
      return `${label} response missing matchedIn: ${row.slug}`;
    }
    if (typeof row.excerpt !== 'string') {
      return `${label} response missing excerpt: ${row.slug}`;
    }
  }
  if (backlinks) {
    if (row.matchedKeys != null && !Array.isArray(row.matchedKeys)) {
      return `${label} response malformed matchedKeys: ${row.slug}`;
    }
    if (row.matchedInBody != null && typeof row.matchedInBody !== 'boolean') {
      return `${label} response malformed matchedInBody: ${row.slug}`;
    }
    if ((row.matchedKeys == null || row.matchedKeys.length === 0) && row.matchedInBody !== true) {
      return `${label} response match has no backlink evidence: ${row.slug}`;
    }
  }
  return null;
}

export function findEvidenceFailure(parsed) {
  if (typeof parsed?.query !== 'string' || parsed.query.length === 0) {
    return 'find_evidence response missing query';
  }
  if (!Array.isArray(parsed.matches)) {
    return 'find_evidence response missing matches array';
  }
  for (const [index, row] of parsed.matches.entries()) {
    const failure = readMatchRowFailure('find_evidence', row, index, { evidence: true });
    if (failure) return failure;
  }
  return null;
}

export function findBacklinksFailure(parsed, expectedTarget) {
  if (parsed?.target !== expectedTarget) {
    return `find_backlinks response target mismatch: expected ${expectedTarget}, got ${parsed?.target}`;
  }
  if (!Number.isInteger(parsed.total) || parsed.total < 0) {
    return 'find_backlinks response missing total count';
  }
  if (!Array.isArray(parsed.matches)) {
    return 'find_backlinks response missing matches array';
  }
  if (parsed.matches.length > parsed.total) {
    return `find_backlinks response match count exceeds total: matches ${parsed.matches.length}, total ${parsed.total}`;
  }
  for (const [index, row] of parsed.matches.entries()) {
    const failure = readMatchRowFailure('find_backlinks', row, index, { backlinks: true });
    if (failure) return failure;
  }
  return null;
}

export function queryConceptsFailure(parsed) {
  if (typeof parsed?.filter !== 'string' || parsed.filter.length === 0) {
    return 'query_concepts response missing filter';
  }
  if (typeof parsed.parsedAs !== 'string' || parsed.parsedAs.length === 0) {
    return 'query_concepts response missing parsedAs';
  }
  if (!Number.isInteger(parsed.total) || parsed.total < 0) {
    return 'query_concepts response missing total count';
  }
  if (typeof parsed.limited !== 'boolean') {
    return 'query_concepts response missing limited flag';
  }
  if (!Array.isArray(parsed.matches)) {
    return 'query_concepts response missing matches array';
  }
  if (parsed.matches.length > parsed.total) {
    return `query_concepts response match count exceeds total: matches ${parsed.matches.length}, total ${parsed.total}`;
  }
  if (!parsed.limited && parsed.matches.length !== parsed.total) {
    return `query_concepts response match count mismatch: matches ${parsed.matches.length}, total ${parsed.total}`;
  }
  for (const [index, row] of parsed.matches.entries()) {
    const failure = readMatchRowFailure('query_concepts', row, index);
    if (failure) return failure;
  }
  return null;
}

export function limitedQueryConceptsFailure(parsed, excludedSlug, expectedTotal) {
  const baseFailure = queryConceptsFailure(parsed);
  if (baseFailure) return baseFailure;
  if (parsed.filter !== `slug!=${excludedSlug}`) {
    return `query_concepts limited filter mismatch: expected slug!=${excludedSlug}, got ${parsed.filter}`;
  }
  if (parsed.total !== expectedTotal) {
    return `query_concepts limited total mismatch: expected ${expectedTotal}, got ${parsed.total}`;
  }
  if (parsed.matches.length !== 1) {
    return `query_concepts limited match count mismatch: expected 1, got ${parsed.matches.length}`;
  }
  if (parsed.limited !== true) {
    return 'query_concepts limited response did not set limited=true';
  }
  if (parsed.matches.some((row) => row?.slug === excludedSlug)) {
    return `query_concepts limited response included excluded slug: ${excludedSlug}`;
  }
  return null;
}
