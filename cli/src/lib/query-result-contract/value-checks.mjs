export function validNodeSummary(row) {
  return Boolean(
    isPlainObject(row)
    && hasNonEmptyString(row.slug)
    && hasNonEmptyString(row.kind)
    && hasNonEmptyString(row.title)
    && (row.mtime === undefined || Number.isFinite(row.mtime))
  );
}

export function validCompiledEdgeRow(row) {
  return Boolean(
    isPlainObject(row)
    && hasNonEmptyString(row.from)
    && hasNonEmptyString(row.to)
    && hasNonEmptyString(row.via)
    && (row.id === undefined || hasNonEmptyString(row.id))
    && (row.ref === undefined || hasNonEmptyString(row.ref))
    && (row.resolved === undefined || typeof row.resolved === 'boolean')
    && (row.external === undefined || typeof row.external === 'boolean')
  );
}

export function validPage(page, rowPredicate) {
  if (!isPlainObject(page)) return false;
  if (!validCount(page.total)) return false;
  if (typeof page.limited !== 'boolean') return false;
  if (!Array.isArray(page.rows)) return false;
  return page.rows.every((row) => rowPredicate(row));
}

export function validCountBucket(value) {
  if (!isPlainObject(value)) return false;
  return Object.values(value).every((count) => validCount(count));
}

export function sumCountBucket(value) {
  return Object.values(value).reduce((sum, count) => sum + count, 0);
}

export function hasNonEmptyString(...values) {
  return values.every((value) => typeof value === 'string' && value.trim().length > 0);
}

export function nullableString(value) {
  return value === undefined || value === null || typeof value === 'string';
}

export function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function hasExactKeys(value, keys) {
  return isPlainObject(value)
    && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
}

export function hasAllowedKeys(value, keys) {
  return isPlainObject(value) && Object.keys(value).every((key) => keys.includes(key));
}

export function validCount(value) {
  return Number.isInteger(value) && value >= 0;
}
