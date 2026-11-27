/**
 * The sealed rule of `scripts/records/who-catches-what-rule.md`, as pure functions: which
 * changes are fixes, which lines a fix corrected, which change wrote them, and what caught the
 * fault. The rule file is the authority; a pattern here that differs from it is a bug here.
 */

const PULL_REQUEST_NUMBER = /^Merge #(\d+):|\(#(\d+)\)\s*$/;
const MERGE_PREFIX = /^Merge #\d+:\s*/;

export function pullRequestNumberOf(subject) {
  const match = PULL_REQUEST_NUMBER.exec(subject);
  return match ? Number(match[1] ?? match[2]) : null;
}

export function isFixSubject(subject) {
  return /^fix[:(]/.test(subject.replace(MERGE_PREFIX, ''));
}

/** How a table names a change: its pull requests (a landing train merges several), else its short SHA. */
export function changeLabel({ sha, subject }) {
  const train = /^Merge ((?:#\d+ ?)+):/.exec(subject);
  if (train) return train[1].trim();
  const number = pullRequestNumberOf(subject);
  return number ? `#${number}` : sha.slice(0, 10);
}

/** The conventional prefix of a change's subject (`refactor`, `chore`, ...), or null. */
export function changeKind(subject) {
  const kind = /^([a-z]+)[:(!]/.exec(subject.replace(/^Merge (?:#\d+ ?)+:\s*/, ''));
  return kind ? kind[1] : null;
}

const NEVER_COUNTED = [
  /^src\/entities\/docs-vault\/data\//,
  /^public\/docs-vault\//,
  /^docs\/\.generated\//,
  /^docs\/records\//,
  /(^|\/)(pnpm-lock\.yaml|Cargo\.lock|package-lock\.json)$/,
];

function isNeverCounted(path) {
  return NEVER_COUNTED.some((pattern) => pattern.test(path));
}

function isTestOrDocument(path) {
  const name = path.split('/').pop();
  return (
    /^(tests|e2e)\//.test(path) ||
    /\.test\.|\.spec\.|_test\./.test(name) ||
    name.endsWith('.md') ||
    path.startsWith('docs/')
  );
}

/**
 * Per file of a `git diff -U0 -M` text: the old path, the removed old-line ranges, and the
 * old line each pure insertion sits below (0, at the top of a file, has no line above it).
 *
 * @returns {{ oldPath: string|null, newPath: string|null, removed: [number, number][], insertedBelow: number[] }[]}
 */
export function parseZeroContextDiff(text) {
  const files = [];
  let file = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) {
      file = { oldPath: null, newPath: null, removed: [], insertedBelow: [] };
      files.push(file);
    } else if (file && line.startsWith('--- ')) {
      file.oldPath = line === '--- /dev/null' ? null : line.slice(6);
    } else if (file && line.startsWith('+++ ')) {
      file.newPath = line === '+++ /dev/null' ? null : line.slice(6);
    } else if (file && line.startsWith('@@ ')) {
      const hunk = /^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/.exec(line);
      if (!hunk) continue;
      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      if (count > 0) file.removed.push([start, count]);
      else if (start > 0) file.insertedBelow.push(start);
    }
  }
  return files.filter((entry) => entry.oldPath && !isNeverCounted(entry.oldPath));
}

/**
 * The first non-empty tier of corrected lines, as blame requests of `[start, count]` ranges per
 * old path: removed code lines, then removed test or document lines, then insertion points.
 */
export function correctedLineTier(files) {
  const removedIn = (keep) =>
    files.filter((file) => file.removed.length > 0 && keep(file.oldPath)).map((file) => ({ path: file.oldPath, ranges: file.removed }));
  const code = removedIn((path) => !isTestOrDocument(path));
  if (code.length > 0) return { tier: 'code', requests: code };
  const rest = removedIn(isTestOrDocument);
  if (rest.length > 0) return { tier: 'tests or documents', requests: rest };
  const insertedIn = (keep) =>
    files
      .filter((file) => file.insertedBelow.length > 0 && keep(file.oldPath))
      .map((file) => ({ path: file.oldPath, ranges: file.insertedBelow.map((line) => [line, 1]) }));
  const anchors = insertedIn((path) => !isTestOrDocument(path));
  if (anchors.length > 0) return { tier: 'insertion point', requests: anchors };
  const otherAnchors = insertedIn(isTestOrDocument);
  if (otherAnchors.length > 0) return { tier: 'insertion point', requests: otherAnchors };
  return { tier: null, requests: [] };
}

/** Line counts per commit from `git blame --porcelain`: every blamed line has one header line. */
export function blameLineCounts(porcelain) {
  const counts = new Map();
  for (const line of porcelain.split('\n')) {
    const header = /^([0-9a-f]{40}) \d+ \d+(?: \d+)?$/.exec(line);
    if (header) counts.set(header[1], (counts.get(header[1]) ?? 0) + 1);
  }
  return counts;
}

/** The commit that wrote the most corrected lines; a tie goes to the most recent. */
export function introducingCommit(counts, commitTimeOf) {
  let best = null;
  for (const [sha, lines] of counts) {
    if (!best || lines > best.lines || (lines === best.lines && commitTimeOf(sha) > commitTimeOf(best.sha))) {
      best = { sha, lines };
    }
  }
  return best;
}

const TEST_PLAN_HEADING = /^#{1,6}\s*(test plan|testing|verification|checks)\b/im;

export function bodyBeforeTestPlan(body) {
  const text = body ?? '';
  const heading = TEST_PLAN_HEADING.exec(text);
  return heading ? text.slice(0, heading.index) : text;
}

export function isScriptComment(body) {
  return (body ?? '').trimStart().startsWith('<!--');
}

const words = (list) => `(?:${list.join('|')})`;
const CHECK = words(['CI', 'Checks', 'check', 'checks', 'gate', 'gates', 'pre-push', 'pre-commit', 'hook', 'hooks', 'lint', 'eslint', 'typecheck', 'tsc', 'test', 'tests', 'contract', 'contracts', 'lane', 'lanes', 'job', 'jobs', 'workflow', 'build', 'e2e', 'clippy', 'spec', 'specs']);
const FAILURE = words(['failed', 'fails', 'failing', 'failure', 'went red', 'turned red', 'is red', 'was red', 'broke', 'broken', 'breaks', 'caught', 'flagged', 'refused', 'rejected', 'blocked', 'tripped', 'timed out']);
const NEW_TEST_DESCRIBED = /^\s*(without|before|on the old|against the old|if)\b/i;
const LOOKING = words(['review', 'reviews', 'reviewed', 'reviewer', 'reviewers', 'code-reviewer', 'audit', 'audits', 'audited', 'QA', 'dogfood', 'dogfooding', 'field trial', 'field-trial', 'probe', 'probes', 'sweep', 'inspection', 'inspected', 'walk', 'walkthrough', 'census', 'survey', 'measured', 'measurement', 'measuring']);
const FINDING = words(['found', 'finds', 'caught', 'flagged', 'noticed', 'surfaced', 'spotted', 'reported', 'showed', 'finding', 'findings', 'turned up', 'revealed']);
const FINDING_BEFORE_LOOKING = words(['found', 'caught', 'flagged', 'noticed', 'surfaced', 'spotted', 'revealed']);
const OWNER_ACTION = words(['reported', 'report', 'noticed', 'found', 'saw', 'asked', 'flagged', 'pointed out', 'spotted', 'caught', 'showed', 'sent', 'screenshot', 'complained', 'said', 'wrote', 'observed', 'hit', 'ran into']);

const USER_PATTERNS = [
  /\b(a|an|one|outside|external) (user|tester|contributor|customer)s? (reported|reports|hit|hits|ran into|saw|filed|opened)\b/i,
  /\b(user|bug|outside|external) report\b/i,
  /\breported (by|from) (a|an) (user|tester|contributor)\b/i,
];
const PERSON_PATTERNS = [
  new RegExp(`\\bowner(?:'s)?\\b[^.\\n]{0,80}?\\b${OWNER_ACTION}\\b`, 'i'),
  /\b(reported|noticed|found|flagged|spotted|asked) by the owner\b/i,
  /translated from Korean/i,
];
const GATE_CHECK_FIRST = new RegExp(`\\b${CHECK}\\b[^.\\n]{0,60}?\\b(${FAILURE})\\b`, 'gi');
const GATE_FAILURE_FIRST = new RegExp(`\\b(${FAILURE})\\b[^.\\n]{0,30}?\\b${CHECK}\\b`, 'gi');
const AGENT_PATTERNS = [
  new RegExp(`\\b${LOOKING}\\b[^.\\n]{0,60}?\\b${FINDING}\\b`, 'i'),
  new RegExp(`\\b${FINDING_BEFORE_LOOKING}\\b[^.\\n]{0,40}?\\b(?:in|during|by|from)\\s+(?:(?:a|an|the)\\s+)?(?:(?:independent|security|code)\\s+)?${LOOKING}\\b`, 'i'),
];
const LUCK_PATTERNS = [
  /\b(?:found|noticed|spotted|discovered|came across|turned up|saw)\b[^.\n]{0,40}?\b(?:while|during|in passing|along the way)\b/i,
  /\b(?:incidentally|by chance|happened to|in passing|along the way|by accident)\b/i,
];

const QUOTE_RADIUS = 50;

function quoteAround(text, index, length) {
  const start = Math.max(0, index - QUOTE_RADIUS);
  const end = Math.min(text.length, index + length + QUOTE_RADIUS);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

function firstMatch(texts, patterns) {
  for (const text of texts) {
    for (const pattern of patterns) {
      const match = pattern.exec(text);
      if (match) return { text, index: match.index, length: match[0].length };
    }
  }
  return null;
}

function gateTextMatch(texts) {
  for (const text of texts) {
    for (const [pattern, failureFirst] of [[GATE_CHECK_FIRST, false], [GATE_FAILURE_FIRST, true]]) {
      for (const match of text.matchAll(pattern)) {
        const failureEnd = match.index + (failureFirst ? match[1].length : match[0].length);
        const after = text.slice(failureEnd, failureEnd + 25);
        if (!NEW_TEST_DESCRIBED.test(after)) return { text, index: match.index, length: match[0].length };
      }
    }
  }
  return null;
}

/** The sentence around a match: no `.` or line break inside it. */
function sentenceAround(text, index, length) {
  const before = text.slice(0, index);
  const start = Math.max(before.lastIndexOf('.'), before.lastIndexOf('\n')) + 1;
  const rest = text.slice(index + length);
  const stop = rest.search(/[.\n]/);
  return text.slice(start, stop === -1 ? text.length : index + length + stop);
}

/**
 * What caught a fix, from its evidence. `sharesFilesWithPullRequest(n)` says whether pull
 * request `n`'s change touched a file the fix touched; it turns a luck sentence into agent.
 *
 * @param {{ texts: string[], issues: {author: string|null}[], mainRedThenGreen: boolean, owner: string, sharesFilesWithPullRequest: (n: number) => boolean }} evidence
 * @returns {{ caughtBy: 'user'|'person'|'gate'|'agent'|'luck'|'unknown', quote: string|null }}
 */
export function classifyCatch({ texts, issues, mainRedThenGreen, owner, sharesFilesWithPullRequest }) {
  const quoted = (caughtBy, match) => ({ caughtBy, quote: match ? quoteAround(match.text, match.index, match.length) : null });
  const outsideIssue = issues.find((issue) => issue.author && issue.author !== owner);
  if (outsideIssue) return { caughtBy: 'user', quote: `closed issue by ${outsideIssue.author}` };
  const user = firstMatch(texts, USER_PATTERNS);
  if (user) return quoted('user', user);
  const person = firstMatch(texts, PERSON_PATTERNS);
  if (person) return quoted('person', person);
  const gate = gateTextMatch(texts);
  if (gate) return quoted('gate', gate);
  if (mainRedThenGreen) return { caughtBy: 'gate', quote: 'main: Checks red on the parent, green on the fix' };
  const agent = firstMatch(texts, AGENT_PATTERNS);
  if (agent) return quoted('agent', agent);
  const luck = firstMatch(texts, LUCK_PATTERNS);
  if (luck) {
    const sentence = sentenceAround(luck.text, luck.index, luck.length);
    const named = [...sentence.matchAll(/#(\d+)/g)].map((match) => Number(match[1]));
    return quoted(named.some(sharesFilesWithPullRequest) ? 'agent' : 'luck', luck);
  }
  return { caughtBy: 'unknown', quote: null };
}

/** mulberry32: a 32-bit seeded generator, so the hand-checked sample is the same on every run. */
function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates over a copy, then the first `size`. */
export function seededSample(items, size, seed) {
  const random = seededRandom(seed);
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, size);
}

/** Nearest-rank quantile of sorted numbers. */
export function quantile(sorted, fraction) {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1))];
}

/**
 * The spec's states from the four evidence verdicts of `mcp/src/drift/evidence-verdict.mjs`:
 * `current` is checked, `stale` and `missing` (the cited file is gone) are stale, `unknown`
 * could not be dated.
 */
export function conceptStatesFromVerdictCounts({ current = 0, stale = 0, missing = 0, unknown = 0 }) {
  return { checked: current, stale: stale + missing, notDated: unknown, total: current + stale + missing + unknown };
}
