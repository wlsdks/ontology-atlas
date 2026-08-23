import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { analyzeDeadCode, cliRuntimeEntries, matchedEntries } from './analyze.mjs';
import { evaluateDeadCode, runDeadCodeCheck, writeBaselineAtomically } from './check.mjs';
import { collectReport, stableIssueKey } from './knip-reporter.mjs';
import { parseArguments } from './scope-configs.mjs';

const empty = () => ({ version: 1, knipVersion: '6.29.0', findings: [] });
const lane = (scope = 'frontend', laneName = 'runtime', findings = [], entries = 1, processed = 1) => ({ scope, lane: laneName, findings, entries, processed });
const report = lanes => ({ knipVersion: '6.29.0', errors: [], exitCode: 0, lanes });
const finding = (type, key) => ({ type, key, scope: 'frontend', lane: 'runtime', file: 'src/a.ts', symbol: 'a' });

test('parses scopes and refuses a scoped baseline update', () => {
  assert.deepEqual(parseArguments(['--scope=cli', '--json']), { scope: 'cli', json: true, updateBaseline: false });
  assert.throws(() => parseArguments(['--scope', 'cli', '--update-baseline']), /requires --scope all/);
});

test('CLI entries use registry modules plus bin and leave an orphan command detectable in project', async () => {
  assert.deepEqual(await cliRuntimeEntries(process.cwd(), { alpha: 'a.mjs', beta: 'b.mjs' }), ['src/commands/a.mjs', 'src/commands/b.mjs', 'src/index.mjs']);
  assert.deepEqual(matchedEntries(process.cwd(), 'cli', ['src/index.mjs'], ['cli/src/index.mjs', 'cli/src/commands/orphan.mjs']), ['src/index.mjs']);
});

test('reporter preserves parent identity, counters, and a stable config path', () => {
  const result = collectReport({ cwd: process.cwd(), report: { exports: true }, issues: { exports: { a: { b: { filePath: 'src/a.ts', symbol: 'child', parentSymbol: 'parent' } } } }, configurationHints: [], counters: { processed: 7, total: 8 } }, { scope: 'frontend', lane: 'runtime', root: process.cwd() });
  assert.equal(result.processed, 7);
  assert.match(result.findings[0].key, /parent:child$/);
  assert.equal(result.findings[0].key, stableIssueKey(result.findings[0]));
  const hint = collectReport({ cwd: process.cwd(), report: {}, issues: {}, configurationHints: [{ type: 'project-empty', identifier: 'x' }], counters: {}, isDisableConfigHints: true }, { scope: 'frontend', lane: 'runtime', root: process.cwd() });
  assert.equal(hint.findings[0].type, 'configurationHints');
});

test('fails closed for configuration hints, zero matched entries, zero processed files, and verification cycles', () => {
  const config = finding('configurationHints', 'frontend:runtime:configurationHints:knip-config:x');
  assert.equal(evaluateDeadCode({ report: report([lane('frontend', 'runtime', [config])]), baseline: empty(), exceptions: { exceptions: [] } }).exitCode, 2);
  assert.equal(evaluateDeadCode({ report: report([lane('frontend', 'runtime', [], 0)]), baseline: empty(), exceptions: { exceptions: [] } }).exitCode, 2);
  assert.equal(evaluateDeadCode({ report: report([lane('frontend', 'runtime', [], 1, 0)]), baseline: empty(), exceptions: { exceptions: [] } }).exitCode, 2);
  const cycle = finding('cycles', 'frontend:verification:cycles:src/a.ts:cycle');
  assert.equal(evaluateDeadCode({ report: report([lane('frontend', 'verification', [cycle]), lane('frontend', 'runtime')]), baseline: empty(), exceptions: { exceptions: [] }, scope: 'frontend' }).exitCode, 1);
});

