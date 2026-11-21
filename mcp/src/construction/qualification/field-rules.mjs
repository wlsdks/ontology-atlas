export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function nonBlank(value, maxLength = 1000) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= maxLength
    && value.trim() === value;
}

export function validTimestamp(value) {
  if (!nonBlank(value, 100)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

export function uniqueStrings(value) {
  return Array.isArray(value)
    && value.every((item) => nonBlank(item, 500))
    && new Set(value).size === value.length;
}

export function portableSourceRef(value) {
  return nonBlank(value, 1000)
    && !value.startsWith('/')
    && !value.startsWith('~')
    && !value.startsWith('file:')
    && !/^[A-Za-z]:[\\/]/.test(value);
}

export function digest(value) {
  return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
}

export function addFinding(findings, code, path, message, options = {}) {
  findings.push({
    code,
    severity: options.severity ?? 'error',
    path,
    message,
    ...(options.category ? { category: options.category } : {}),
    ...(options.refs?.length ? { refs: [...options.refs] } : {}),
  });
}

export function countBy(rows, statuses) {
  return Object.fromEntries([...statuses].map((status) => [
    status,
    rows.filter((row) => row?.status === status).length,
  ]));
}

export function mapUnique(rows, key, findings, path) {
  const result = new Map();
  if (!Array.isArray(rows)) {
    addFinding(findings, 'invalid-array', path, `${path} must be an array.`);
    return result;
  }
  rows.forEach((row, index) => {
    const value = row?.[key];
    if (!nonBlank(value) || result.has(value)) {
      addFinding(
        findings,
        'invalid-or-duplicate-id',
        `${path}[${index}].${key}`,
        `${path} rows need unique non-empty ${key} values.`,
      );
      return;
    }
    result.set(value, row);
  });
  return result;
}
