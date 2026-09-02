#!/usr/bin/env node
/**
 * `pnpm decisions:find <terms...>` — find the one decision record to cite or
 * overturn, without reading the ledger.
 *
 * **Why this exists.** `docs/DECISIONS.md` is append-only and, on 2026-09-02,
 * 495 records and 1.98 MB. Every pass and council is told to "search the
 * ledger for the same surface and question" and to cite a standing decision
 * or overturn it explicitly, and the only mechanism behind that sentence was
 * grep over two megabytes, which returns lines, not records. A ledger nobody
 * can retrieve from is a ledger that gets silently re-decided, which is the
 * exact failure it exists to prevent (its own first section says so).
 *
 * **What it knows.** Records begin with `## YYYY-MM-DD (n)? — title`. Inside,
 * bold labels mark the parts a reader needs: the decision, the falsifier
 * (English and Korean label spellings alike), the prior decisions it builds on
 * or overturns, and dissent. Records cite each other as `YYYY-MM-DD (n)` or
 * `(n)`, so the reverse index (which later records cite this one) is derivable
 * and is the cheapest signal that a decision may already be overturned.
 *
 * **What it prints.** Records, not lines: file:line for a clickable jump, the
 * date and number, the title, the decision's first sentence, the falsifier's
 * first sentence, and the later records that cite it. Nothing is generated or
 * written; the ledger stays the single source and stays hand-authored.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const HEADING = /^## (\d{4}-\d{2}-\d{2})(?: \((\d+)\))? [—–-]+ (.+)$/;
// A field opens with a bold label (`**Decision**: …`) or, in some records, a
// level-3 sub-heading carrying the same word; both shapes are live in the ledger.
const LABEL = /^\*\*([^*]+)\*\*[:：]?\s*(.*)$/;
const SUBHEADING = /^#{3,4}\s+(.+?)\s*$/;
const REF = /(\d{4}-\d{2}-\d{2}) \((\d+)\)|(?:^|[\s(（,·])\((\d{1,3})\)(?=[\s,.;:)）]|$)/g;

// Order matters: "Dissent and falsifier" is dissent, "Observed falsifier" is a
// falsifier. The Korean spellings in the patterns are the ledger's own labels
// for decided / falsifier / dissent / prior, measured against the live label
// census on 2026-09-02 (the Korean "decided" label 911, Korean falsifier 317,
// Recorded dissent 109, Decision 85, Falsifier 82, prior-record labels 52).
const FIELD_KINDS = [
  { kind: 'dissent', test: /dissent|반대/i },
  { kind: 'prior', test: /^(prior|standing decision|이전 결정|선행 (결정|기록))/i },
  { kind: 'falsifier', test: /falsifier|반증|옳았다면/i },
  { kind: 'decision', test: /^(decision|결정|정한 것|final decision|결론)/i },
];

function kindOf(label) {
  const clean = label.trim().toLowerCase();
  for (const { kind, test } of FIELD_KINDS) if (test.test(clean)) return kind;
  return null;
}

function firstSentence(text, max = 180) {
  const flat = text.replace(/\s+/g, ' ').trim();
  const cut = flat.search(/[.。]\s|[.。]$/);
  let sentence = cut === -1 ? flat : flat.slice(0, cut + 1);
  // A list-shaped field ("1." or "(▲ = …): 1.") has no useful first sentence;
  // show the opening instead of a fragment.
  if (sentence.length < 24 && flat.length > sentence.length) sentence = flat;
  return sentence.length > max ? `${sentence.slice(0, max - 1)}…` : sentence;
}

/** Split the ledger into records; the preamble before the first dated heading is dropped. */
export function parseLedger(text) {
  const lines = text.split('\n');
  const records = [];
  let current = null;
  for (let i = 0; i < lines.length; i += 1) {
    const heading = HEADING.exec(lines[i]);
    if (heading) {
      current = {
        line: i + 1,
        date: heading[1],
        number: heading[2] ? Number(heading[2]) : null,
        title: heading[3].trim(),
        bodyLines: [],
      };
      records.push(current);
      continue;
    }
    if (current) current.bodyLines.push(lines[i]);
  }
  for (const record of records) {
    const body = record.bodyLines.join('\n');
    record.body = body;
    record.fields = extractFields(record.bodyLines);
    record.refs = extractRefs(body, record);
    delete record.bodyLines;
  }
  return records;
}

