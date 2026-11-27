import { isPersistableRelativePath, parseSourceRangeCitation } from '../meaning/source-range-citation.mjs';
import { compareText } from '../compare-text.mjs';

const COMPETENCY_HEADING = '## Competency answers';

/**
 * Evidence and path rows from the exact persisted competency section only;
 * arbitrary prose and generic Evidence headings are not source claims. A
 * malformed row yields an empty set, and the strict parser reports it at finalization.
 */
export function extractProjectMeaningEvidencePaths(body) {
  return [...new Set(competencyEvidenceValues(body).map(({ path }) => path))]
    .sort((left, right) => compareText(left, right));
}

/** The pinned `source:<path>#L..@sha256:..` citations among the section's Evidence values. */
export function extractProjectMeaningEvidenceCitations(body) {
  return [...new Set(competencyEvidenceValues(body)
    .filter(({ citation }) => citation !== null)
    .map(({ citation }) => citation))]
    .sort((left, right) => compareText(left, right));
}

function competencyEvidenceValues(body) {
  if (typeof body !== 'string') return [];
  const heading = /^## Competency answers$/gm;
  const matches = [...body.matchAll(heading)];
  if (matches.length !== 1) return [];

  const start = (matches[0].index ?? 0) + COMPETENCY_HEADING.length;
  const remainder = body.slice(start);
  const nextHeading = /\n## (?!#)/.exec(remainder);
  const section = remainder.slice(0, nextHeading?.index ?? remainder.length);
  const values = [];

  for (const line of section.split('\n')) {
    const row = /^- (Evidence|Paths): (.+)$/.exec(line);
    if (!row) continue;
    const cells = row[2].split(', ');
    if (cells.length === 0) return [];
    for (const value of cells) {
      const literal = /^`([^`]+)`$/.exec(value);
      if (!literal) return [];
      const range = row[1] === 'Evidence' ? parseSourceRangeCitation(literal[1]) : null;
      if (literal[1].startsWith('source:') && !range) return [];
      if (row[1] === 'Paths' && literal[1].startsWith('source:')) return [];
      const path = range?.path ?? literal[1];
      if (!isPersistableRelativePath(path, { allowRoot: true })) return [];
      values.push({ path, citation: range ? literal[1] : null });
    }
  }
  return values;
}
