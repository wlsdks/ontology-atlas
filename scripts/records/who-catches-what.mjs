#!/usr/bin/env node
/**
 * `pnpm who-catches-what`: acceptance criteria 2 and 3 of
 * `docs/specs/2026-11-27-when-people-cannot-keep-up.md`. For each `fix` change in the spec's
 * window, whether it corrected lines an earlier change wrote and what caught the fault, by the
 * sealed rule in `scripts/records/who-catches-what-rule.md`; then the evidence state of every
 * concept in today's vault. Reads Git, `gh` and the vault; writes nothing.
 */

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import { callMcpTool } from '../../mcp/scripts/call-tool.mjs';
import {
  blameLineCounts,
  bodyBeforeTestPlan,
  changeKind,
  changeLabel,
  classifyCatch,
  conceptStatesFromVerdictCounts,
  correctedLineTier,
  introducingCommit,
  isFixSubject,
  isScriptComment,
  parseZeroContextDiff,
  pullRequestNumberOf,
  quantile,
  seededSample,
} from '../lib/records/who-catches-what.mjs';

const WINDOW_END = 'bf6670e469';
const WINDOW_SIZE = 200;
const SAMPLE_SIZE = 20;
const SAMPLE_SEED = 20261127;
const OWNER = 'wlsdks';
const VAULT = 'docs/ontology';
const STABLE_RELEASE_TAG = /^v\d+\.\d+\.\d+$/;
const HOUR_S = 3600;
const DAY_S = 24 * HOUR_S;
const NOT_LOOKED_AT_LIMIT = 1 / 5;

const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

function git(args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 1 << 30 });
}

function gh(args) {
  return JSON.parse(execFileSync('gh', args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 1 << 28 }));
}

function readFirstParentChanges(end, count) {
  const out = git(['log', '--first-parent', `-${count}`, '--format=%H%x09%P%x09%ct%x09%s', end]);
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, parents, time, ...subject] = line.split('\t');
      const text = subject.join('\t');
      return { sha, parents: parents.split(' '), time: Number(time), subject: text, pullRequest: pullRequestNumberOf(text) };
    });
}

const commitCache = new Map();
function commitOf(sha) {
  if (!commitCache.has(sha)) {
    const [time, ...subject] = git(['show', '-s', '--format=%ct%x09%s', sha]).trim().split('\t');
    commitCache.set(sha, { sha, time: Number(time), subject: subject.join('\t'), pullRequest: pullRequestNumberOf(subject.join('\t')) });
  }
  return commitCache.get(sha);
}

function stableReleaseTimes() {
  return git(['for-each-ref', 'refs/tags', '--format=%(refname:short)%09%(creatordate:unix)'])
    .split('\n')
    .map((line) => line.split('\t'))
    .filter(([name]) => STABLE_RELEASE_TAG.test(name ?? ''))
    .map(([, time]) => Number(time));
}

function checksConclusionOnMain() {
  const runs = gh(['run', 'list', '--workflow', 'Checks', '--branch', 'main', '--event', 'push', '--limit', '1000', '--json', 'headSha,conclusion']);
  const bySha = new Map();
  for (const run of runs) if (!bySha.has(run.headSha)) bySha.set(run.headSha, run.conclusion);
  return bySha;
}

function changedFiles(fromSha, toSha) {
  return new Set(git(['diff', '--name-only', '-M', fromSha, toSha]).split('\n').filter(Boolean));
}

function traceLateFind(fix) {
  const parent = fix.parents[0];
  const files = parseZeroContextDiff(git(['diff', '-U0', '-M', '--no-color', '--no-ext-diff', parent, fix.sha]));
  const { tier, requests } = correctedLineTier(files);
  const counts = new Map();
  for (const { path, ranges } of requests) {
    const lineRanges = ranges.flatMap(([start, count]) => ['-L', `${start},+${count}`]);
    let porcelain = '';
    try {
      porcelain = git(['blame', '-w', '--first-parent', '--porcelain', ...lineRanges, parent, '--', path]);
    } catch {
      continue;
    }
    for (const [sha, lines] of blameLineCounts(porcelain)) counts.set(sha, (counts.get(sha) ?? 0) + lines);
  }
  const best = introducingCommit(counts, (sha) => commitOf(sha).time);
  return { tier: best ? tier : null, introducing: best ? commitOf(best.sha) : null, files };
}

