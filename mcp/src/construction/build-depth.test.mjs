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

/** A command whose dispatcher routes three operations, each in its own file. */
function product() {
  return repository({
    'package.json': JSON.stringify({ name: 'tool', bin: { tool: 'src/cli.ts' } }),
    'src/cli.ts': [
      "import { ship } from './ship';",
      "import { canary } from './canary';",
      "import { whisper } from './whisper';",
      'export function run(command: string) {',
      '  switch (command) {',
      '    case "ship":',
      '      ship();',
      '      break;',
      '    case "canary":',
      '      canary();',
      '      break;',
      '    case "whisper":',
      '      whisper();',
      '      break;',
      '  }',
      '}',
      '',
    ].join('\n'),
    'src/ship.ts': 'export function ship(tagged = false) {\n  if (!tagged) return;\n  publish();\n}\nfunction publish() {\n  return 1;\n}\n',
    'src/canary.ts': 'export function canary() {\n  return 2;\n}\n',
    'src/whisper.ts': 'export function whisper() {\n  return 3;\n}\n',
  });
}

/*
 * Breadth counts abilities, not folders: an operation inside a file some node
 * already covers is still listed by name when no capability or element names it,
 * and a word in a domain sentence does not place it.
 */
test('every surveyed ability has a node, is named inside one, is excluded with a reason, or is listed', (t) => {
  const root = product();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = repositorySurvey(root, join(root, 'atlas'));
  assert.deepEqual(repo.survey.abilities.map((row) => `${row.kind} ${row.name}`), ['command tool', 'operation ship', 'operation canary', 'operation whisper']);
  const docs = [
    doc('project', {}, 'Ships releases.\n\n## Uncertainty\n- The tool command is only the launcher for the operations below.\n'),
    doc('domains/release', {}, 'Releases, canaries and whisper messages.\n'),
    doc('capabilities/ship-a-release', { path: 'src/cli.ts' }, 'Ships a release with `ship`.\n'),
    doc('capabilities/publish', { path: 'src/ship.ts' }, 'Publishes.\n\n## Includes\n- Canary builds too.\n'),
  ];
  const depth = measureBuildDepth(docs, repo, null);
  const { breadth } = depth;
  assert.deepEqual([breadth.abilities, breadth.node, breadth.named, breadth.excluded], [4, 1, 1, 1]);
  assert.deepEqual(breadth.unplaced.map((row) => row.name), ['whisper'], 'a domain sentence does not place an ability');
  assert.match(depth.line, /Not placed: whisper \(operation, src\/cli\.ts\)/);
  assert.match(depth.line, /add_concepts a capability for it/);
});

/*
 * A rule a body states is checked against the lines this session served: the
 * cite must fall inside a served range and hold a condition. Without reads (the
 * CLI), only the cited lines are checked.
 */
test('a stated rule needs a cite of read lines that hold its condition', (t) => {
  const root = product();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  resetSessionReads();
  recordSourceEvidence(root, { rows: [{ status: 'read', path: 'src/ship.ts', actualRange: { startLine: 1, endLine: 4 }, symbol: 'ship' }] });
  const reads = sessionReads(root);
  const cited = doc('capabilities/ship', { path: 'src/ship.ts' }, 'Ships a release.\n\nShips only when tagged (`src/ship.ts:L1-L2`).\n\n## Uncertainty\n- None.\n');
  const unserved = doc('capabilities/publish', { path: 'src/ship.ts' }, 'Publishes.\n\nPublishes only after ship (src/ship.ts L5-L7).\n\n## Uncertainty\n- None.\n');
  const bare = doc('capabilities/canary', { path: 'src/canary.ts' }, 'Ships a canary.\n\nRuns only on a pull request, `src/canary.ts` `canary`.\n\n## Uncertainty\n- None.\n');
  const plain = doc('capabilities/whisper', { path: 'src/whisper.ts' }, 'Sends a whisper.\n\n## Uncertainty\n- None.\n');
  const repo = repositorySurvey(root, join(root, 'atlas'));
  const depth = measureBuildDepth([cited, unserved, bare, plain], repo, reads);
  assert.deepEqual(depth.rules.uncited.map((row) => row.slug), ['capabilities/publish', 'capabilities/canary'], 'a definition alone states no rule');
  assert.match(depth.line, /Rules: 2 of 4 capabilities state a rule without citing read lines/);
  assert.match(depth.line, /"path":"src\/canary\.ts","symbol":"canary"\}\]\}\), then patch_concept each rule with the cite/);
  const findings = buildDepthFindings([cited, unserved, bare, plain], { repoRoot: root, reads }).filter((row) => row.code === 'rule-without-read-lines');
  assert.deepEqual(findings.map((row) => row.slug), ['capabilities/publish', 'capabilities/canary']);
  const offline = buildDepthFindings([cited, unserved], { repoRoot: root }).filter((row) => row.code === 'rule-without-read-lines');
  assert.deepEqual(offline.map((row) => row.slug), ['capabilities/publish'], 'without reads the cited lines must still hold a condition');
  resetSessionReads();
});

