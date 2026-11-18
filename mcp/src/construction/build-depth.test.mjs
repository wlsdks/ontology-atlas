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
  saysOutlinedOnly,
} from './build-depth.mjs';

function repository(files) {
  const root = mkdtempSync(join(tmpdir(), 'atlas-build-depth-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

const lines = (count) => Array.from({ length: count }, (_, index) => `export const v${index} = ${index};`).join('\n') + '\n';
const doc = (slug, frontmatter, body = 'Defines it.\n\n## Uncertainty\n- Read in full.\n') => ({
  slug, frontmatter: { kind: slug.split('/')[0].replace(/ies$/, 'y').replace(/s$/, ''), ...frontmatter }, body,
});
const OUTLINED = 'Defines it.\n\n## Uncertainty\n- Outlined only, body not read.\n';

test('coverage is the share of product lines whose unit a node path touches, naming the untouched units', (t) => {
  const root = repository({
    'src/billing/invoice.ts': lines(30),
    'src/refunds/refund.ts': lines(10),
    'src/billing/invoice.test.ts': lines(50),
  });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const units = collectSourceUnits(root);
  const depth = measureBuildDepth([doc('capabilities/issue-invoice', { path: 'src/billing/invoice.ts' })], units);
  assert.equal(depth.coverage.percent, 75, 'the test file is not in the denominator');
  assert.deepEqual(depth.coverage.untouched, [{ path: 'src/refunds', lines: 10 }]);
  assert.match(depth.line, /^Coverage 75%: node paths touch 1 of 2 product units .* Untouched: src\/refunds \(10\)\./);
});

test('outlined only is read from the Uncertainty section alone', () => {
  assert.equal(saysOutlinedOnly(OUTLINED), true);
  assert.equal(saysOutlinedOnly('Marks a message unread for the reader.\n\n## Uncertainty\n- None.\n'), false);
  const depth = measureBuildDepth([doc('capabilities/a', {}, OUTLINED), doc('capabilities/b', {}), doc('elements/c', {}, OUTLINED)], null);
  assert.deepEqual(depth.outlinedCapabilities, ['capabilities/a']);
  assert.match(depth.line, /^1 of 2 capabilities and 1 elements say outlined only\.$/);
});

test('a relation note about a node that says outlined only is flagged on the source', () => {
  const docs = [
    doc('capabilities/send', { dependencies: ['elements/queue'], relation_notes: { 'elements/queue': 'Every message waits in the queue.' } }),
    doc('elements/queue', {}, OUTLINED),
  ];
  const findings = buildDepthFindings(docs);
  assert.deepEqual(findings.map(({ slug, code }) => [slug, code]), [['capabilities/send', 'relation-note-on-unread']]);
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

test('finalize refuses answered rows the map does not support and names the fixing call', () => {
  const questions = ['scope', 'domains', 'abilities', 'evidence', 'impact'].map((id) => ({ id, status: 'answered' }));
  const depth = {
    capabilities: 6,
    outlinedCapabilities: ['capabilities/a', 'capabilities/b', 'capabilities/c'],
    dependsOn: 2,
    coverage: { percent: 60, untouched: [{ path: 'src/refunds', lines: 10 }] },
  };
  const reasons = competencyDepthRefusals(questions, depth);
  assert.deepEqual(reasons.map((reason) => reason.split(':')[0]), ['- evidence', '- domains', '- abilities', '- impact']);
  assert.match(reasons[0], /sourceReads .* patch_concept/);
  assert.match(reasons[1], /Untouched: src\/refunds/);
  assert.match(reasons[3], /add_relations/);
  const held = competencyDepthRefusals(questions, { capabilities: 6, outlinedCapabilities: ['capabilities/a', 'capabilities/b'], dependsOn: 3, coverage: { percent: 80, untouched: [] } });
  assert.deepEqual(held, []);
  const partial = questions.map((row) => ({ ...row, status: 'partial' }));
  assert.deepEqual(competencyDepthRefusals(partial, depth), []);
});
