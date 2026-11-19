// Answers computed from a document's body, kept per cached document once computed.
// A cached document holds no text (`documents.mjs`), so its body is read again the
// first time one of these is asked; the answer is kept for as long as that
// document is current, and a changed file is a new document. A document the cache
// did not produce (a fresh read, a test fixture) is answered from its own body
// every time.

import { bodyMeaningFindings, bodyMeaningFindingsFromVerdict, bodyMeaningVerdict } from '../meaning/meaning-findings.mjs';
import { extractUncertaintyReads } from '../meaning/uncertainty-reads.mjs';
import {
  unclosedFrontmatterReport,
  unframedDocumentReport,
  validateFramedVaultDocument,
  validateVaultDocument,
} from '../validate.mjs';

import { signatureMayContain } from './doc-shape.mjs';
import { cachedDocShape, cachedDocVersionKey, readVaultDocText } from './documents.mjs';

/** Keyed by a file version (`cachedDocVersionKey`), so a load pass's text-carrying twin shares it. */
const memos = new WeakMap();

function memoFor(doc) {
  const key = cachedDocVersionKey(doc);
  if (!key) return null;
  let memo = memos.get(key);
  if (!memo) {
    memo = {};
    memos.set(key, memo);
  }
  return memo;
}

/**
 * `bodyMeaningFindings({ kind, slug, title, body: doc.body })`. The verdict depends
 * on kind, title and body; the slug only addresses the findings.
 */
export function docBodyMeaningFindings(doc, { kind, slug, title }) {
  const memo = memoFor(doc);
  if (!memo) return bodyMeaningFindings({ kind, slug, title, body: doc.body });
  const held = memo.meaning;
  let verdict;
  if (held && held.kind === kind && held.title === title) {
    verdict = held.verdict;
  } else {
    verdict = bodyMeaningVerdict({ kind, title, body: doc.body });
    memo.meaning = { kind, title, verdict };
  }
  return bodyMeaningFindingsFromVerdict(verdict, { kind, slug });
}

/**
 * `validateVaultDocument(doc.raw, { ...options, parsed: doc })` for a loaded
 * document, from what the cache kept: the fence shape and the body verdict.
 */
export function validateLoadedVaultDocument(doc, options = {}) {
  const shape = cachedDocShape(doc);
  if (!shape) return validateVaultDocument(doc.raw || '', { ...options, parsed: doc });
  if (shape.rawShape === 'unclosed') return unclosedFrontmatterReport();
  if (shape.rawShape !== 'framed') return unframedDocumentReport();
  return validateFramedVaultDocument(doc, options, (input) => docBodyMeaningFindings(doc, input));
}

/** Whether a loaded document's file is empty (zero bytes), without reading it. */
export function loadedDocIsEmpty(doc) {
  const shape = cachedDocShape(doc);
  return shape ? shape.rawShape === 'empty' : !doc.raw;
}

function frozenCopy(value) {
  if (typeof value === 'string') return JSON.parse(JSON.stringify(value));
  if (Array.isArray(value)) return Object.freeze(value.map(frozenCopy));
  if (value !== null && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, frozenCopy(item)])));
  }
  return value;
}

/**
 * `extractUncertaintyReads({ slug, kind, title, path, body: doc.body })`. The rows
 * are copied out of the body and frozen; callers build new rows from them.
 */
export function docUncertaintyReads(doc, { slug, kind, title, path }) {
  const memo = memoFor(doc);
  if (!memo) return extractUncertaintyReads({ slug, kind, title, path, body: doc.body });
  const held = memo.uncertainty;
  if (held && held.slug === slug && held.kind === kind && held.title === title && held.path === path) return held.rows;
  const rows = frozenCopy(extractUncertaintyReads({ slug, kind, title, path, body: doc.body }));
  memo.uncertainty = { slug, kind, title, path, rows };
  return rows;
}

/** Needles whose per-document answers {@link docBodyIncluder} keeps, most recent last. */
const BODY_NEEDLES_KEPT = 4;
/** needle → (file version → whether its lowercased body includes the needle). */
const bodyAnswers = new Map();

/**
 * A test of `doc.body.toLowerCase().includes(needle)` (`needle` already lowercased)
 * for one query. A cached document whose fingerprint (`evidenceSignature`) rules the
 * needle out is not read; one that is read has its answer kept for its file version,
 * for the last {@link BODY_NEEDLES_KEPT} needles, so asking the same needle again
 * reads only files that changed. Those reads stay out of the body cache: a broad
 * needle reads tens of thousands of bodies once each. Any other document is
 * answered from its own body.
 * @returns {(doc: object) => boolean}
 */
export function docBodyIncluder(needle) {
  let answers = bodyAnswers.get(needle);
  if (answers) bodyAnswers.delete(needle);
  else answers = new WeakMap();
  bodyAnswers.set(needle, answers);
  while (bodyAnswers.size > BODY_NEEDLES_KEPT) bodyAnswers.delete(bodyAnswers.keys().next().value);
  return (doc) => {
    const shape = cachedDocShape(doc);
    if (!shape) return String(doc.body ?? '').toLowerCase().includes(needle);
    if (!signatureMayContain(shape.evidence, needle)) return false;
    let answer = answers.get(shape);
    if (answer === undefined) {
      answer = readVaultDocText(doc, { remember: false }).body.toLowerCase().includes(needle);
      answers.set(shape, answer);
    }
    return answer;
  };
}

/**
 * `typeof doc.body === 'string'` without reading it: a cached document always has
 * one. Artifacts compiled without bodies hand documents that have none.
 */
export function docHasBody(doc) {
  if (!doc) return false;
  return cachedDocShape(doc) ? true : typeof doc.body === 'string';
}
