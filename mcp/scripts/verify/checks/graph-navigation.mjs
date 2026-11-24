export function pathNodeFailure(row, index) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return `path response malformed node at index ${index}`;
  }
  if (typeof row.slug !== 'string' || row.slug.length === 0) {
    return `path response missing node slug at index ${index}`;
  }
  if (typeof row.kind !== 'string' || row.kind.length === 0) {
    return `path response missing node kind: ${row.slug}`;
  }
  if (typeof row.title !== 'string' || row.title.length === 0) {
    return `path response missing node title: ${row.slug}`;
  }
  if (row.domain !== undefined && typeof row.domain !== 'string') {
    return `path response malformed node domain: ${row.slug}`;
  }
  return null;
}

export function graphEdgeFailure(label, edge, index) {
  if (!edge || typeof edge !== 'object' || Array.isArray(edge)) {
    return `${label} malformed edge at index ${index}`;
  }
  for (const key of ['from', 'to', 'via']) {
    if (typeof edge[key] !== 'string' || edge[key].length === 0) {
      return `${label} missing ${key} at index ${index}`;
    }
  }
  return null;
}
