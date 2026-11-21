import { existsSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import {
  parseTaskNavigationEvidenceSource,
  verifyTaskNavigationEvidenceCoordinate,
} from '../../agent-brief/task-navigation-evidence.mjs';
import {
  matchingReviewRequiredEvidence,
  proposalAuthorityClaim,
  semanticUnitSupportsClaim,
} from '../meaning-authority.mjs';
import { finding } from './findings.mjs';
import { nonEmpty } from './shape.mjs';

export function validateOptionalConceptBoundaryList(value, path, findings) {
  if (value == null) return;
  const valid = Array.isArray(value) &&
    value.length <= 20 &&
    value.every(nonEmpty) &&
    new Set(value).size === value.length;
  if (valid) return;
  findings.push(finding(
    'invalid-concept-boundary-list',
    'error',
    path,
    'Concept includes/excludes must be a unique array of at most 20 non-empty strings.',
  ));
}

export function validateCitationsAndConfidence({
  row,
  path,
  availableSources,
  evidenceBySource,
  findings,
  label,
}) {
  const reviewUnitMatches = [];
  if (!Array.isArray(row.evidence) || row.evidence.length === 0) {
    findings.push(finding(
      'missing-citation',
      'error',
      path,
      `Every ${label} claim needs at least one repository evidence source.`,
    ));
  } else {
    const safeSources = [];
    for (const source of row.evidence) {
      if (!availableSources.has(source)) {
        findings.push(finding(
          'unknown-citation',
          'error',
          path,
          `Citation is not present in the analysis evidence packet: ${source}`,
          [source],
        ));
        continue;
      }
      const semantic = evidenceBySource.get(source);
      if (semantic?.trust === 'untrusted-instruction') {
        findings.push(finding(
          'untrusted-citation',
          'error',
          path,
          `Untrusted instruction content cannot support a ${label} assertion: ${source}`,
          [source],
        ));
      } else if (semantic?.trust === 'claim-review-required') {
        findings.push(finding(
          'risky-citation',
          'warning',
          path,
          `Temporal, negated, or deprecated ${label} evidence needs an independent current-state source: ${source}`,
          [source],
        ));
      // Structural candidates prove paths, not independent current product meaning.
      } else if (semantic) {
        safeSources.push(source);
      }
      const matchedUnits = matchingReviewRequiredEvidence(
        semantic,
        proposalAuthorityClaim(row),
      );
      if (matchedUnits.length > 0) {
        reviewUnitMatches.push({ source, units: matchedUnits });
      }
    }
    const usesRiskyEvidence = row.evidence.some(
      (source) => evidenceBySource.get(source)?.trust === 'claim-review-required',
    );
    if (usesRiskyEvidence && safeSources.length === 0) {
      findings.push(finding(
        'risky-citation-unconfirmed',
        'error',
        path,
        `Risky ${label} evidence has no independent current-state corroboration.`,
        row.evidence,
      ));
    }
    if (reviewUnitMatches.length > 0) {
      const matchedSources = new Set(reviewUnitMatches.map(({ source }) => source));
      const claim = proposalAuthorityClaim(row);
      const independentCurrentSources = row.evidence.filter((source) => {
        if (matchedSources.has(source)) return false;
        const evidence = evidenceBySource.get(source);
        return (
          evidence?.trust === 'candidate-evidence' &&
          semanticUnitSupportsClaim(claim, evidence.excerpt)
        );
      });
      if (independentCurrentSources.length === 0) {
        findings.push(finding(
          'review-required-unit-citation',
          'warning',
          path,
          `The ${label} overlaps line-scoped review-required evidence; that unit is counterevidence, not claim authority.`,
          [...matchedSources],
        ));
        findings.push(finding(
          'review-required-unit-unconfirmed',
          'error',
          path,
          `The ${label} relies on line-scoped review-required evidence without an independent claim-aligned current semantic source.`,
          [...matchedSources],
        ));
      }
    }
  }
  if (
    typeof row.confidence !== 'number' ||
    row.confidence < 0 ||
    row.confidence > 1
  ) {
    findings.push(finding(
      'invalid-confidence',
      'error',
      path,
      'confidence must be a number between 0 and 1.',
    ));
  }
}

function navigationFindingCode(code) {
  return `navigation-${String(code).replaceAll('_', '-')}`;
}

export function validateElementTaskNavigationEvidence({ element, index, rootPath, findings }) {
  const parsedRows = [];
  for (const source of element.evidence ?? []) {
    const parsed = parseTaskNavigationEvidenceSource(source);
    if (parsed === null) continue;
    if (!parsed.ok) {
      findings.push(finding(
        navigationFindingCode(parsed.diagnostic.code),
        'error',
        `elements[${index}].evidence`,
        'Task-navigation evidence must use navigation:<primary|supporting|test>:<path>#<symbol>.',
        [source],
      ));
      continue;
    }
    parsedRows.push({ source, coordinate: parsed.coordinate });
  }
  const uniqueRows = [];
  const seen = new Set();
  for (const row of parsedRows) {
    const key = `${row.coordinate.role}\0${row.coordinate.path}\0${row.coordinate.symbol}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueRows.push(row);
  }
  for (const [role, limit] of Object.entries({ primary: 1, supporting: 1, test: 3 })) {
    const rows = uniqueRows.filter((row) => row.coordinate.role === role);
    if (rows.length <= limit) continue;
    findings.push(finding(
      'navigation-coordinate-cardinality',
      'error',
      `elements[${index}].evidence`,
      `Task-navigation evidence permits at most ${limit} ${role} coordinate(s); received ${rows.length}.`,
      rows.map((row) => row.source),
    ));
  }
  for (const row of uniqueRows) {
    const verified = verifyTaskNavigationEvidenceCoordinate(rootPath, row.coordinate);
    if (verified.target) continue;
    findings.push(finding(
      navigationFindingCode(verified.diagnostic.code),
      'error',
      `elements[${index}].evidence`,
      `Task-navigation coordinate is not uniquely verifiable in the current source: ${row.coordinate.path}#${row.coordinate.symbol}.`,
      [row.source],
    ));
  }
}

export function repositoryPathExists(rootPath, value) {
  if (!nonEmpty(rootPath) || !nonEmpty(value) || isAbsolute(value)) return false;
  const absoluteRoot = resolve(rootPath);
  const candidate = resolve(absoluteRoot, value);
  const relativePath = relative(absoluteRoot, candidate);
  if (relativePath === '..' || relativePath.startsWith(`..${sep}`)) return false;
  return existsSync(candidate);
}

export function textNamesExactPath(text, path) {
  if (!nonEmpty(text) || !nonEmpty(path)) return false;
  const pathCharacter = /[A-Za-z0-9_./-]/;
  let offset = 0;
  while (offset <= text.length - path.length) {
    const index = text.indexOf(path, offset);
    if (index < 0) return false;
    const before = index > 0 ? text[index - 1] : '';
    const afterIndex = index + path.length;
    const after = afterIndex < text.length ? text[afterIndex] : '';
    if ((!before || !pathCharacter.test(before)) && (!after || !pathCharacter.test(after))) {
      return true;
    }
    offset = index + path.length;
  }
  return false;
}