test('filters baseline and exceptions for a partial scope and rejects outside-repository exception consumers', () => {
  const key = 'cli:runtime:exports:src/a.mjs:a';
  const partial = evaluateDeadCode({ report: report([lane('cli', 'runtime', [{ ...finding('exports', key), scope: 'cli', file: 'cli/src/a.mjs' }]), lane('cli', 'verification')]), baseline: { ...empty(), findings: [key, 'mcp:runtime:exports:src/x.js:x'] }, exceptions: { version: 1, exceptions: [{ key: 'mcp:runtime:files:x:x', reason: 'x', consumer: '../outside', witness: 'x' }] }, scope: 'cli' });
  assert.equal(partial.errors.length, 0);
  const bad = evaluateDeadCode({ report: report([lane('frontend', 'runtime', [finding('files', 'frontend:runtime:files:src/a.ts:src/a.ts')]), lane('frontend', 'verification')]), baseline: empty(), exceptions: { version: 1, exceptions: [{ key: 'frontend:runtime:files:src/a.ts:src/a.ts', reason: 'manual', consumer: '../outside', witness: 'src/a.ts' }] }, scope: 'frontend' });
  assert.match(bad.errors.join('\n'), /repository-relative/);
  const malformed = evaluateDeadCode({ report: report([lane('frontend', 'runtime'), lane('frontend', 'verification')]), baseline: { version: 9, knipVersion: 'x', findings: ['frontend:runtime:exports:x:a', 'frontend:runtime:exports:x:a', 'frontend:runtime:files:x:x'] }, exceptions: { version: 9, exceptions: [{ key: 'x' }, { key: 'x' }] }, scope: 'frontend' });
  assert.match(malformed.errors.join('\n'), /baseline version/);
  assert.match(malformed.errors.join('\n'), /duplicate keys/);
  assert.match(malformed.errors.join('\n'), /non-ratchet/);
});

test('applies exact platform exceptions only on their declared hosts', () => {
  const key = 'scripts:runtime:unresolved:scripts/lib/verify-macos/process-lock.mjs:/usr/libexec/PlistBuddy';
  const unresolved = {
    type: 'unresolved',
    key,
    scope: 'scripts',
    lane: 'runtime',
    file: 'scripts/lib/verify-macos/process-lock.mjs',
    symbol: '/usr/libexec/PlistBuddy',
  };
  const exception = {
    key,
    reason: 'macOS system executable is absent on other hosts',
    consumer: 'scripts/lib/verify-macos/process-lock.mjs',
    witness: '/usr/libexec/PlistBuddy',
    platforms: ['linux', 'win32'],
  };
  const linux = evaluateDeadCode({
    report: report([lane('scripts', 'runtime', [unresolved]), lane('scripts', 'verification')]),
    baseline: empty(),
    exceptions: { version: 1, exceptions: [exception] },
    scope: 'scripts',
    platform: 'linux',
  });
  assert.deepEqual(linux.errors, []);

  const darwin = evaluateDeadCode({
    report: report([lane('scripts', 'runtime'), lane('scripts', 'verification')]),
    baseline: empty(),
    exceptions: { version: 1, exceptions: [exception] },
    scope: 'scripts',
    platform: 'darwin',
  });
  assert.deepEqual(darwin.errors, []);

  const malformed = evaluateDeadCode({
    report: report([lane('scripts', 'runtime'), lane('scripts', 'verification')]),
    baseline: empty(),
    exceptions: { version: 1, exceptions: [{ ...exception, platforms: ['linux', 'linux'] }] },
    scope: 'scripts',
    platform: 'darwin',
  });
  assert.match(malformed.errors.join('\n'), /invalid exception platforms/);
});