/** Bold-labelled paragraphs, keyed by the kind the label maps to (first wins). */
function extractFields(lines) {
  const fields = {};
  let open = null;
  for (const line of lines) {
    const label = LABEL.exec(line) ?? SUBHEADING.exec(line);
    if (label) {
      const kind = kindOf(label[1]);
      open = kind && !fields[kind] ? kind : null;
      if (open) fields[open] = (label[2] ?? '').trim();
      continue;
    }
    if (open) {
      if (line.trim() === '') {
        // A sub-heading field starts after a blank line; keep waiting for text.
        if (fields[open] !== '') open = null;
      } else fields[open] = `${fields[open]} ${line.trim()}`.trim();
    }
  }
  for (const kind of Object.keys(fields)) if (fields[kind] === '') delete fields[kind];
  return fields;
}

/** Other records this one cites, as {date?, number?}; self-references are dropped. */
function extractRefs(body, self) {
  const refs = [];
  const seen = new Set();
  for (const match of body.matchAll(REF)) {
    const ref = match[1] ? { date: match[1], number: Number(match[2]) } : { number: Number(match[3]) };
    if (ref.number === self.number && (!ref.date || ref.date === self.date)) continue;
    const key = `${ref.date ?? ''}#${ref.number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(ref);
  }
  return refs;
}

const normalize = (s) => s.toLowerCase();

/** Terms scored against title (weight 3), decision and falsifier (2), and the rest (1). */
export function searchRecords(records, terms, { since = null, limit = 8 } = {}) {
  const needles = terms.map(normalize).filter(Boolean);
  if (needles.length === 0) return [];
  const scored = [];
  for (const record of records) {
    if (since && record.date < since) continue;
    const title = normalize(record.title);
    const core = normalize(`${record.fields.decision ?? ''} ${record.fields.falsifier ?? ''}`);
    const body = normalize(record.body);
    let score = 0;
    let matched = 0;
    for (const needle of needles) {
      const inTitle = title.includes(needle);
      const inCore = core.includes(needle);
      const bodyHits = body.split(needle).length - 1;
      if (inTitle || inCore || bodyHits > 0) matched += 1;
      score += (inTitle ? 3 : 0) + (inCore ? 2 : 0) + Math.min(bodyHits, 5);
    }
    if (matched === 0) continue;
    // Every term matched beats a high count of one term; recency breaks ties.
    scored.push({ record, score: score + matched * 10 });
  }
  scored.sort((a, b) => b.score - a.score || (b.record.date > a.record.date ? 1 : -1));
  return scored.slice(0, limit).map(({ record, score }) => ({ ...record, score }));
}

/**
 * Resolve one citation from `from`. Decision numbers repeat in this ledger
 * (record 96 records the overlap; measured 2026-09-02: 177 numbered records,
 * 115 distinct numbers), so a bare `(n)` means the nearest record numbered n
 * on or before the citing record's date, and a dated citation is exact.
 */
export function resolveRef(records, ref, from) {
  if (ref.date) return records.find((r) => r.date === ref.date && r.number === ref.number) ?? null;
  const candidates = records.filter((r) => r.number === ref.number && r.date <= from.date && r !== from);
  if (candidates.length === 0) return null;
  return candidates.reduce((best, r) => (r.date > best.date || (r.date === best.date && r.line > best.line) ? r : best));
}

/** Later records whose citations resolve to `target`, the cheapest sign it may be overturned. */
export function citedBy(records, target) {
  if (target.number === null) return [];
  return records.filter((record) => record !== target && record.refs.some((ref) => resolveRef(records, ref, record) === target));
}

export function findRecord(records, selector) {
  if (/^\d+$/.test(selector)) return records.find((r) => r.number === Number(selector)) ?? null;
  const dateAndNumber = /^(\d{4}-\d{2}-\d{2})(?: \((\d+)\))?$/.exec(selector);
  if (dateAndNumber) {
    return (
      records.find((r) => r.date === dateAndNumber[1] && (!dateAndNumber[2] || r.number === Number(dateAndNumber[2]))) ??
      null
    );
  }
  return null;
}

export function formatRecord(record, records, { file = 'docs/DECISIONS.md', full = false } = {}) {
  const id = record.number === null ? record.date : `${record.date} (${record.number})`;
  const lines = [`${file}:${record.line}  ${id}  ${record.title}`];
  if (record.fields.decision) lines.push(`  decision:  ${full ? record.fields.decision : firstSentence(record.fields.decision)}`);
  if (record.fields.falsifier) lines.push(`  falsifier: ${full ? record.fields.falsifier : firstSentence(record.fields.falsifier)}`);
  if (record.fields.prior) lines.push(`  prior:     ${firstSentence(record.fields.prior, 140)}`);
  if (full && record.fields.dissent) lines.push(`  dissent:   ${record.fields.dissent}`);
  const later = record.number === null ? [] : citedBy(records, record);
  if (later.length > 0) {
    lines.push(`  cited by:  ${later.map((r) => (r.number === null ? r.date : `${r.date} (${r.number})`)).join(', ')} — read these before citing it as standing`);
  }
  return lines.join('\n');
}

function parseArgs(argv) {
  const args = { terms: [], since: null, limit: 8, json: false, record: null, full: false };
  for (const arg of argv) {
    if (arg === '--json') args.json = true;
    else if (arg === '--full') args.full = true;
    else if (arg.startsWith('--since=')) args.since = arg.slice('--since='.length);
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.slice('--limit='.length));
    else if (arg.startsWith('--record=')) args.record = arg.slice('--record='.length);
    else if (arg !== '--') args.terms.push(arg);
  }
  if (!Number.isFinite(args.limit) || args.limit <= 0) throw new Error('--limit must be a positive number');
  if (args.since && !/^\d{4}-\d{2}-\d{2}$/.test(args.since)) throw new Error('--since must be YYYY-MM-DD');
  return args;
}

export function runDecisionsFind(argv, io = console, { cwd = process.cwd() } = {}) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    io.error(`[decisions] ${error.message}`);
    return 2;
  }
  const file = 'docs/DECISIONS.md';
  const records = parseLedger(readFileSync(join(cwd, file), 'utf8'));
  if (args.record !== null) {
    const record = findRecord(records, args.record);
    if (!record) {
      io.error(`[decisions] no record ${args.record}; use a number, a date, or "date (n)"`);
      return 1;
    }
    io.log(args.json ? JSON.stringify({ ...record, citedBy: citedBy(records, record).map((r) => r.line) }, null, 2) : formatRecord(record, records, { file, full: true }));
    return 0;
  }
  if (args.terms.length === 0) {
    io.error('[decisions] usage: pnpm decisions:find <terms...> [--since=YYYY-MM-DD] [--limit=N] [--json] | --record=<n|date> [--full]');
    return 2;
  }
  const hits = searchRecords(records, args.terms, { since: args.since, limit: args.limit });
  if (hits.length === 0) {
    io.log(`[decisions] no record matches ${args.terms.join(' ')}; if this is a new question, append a record rather than deciding in prose.`);
    return 1;
  }
  io.log(args.json ? JSON.stringify(hits, null, 2) : hits.map((hit) => formatRecord(hit, records, { file, full: args.full })).join('\n\n'));
  return 0;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = runDecisionsFind(process.argv.slice(2));
}
