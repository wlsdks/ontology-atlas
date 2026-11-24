import { isDeepStrictEqual } from 'node:util';

export function structuredContentFailure(response, parsed, label) {
  const structured = response?.result?.structuredContent;
  const status = structuredContentParityStatus(parsed, structured);
  if (status === 'missing') {
    return `${label} structuredContent missing`;
  }
  if (status === 'mismatch') {
    return `${label} structuredContent mismatch: ${structuredContentMismatchSummary(parsed, structured)}`;
  }
  return null;
}

export function structuredContentParityStatus(parsed, structured) {
  if (structured == null) return 'missing';
  return isDeepStrictEqual(structured, parsed) ? 'pass' : 'mismatch';
}

export function structuredContentMismatchSummary(parsed, structured) {
  const mismatch = firstMismatch(parsed, structured);
  if (!mismatch) return 'values differ';
  return `${mismatch.path}: parsed ${previewValue(mismatch.expected)}, structuredContent ${previewValue(mismatch.actual)}`;
}

function firstMismatch(expected, actual, path = '$') {
  if (isDeepStrictEqual(expected, actual)) return null;
  if (!expected || !actual || typeof expected !== 'object' || typeof actual !== 'object') {
    return { path, expected, actual };
  }
  const expectedIsArray = Array.isArray(expected);
  const actualIsArray = Array.isArray(actual);
  if (expectedIsArray !== actualIsArray) {
    return { path, expected, actual };
  }
  if (expectedIsArray) {
    const maxLength = Math.max(expected.length, actual.length);
    for (let index = 0; index < maxLength; index += 1) {
      if (!(index in expected) || !(index in actual)) {
        return { path: `${path}[${index}]`, expected: expected[index], actual: actual[index] };
      }
      const childMismatch = firstMismatch(expected[index], actual[index], `${path}[${index}]`);
      if (childMismatch) return childMismatch;
    }
    return { path, expected, actual };
  }
  const expectedKeys = Object.keys(expected);
  const actualExtraKeys = Object.keys(actual).filter((key) => !(key in expected));
  const keys = [...expectedKeys, ...actualExtraKeys];
  for (const key of keys) {
    if (!(key in expected) || !(key in actual)) {
      return { path: `${path}.${key}`, expected: expected[key], actual: actual[key] };
    }
    const childMismatch = firstMismatch(expected[key], actual[key], `${path}.${key}`);
    if (childMismatch) return childMismatch;
  }
  return { path, expected, actual };
}

function previewValue(value) {
  if (value === undefined) return 'undefined';
  const preview = JSON.stringify(value);
  if (preview == null) return String(value);
  return preview.length > 96 ? `${preview.slice(0, 93)}...` : preview;
}

export function structuredContentVerifySummary({
  hasNode = false,
  hasProject = false,
  hasGetConcept = false,
  hasFindBacklinks = false,
  hasLimitedQueryConcepts = false,
  hasCompileIndexes = false,
  hasAllPaths = false,
  hasMaintenanceResume = false,
  hasMaintenanceResumeSkipped = false,
  destructiveDryRunCount = 0,
} = {}) {
  const direct = 10
    + (hasGetConcept ? 1 : 0)
    + (hasFindBacklinks ? 1 : 0)
    + (hasLimitedQueryConcepts ? 1 : 0);
  const write = 2 + destructiveDryRunCount;
  const maintenance = 2 + (hasMaintenanceResume ? 1 : 0);
  const maintenanceSuffix = hasMaintenanceResumeSkipped ? ' (resume skipped: no actions)' : '';
  const graph = 8 + (hasNode ? 2 : 0) + (hasProject ? 1 : 0) + (hasCompileIndexes ? 1 : 0) + (hasAllPaths ? 1 : 0);
  return `direct ${direct}/${direct}, write ${write}/${write} (batch row-isolation 2/2, batch no-write metadata 2/2, destructive dry-run ${destructiveDryRunCount}/${destructiveDryRunCount}), maintenance ${maintenance}/${maintenance}${maintenanceSuffix}, graph ${graph}/${graph}`;
}
