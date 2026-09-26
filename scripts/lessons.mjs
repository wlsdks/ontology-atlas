#!/usr/bin/env node
/**
 * `pnpm lessons` — harness lessons: mistakes, wasted rounds, gate gaps, and
 * costly tool patterns, shared in the repository instead of one person's
 * private memory. `/harness-retro` owns when to write and review them.
 *
 * A lesson is an immutable file under `docs/records/lessons/` with status
 * `reported`. Every later verdict (verified, refuted, fixed, wontfix, or a
 * reopening `reported`) is a new file naming the lesson and the current heads
 * of its history, the same append-only shape as backlog observations, so two
 * worktrees never edit one file and concurrent verdicts stay visible until
 * someone reconciles them.
 */
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LESSON_DIR = 'docs/records/lessons';
export const KINDS = ['mistake', 'tool-efficiency', 'gate-gap', 'process'];
export const STATUSES = ['reported', 'verified', 'refuted', 'fixed', 'wontfix'];
export const LESSON_FIELDS = ['Observed', 'Cost', 'Suspected cause', 'Proposed change'];
export const PROPOSALS = ['skill', 'rule', 'hook', 'script', 'gate', 'none'];
/** Open lessons at or above this count make the reader ask for a review. */
export const REVIEW_THRESHOLD = 5;
export const LIMITS = { lesson: { lines: 16, bytes: 1600 }, status: { lines: 8, bytes: 800 } };

