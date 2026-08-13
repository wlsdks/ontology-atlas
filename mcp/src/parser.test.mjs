// Smoke test — node-native, no test runner. `npm run test:smoke` 로 실행.
// 본 repo 의 vitest 단위 테스트 (parse-frontmatter.test.ts) 와 동일 케이스
// 일부 검증.

import assert from 'node:assert/strict';
import {
  parseFrontmatter,
  serializeFrontmatter,
  buildMarkdown,
} from './parser.mjs';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

console.log('parser smoke');

test('scalar', () => {
  const { frontmatter } = parseFrontmatter(`---\nname: foo\nstatus: live\n---\n`);
  assert.deepEqual(frontmatter, { name: 'foo', status: 'live' });
});

test('inline list', () => {
  const { frontmatter } = parseFrontmatter(`---\ntags: [a, b, c]\n---\n`);
  assert.deepEqual(frontmatter.tags, ['a', 'b', 'c']);
});

test('block list', () => {
  const raw = ['---', 'caps:', '  - login', '  - reset', '---', ''].join('\n');
  const { frontmatter } = parseFrontmatter(raw);
  assert.deepEqual(frontmatter.caps, ['login', 'reset']);
});

test('indented missing-colon declarations retain diagnostics', () => {
  const raw = [
    '---',
    'kind: domain',
    '  missing-colon',
    '  orphan value',
    '---',
    '',
  ].join('\n');
  const parsed = parseFrontmatter(raw);
  assert.deepEqual(parsed.diagnostics, [
    {
      code: 'malformed-frontmatter-line',
      line: 3,
      message: 'Frontmatter line 3 must use key: value syntax.',
    },
    {
      code: 'malformed-frontmatter-line',
      line: 4,
      message: 'Frontmatter line 4 must use key: value syntax.',
    },
  ]);
});

test('inline object', () => {
  const { frontmatter } = parseFrontmatter(
    `---\nposition: { x: 100, y: 200 }\n---\n`,
  );
  assert.deepEqual(frontmatter.position, { x: 100, y: 200 });
});

test('block object', () => {
  const raw = [
    '---',
    'meta:',
    '  owner: alice',
    '  count: 42',
    '  active: true',
    '---',
    '',
  ].join('\n');
  const { frontmatter } = parseFrontmatter(raw);
  assert.deepEqual(frontmatter.meta, { owner: 'alice', count: 42, active: true });
});

test('serialize roundtrip', () => {
  const fm = {
    name: 'Auth Platform',
    kind: 'project',
    capabilities: ['login', 'logout'],
    position: { x: 100, y: 200 },
  };
  const block = serializeFrontmatter(fm);
  const parsed = parseFrontmatter(`---\n${block}\n---\nbody`).frontmatter;
  assert.deepEqual(parsed.name, fm.name);
  assert.deepEqual(parsed.kind, fm.kind);
  assert.deepEqual(parsed.capabilities, fm.capabilities);
  // inline object 직렬화 → 다시 파싱 시 inline object 인식.
  assert.deepEqual(parsed.position, fm.position);
});

test('buildMarkdown', () => {
  const md = buildMarkdown({
    frontmatter: { kind: 'project', name: 'Sample' },
    body: '# Sample\n',
  });
  assert.ok(md.startsWith('---\n'));
  assert.ok(md.includes('kind: project'));
  assert.ok(md.endsWith('# Sample\n'));
});

console.log(`\nresult: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