function readEvidence(fix) {
  const view = gh(['pr', 'view', String(fix.pullRequest), '--json', 'body,comments,reviews,closingIssuesReferences']);
  const oldest = fix.parents.length > 1
    ? git(['rev-list', '--reverse', `${fix.parents[0]}..${fix.parents[1]}`]).split('\n').filter(Boolean)[0] ?? fix.sha
    : fix.sha;
  const issues = (view.closingIssuesReferences ?? []).map((reference) => {
    const issue = gh(['issue', 'view', String(reference.number), '--json', 'author,title,body']);
    return { author: issue.author?.login ?? null, text: `${issue.title}\n${issue.body ?? ''}` };
  });
  const texts = [
    bodyBeforeTestPlan(view.body),
    git(['show', '-s', '--format=%b', oldest]),
    ...(view.comments ?? []).map((comment) => comment.body).filter((body) => !isScriptComment(body)),
    ...(view.reviews ?? []).map((review) => review.body).filter((body) => body && !isScriptComment(body)),
    ...issues.map((issue) => issue.text),
  ].filter(Boolean);
  return { texts, issues };
}

function formatAge(seconds) {
  if (seconds == null) return '-';
  if (seconds < DAY_S) return `${(seconds / HOUR_S).toFixed(1)} h`;
  return `${(seconds / DAY_S).toFixed(1)} d`;
}

function percent(part, whole) {
  return whole === 0 ? '-' : `${Math.round((100 * part) / whole)}%`;
}

function classifyFixes() {
  const window = readFirstParentChanges(WINDOW_END, WINDOW_SIZE);
  const inWindow = new Set(window.map((change) => change.sha));
  const history = readFirstParentChanges(WINDOW_END, 5000);
  const changeByPullRequest = new Map(history.filter((change) => change.pullRequest).map((change) => [change.pullRequest, change]));
  const releases = stableReleaseTimes();
  const checks = checksConclusionOnMain();
  const fixes = window.filter((change) => isFixSubject(change.subject)).reverse();

  return fixes.map((fix) => {
    const { tier, introducing, files } = traceLateFind(fix);
    const fixFiles = new Set(files.flatMap((file) => [file.oldPath, file.newPath]).filter(Boolean));
    const sharesFilesWithPullRequest = (number) => {
      const other = changeByPullRequest.get(number);
      if (!other || other.sha === fix.sha) return false;
      return [...changedFiles(other.parents[0], other.sha)].some((path) => fixFiles.has(path));
    };
    const { texts, issues } = fix.pullRequest ? readEvidence(fix) : { texts: [git(['show', '-s', '--format=%b', fix.sha])], issues: [] };
    const mainRedThenGreen = checks.get(fix.parents[0]) === 'failure' && checks.get(fix.sha) === 'success';
    const caught = classifyCatch({ texts, issues, mainRedThenGreen, owner: OWNER, sharesFilesWithPullRequest });
    const ageSeconds = introducing ? fix.time - introducing.time : null;
    return {
      fix,
      tier,
      introducing,
      ageSeconds,
      introducedInWindow: introducing ? inWindow.has(introducing.sha) : null,
      releasedBetween: introducing ? releases.some((time) => time > introducing.time && time < fix.time) : null,
      ...caught,
    };
  });
}

function lateFindLabel(row) {
  if (!row.tier) return 'not traced';
  return row.tier === 'insertion point' ? 'yes, by insertion point' : `yes (${row.tier})`;
}

function printFixTable(rows) {
  console.log(`## Who catches what: ${rows.length} fix changes in the ${WINDOW_SIZE} first-parent changes ending at ${WINDOW_END}\n`);
  console.log('Rule: scripts/records/who-catches-what-rule.md\n');
  console.log('| Fix | Late find | Introduced by | Its kind | Age | In window | Release between | Caught by | Evidence |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const row of rows) {
    const introducedBy = row.introducing ? changeLabel(row.introducing) : '-';
    const kind = row.introducing ? (changeKind(row.introducing.subject) ?? '-') : '-';
    const yesNo = (value) => (value == null ? '-' : value ? 'yes' : 'no');
    const quote = row.quote ? row.quote.replace(/\|/g, '/').slice(0, 110) : '';
    console.log(`| ${changeLabel(row.fix)} | ${lateFindLabel(row)} | ${introducedBy} | ${kind} | ${formatAge(row.ageSeconds)} | ${yesNo(row.introducedInWindow)} | ${yesNo(row.releasedBetween)} | ${row.caughtBy} | ${quote} |`);
  }
}

