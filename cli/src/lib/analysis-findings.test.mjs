import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SEVERITIES,
  collectFindings,
  diffFindings,
  findingId,
  findingsFromArchitecture,
  findingsFromHealth,
  findingsFromValidation,
  parseFindings,
  renderAnalysis,
} from './analysis-findings.mjs';

const basis = {
  id: '2026-08-31-01-00-00-abc1234',
  measuredAt: '2026-08-31T01:00:00.000Z',
  commit: 'abc1234',
  graphHash: 'hash',
  filesScanned: 10,
};

test('an id is about the thing, not about the wording', () => {
  // The whole comparison rests on this. If the id moved when the sentence moved,
  // every re-run would report every finding as new.
  const first = findingId({ source: 'architecture', check: 'unmapped-edges', target: 'atlas-web' });
  const second = findingId({ source: 'architecture', check: 'unmapped-edges', target: '  atlas-web  ' });
  assert.equal(first, second);
  assert.equal(first, 'architecture/unmapped-edges/atlas-web');
  assert.notEqual(first, findingId({ source: 'architecture', check: 'unmapped-edges', target: 'atlas-cli' }));
});

test('a passing check is not a finding', () => {
  const found = findingsFromHealth({
    checks: [
      { id: 'vault_present', status: 'pass', count: 92, message: 'fine' },
      { id: 'meaning_assessment', status: 'warn', count: 1, message: 'needs review' },
      { id: 'compile_issues', status: 'fail', count: 3, message: 'broken' },
    ],
  });
  assert.deepEqual(found.map((item) => item.check), ['meaning_assessment', 'compile_issues']);
  assert.deepEqual(found.map((item) => item.severity), ['review', 'violation']);
});

test('unknown coverage is reported as unknown, never as clean', () => {
  // The profile contract says unknown import usage never means compliant, so a
  // scan that covered nothing must not read the same as a scan that found
  // nothing wrong.
  const clean = findingsFromArchitecture({
    profile: { slug: 'atlas-web' },
    conformance: { violations: [], unknown: { unmappedEdges: 0, coverageIncomplete: false, emptyRoles: [] } },
  });
  assert.deepEqual(clean, []);

  const uncovered = findingsFromArchitecture({
    profile: { slug: 'atlas-web' },
    conformance: { violations: [], unknown: { unmappedEdges: 75, coverageIncomplete: false, emptyRoles: [] } },
  });
  assert.equal(uncovered.length, 1);
  assert.equal(uncovered[0].severity, 'unknown');
  assert.match(uncovered[0].title, /unknown, not clean/);
  assert.match(uncovered[0].title, /75/);
});

test('a declared violation outranks an unknown, and both outrank a review', () => {
  const findings = collectFindings({
    health: { checks: [{ id: 'meaning_assessment', status: 'warn', count: 1, message: 'needs review' }] },
    validation: { problems: [{ file: 'capabilities/x.md', issues: [{ code: 'missing-evidence', severity: 'error', message: 'no evidence' }] }] },
    architecture: {
      profile: { slug: 'atlas-web' },
      conformance: {
        violations: [{ fromRole: 'entities', toRole: 'widgets', from: 'src/entities/a.ts', to: 'src/widgets/b.tsx', importUsage: 'value' }],
        unknown: { unmappedEdges: 4, coverageIncomplete: false, emptyRoles: [] },
      },
    },
  });
  assert.deepEqual(findings.map((item) => item.severity), ['violation', 'violation', 'unknown', 'review']);
  assert.equal(new Set(findings.map((item) => item.id)).size, findings.length, 'ids are unique');
});