const LESSON_KEYS = ['id', 'date', 'kind', 'status', 'harness_area'];
const STATUS_KEYS = ['id', 'date', 'lesson', 'status', 'parents'];
const NEXT = {
  reported: ['verified', 'refuted', 'wontfix'],
  verified: ['fixed', 'refuted', 'wontfix'],
  fixed: ['reported'],
  refuted: ['reported'],
  wontfix: ['reported'],
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const AREA = /^[a-z0-9][a-z0-9-]{0,39}$/;
// A fix is only a fix once it can be found: a commit SHA or a pull request number.
const CITES_CHANGE = /(?:^|[^0-9a-z])(?:[0-9a-f]{7,40}|#\d+)(?![0-9a-z])/i;
const fail = (message) => { throw new Error(`[lessons] ${message}`); };

const validDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export function slugify(value) {
  const slug = String(value ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').slice(0, 60).replace(/^-+|-+$/g, '');
  if (!slug) fail('slug must contain an ASCII letter or number');
  return slug;
}

function fields(body, file) {
  const lines = body.split('\n');
  const found = [];
  for (const line of lines) {
    const match = /^\*\*([^*]+)\*\*:\s*(.*)$/.exec(line);
    if (match) found.push({ label: match[1], value: match[2].trim() });
    else if (found.length) found.at(-1).value += ` ${line.trim()}`;
    else if (line.trim()) fail(`${file}: text before the first field`);
  }
  return found.map(({ label, value }) => ({ label, value: value.trim() }));
}

function checkCap(body, cap, file) {
  if (body.split('\n').length > cap.lines || Buffer.byteLength(body) > cap.bytes) {
    fail(`${file}: body exceeds the ${cap.lines}-line or ${cap.bytes}-byte cap; keep the evidence, cut the story`);
  }
}

/** Parse one record. Shape only; history rules need every record (`composeLessons`). */
export function parseLessonRecord(raw, file) {
  const match = /^---\n([\s\S]+?)\n---\n([\s\S]*)$/.exec(String(raw).replace(/\r\n/g, '\n'));
  if (!match) fail(`${file}: expected metadata and a body`);
  const meta = {};
  for (const line of match[1].split('\n')) {
    const field = /^([a-z_]+): (.+)$/.exec(line);
    if (!field || Object.hasOwn(meta, field[1])) fail(`${file}: malformed or duplicate metadata line "${line}"`);
    meta[field[1]] = field[2].trim();
  }
  const isStatus = Object.hasOwn(meta, 'lesson');
  const keys = isStatus ? STATUS_KEYS : LESSON_KEYS;
  const got = Object.keys(meta);
  if (got.length !== keys.length || keys.some((key) => !got.includes(key))) fail(`${file}: metadata must be exactly ${keys.join(', ')}`);
  if (!UUID.test(meta.id)) fail(`${file}: id must be a lowercase UUIDv4`);
  if (!validDate(meta.date)) fail(`${file}: invalid calendar date`);
  if (!STATUSES.includes(meta.status)) fail(`${file}: status must be one of ${STATUSES.join(', ')}`);
  const body = match[2].trim();
  if (!body) fail(`${file}: body is required`);
  if (!new RegExp(`^${meta.date}-[a-z0-9]+(?:-[a-z0-9]+)*-${meta.id}\\.md$`).test(basename(file))) fail(`${file}: filename must be <date>-<slug>-<id>.md`);
  const labels = fields(body, file);
  if (isStatus) {
    if (!UUID.test(meta.lesson)) fail(`${file}: lesson must be a UUIDv4`);
    const parents = meta.parents.split(',').map((value) => value.trim());
    if (!parents.length || parents.some((value) => !UUID.test(value)) || new Set(parents).size !== parents.length) fail(`${file}: parents must be unique UUIDv4 values`);
    checkCap(body, LIMITS.status, file);
    if (labels.map((item) => item.label).join('|') !== 'Evidence' || !labels[0].value) fail(`${file}: a status record is one non-empty **Evidence**: field`);
    if (meta.status === 'fixed' && !CITES_CHANGE.test(labels[0].value)) fail(`${file}: a fixed status must cite the commit SHA or pull request (#N)`);
    return { type: 'status', ...meta, parents, evidence: labels[0].value, file };
  }
  if (meta.status !== 'reported') fail(`${file}: a new lesson is always reported; later verdicts are separate status records`);
  if (!KINDS.includes(meta.kind)) fail(`${file}: kind must be one of ${KINDS.join(', ')}`);
  if (!AREA.test(meta.harness_area)) fail(`${file}: harness_area must be a short lowercase slug`);
  checkCap(body, LIMITS.lesson, file);
  if (labels.map((item) => item.label).join('|') !== LESSON_FIELDS.join('|')) fail(`${file}: body must be the fields ${LESSON_FIELDS.map((label) => `**${label}**:`).join(' ')} in that order`);
  const empty = labels.find((item) => !item.value);
  if (empty) fail(`${file}: field ${empty.label} is empty`);
  const proposal = /^([a-z]+)\b/.exec(labels[3].value)?.[1];
  if (!PROPOSALS.includes(proposal)) fail(`${file}: Proposed change must start with one of ${PROPOSALS.join(', ')}`);
  const [observed, cost, cause, change] = labels.map((item) => item.value);
  return { type: 'lesson', ...meta, observed, cost, cause, change, proposal, file };
}

/** Compose parsed records into lessons with their current heads and status. */
export function composeLessons(records) {
  const byId = new Map();
  for (const record of records) {
    if (byId.has(record.id)) fail(`duplicate record id ${record.id} (${byId.get(record.id).file}, ${record.file})`);
    byId.set(record.id, record);
  }
  const lessons = records.filter((record) => record.type === 'lesson');
  const statuses = records.filter((record) => record.type === 'status');
  const referenced = new Set();
  for (const record of statuses) {
    const lesson = byId.get(record.lesson);
    if (!lesson || lesson.type !== 'lesson') fail(`${record.file}: unknown lesson ${record.lesson}`);
    for (const id of record.parents) {
      const parent = byId.get(id);
      if (!parent || (parent.id !== record.lesson && parent.lesson !== record.lesson)) fail(`${record.file}: parent ${id} is not in the history of lesson ${record.lesson}`);
      if (parent.date > record.date) fail(`${record.file}: date predates parent ${id}`);
      referenced.add(id);
    }
    const reconciling = record.parents.length > 1;
    const allowed = record.parents.some((id) => NEXT[byId.get(id).status].includes(record.status)
      || (reconciling && byId.get(id).status === record.status));
    if (!allowed) fail(`${record.file}: ${record.parents.map((id) => byId.get(id).status).join('/')} cannot become ${record.status}`);
  }
  // Parents only point at earlier-or-same-date records of the same lesson; a
  // hand-edited file could still close a loop, so walk every chain once.
  const done = new Set();
  const walk = (record, trail) => {
    if (trail.has(record.id)) fail(`${record.file}: cyclic history`);
    if (done.has(record.id) || record.type === 'lesson') return;
    trail.add(record.id);
    for (const id of record.parents) walk(byId.get(id), trail);
    trail.delete(record.id); done.add(record.id);
  };
  statuses.forEach((record) => walk(record, new Set()));
  const depths = new Map();
  const depth = (record) => {
    if (record.type === 'lesson') return 0;
    if (!depths.has(record.id)) depths.set(record.id, 1 + Math.max(...record.parents.map((id) => depth(byId.get(id)))));
    return depths.get(record.id);
  };
  return lessons.map((lesson) => {
    const history = [lesson, ...statuses.filter((record) => record.lesson === lesson.id)]
      .sort((a, b) => depth(a) - depth(b) || a.date.localeCompare(b.date) || a.file.localeCompare(b.file));
    const heads = history.filter((record) => !referenced.has(record.id));
    return {
      ...lesson,
      state: heads.length === 1 ? 'current' : 'needs_reconciliation',
      current: heads.length === 1 ? heads[0].status : null,
      heads: heads.map((record) => record.id),
      history: history.map(({ id, date, status, file, evidence }) => ({ id, date, status, file, ...(evidence ? { evidence } : {}) })),
    };
  }).sort((a, b) => a.date.localeCompare(b.date) || a.file.localeCompare(b.file));
}

export function readLessonRecords(root = process.cwd()) {
  const dir = join(root, LESSON_DIR);
  const files = existsSync(dir) ? readdirSync(dir).filter((file) => file.endsWith('.md')).sort() : [];
  return files.map((file) => parseLessonRecord(readFileSync(join(dir, file), 'utf8'), `${LESSON_DIR}/${file}`));
}

export const readLessons = (root = process.cwd()) => composeLessons(readLessonRecords(root));

function writeExclusive(root, relativePath, content) {
  mkdirSync(join(root, LESSON_DIR), { recursive: true });
  const fd = openSync(join(root, relativePath), 'wx');
  try { writeFileSync(fd, content, 'utf8'); } finally { closeSync(fd); }
}

const today = () => new Date().toISOString().slice(0, 10);

/** Write a new `reported` lesson. `kind` is the lesson kind, not the record kind. */
export function createLesson({ kind, area, slug, body, date = today(), id = randomUUID(), root = process.cwd() }) {
  const records = readLessonRecords(root);
  composeLessons(records);
  const file = `${LESSON_DIR}/${date}-${slugify(slug)}-${id}.md`;
  const content = `---\nid: ${id}\ndate: ${date}\nkind: ${kind}\nstatus: reported\nharness_area: ${area}\n---\n${String(body ?? '').trim()}\n`;
  composeLessons([...records, parseLessonRecord(content, file)]);
  writeExclusive(root, file, content);
  return { path: file, id, content };
}

/**
 * Append a verdict. Without `parents` it supersedes every current head of the
 * lesson, which is what a reader of `pnpm lessons -- --id=<lesson>` would name;
 * explicit parents must match those heads exactly, as in the backlog.
 */
export function createLessonStatus({ lesson, status, parents, slug, body, date = today(), id = randomUUID(), root = process.cwd() }) {
  const records = readLessonRecords(root);
  const target = composeLessons(records).find((item) => item.id === lesson);
  if (!target) fail(`unknown lesson ${lesson}`);
  const chosen = parents?.length ? [...parents] : target.heads;
  if (JSON.stringify([...chosen].sort()) !== JSON.stringify([...target.heads].sort())) fail(`stale or incomplete parents for ${lesson}; current heads: ${target.heads.join(',')}`);
  const file = `${LESSON_DIR}/${date}-${slugify(slug ?? `${status}-${basename(target.file).slice(11, -40)}`)}-${id}.md`;
  const content = `---\nid: ${id}\ndate: ${date}\nlesson: ${lesson}\nstatus: ${status}\nparents: ${chosen.join(', ')}\n---\n${String(body ?? '').trim()}\n`;
  composeLessons([...records, parseLessonRecord(content, file)]);
  writeExclusive(root, file, content);
  return { path: file, id, content };
}

export function checkImmutableLessons(root = process.cwd(), base = 'origin/main') {
  const mergeBase = execFileSync('git', ['merge-base', base, 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const entries = execFileSync('git', ['diff', '--name-status', '--no-renames', mergeBase, '--', LESSON_DIR], { cwd: root, encoding: 'utf8' })
    .trim().split('\n').filter(Boolean);
  const changed = entries.filter((line) => !line.startsWith('A\t'));
  if (changed.length) fail(`published lessons are immutable; record a new status instead:\n${changed.join('\n')}`);
}

export function sinceDate(value, now = new Date()) {
  if (validDate(value)) return value;
  const match = /^(\d{1,4})d$/.exec(value ?? '');
  if (!match) fail('--since takes <N>d or YYYY-MM-DD');
  return new Date(now.getTime() - Number(match[1]) * 86_400_000).toISOString().slice(0, 10);
}

export function selectLessons(lessons, { kind, status, area, since, now } = {}) {
  const cutoff = since ? sinceDate(since, now) : null;
  return lessons.filter((lesson) => (!kind || lesson.kind === kind)
    && (!status || (lesson.current ?? 'needs_reconciliation') === status)
    && (!area || lesson.harness_area === area)
    && (!cutoff || lesson.date >= cutoff));
}

export function summarize(lessons) {
  const by = (status) => lessons.filter((lesson) => lesson.current === status);
  const areas = new Map();
  for (const lesson of lessons.filter((item) => item.current !== 'refuted')) areas.set(lesson.harness_area, (areas.get(lesson.harness_area) ?? 0) + 1);
  return {
    total: lessons.length,
    open: by('reported'),
    verified: by('verified'),
    fixed: by('fixed'),
    refuted: by('refuted'),
    wontfix: by('wontfix'),
    conflicts: lessons.filter((lesson) => lesson.state !== 'current'),
    areas: [...areas].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([area, count]) => ({ area, count })),
    reviewDue: by('reported').length >= REVIEW_THRESHOLD,
  };
}

const line = (lesson) => {
  const text = lesson.observed.length > 110 ? `${lesson.observed.slice(0, 107)}...` : lesson.observed;
  return `- ${lesson.date} ${lesson.id.slice(0, 8)} [${lesson.kind}/${lesson.harness_area}] ${text}`;
};

export function renderLessons(summary) {
  const section = (title, items) => items.length ? [`${title} (${items.length})`, ...items.map(line), ''] : [];
  const out = [
    `# Harness lessons: ${summary.total} shown`,
    '',
    ...section('Open, not yet verified', summary.open),
    ...section('Verified, not yet fixed', summary.verified),
    ...section('Concurrent verdicts to reconcile', summary.conflicts),
    `Closed: ${summary.fixed.length} fixed, ${summary.refuted.length} refuted, ${summary.wontfix.length} wontfix`,
  ];
  const recurring = summary.areas.filter(({ count }) => count > 1);
  if (recurring.length) out.push(`Recurring areas: ${recurring.slice(0, 5).map(({ area, count }) => `${area} ${count}`).join(', ')}`);
  if (summary.reviewDue) out.push(`Review due: ${summary.open.length} open lessons (threshold ${REVIEW_THRESHOLD}); run /harness-retro in review mode.`);
  return `${out.join('\n')}\n`;
}

const FLAGS = new Set(['json', 'check']);
const VALUES = new Set(['base', 'since', 'kind', 'status', 'area', 'id']);

export function main(argv, { root = process.cwd(), now = new Date(), log = console.log } = {}) {
  const args = {};
  for (const arg of argv.filter((value) => value !== '--')) {
    if (arg === '--help') { log('pnpm lessons [--json] [--since=<N>d|YYYY-MM-DD] [--kind=K] [--status=S] [--area=A] [--id=UUID]\npnpm lessons --check [--base=REF]\nWrite with pnpm record:new -- --kind=lesson | --kind=lesson-status (see /harness-retro).'); return 0; }
    const match = /^--([a-z]+)(?:=(.*))?$/.exec(arg);
    if (!match || !(FLAGS.has(match[1]) || VALUES.has(match[1])) || Object.hasOwn(args, match[1])) fail(`unknown or repeated argument: ${arg}`);
    if (FLAGS.has(match[1]) ? match[2] !== undefined : !match[2]) fail(`invalid argument form: ${arg}`);
    args[match[1]] = match[2] ?? true;
  }
  if (args.kind && !KINDS.includes(args.kind)) fail(`--kind must be one of ${KINDS.join(', ')}`);
  if (args.status && ![...STATUSES, 'needs_reconciliation'].includes(args.status)) fail(`--status must be one of ${STATUSES.join(', ')}, needs_reconciliation`);
  if (args.base && !args.check) fail('--base requires --check');
  const lessons = readLessons(root);
  if (args.check) {
    if (args.since || args.kind || args.status || args.area || args.id) fail('--check covers every lesson; drop the filters');
    // A check with nothing to read would report success about nothing.
    if (!lessons.length) fail(`no lesson records found under ${LESSON_DIR}`);
    const conflicts = lessons.filter((lesson) => lesson.state !== 'current');
    if (conflicts.length) fail(`reconcile concurrent verdicts before landing: ${conflicts.map((lesson) => lesson.id).join(', ')}`);
    checkImmutableLessons(root, args.base ?? 'origin/main');
    log(`[lessons] ${lessons.length} lessons fit the template; histories are consistent and published records are unchanged`);
    return 0;
  }
  if (args.id) {
    const lesson = lessons.find((item) => item.id === args.id || item.id.startsWith(args.id));
    if (!lesson) fail(`unknown lesson ${args.id}`);
    log(JSON.stringify(lesson, null, 2));
    return 0;
  }
  const selected = selectLessons(lessons, { ...args, now });
  const summary = summarize(selected);
  log(args.json ? JSON.stringify({ ...summary, lessons: selected }, null, 2) : renderLessons(summary));
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
