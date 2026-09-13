import { isPersistableRelativePath, parseSourceRangeCitation } from './source-range-citation.mjs';

const COMPETENCY_HEADING = '## Competency answers';

/**
 * Extract only the evidence/path rows emitted inside the exact, persisted
 * project competency section. Arbitrary prose and generic Evidence headings
 * are not source claims. Any malformed row fails closed to an empty set; the
 * strict competency parser will surface the body error at finalization.
 */
export function extractProjectMeaningEvidencePaths(body) {
  if (typeof body !== 'string') return [];
  const heading = /^## Competency answers$/gm;
  const matches = [...body.matchAll(heading)];
  if (matches.length !== 1) return [];

  const start = (matches[0].index ?? 0) + COMPETENCY_HEADING.length;
  const remainder = body.slice(start);
  const nextHeading = /\n## (?!#)/.exec(remainder);
  const section = remainder.slice(0, nextHeading?.index ?? remainder.length);
  const paths = new Set();

  for (const line of section.split('\n')) {
    const row = /^- (Evidence|Paths): (.+)$/.exec(line);
    if (!row) continue;
    const values = row[2].split(', ');
    if (values.length === 0) return [];
    for (const value of values) {
      const literal = /^`([^`]+)`$/.exec(value);
      if (!literal) return [];
      const range = row[1] === 'Evidence' ? parseSourceRangeCitation(literal[1]) : null;
      if (literal[1].startsWith('source:') && !range) return [];
      if (row[1] === 'Paths' && literal[1].startsWith('source:')) return [];
      const path = range?.path ?? literal[1];
      if (!isPersistableRelativePath(path, { allowRoot: true })) return [];
      paths.add(path);
    }
  }

  return [...paths].sort((left, right) => left.localeCompare(right, 'en'));
}