/*
 * Impact needs conditions between abilities, not only edges into shared roles.
 */
const edgeDocs = [
  doc('capabilities/presence', { depends_on: ['capabilities/subscribe', 'elements/broker'] }),
  doc('capabilities/subscribe', { depends_on: ['elements/broker'] }),
  doc('capabilities/whisper', { depends_on: ['elements/broker'] }),
  doc('elements/broker', {}),
];

test('capabilities no ability-to-ability edge touches are listed with the question to ask', (t) => {
  const root = product();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const depth = measureBuildDepth(edgeDocs, repositorySurvey(root, join(root, 'atlas')), null);
  assert.deepEqual(depth.abilityEdges, { edges: 1, alone: ['capabilities/whisper'] });
  assert.match(depth.line, /none touch capabilities\/whisper\. For each, ask which other ability must have run, be configured or be present first/);
  assert.doesNotMatch(measureBuildDepth(edgeDocs, null, null).line ?? '', /capabilities\/whisper/, 'without a grounded repository the line names no slug');
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

/*
 * With this session's reads the check asks the record, not the wording: a node
 * whose file was served passes whatever its Uncertainty says, and one whose file
 * never was is flagged even when its body claims nothing.
 */
test('with session reads a relation note is judged by what was served', () => {
  resetSessionReads();
  recordSourceEvidence('/repo', { rows: [{ status: 'read', path: 'src/queue.ts', actualRange: { startLine: 1, endLine: 9 }, symbol: 'Queue.push' }] });
  const reads = sessionReads('/repo');
  const docs = [
    doc('capabilities/send', { path: 'src/send.ts', dependencies: ['elements/queue'], relation_notes: { 'elements/queue': 'Every message waits in the queue.' } }, 'Sends.\n\n## Uncertainty\n- None.\n'),
    doc('elements/queue', { path: 'src/queue.ts' }, 'Holds messages.\n\n## Uncertainty\n- Outlined only.\n'),
  ];
  const findings = buildDepthFindings(docs, { reads }).filter((row) => row.code === 'relation-note-on-unread');
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /but capabilities\/send was never read this session/);
  resetSessionReads();
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
    rules: { capabilities: 6, judgedAgainstReads: true, uncited: [{ slug: 'capabilities/d', path: 'src/d.ts', symbol: 'runD', cited: false }] },
    abilityEdges: { edges: 0, alone: ['capabilities/a'] },
    breadth: { abilities: 4, node: 2, named: 1, excluded: 0, unplaced: [{ kind: 'operation', name: 'whisper', path: 'src/cli.ts', symbol: 'whisper' }] },
  };
  const reasons = competencyDepthRefusals(questions, depth);
  assert.deepEqual(reasons.map((reason) => reason.split(':')[0]), ['- evidence', '- evidence', '- abilities', '- impact']);
  assert.match(reasons[0], /Next call: analyze_repo_structure\(\{"sourceOnly":true,"sourceReads":\[\{"path":"src\/a\.ts","symbol":"runA"\},\{"path":"src\/b\.ts","startLine":1,"maxLines":200\}/);
  assert.ok(reasons[0].indexOf('Next call') < reasons[0].indexOf('partial'), 'reading comes before the partial fallback');
  assert.match(reasons[1], /state a rule without citing read lines.*Next call: analyze_repo_structure\(\{"sourceOnly":true,"sourceReads":\[\{"path":"src\/d\.ts","symbol":"runD"\}\]\}\), then patch_concept/);
  assert.match(reasons[2], /whisper \(operation, src\/cli\.ts\)/);
  assert.match(reasons[3], /add_relations/);
  const edgesOnly = competencyDepthRefusals([{ id: 'impact', status: 'answered' }], { ...depth, dependsOn: 6 });
  assert.match(edgesOnly[0], /0 depends_on edges run from one capability to another for 6 capabilities/);
  const held = competencyDepthRefusals(questions, {
    capabilities: 6, dependsOn: 3,
    reads: { capabilities: 6, read: 4, unread: unread.slice(0, 2) },
    rules: { ...depth.rules, uncited: [] },
    abilityEdges: { edges: 2, alone: [] },
    breadth: { ...depth.breadth, unplaced: [] },
  });
  assert.deepEqual(held, []);
  assert.deepEqual(competencyDepthRefusals(questions.map((row) => ({ ...row, status: 'partial' })), depth), []);
  const unmeasured = competencyDepthRefusals([{ id: 'evidence', status: 'answered' }], { ...depth, reads: null, rules: { ...depth.rules, judgedAgainstReads: false } });
  assert.deepEqual(unmeasured, [], 'a server that served no reads does not refuse on reads it cannot see');
});