function printFixSummary(rows) {
  const total = rows.length;
  console.log('\n### Caught by\n');
  for (const name of ['gate', 'agent', 'person', 'user', 'luck', 'unknown']) {
    const count = rows.filter((row) => row.caughtBy === name).length;
    console.log(`- ${name}: ${count} of ${total} (${percent(count, total)})`);
  }
  const traced = rows.filter((row) => row.tier && row.tier !== 'insertion point');
  const byInsertion = rows.filter((row) => row.tier === 'insertion point');
  console.log('\n### Late finds\n');
  console.log(`- corrected removed lines an earlier change wrote: ${traced.length} of ${total} (${percent(traced.length, total)})`);
  console.log(`- only by the line above an insertion: ${byInsertion.length}; not traced: ${total - traced.length - byInsertion.length}`);
  const ages = traced.map((row) => row.ageSeconds).sort((a, b) => a - b);
  const quartiles = [0.25, 0.5, 0.75].map((fraction) => formatAge(quantile(ages, fraction)));
  console.log(`- age, removed-line late finds: quarter ${quartiles[0]}, median ${quartiles[1]}, three quarters ${quartiles[2]}, oldest ${formatAge(ages.at(-1))}`);
  const buckets = [
    ['under 1 hour', 0, HOUR_S],
    ['1 hour to 1 day', HOUR_S, DAY_S],
    ['1 to 7 days', DAY_S, 7 * DAY_S],
    ['7 to 30 days', 7 * DAY_S, 30 * DAY_S],
    ['30 days or more', 30 * DAY_S, Infinity],
  ];
  for (const [label, low, high] of buckets) {
    console.log(`  - ${label}: ${ages.filter((age) => age >= low && age < high).length}`);
  }
  const moves = traced.filter((row) => ['refactor', 'chore'].includes(changeKind(row.introducing.subject))).length;
  console.log(`- introducing change is a refactor or chore (moves, splits, release preparation, where blame stops at the move): ${moves} of ${traced.length}`);
  console.log(`- introduced inside the window: ${traced.filter((row) => row.introducedInWindow).length} of ${traced.length}`);
  console.log(`- a stable release was tagged between the two: ${traced.filter((row) => row.releasedBetween).length} of ${traced.length}`);
  const outside = traced.filter((row) => row.caughtBy === 'luck' || row.caughtBy === 'user' || row.releasedBetween).length;
  console.log(`- caught by luck or a user, or after a release (experiment 0's kill line is one third): ${outside} of ${traced.length} (${percent(outside, traced.length)})`);
}

function printSample(rows) {
  const sample = seededSample(rows, SAMPLE_SIZE, SAMPLE_SEED);
  console.log(`\n### Hand-check sample (seed ${SAMPLE_SEED})\n`);
  console.log(sample.map((row) => changeLabel(row.fix)).join(' '));
}

async function printConceptStates() {
  const { evidenceDrift } = await callMcpTool(resolve(repoRoot, VAULT), 'validate_vault', {}, { repoRoot });
  console.log(`\n## The noise count: ${VAULT} at ${git(['rev-parse', '--short', 'HEAD']).trim()}\n`);
  if (!evidenceDrift.checked) {
    console.log(`Not measured: ${evidenceDrift.reason}. Every concept is unknown, none checked.`);
    return;
  }
  const { counts } = evidenceDrift;
  const states = conceptStatesFromVerdictCounts(counts);
  console.log(`Evidence verdicts (validate_vault): current ${counts.current}, stale ${counts.stale}, missing ${counts.missing}, unknown ${counts.unknown} (folder only ${counts.folderOnly})\n`);
  console.log(`- checked (document newer than its code, or only comments, imports or whitespace changed since): ${states.checked} of ${states.total} (${percent(states.checked, states.total)})`);
  console.log(`- stale (cited code changed after the document, or is gone): ${states.stale} of ${states.total} (${percent(states.stale, states.total)})`);
  console.log(`- could not be dated: ${states.notDated} of ${states.total} (${percent(states.notDated, states.total)})`);
  for (const [label, count] of [['stale', states.stale], ['could not be dated', states.notDated]]) {
    const over = states.total > 0 && count / states.total > NOT_LOOKED_AT_LIMIT;
    console.log(`- read as "not looked at" = ${label}: ${over ? 'over' : 'within'} the one-in-five limit`);
  }
}

const rows = classifyFixes();
printFixTable(rows);
printFixSummary(rows);
printSample(rows);
await printConceptStates();
