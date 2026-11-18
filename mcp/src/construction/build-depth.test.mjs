import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { collectSourceUnits } from '../analyze/source-units.mjs';
import {
  buildDepthFindings,
  competencyDepthRefusals,
  measureBuildDepth,
  repositorySurvey,
  saysOutlinedOnly,
} from './build-depth.mjs';
import { recordSourceEvidence, resetSessionReads, sessionReads } from './session-reads.mjs';

function repository(files) {
  const root = mkdtempSync(join(tmpdir(), 'atlas-build-depth-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

const lines = (count) => Array.from({ length: count }, (_, index) => `export const v${index} = ${index};`).join('\n') + '\n';
const doc = (slug, frontmatter, body = 'Defines it.\n\n## Uncertainty\n- None.\n') => ({
  slug, frontmatter: { kind: slug.includes('/') ? slug.split('/')[0].replace(/ies$/, 'y').replace(/s$/, '') : 'project', ...frontmatter }, body,
});
const OUTLINED = 'Defines it.\n\n## Uncertainty\n- Outlined only, body not read.\n';

/** A product with three plugins, a core library and a command entry point. */
function product() {
  return repository({
    'packages/core/src/release.ts': lines(320),
    'packages/core/src/semver.ts': lines(40),
    'packages/core/package.json': JSON.stringify({ name: 'core', main: 'src/release.ts' }),
    'packages/cli/src/bin/run.ts': "import { release } from '../../../core/src/release';\nexport function main() { release(); }\n",
    'packages/cli/package.json': JSON.stringify({ name: 'cli', bin: { tool: 'src/bin/run.ts' } }),
    'plugins/npm/src/index.ts': "import { release } from '../../../packages/core/src/release';\nexport class NpmPlugin { apply() { release(); } }\n",
    'plugins/slack/src/index.ts': "import { release } from '../../../packages/core/src/release';\nexport class SlackPlugin { apply() { release(); } }\n",
    'plugins/s3/src/index.ts': 'export class S3Plugin { apply() { return 1; } }\n',
    'package.json': JSON.stringify({ name: 'root', workspaces: ['packages/*', 'plugins/*'] }),
  });
}

/*
 * Breadth is placement against the survey, not lines under a path: a family node
 * that names its siblings places them, a reasoned exclusion places a unit, and a
 * unit nothing names is listed with its next call.
 */
test('every surveyed unit is under a node, named inside one, excluded with a reason, or listed', (t) => {
  const root = product();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = repositorySurvey(root, join(root, 'atlas'));
  const docs = [
    doc('project', {}, 'Ships releases.\n\n## Uncertainty\n- plugins/s3 is left out: it uploads files and decides nothing about a release.\n'),
    doc('capabilities/ship-a-release', { path: 'packages/core/src/release.ts' }),
    doc('capabilities/publish-packages', { path: 'plugins/npm/src/index.ts' }, 'Publishes.\n\n## Includes\n- npm and slack plugins.\n\n## Uncertainty\n- None.\n'),
  ];
  const depth = measureBuildDepth(docs, repo, null);
  const { breadth } = depth;
  assert.equal(breadth.units, repo.survey.units.length);
  const placed = breadth.node + breadth.named + breadth.excluded;
  assert.equal(placed + breadth.unplaced.length, breadth.units);
  assert.ok(breadth.named >= 1, 'the family node places its sibling by name');
  assert.ok(breadth.excluded >= 1, 'a reasoned exclusion places a unit');
  assert.deepEqual(breadth.unplaced.map((unit) => unit.path), ['packages/cli']);
  assert.match(depth.line, /Not placed: packages\/cli/);
  assert.match(depth.line, /add_concepts a node whose path is inside it/);
  const without = measureBuildDepth(docs.slice(0, 2), repo, null).breadth;
  assert.ok(without.unplaced.some((unit) => unit.path === 'plugins/npm'), 'without the family node the plugin is unplaced');
});

test('a must-have unit with no node is listed by name even when the line count is small', (t) => {
  const root = product();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = repositorySurvey(root, join(root, 'atlas'));
  const docs = [doc('project', {}), doc('capabilities/run-the-tool', { path: 'packages/cli/src/bin/run.ts' })];
  const { breadth } = measureBuildDepth(docs, repo, null);
  assert.ok(breadth.mustHaveWithoutNode.some((unit) => unit.path === 'packages/core'), JSON.stringify(breadth.mustHaveWithoutNode));
  assert.ok(breadth.mainUnplaced.some((file) => file.path === 'packages/core/src/release.ts'));
});

/*
 * Depth is the server's own record of what it served, matched to each capability's
 * path: an honest Uncertainty line about an unread helper is not counted as unread.
 */
test('reads come from the session record, not from what a body says', () => {
  resetSessionReads();
  const root = '/repo';
  recordSourceEvidence(root, { rows: [
    { status: 'read', path: 'src/billing/invoice.ts', actualRange: { startLine: 10, endLine: 40 }, symbol: 'issueInvoice' },
    { status: 'outlined', path: 'src/refunds/refund.ts' },
  ] });
  const docs = [
    doc('capabilities/issue-invoice', { path: 'src/billing/invoice.ts' }, 'Issues.\n\n## Uncertainty\n- The rounding helper was not read.\n'),
    doc('capabilities/refund', { path: 'src/refunds/refund.ts' }, 'Refunds. Cited: `src/refunds/refund.ts` `refundPayment`.\n\n## Uncertainty\n- None.\n'),
  ];
  const depth = measureBuildDepth(docs, null, sessionReads(root));
  assert.deepEqual(depth.reads.unread.map((row) => row.slug), ['capabilities/refund'], 'an outline is not a read; a named unread helper is not an unread entry');
  assert.match(depth.line, /"path":"src\/refunds\/refund\.ts","symbol":"refundPayment"/);
  assert.equal(measureBuildDepth(docs, null, new Map()).reads, null, 'a process that served nothing does not guess');
  resetSessionReads();
});

test('outlined only is read from the Uncertainty section alone', () => {
  assert.equal(saysOutlinedOnly(OUTLINED), true);
  assert.equal(saysOutlinedOnly('Marks a message unread for the reader.\n\n## Uncertainty\n- None.\n'), false);
});

test('a relation note about a node that says it was not read names the read and the rewrite call', () => {
  const docs = [
    doc('capabilities/send', { dependencies: ['elements/queue'], relation_notes: { 'elements/queue': 'Every message waits in the queue.' } }),
    doc('elements/queue', { path: 'src/queue.ts' }, 'Holds messages. Cited: src/queue.ts#Queue.push.\n\n## Uncertainty\n- Outlined only.\n'),
  ];
  const findings = buildDepthFindings(docs);
  assert.deepEqual(findings.map(({ slug, code }) => [slug, code]), [['capabilities/send', 'relation-note-on-unread']]);
  assert.match(findings[0].message, /"sourceReads":\[\{"path":"src\/queue\.ts","symbol":"Queue\.push"\}\]/);
  assert.match(findings[0].message, /replace_relation\(\{"from":"capabilities\/send","oldTo":"elements\/queue","oldType":"depends_on","newTo":"elements\/queue","newType":"depends_on"/);
  assert.equal(buildDepthFindings([docs[0], doc('elements/queue', {})]).length, 0);
});

test('a dependency both ways is one finding naming the direction rule', () => {
  const findings = buildDepthFindings([
    doc('elements/client', { depends_on: ['elements/stream'] }),
    doc('elements/stream', { depends_on: ['elements/client'] }),
  ]);
  assert.deepEqual(findings.map(({ code }) => code), ['dependency-both-ways']);
  assert.match(findings[0].message, /consumer to provider/);
});

test('an entry file with no code and a path shared by more than five nodes are flagged with a nearer file', (t) => {
  const root = repository({
    'pkg/transforms/__init__.py': '"""Intensity transforms."""\nfrom .blur import Blur\n__all__ = [\n    "Blur",\n]\n',
    'pkg/transforms/blur.py': 'class Blur:\n    def apply(self):\n        return 1\n',
    'src/auto.ts': lines(40),
    'src/load-plugins.ts': lines(20),
  });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const units = collectSourceUnits(root);
  const shared = Array.from({ length: 6 }, (_, index) => doc(`capabilities/c${index}`, { path: 'src/auto.ts' }));
  const findings = buildDepthFindings([doc('capabilities/blur', { path: 'pkg/transforms/__init__.py' }), ...shared], { repoRoot: root, collection: units });
  const empty = findings.find((finding) => finding.code === 'path-without-code');
  assert.equal(empty.slug, 'capabilities/blur');
  assert.match(empty.message, /pkg\/transforms\/blur\.py/);
  const sharedFindings = findings.filter((finding) => finding.code === 'path-shared');
  assert.equal(sharedFindings.length, 6);
  assert.match(sharedFindings[0].message, /src\/load-plugins\.ts/);
  assert.equal(buildDepthFindings(shared.slice(0, 5), { repoRoot: root, collection: units }).length, 0, 'five may share');
});

test('finalize refuses answered rows the map does not support, leading with the call that repairs it', () => {
  const questions = ['scope', 'domains', 'abilities', 'evidence', 'impact'].map((id) => ({ id, status: 'answered' }));
  const unread = [
    { slug: 'capabilities/a', path: 'src/a.ts', symbol: 'runA' },
    { slug: 'capabilities/b', path: 'src/b.ts', symbol: null },
    { slug: 'capabilities/c', path: 'src/c.ts', symbol: 'runC' },
  ];
  const depth = {
    capabilities: 6,
    dependsOn: 2,
    reads: { capabilities: 6, read: 3, unread },
    breadth: {
      units: 4, node: 2, named: 0, excluded: 0,
      unplaced: [{ path: 'src/refunds', lines: 10 }],
      mustHaveWithoutNode: [{ path: 'src/refunds', lines: 10 }],
      entryUnplaced: [], mainUnplaced: [],
    },
  };
  const reasons = competencyDepthRefusals(questions, depth);
  assert.deepEqual(reasons.map((reason) => reason.split(':')[0]), ['- evidence', '- domains', '- abilities', '- impact']);
  assert.match(reasons[0], /Next call: analyze_repo_structure\(\{"sourceOnly":true,"sourceReads":\[\{"path":"src\/a\.ts","symbol":"runA"\},\{"path":"src\/b\.ts","startLine":1,"maxLines":200\}/);
  assert.ok(reasons[0].indexOf('Next call') < reasons[0].indexOf('partial'), 'reading comes before the partial fallback');
  assert.match(reasons[1], /src\/refunds/);
  assert.match(reasons[3], /add_relations/);
  const held = competencyDepthRefusals(questions, {
    capabilities: 6, dependsOn: 3,
    reads: { capabilities: 6, read: 4, unread: unread.slice(0, 2) },
    breadth: { ...depth.breadth, unplaced: [], mustHaveWithoutNode: [] },
  });
  assert.deepEqual(held, []);
  assert.deepEqual(competencyDepthRefusals(questions.map((row) => ({ ...row, status: 'partial' })), depth), []);
  const unmeasured = competencyDepthRefusals([{ id: 'evidence', status: 'answered' }], { ...depth, reads: null });
  assert.deepEqual(unmeasured, [], 'a server that served no reads does not refuse on reads it cannot see');
});