test('uses unique scratch directories and atomic shrink writes', async () => {
  const parent = '/tmp/ontology-atlas-deadcode-fix-terra';
  mkdirSync(parent, { recursive: true });
  const paths = [];
  const runner = ({ args, env }) => { paths.push([args[args.indexOf('--config') + 1], env.OATLAS_DEAD_CODE_REPORT_FILE]); throw new Error('stop'); };
  const first = analyzeDeadCode({ root: process.cwd(), scope: 'frontend', scratchParent: parent, runKnip: runner });
  const second = analyzeDeadCode({ root: process.cwd(), scope: 'frontend', scratchParent: parent, runKnip: runner });
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.exitCode, 2); assert.equal(b.exitCode, 2);
  assert.notEqual(dirname(paths[0][0]), dirname(paths[1][0]));
  assert.equal(dirname(paths[0][0]), dirname(paths[0][1]));
  const dir = mkdtempSync(join(parent, 'atomic-')); const path = join(dir, 'baseline.json');
  writeBaselineAtomically(path, empty());
  assert.equal(existsSync(path), true); assert.equal(existsSync(join(dir, '.baseline.json.tmp')), false);
  assert.throws(() => writeBaselineAtomically(path, empty(), { write: () => { throw new Error('injected write failure'); } }), /injected/);
  assert.equal(readdirSync(dir).some(name => name.endsWith('.tmp')), false);
  rmSync(dir, { recursive: true, force: true });
});

test('normalizes setup, malformed reporter, and rejected-analysis failures to exit 2', async () => {
  assert.equal((await analyzeDeadCode({ root: '/tmp/ontology-atlas-missing-knip' })).exitCode, 2);
  const malformed = await analyzeDeadCode({ root: process.cwd(), scope: 'frontend', runKnip: ({ env }) => writeFileSync(env.OATLAS_DEAD_CODE_REPORT_FILE, '{bad') });
  assert.equal(malformed.exitCode, 2); assert.match(malformed.errors[0], /malformed reporter JSON/);
  const badShape = await analyzeDeadCode({ root: process.cwd(), scope: 'frontend', runKnip: ({ env }) => writeFileSync(env.OATLAS_DEAD_CODE_REPORT_FILE, JSON.stringify({ findings: {}, processed: 1, total: 1 })) });
  assert.equal(badShape.exitCode, 2); assert.match(badShape.errors[0], /findings must be an array/);
  const rejected = await runDeadCodeCheck({ analyze: async () => { throw new Error('injected rejection'); } });
  assert.equal(rejected.exitCode, 2); assert.match(rejected.errors[0], /rejected/);
});

test('check returns exit 0, 1, and 2 through injected analysis', async () => {
  const good = await runDeadCodeCheck({ argv: ['--scope', 'frontend'], baselineData: empty(), exceptionsData: { version: 1, exceptions: [] }, analyze: async () => report([lane(), lane('frontend', 'verification')]) });
  assert.equal(good.exitCode, 0);
  const red = await runDeadCodeCheck({ argv: ['--scope', 'frontend'], baselineData: empty(), exceptionsData: { version: 1, exceptions: [] }, analyze: async () => report([lane('frontend', 'runtime', [finding('files', 'frontend:runtime:files:x:x')]), lane('frontend', 'verification')]) });
  assert.equal(red.exitCode, 1);
  const broken = await runDeadCodeCheck({ argv: ['--scope', 'frontend'], analyze: async () => ({ exitCode: 2, errors: ['injected'] }) });
  assert.equal(broken.exitCode, 2);
  const key = 'frontend:runtime:exports:src/a.ts:a';
  const allLanes = ['frontend', 'scripts', 'cli', 'mcp'].flatMap(scope => [lane(scope, 'runtime'), lane(scope, 'verification')]);
  const shrink = await runDeadCodeCheck({ argv: ['--update-baseline'], baselineData: { ...empty(), findings: [key] }, exceptionsData: { version: 1, exceptions: [] }, analyze: async () => report(allLanes), writeBaseline: () => {} });
  assert.equal(shrink.exitCode, 0);
  assert.deepEqual(shrink.errors, []);
  assert.deepEqual(shrink.baselineKeys, []);
  assert.deepEqual(shrink.removedBaselineKeys, [key]);
});
