// R13 #40 — CLI 5 명령 통합 test. mcp 의 integration.test.mjs 패턴 reuse.
// tmp vault fixture + cli spawn + stdout/exit code 검증.
//
// node --test 또는 \`npm test\` 로 실행.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, 'index.mjs');

function run(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [CLI, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (b) => (stdout += b.toString()));
    proc.stderr.on('data', (b) => (stderr += b.toString()));
    proc.on('close', (code) => resolve({ code, stdout, stderr }));
    proc.on('error', reject);
  });
}

function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

function withVault(seed = []) {
  const root = mkdtempSync(join(tmpdir(), 'cli-int-'));
  for (const { slug, content } of seed) {
    const full = join(root, `${slug}.md`);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content, 'utf-8');
  }
  return root;
}

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message ?? err}`);
  }
}

console.log('cli integration');

await test('list — empty vault: 0 노드 메시지', async () => {
  const root = withVault([]);
  try {
    const r = await run(['list', root]);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /ontology 노드 0|0 ontology 노드/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('list — kind 있는 노드만 카운트', async () => {
  const root = withVault([
    { slug: 'a', content: '---\nkind: capability\ntitle: A\n---\n' },
    { slug: 'b', content: '---\nkind: domain\ntitle: B\n---\n' },
    { slug: 'noframe', content: '# just a doc' },
  ]);
  try {
    const r = await run(['list', root]);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /2 ontology 노드/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('list --json — JSON 머신 가독', async () => {
  const root = withVault([
    { slug: 'foo', content: '---\nkind: capability\ntitle: Foo\n---\n' },
  ]);
  try {
    const r = await run(['list', root, '--json']);
    assert.equal(r.code, 0);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.total, 1);
    assert.equal(parsed.nodes[0].kind, 'capability');
    assert.equal(parsed.nodes[0].slug, 'foo');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('validate — clean vault: exit 0', async () => {
  // R14 — capability/element 는 domain 까지 박아야 missing-expected-field
  // warning 없이 clean. canonical kind 인식 자체를 보는 fixture 라 domain 추가.
  const root = withVault([
    { slug: 'a', content: '---\nkind: capability\ndomain: domains/auth\n---\n' },
  ]);
  try {
    const r = await run(['validate', root]);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /clean ✓|issue 0/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('validate — empty kind: exit 1 + empty-kind code', async () => {
  const root = withVault([
    { slug: 'bad', content: '---\nkind:\n---\n' },
  ]);
  try {
    const r = await run(['validate', root]);
    assert.equal(r.code, 1);
    assert.match(r.stdout, /empty-kind/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('add — 새 노드 + duplicate throws', async () => {
  const root = withVault([]);
  try {
    const r1 = await run([
      'add',
      'capability',
      'auth/foo',
      '--title',
      'Foo',
      '--vault',
      root,
    ]);
    assert.equal(r1.code, 0, `first add should succeed, got ${r1.code}: ${r1.stderr}`);
    // 파일 실제로 작성됐는지
    const written = readFileSync(join(root, 'auth/foo.md'), 'utf-8');
    assert.match(written, /kind: capability/);
    assert.match(written, /title: Foo/);

    const r2 = await run([
      'add',
      'capability',
      'auth/foo',
      '--title',
      'Dup',
      '--vault',
      root,
    ]);
    assert.equal(r2.code, 1);
    assert.match(r2.stderr + r2.stdout, /already exists/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('add — title 빈 문자열 거부', async () => {
  const root = withVault([]);
  try {
    const r = await run(['add', 'capability', 'foo', '--title', '', '--vault', root]);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /title.*required/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('add — unknown kind 거부', async () => {
  const root = withVault([]);
  try {
    const r = await run([
      'add',
      'bogus',
      'foo',
      '--title',
      'Foo',
      '--vault',
      root,
    ]);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /unknown kind/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('add --auto-prefix — kind 별 folder 자동 (R12 #37)', async () => {
  const root = withVault([]);
  try {
    const r = await run([
      'add',
      'capability',
      'foo',
      '--title',
      'Foo',
      '--auto-prefix',
      '--vault',
      root,
    ]);
    assert.equal(r.code, 0);
    const written = readFileSync(join(root, 'capabilities/foo.md'), 'utf-8');
    assert.match(written, /slug: capabilities\/foo/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('add (default) — auto-prefix 안 적용 (backward compat)', async () => {
  const root = withVault([]);
  try {
    const r = await run([
      'add',
      'capability',
      'bar',
      '--title',
      'Bar',
      '--vault',
      root,
    ]);
    assert.equal(r.code, 0);
    const written = readFileSync(join(root, 'bar.md'), 'utf-8');
    assert.match(written, /slug: bar/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('find — title 부분매칭', async () => {
  const root = withVault([
    {
      slug: 'auth-token',
      content: '---\nkind: capability\ntitle: Auth Token Issue\n---\n',
    },
    { slug: 'other', content: '---\nkind: domain\ntitle: Other\n---\n' },
  ]);
  try {
    const r = await run(['find', 'token', root]);
    assert.equal(r.code, 0);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /auth-token/);
    assert.match(clean, /1 매칭/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('find — 매칭 0 도 exit 0 (정상)', async () => {
  const root = withVault([
    { slug: 'foo', content: '---\nkind: capability\ntitle: Foo\n---\n' },
  ]);
  try {
    const r = await run(['find', 'xyz999', root]);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /매칭 0/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('find --kind 필터', async () => {
  const root = withVault([
    { slug: 'foo-cap', content: '---\nkind: capability\ntitle: foo cap\n---\n' },
    { slug: 'foo-dom', content: '---\nkind: domain\ntitle: foo dom\n---\n' },
  ]);
  try {
    const r = await run(['find', 'foo', root, '--kind=capability']);
    assert.equal(r.code, 0);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /foo-cap/);
    assert.doesNotMatch(clean, /foo-dom/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── R14 import 명령 통합 ─────────────────────────────────────────────────

function withTmpDir() {
  return mkdtempSync(join(tmpdir(), 'cli-import-src-'));
}

await test('import — input frontmatter 의 kind 사용, schema arrayDefaults 적용', async () => {
  const vault = withVault([]);
  const src = withTmpDir();
  try {
    const file = join(src, 'token-issue.md');
    writeFileSync(
      file,
      '---\nkind: capability\ntitle: Token issue\ndomain: domains/auth\n---\n\n# Token issue\n\nbody.\n',
      'utf-8',
    );
    const r = await run(['import', file, '--vault', vault]);
    assert.equal(r.code, 0);
    const written = readFileSync(join(vault, 'token-issue.md'), 'utf-8');
    assert.match(written, /kind: capability/);
    assert.match(written, /domain: domains\/auth/);
    // schema arrayDefaults — capability 는 elements: [] 자동 추가.
    assert.match(written, /elements:/);
    // body 보존.
    assert.match(written, /body\./);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(src, { recursive: true, force: true });
  }
});

await test('import — frontmatter kind 없으면 --kind fallback', async () => {
  const vault = withVault([]);
  const src = withTmpDir();
  try {
    const file = join(src, 'foo.md');
    writeFileSync(file, '# Foo\n\nbare markdown without frontmatter.\n', 'utf-8');
    const r = await run([
      'import',
      file,
      '--vault',
      vault,
      '--kind',
      'capability',
    ]);
    assert.equal(r.code, 0);
    const written = readFileSync(join(vault, 'foo.md'), 'utf-8');
    assert.match(written, /kind: capability/);
    // title 은 첫 H1 'Foo' 추출.
    assert.match(written, /title: Foo/);
    // body 보존.
    assert.match(written, /bare markdown/);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(src, { recursive: true, force: true });
  }
});

await test('import — kindless skip (kind 도 --kind 도 없음)', async () => {
  const vault = withVault([]);
  const src = withTmpDir();
  try {
    const file = join(src, 'note.md');
    writeFileSync(file, '# just a note\n', 'utf-8');
    const r = await run(['import', file, '--vault', vault]);
    // 1 입력 모두 kindless → exit 1, 메시지에 kindless 명시.
    assert.equal(r.code, 1);
    const clean = stripAnsi(r.stderr + r.stdout);
    assert.match(clean, /kindless|no kind/);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(src, { recursive: true, force: true });
  }
});

await test('import --auto-prefix — kind→folder 자동', async () => {
  const vault = withVault([]);
  const src = withTmpDir();
  try {
    const file = join(src, 'login.md');
    writeFileSync(
      file,
      '---\nkind: capability\ntitle: Login\ndomain: domains/auth\n---\n\nx\n',
      'utf-8',
    );
    const r = await run([
      'import',
      file,
      '--vault',
      vault,
      '--auto-prefix',
    ]);
    assert.equal(r.code, 0);
    const written = readFileSync(join(vault, 'capabilities/login.md'), 'utf-8');
    assert.match(written, /slug: capabilities\/login/);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(src, { recursive: true, force: true });
  }
});

await test('import — slug 충돌 시 default skip, --rename 시 -2 회피', async () => {
  // 같은 slug 의 .md 가 vault 에 이미 있는 상태로 시작.
  const vault = withVault([
    { slug: 'foo', content: '---\nkind: capability\ntitle: Existing\ndomain: domains/auth\n---\n' },
  ]);
  const src = withTmpDir();
  try {
    const file = join(src, 'foo.md');
    writeFileSync(
      file,
      '---\nkind: capability\ntitle: Imported\ndomain: domains/auth\n---\n',
      'utf-8',
    );

    // default — skip + 종료 1 (모두 conflict 라 imported 0)
    const r1 = await run(['import', file, '--vault', vault]);
    assert.equal(r1.code, 1);
    const c1 = stripAnsi(r1.stderr + r1.stdout);
    assert.match(c1, /conflict|already exists/);

    // --rename — foo-2.md 로 import 성공
    const r2 = await run(['import', file, '--vault', vault, '--rename']);
    assert.equal(r2.code, 0);
    const written = readFileSync(join(vault, 'foo-2.md'), 'utf-8');
    assert.match(written, /slug: foo-2/);
    assert.match(written, /title: Imported/);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(src, { recursive: true, force: true });
  }
});

await test('import --dry-run — 디스크 변경 0', async () => {
  const vault = withVault([]);
  const src = withTmpDir();
  try {
    const file = join(src, 'plan.md');
    writeFileSync(
      file,
      '---\nkind: domain\ntitle: Plan\n---\n',
      'utf-8',
    );
    const r = await run(['import', file, '--vault', vault, '--dry-run']);
    assert.equal(r.code, 0);
    // vault 안에 파일 안 만들어졌어야.
    assert.equal(
      existsSyncTest(join(vault, 'plan.md')),
      false,
      'dry-run should not write',
    );
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /would import|plan/);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(src, { recursive: true, force: true });
  }
});

await test('import — 디렉토리 재귀 walk', async () => {
  const vault = withVault([]);
  const src = withTmpDir();
  try {
    mkdirSync(join(src, 'sub'), { recursive: true });
    writeFileSync(
      join(src, 'a.md'),
      '---\nkind: domain\ntitle: A\n---\n',
      'utf-8',
    );
    writeFileSync(
      join(src, 'sub', 'b.md'),
      '---\nkind: domain\ntitle: B\n---\n',
      'utf-8',
    );
    const r = await run(['import', src, '--vault', vault]);
    assert.equal(r.code, 0);
    assert.equal(existsSyncTest(join(vault, 'a.md')), true);
    assert.equal(existsSyncTest(join(vault, 'b.md')), true);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(src, { recursive: true, force: true });
  }
});

function existsSyncTest(p) {
  try {
    readFileSync(p);
    return true;
  } catch {
    return false;
  }
}

console.log(`\ncli integration: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
