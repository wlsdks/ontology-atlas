import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import {
  MEANING_COMPETENCY_CONTRACT,
  MEANING_COMPETENCY_EVALUATOR,
  MEANING_COMPETENCY_QUESTIONS,
  deriveMeaningAssessment,
} from './meaning-assessment.mjs';

export const PROJECT_MEANING_RECEIPT_VERSION = 1;
export const PROJECT_MEANING_STATE_RELATIVE_PATH = '.ontology-atlas/project-meaning.json';
export const PROJECT_COMPETENCY_MARKDOWN_CONTRACT = 'projectCompetencyMarkdown:v1';

const QUESTION_STATUSES = new Set(['answered', 'partial', 'visible-gap']);
const WITNESS_KEYS = Object.freeze(['concepts', 'relations', 'evidence', 'paths']);
const RECEIPT_KEYS = Object.freeze([
  'bodyDigest',
  'evaluator',
  'graphHash',
  'markdownContract',
  'measuredAt',
  'projectSlug',
  'sourceFingerprint',
  'version',
]);
const STATE_KEYS = Object.freeze(['receipts', 'version']);

function safeVaultSlug(value, maxLength = 300) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > maxLength
    || value.trim() !== value
    || value.startsWith('/')
    || /^[A-Za-z]:[\\/]/.test(value)
    || value.includes('\\')
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) return false;
  return value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function safeProjectSlug(value) {
  return safeVaultSlug(value, 200);
}

function safeGraphHash(value) {
  return typeof value === 'string' && /^project-graph-v1:[a-f0-9]{8}$/.test(value);
}

function safeOpaque(value) {
  return typeof value === 'string'
    && value.length <= 200
    && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
}

function safeRelativePath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 500) return false;
  const normalized = value.replaceAll('\\', '/');
  return !normalized.startsWith('/')
    && !/^[A-Za-z]:\//.test(normalized)
    && !normalized.split('/').includes('..')
    && !normalized.includes('\0');
}

function safeMeasuredAt(value) {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function bodyDigest(body) {
  return `sha256:${createHash('sha256').update(body, 'utf8').digest('hex')}`;
}

function fail(message) {
  throw new Error(`Invalid project competency Markdown: ${message}`);
}

function renderBacktickList(values) {
  return values.map((value) => `\`${value}\``).join(', ');
}

function normalizeAnswerRows(answers) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    fail('answers must be an object keyed by competency id');
  }
  const keys = Object.keys(answers);
  const expectedIds = MEANING_COMPETENCY_QUESTIONS.map(({ id }) => id);
  if (keys.length !== expectedIds.length || keys.some((key) => !expectedIds.includes(key))) {
    fail('answers must contain exactly the five fixed competency ids');
  }
  return MEANING_COMPETENCY_QUESTIONS.map(({ id, question }) => {
    const row = answers[id];
    if (!row || !QUESTION_STATUSES.has(row.status) || typeof row.answer !== 'string' || !row.answer.trim()) {
      fail(`${id} has an invalid status or answer`);
    }
    if (row.answer.trim() !== row.answer) fail(`${id} answer has surrounding whitespace`);
    const witnesses = row.witnesses;
    if (!witnesses || typeof witnesses !== 'object') fail(`${id} witnesses are missing`);
    for (const key of WITNESS_KEYS) {
      if (!Array.isArray(witnesses[key])) fail(`${id} ${key} witnesses are malformed`);
    }
    if (!witnesses.concepts.every((value) => safeVaultSlug(value))) {
      fail(`${id} concept witnesses are malformed`);
    }
    if (!witnesses.evidence.every(safeRelativePath) || !witnesses.paths.every(safeRelativePath)) {
      fail(`${id} path witnesses are malformed`);
    }
    if (!witnesses.relations.every((relation) => relation
      && safeVaultSlug(relation.from)
      && safeVaultSlug(relation.to)
      && safeOpaque(relation.type))) {
      fail(`${id} relation witnesses are malformed`);
    }
    if (row.gap !== undefined && (
      typeof row.gap !== 'string'
      || !row.gap.trim()
      || row.gap.trim() !== row.gap
      || /[\r\n\u0000-\u001f\u007f]/u.test(row.gap)
    )) {
      fail(`${id} gap is malformed`);
    }
    if (row.status === 'answered' && row.gap !== undefined) fail(`${id} answered row cannot declare a gap`);
    if (row.status !== 'answered' && row.gap === undefined) fail(`${id} incomplete row must declare a gap`);
    return { id, question, ...row };
  });
}

