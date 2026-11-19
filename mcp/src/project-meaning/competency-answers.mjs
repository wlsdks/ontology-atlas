/**
 * The `answers` argument of finalize_project_meaning: five rows the server renders
 * into the exact `## Competency answers` section, so an agent never copies the fixed
 * questions or the layout. Every refusal names the row and the argument to change.
 */

import { MEANING_COMPETENCY_QUESTIONS } from '../meaning/meaning-assessment.mjs';
import {
  isPersistableEvidenceReference,
  isPersistablePathWitness,
  parseSourceRangeCitation,
} from '../meaning/source-range-citation.mjs';
import { renderProjectCompetencyMarkdown, safeVaultSlug } from './project-meaning-receipt.mjs';

const QUESTION_IDS = MEANING_COMPETENCY_QUESTIONS.map(({ id }) => id);
const STATUSES = ['answered', 'partial', 'visible-gap'];
const ROW_FIELDS = ['id', 'status', 'answer', 'concepts', 'relations', 'evidence', 'paths', 'gap'];
const RELATION_TYPE = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
/** A line the section parser would read as a witness row or a heading, not as answer prose. */
const STRUCTURAL_LINE = /^(?:#|- [A-Z][A-Za-z ]*:)/;
const LINE_CITE_SUFFIX = /^(.+):L\d+(?:-L?\d+)?$/;

function evidenceProblem(value) {
  if (typeof value === 'string' && !value.startsWith('source:')) {
    const cited = LINE_CITE_SUFFIX.exec(value);
    if (cited) return `\`${value}\` is a line cite; name the file \`${cited[1]}\` (cite lines in the answer)`;
  }
  if (isPersistableEvidenceReference(value)) return null;
  return typeof value === 'string' && value.startsWith('source:') && !parseSourceRangeCitation(value)
    ? `\`${value}\` is not a pinned \`source:<path>#L<a>-L<b>@sha256:<64 hex>\` citation`
    : `${JSON.stringify(value)} is not a repository-relative file path`;
}

function listProblems(row, field, label, valueProblem) {
  const values = row[field];
  if (values === undefined) return [];
  if (!Array.isArray(values)) return [`${label}.${field} must be an array`];
  return values.flatMap((value, index) => {
    const problem = valueProblem(value);
    return problem ? [`${label}.${field}[${index}]: ${problem}`] : [];
  });
}

function relationProblem(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'must be {from, to, type}';
  if (!safeVaultSlug(value.from) || !safeVaultSlug(value.to)) return '`from` and `to` must be vault slugs';
  return typeof value.type === 'string' && RELATION_TYPE.test(value.type)
    ? null
    : '`type` must be the stored relation key, such as `domains`, `capabilities` or `depends_on`';
}

function answerProblem(answer, label) {
  if (typeof answer !== 'string' || !answer.trim()) return [`${label}.answer is empty`];
  return answer.split(/\r?\n/).some((line) => STRUCTURAL_LINE.test(line))
    ? [`${label}.answer holds a heading or a "- Label:" line; write it as plain sentences`]
    : [];
}

function gapProblems(row, label) {
  if (row.status === 'answered') {
    return row.gap === undefined ? [] : [`${label} is answered, so drop \`gap\` or set status "partial"`];
  }
  if (typeof row.gap !== 'string' || !row.gap.trim()) {
    return [`${label} is ${JSON.stringify(row.status)}, so \`gap\` must say in one line what is missing`];
  }
  return /[\r\n]/.test(row.gap.trim()) ? [`${label}.gap must be one line`] : [];
}

function rowProblems(row, label) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return [`${label} must be an object`];
  const unknown = Object.keys(row).filter((key) => !ROW_FIELDS.includes(key));
  if (unknown.length > 0) {
    return [`${label} has unknown field(s) ${unknown.join(', ')}; a row takes ${ROW_FIELDS.join(', ')}`];
  }
  if (!QUESTION_IDS.includes(row.id)) {
    return [`${label}.id ${JSON.stringify(row.id)} is not one of ${QUESTION_IDS.join(', ')}`];
  }
  if (!STATUSES.includes(row.status)) {
    return [`${label}.status must be one of ${STATUSES.join(', ')}`];
  }
  return [
    ...answerProblem(row.answer, label),
    ...gapProblems(row, label),
    ...listProblems(row, 'concepts', label, (value) => (safeVaultSlug(value) ? null : `${JSON.stringify(value)} is not a vault slug`)),
    ...listProblems(row, 'relations', label, relationProblem),
    ...listProblems(row, 'evidence', label, evidenceProblem),
    ...listProblems(row, 'paths', label, (value) => (isPersistablePathWitness(value) ? null : `${JSON.stringify(value)} is not a repository-relative path`)),
  ];
}

function unique(values = []) {
  return [...new Set(values)];
}

function uniqueRelations(relations = []) {
  const byKey = new Map(relations.map(({ from, to, type }) => [`${from}\0${type}\0${to}`, { from, to, type }]));
  return [...byKey.values()];
}

/**
 * Validates the five rows and renders the section; throws one message listing every
 * row to repair, so a single corrected call succeeds.
 */
export function renderCompetencyAnswers(answers) {
  if (!Array.isArray(answers)) {
    throw new Error(`answers must be an array of ${QUESTION_IDS.length} rows, one per id: ${QUESTION_IDS.join(', ')}.`);
  }
  const problems = answers.flatMap((row, index) => rowProblems(row, `answers[${index}]`));
  const ids = answers.map((row) => row?.id);
  const repeated = QUESTION_IDS.filter((id) => ids.filter((value) => value === id).length > 1);
  const missing = QUESTION_IDS.filter((id) => !ids.includes(id));
  if (repeated.length > 0) problems.push(`answers holds more than one row for ${repeated.join(', ')}`);
  if (missing.length > 0) problems.push(`answers has no row for ${missing.join(', ')}`);
  if (problems.length > 0) {
    throw new Error(['finalize_project_meaning refused `answers`; nothing was written:', ...problems.map((line) => `- ${line}.`)].join('\n'));
  }
  const keyed = Object.fromEntries(answers.map((row) => [row.id, {
    status: row.status,
    answer: row.answer.replace(/\r\n/g, '\n').trim(),
    witnesses: {
      concepts: unique(row.concepts),
      relations: uniqueRelations(row.relations),
      evidence: unique(row.evidence),
      paths: unique(row.paths),
    },
    ...(row.status === 'answered' ? {} : { gap: row.gap.trim() }),
  }]));
  return renderProjectCompetencyMarkdown(keyed);
}

/** Byte offsets of each `## Competency answers` section: its heading to the next `## ` heading. */
function competencySectionSpans(body) {
  return [...body.matchAll(/^## Competency answers$/gm)].map((match) => {
    const afterHeading = match.index + match[0].length;
    const next = /\n## (?!#)/.exec(body.slice(afterHeading));
    return { start: match.index, end: next ? afterHeading + next.index + 1 : body.length };
  });
}

/** The body with `section` in place of every existing competency section, or appended. */
export function withCompetencySection(body, section) {
  const text = typeof body === 'string' ? body : '';
  const spans = competencySectionSpans(text);
  if (spans.length === 0) {
    const kept = text.trimEnd();
    return kept ? `${kept}\n\n${section}` : section;
  }
  const pieces = [];
  let cursor = 0;
  spans.forEach(({ start, end }, index) => {
    pieces.push(text.slice(cursor, start));
    if (index === 0) pieces.push(end < text.length ? `${section}\n` : section);
    cursor = end;
  });
  pieces.push(text.slice(cursor));
  return pieces.join('');
}
