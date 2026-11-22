export function decideExit(errorFiles, warningFiles, strict, failOn, groups, unreadableCount = 0) {
  // A file that could not be opened was never validated, so no mode may certify the vault, --json
  // included, which is what CI consumes.
  if (unreadableCount > 0) return 1;
  if (failOn && failOn.length > 0) {
    return groups.some((g) => failOn.includes(g.code)) ? 1 : 0;
  }
  if (errorFiles > 0) return 1;
  if (strict && warningFiles > 0) return 1;
  return 0;
}

/**
 * Groups reports by issue code. Severity is the max within a code; `files` is deduped in order;
 * `count` is files affected, not occurrences.
 */
export function groupIssuesByCode(reports) {
  const map = new Map();
  for (const { file, report } of reports) {
    const seenInFile = new Set();
    for (const issue of report.issues) {
      const key = issue.code;
      if (seenInFile.has(key)) continue;
      seenInFile.add(key);
      if (!map.has(key)) {
        map.set(key, { code: key, severity: issue.severity, files: [], count: 0 });
      }
      const entry = map.get(key);
      if (issue.severity === 'error') entry.severity = 'error';
      entry.files.push(file);
      entry.count += 1;
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1;
    return b.count - a.count;
  });
}