/** Render the complete, versioned human-editable competency section. */
export function renderProjectCompetencyMarkdown(answers) {
  const sections = normalizeAnswerRows(answers).map(({ id, question, answer, status, witnesses, gap }) => {
    const witnessLines = [
      witnesses.concepts.length > 0
        ? `- Concepts: ${renderBacktickList(witnesses.concepts)}`
        : null,
      witnesses.relations.length > 0
        ? `- Relations: ${witnesses.relations.map(
          ({ from, to, type }) => `\`${from}\` --${type}--> \`${to}\``,
        ).join(', ')}`
        : null,
      witnesses.evidence.length > 0
        ? `- Evidence: ${renderBacktickList(witnesses.evidence)}`
        : null,
      witnesses.paths.length > 0
        ? `- Paths: ${renderBacktickList(witnesses.paths)}`
        : null,
      typeof gap === 'string' && gap.trim() ? `- Gap: ${gap}` : null,
    ].filter(Boolean);
    return [
      `### ${id}: ${status}`,
      '',
      question,
      '',
      answer,
      ...(witnessLines.length > 0 ? ['', ...witnessLines] : []),
    ].join('\n');
  });
  return `## Competency answers\n\n${sections.join('\n\n')}\n`;
}

function parseBacktickList(value, validate, label) {
  const parts = value.split(', ');
  if (parts.length === 0) fail(`${label} is empty`);
  const parsed = parts.map((part) => {
    const match = /^`([^`]+)`$/.exec(part);
    if (!match || !validate(match[1])) fail(`${label} is malformed`);
    return match[1];
  });
  if (new Set(parsed).size !== parsed.length) fail(`${label} contains duplicates`);
  return parsed;
}

function parseRelations(value, label) {
  const parts = value.split(', ');
  const parsed = parts.map((part) => {
    const match = /^`([^`]+)` --([A-Za-z0-9][A-Za-z0-9._:-]*)--> `([^`]+)`$/.exec(part);
    if (!match || !safeVaultSlug(match[1]) || !safeVaultSlug(match[3])) {
      fail(`${label} is malformed`);
    }
    return { from: match[1], to: match[3], type: match[2] };
  });
  const keys = parsed.map(({ from, to, type }) => `${from}\0${type}\0${to}`);
  if (new Set(keys).size !== keys.length) fail(`${label} contains duplicates`);
  return parsed;
}

function competencySection(body) {
  if (typeof body !== 'string') fail('body must be a string');
  const heading = /^## Competency answers$/gm;
  const matches = [...body.matchAll(heading)];
  if (matches.length !== 1) fail('exactly one Competency answers section is required');
  const start = matches[0].index;
  const afterHeading = start + matches[0][0].length;
  const remainder = body.slice(afterHeading);
  const nextHeading = /\n## (?!#)/.exec(remainder);
  return body.slice(start, nextHeading ? afterHeading + nextHeading.index : body.length).trimEnd();
}

/** Parse only the exact deterministic format emitted by renderProjectCompetencyMarkdown. */
export function parseProjectCompetencyMarkdown(body) {
  const section = competencySection(body);
  if (!section.startsWith('## Competency answers\n\n')) fail('section spacing is malformed');
  const content = section.slice('## Competency answers\n\n'.length);
  const headingMatches = [...content.matchAll(/^### ([^\n]+)$/gm)];
  if (headingMatches.length !== MEANING_COMPETENCY_QUESTIONS.length) {
    fail('exactly five competency rows are required');
  }

  const questions = headingMatches.map((match, index) => {
    const contract = MEANING_COMPETENCY_QUESTIONS[index];
    const heading = new RegExp(`^${contract.id}(?::| —) (.+)$`).exec(match[1]);
    if (!heading) fail('competency ids must be fixed and ordered');
    const status = heading[1];
    if (!QUESTION_STATUSES.has(status)) fail(`${contract.id} status is unknown`);
    const blockStart = match.index + match[0].length;
    const blockEnd = headingMatches[index + 1]?.index ?? content.length;
    const block = content.slice(blockStart, blockEnd).replace(/\n+$/u, '');
    const prefix = `\n\n${contract.question}\n\n`;
    if (!block.startsWith(prefix)) fail(`${contract.id} question or spacing is malformed`);
    const answerAndWitnesses = block.slice(prefix.length);
    if (!answerAndWitnesses) fail(`${contract.id} answer is missing`);

    const lines = answerAndWitnesses.split('\n');
    let witnessStart = -1;
    for (let cursor = 1; cursor < lines.length; cursor += 1) {
      if (lines[cursor - 1] === '' && /^- [A-Z][A-Za-z ]*:/.test(lines[cursor])) {
        witnessStart = cursor;
        break;
      }
    }
    const answerLines = witnessStart === -1 ? lines : lines.slice(0, witnessStart - 1);
    const witnessLines = witnessStart === -1 ? [] : lines.slice(witnessStart);
    const answer = answerLines.join('\n');
    if (!answer.trim() || answer.trim() !== answer) fail(`${contract.id} answer is malformed`);

    const witnesses = { concepts: [], relations: [], evidence: [], paths: [] };
    let gap;
    const seen = new Set();
    const witnessOrder = new Map([
      ['Concepts', 0],
      ['Relations', 1],
      ['Evidence', 2],
      ['Paths', 3],
      ['Gap', 4],
    ]);
    let previousOrder = -1;
    for (const line of witnessLines) {
      const row = /^- ([A-Za-z]+): (.+)$/.exec(line);
      if (!row) fail(`${contract.id} witness row is malformed`);
      const [, label, value] = row;
      if (seen.has(label)) fail(`${contract.id} ${label} row is duplicated`);
      const order = witnessOrder.get(label);
      if (order === undefined) fail(`${contract.id} witness row ${label} is unknown`);
      if (order <= previousOrder) fail(`${contract.id} witness rows are out of order`);
      previousOrder = order;
      seen.add(label);
      if (label === 'Concepts') witnesses.concepts = parseBacktickList(value, safeVaultSlug, label);
      else if (label === 'Relations') witnesses.relations = parseRelations(value, label);
      else if (label === 'Evidence') witnesses.evidence = parseBacktickList(value, safeRelativePath, label);
      else if (label === 'Paths') witnesses.paths = parseBacktickList(value, safeRelativePath, label);
      else if (label === 'Gap') {
        if (!value.trim() || value.trim() !== value) fail(`${contract.id} Gap is malformed`);
        gap = value;
      }
    }
    if (gap !== undefined && witnessLines.at(-1) !== `- Gap: ${gap}`) {
      fail(`${contract.id} Gap must be the final row`);
    }
    if (status === 'answered' && gap !== undefined) fail(`${contract.id} answered row cannot declare a gap`);
    if (status !== 'answered' && gap === undefined) fail(`${contract.id} incomplete row must declare a gap`);
    return {
      id: contract.id,
      status,
      answer,
      witnesses,
      ...(gap === undefined ? {} : { gap }),
      unresolvedWitnesses: gap === undefined ? [] : ['declared_gap'],
    };
  });

  return {
    contract: PROJECT_COMPETENCY_MARKDOWN_CONTRACT,
    questions,
  };
}

function strictReceipt(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const keys = Object.keys(value).sort();
  if (keys.length !== RECEIPT_KEYS.length || keys.some((key, index) => key !== RECEIPT_KEYS[index])) {
    return null;
  }
  if (
    value.version !== PROJECT_MEANING_RECEIPT_VERSION
    || value.evaluator !== MEANING_COMPETENCY_EVALUATOR
    || value.markdownContract !== PROJECT_COMPETENCY_MARKDOWN_CONTRACT
    || !safeProjectSlug(value.projectSlug)
    || !/^sha256:[a-f0-9]{64}$/.test(value.bodyDigest)
    || !safeGraphHash(value.graphHash)
    || !safeOpaque(value.sourceFingerprint)
    || !safeMeasuredAt(value.measuredAt)
  ) return null;
  return value;
}

function strictState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const keys = Object.keys(value).sort();
  if (keys.length !== STATE_KEYS.length || keys.some((key, index) => key !== STATE_KEYS[index])) {
    return null;
  }
  if (value.version !== PROJECT_MEANING_RECEIPT_VERSION || !Array.isArray(value.receipts)) {
    return null;
  }
  const receipts = value.receipts.map(strictReceipt);
  if (receipts.some((receipt) => receipt === null)) return null;
  const slugs = receipts.map(({ projectSlug }) => projectSlug);
  if (new Set(slugs).size !== slugs.length) return null;
  return { version: value.version, receipts };
}

function readState(path) {
  if (!existsSync(path)) return { status: 'missing', state: null };
  try {
    const state = strictState(JSON.parse(readFileSync(path, 'utf8')));
    return state ? { status: 'current', state } : { status: 'malformed', state: null };
  } catch {
    return { status: 'malformed', state: null };
  }
}

export function finalizeProjectMeaningReceipt({
  vaultRoot,
  projectSlug,
  projectBody,
  graphHash,
  sourceFingerprint,
  measuredAt,
}) {
  if (typeof vaultRoot !== 'string' || vaultRoot.length === 0) throw new Error('vaultRoot is required');
  if (!safeProjectSlug(projectSlug)) throw new Error('projectSlug is invalid');
  if (!safeGraphHash(graphHash)) throw new Error('graphHash is invalid');
  if (!safeOpaque(sourceFingerprint)) throw new Error('sourceFingerprint is invalid');
  if (!safeMeasuredAt(measuredAt)) throw new Error('measuredAt is invalid');
  parseProjectCompetencyMarkdown(projectBody);

  const receiptPath = join(resolve(vaultRoot), PROJECT_MEANING_STATE_RELATIVE_PATH);
  const existing = readState(receiptPath);
  if (existing.status === 'malformed') throw new Error('Existing project meaning receipt is malformed');
  const receipt = {
    version: PROJECT_MEANING_RECEIPT_VERSION,
    evaluator: MEANING_COMPETENCY_EVALUATOR,
    markdownContract: PROJECT_COMPETENCY_MARKDOWN_CONTRACT,
    projectSlug,
    bodyDigest: bodyDigest(projectBody),
    graphHash,
    sourceFingerprint,
    measuredAt,
  };
  const retained = (existing.state?.receipts ?? []).filter((row) => row.projectSlug !== projectSlug);
  const state = {
    version: PROJECT_MEANING_RECEIPT_VERSION,
    receipts: [...retained, receipt].sort((left, right) => left.projectSlug.localeCompare(right.projectSlug)),
  };
  mkdirSync(dirname(receiptPath), { recursive: true });
  const tempPath = `${receiptPath}.tmp`;
  try {
    writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    renameSync(tempPath, receiptPath);
  } finally {
    try {
      rmSync(tempPath, { force: true });
    } catch {
      // A non-file collision is deliberately left for manual inspection.
    }
  }
  return receipt;
}

function invalidAssessment(input) {
  return deriveMeaningAssessment({
    projectSlug: input.projectSlug,
    graphHash: input.graphHash,
    structure: input.structure,
    source: input.source,
    competency: {
      contract: 'projectMeaningReceipt:invalid',
      receiptVersion: PROJECT_MEANING_RECEIPT_VERSION,
      evaluator: MEANING_COMPETENCY_EVALUATOR,
      graphHash: input.graphHash,
      inventory: input.inventory,
      questions: [],
    },
  });
}

/**
 * 아직 `finalize_project_meaning` 을 한 번도 안 돌린 프로젝트 (2026-08-17).
 *
 * 종전에는 이 경우도 `invalidAssessment` 로 보냈다. 그래서 **볼트를 방금
 * 만들고 바로 검사하면** `invalid (assessment_input_invalid)` 가 나왔고,
 * 아무 잘못도 안 한 사람이 자기가 뭘 깨뜨린 줄 알게 됐다.
 *
 * 판정은 그대로 「아직 확인 안 됨」이다 — 바뀌는 것은 **이름과 처방**뿐이다.
 * `competency: null` 로 넘겨서 평가기가 「안 적었다」 갈래를 타게 한다.
 */
function notAuthoredAssessment(input) {
  return deriveMeaningAssessment({
    projectSlug: input.projectSlug,
    graphHash: input.graphHash,
    structure: input.structure,
    source: input.source,
    competency: null,
  });
}

export function readProjectMeaningAssessment(input) {
  const {
    vaultRoot,
    projectSlug,
    projectBody,
    graphHash,
    structure,
    source,
    inventory,
  } = input ?? {};
  if (typeof vaultRoot !== 'string' || vaultRoot.length === 0) {
    return invalidAssessment({ projectSlug, graphHash, structure, source, inventory });
  }
  const receiptPath = join(resolve(vaultRoot), PROJECT_MEANING_STATE_RELATIVE_PATH);
  const stored = readState(receiptPath);
  const receipt = stored.state?.receipts.find((row) => row.projectSlug === projectSlug);
  if (!receipt) {
    // 「아직 안 했다」는 「망가졌다」가 아니다.
    return notAuthoredAssessment({ projectSlug, graphHash, structure, source, inventory });
  }

  let parsed;
  try {
    parsed = parseProjectCompetencyMarkdown(projectBody);
  } catch {
    return invalidAssessment({ projectSlug, graphHash, structure, source, inventory });
  }
  if (receipt.bodyDigest !== bodyDigest(projectBody)) {
    return invalidAssessment({ projectSlug, graphHash, structure, source, inventory });
  }
  return deriveMeaningAssessment({
    projectSlug,
    graphHash,
    structure,
    source,
    competency: {
      contract: MEANING_COMPETENCY_CONTRACT,
      receiptVersion: PROJECT_MEANING_RECEIPT_VERSION,
      evaluator: receipt.evaluator,
      graphHash: receipt.graphHash,
      inventory: inventory && typeof inventory === 'object' && safeOpaque(inventory.sourceFingerprint)
        ? { ...inventory, sourceFingerprint: receipt.sourceFingerprint }
        : inventory,
      questions: parsed.questions,
    },
  });
}