test('the diff separates opened, resolved and moved — and re-wording is none of them', () => {
  const before = [
    { id: 'a/b/c', severity: 'review', title: 'first wording' },
    { id: 'd/e/f', severity: 'violation', title: 'goes away' },
  ];
  const after = [
    { id: 'a/b/c', severity: 'violation', title: 'a completely different sentence about the same thing' },
    { id: 'g/h/i', severity: 'unknown', title: 'brand new' },
  ];
  const diff = diffFindings(before, after);
  assert.deepEqual(diff.opened.map((item) => item.id), ['g/h/i']);
  assert.deepEqual(diff.resolved.map((item) => item.id), ['d/e/f']);
  assert.deepEqual(diff.changed.map((item) => [item.id, item.wasSeverity, item.severity]), [['a/b/c', 'review', 'violation']]);
  assert.equal(diff.carried.length, 0);

  const reworded = diffFindings(before, before.map((item) => ({ ...item, title: `${item.title} rewritten entirely` })));
  assert.deepEqual(reworded.opened, []);
  assert.deepEqual(reworded.resolved, []);
  assert.deepEqual(reworded.changed, []);
  assert.equal(reworded.carried.length, 2, 'a finding that only changed wording did not change');
});

test('a first run says so instead of pretending everything is new', () => {
  const findings = collectFindings({ architecture: { profile: { slug: 'p' }, conformance: { violations: [], unknown: { unmappedEdges: 2 } } } });
  const markdown = renderAnalysis({ findings, diff: diffFindings(null, findings), basis });
  assert.match(markdown, /This is the first run/);
  assert.doesNotMatch(markdown, /Newly opened/);
});

test('what one run writes, the next run can read back', () => {
  // One artifact: the prose is the format. If this round trip breaks, every
  // comparison silently reports every finding as new.
  const findings = collectFindings({
    health: { checks: [{ id: 'meaning_assessment', status: 'warn', count: 1, message: 'needs review' }] },
    architecture: {
      profile: { slug: 'atlas-web' },
      conformance: {
        violations: [{ fromRole: 'entities', toRole: 'widgets', from: 'src/entities/a.ts', to: 'src/widgets/b.tsx' }],
        unknown: { unmappedEdges: 75, coverageIncomplete: true, emptyRoles: ['legacy'] },
      },
    },
  });
  const markdown = renderAnalysis({ findings, diff: diffFindings(null, findings), basis });
  const parsed = parseFindings(markdown);
  assert.deepEqual(parsed.map((item) => item.id), findings.map((item) => item.id));
  assert.deepEqual(parsed.map((item) => item.severity), findings.map((item) => item.severity));
  assert.deepEqual(diffFindings(parsed, findings).opened, []);
  assert.deepEqual(diffFindings(parsed, findings).resolved, []);
});

test('the record states what it cannot tell you', () => {
  const markdown = renderAnalysis({ findings: [], diff: diffFindings(null, []), basis });
  assert.match(markdown, /No open findings/);
  assert.match(markdown, /silence here is not proof/);
  assert.match(markdown, /It judges no meaning/);
  assert.doesNotMatch(markdown, /^kind:/m, 'the record must never carry a kind, or the compiler counts it as a concept');
  assert.match(markdown, /commit: abc1234/);
  assert.match(markdown, /graph_hash: hash/);
});

test('severity order is worst first and unknown is not ok', () => {
  assert.deepEqual(SEVERITIES, ['violation', 'unknown', 'review', 'info']);
  assert.ok(SEVERITIES.indexOf('unknown') < SEVERITIES.indexOf('info'));
});

test('a validation problem becomes one finding per issue, keyed by file and code', () => {
  const found = findingsFromValidation({
    problems: [{ file: 'analyses/x.md', issues: [
      { code: 'missing-kind', severity: 'warning', message: 'no kind' },
      { code: 'bad-slug', severity: 'error', message: 'bad slug' },
    ] }],
  });
  assert.deepEqual(found.map((item) => item.id), ['vault/missing-kind/analyses/x.md', 'vault/bad-slug/analyses/x.md']);
  assert.deepEqual(found.map((item) => item.severity), ['review', 'violation']);
});
