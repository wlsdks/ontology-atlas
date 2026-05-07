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

await test('validate — 2+ 같은 code → "grouped by code" 요약 섹션 (R+)', async () => {
  // 같은 missing-expected-field warning 이 3 file 에서 — grouped 섹션에
  // "missing-expected-field — 3 occurrences" + 첫 3 file 노출되어야 함.
  const root = withVault([
    { slug: 'cap1', content: '---\nkind: capability\ntitle: One\n---\n' },
    { slug: 'cap2', content: '---\nkind: capability\ntitle: Two\n---\n' },
    { slug: 'cap3', content: '---\nkind: capability\ntitle: Three\n---\n' },
  ]);
  try {
    const r = await run(['validate', root]);
    // capability missing domain → warning, exit 0 (warning only)
    assert.equal(r.code, 0);
    const clean = stripAnsi(r.stdout);
    // per-file detail 보존
    assert.match(clean, /cap1\.md/);
    assert.match(clean, /cap2\.md/);
    // grouped section 등장
    assert.match(clean, /grouped by code/);
    assert.match(clean, /missing-expected-field — 3 occurrences/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('validate — 1회짜리 code 는 grouped 섹션 안 보임 (per-file 만)', async () => {
  // 단일 issue 는 per-file 출력만으로 충분 — grouped 섹션 노이즈 회피.
  const root = withVault([
    { slug: 'bad', content: '---\nkind:\n---\n' }, // empty-kind error
  ]);
  try {
    const r = await run(['validate', root]);
    assert.equal(r.code, 1);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /empty-kind/);
    assert.doesNotMatch(clean, /grouped by code/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('validate --json — clean vault: scanned/problems[]/summary 노출, exit 0 (R+ cycle 40)', async () => {
  // capability 는 domain 누락 시 missing-expected-field warning. project 로
  // 정말 깨끗한 vault 만든다.
  const root = withVault([
    { slug: 'p', content: '---\nkind: project\ntitle: P\n---\n' },
  ]);
  try {
    const r = await run(['validate', root, '--json']);
    assert.equal(r.code, 0);
    const data = JSON.parse(r.stdout);
    assert.equal(typeof data.scanned, 'number');
    assert.deepEqual(data.problems, []);
    assert.equal(data.summary.errorFiles, 0);
    assert.equal(data.summary.warningFiles, 0);
    assert.deepEqual(data.summary.byCode, {});
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('validate --json — empty-kind error: problems[] / summary.byCode, exit 1 (R+ cycle 40)', async () => {
  const root = withVault([
    { slug: 'broken', content: '---\nkind:\ntitle: X\n---\n' },
  ]);
  try {
    const r = await run(['validate', root, '--json']);
    assert.equal(r.code, 1);
    const data = JSON.parse(r.stdout);
    assert.ok(data.problems.length >= 1);
    const p = data.problems.find((x) => /broken\.md$/.test(x.file));
    assert.ok(p, 'broken.md 가 problems 에 있어야');
    assert.ok(p.issues.some((i) => i.code === 'empty-kind'));
    assert.ok(data.summary.byCode['empty-kind']);
    assert.equal(data.summary.byCode['empty-kind'].severity, 'error');
    assert.ok(data.summary.errorFiles >= 1);
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
    // R15 — auto-prefix default on, capability → capabilities/ folder
    const written = readFileSync(join(root, 'capabilities/auth/foo.md'), 'utf-8');
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

await test('add (default) — kind→folder 자동 (R15 default on)', async () => {
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
    // R15 — default auto-prefix → capabilities/bar.md
    const written = readFileSync(join(root, 'capabilities/bar.md'), 'utf-8');
    assert.match(written, /slug: capabilities\/bar/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('add --raw-slug — auto-prefix 명시 opt-out (R15)', async () => {
  const root = withVault([]);
  try {
    const r = await run([
      'add',
      'capability',
      'baz',
      '--title',
      'Baz',
      '--raw-slug',
      '--vault',
      root,
    ]);
    assert.equal(r.code, 0);
    // --raw-slug 으로 root 에 직접
    const written = readFileSync(join(root, 'baz.md'), 'utf-8');
    assert.match(written, /slug: baz/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('add element path-style → cyan hint advisory (post-Paravel dogfood)', async () => {
  const root = withVault([]);
  try {
    const r = await run([
      'add',
      'element',
      'src/features/auth',
      '--title',
      'Auth module',
      '--domain',
      'identity',
      '--vault',
      root,
    ]);
    assert.equal(r.code, 0);
    // 4단계 nested 작성 자체는 valid
    const written = readFileSync(
      join(root, 'elements/src/features/auth.md'),
      'utf-8',
    );
    assert.match(written, /kind: element/);
    // stderr 에 path-style hint
    assert.match(r.stderr, /path-style/);
    assert.match(r.stderr, /4 levels/);
    assert.match(r.stderr, /--raw-slug/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('add element flat slug → hint 없음 (정상 case)', async () => {
  const root = withVault([]);
  try {
    const r = await run([
      'add',
      'element',
      'zod',
      '--title',
      'Zod library',
      '--domain',
      'identity',
      '--vault',
      root,
    ]);
    assert.equal(r.code, 0);
    assert.doesNotMatch(r.stderr, /path-style/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('add capability path slug → hint 없음 (element 만 적용)', async () => {
  const root = withVault([]);
  try {
    const r = await run([
      'add',
      'capability',
      'auth/login',
      '--title',
      'Login',
      '--domain',
      'identity',
      '--vault',
      root,
    ]);
    assert.equal(r.code, 0);
    assert.doesNotMatch(r.stderr, /path-style/);
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
    // R15 — auto-prefix default on, capability → capabilities/ folder
    const written = readFileSync(join(vault, 'capabilities/token-issue.md'), 'utf-8');
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
    // R15 — auto-prefix default on, capability → capabilities/ folder
    const written = readFileSync(join(vault, 'capabilities/foo.md'), 'utf-8');
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
  // R15 — auto-prefix default on, vault seed slug 도 capabilities/ 안.
  const vault = withVault([
    {
      slug: 'capabilities/foo',
      content:
        '---\nkind: capability\nslug: capabilities/foo\ntitle: Existing\ndomain: domains/auth\n---\n',
    },
  ]);
  const src = withTmpDir();
  try {
    const file = join(src, 'foo.md');
    writeFileSync(
      file,
      '---\nkind: capability\ntitle: Imported\ndomain: domains/auth\n---\n',
      'utf-8',
    );

    // default — auto-prefix on, slug 가 capabilities/foo 로 충돌.
    const r1 = await run(['import', file, '--vault', vault]);
    assert.equal(r1.code, 1);
    const c1 = stripAnsi(r1.stderr + r1.stdout);
    assert.match(c1, /conflict|already exists/);

    // --rename — capabilities/foo-2.md 로 import 성공
    const r2 = await run(['import', file, '--vault', vault, '--rename']);
    assert.equal(r2.code, 0);
    const written = readFileSync(
      join(vault, 'capabilities/foo-2.md'),
      'utf-8',
    );
    assert.match(written, /slug: capabilities\/foo-2/);
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
    // R15 — auto-prefix default on, domain → domains/ folder
    assert.equal(existsSyncTest(join(vault, 'domains/a.md')), true);
    assert.equal(existsSyncTest(join(vault, 'domains/b.md')), true);
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

// ── R15 graph-level commands (backlinks/query/rename/merge/delete) ───────
//
// 이 명령들은 mcp child_process spawn — relative path fallback (../../mcp/
// src/index.js) 으로 monorepo dev 환경에서 작동.

async function buildGraphFixture() {
  const root = withVault([
    {
      slug: 'capabilities/foo',
      content:
        '---\nkind: capability\nslug: capabilities/foo\ntitle: Foo\ndomain: domains/auth\nelements: [src/foo.ts]\n---\n\n# Foo\n',
    },
    {
      slug: 'capabilities/bar',
      content:
        '---\nkind: capability\nslug: capabilities/bar\ntitle: Bar\ndomain: domains/auth\nrelates: [capabilities/foo]\n---\n\n# Bar\n',
    },
    {
      slug: 'domains/auth',
      content:
        '---\nkind: domain\nslug: domains/auth\ntitle: Auth\ncapabilities: [capabilities/foo, capabilities/bar]\n---\n\n# Auth\n',
    },
  ]);
  return root;
}

await test('backlinks — capabilities/foo 의 backlinks (bar relates + auth capabilities)', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['backlinks', 'capabilities/foo', root]);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /backlink/);
    assert.match(clean, /capabilities\/bar/);
    assert.match(clean, /domains\/auth/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('backlinks --json — JSON 응답 파싱', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['backlinks', 'capabilities/foo', root, '--json']);
    assert.equal(r.code, 0);
    const data = JSON.parse(r.stdout);
    assert.ok(Array.isArray(data.matches));
    assert.ok(data.matches.length >= 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('path — capabilities/bar → capabilities/foo (1 hop, via relates)', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['path', 'capabilities/bar', 'capabilities/foo', root]);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /1 hop/);
    assert.match(clean, /capabilities\/bar/);
    assert.match(clean, /capabilities\/foo/);
    // bar.relates 가 foo 를 가리키므로 via=relates 로 노출
    assert.match(clean, /relates/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('path --json — edges[] 포함된 raw 응답 파싱', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run([
      'path',
      'capabilities/bar',
      'capabilities/foo',
      root,
      '--json',
    ]);
    assert.equal(r.code, 0);
    const data = JSON.parse(r.stdout);
    assert.ok(Array.isArray(data.hops), 'hops 배열');
    assert.ok(Array.isArray(data.edges), 'edges 배열');
    assert.equal(data.edges.length, data.hops.length - 1, 'edges 길이는 hops - 1');
    assert.equal(data.found, true);
    assert.equal(data.edges[0].via, 'relates');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('path — same slug → 0 hops trivial', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['path', 'capabilities/foo', 'capabilities/foo', root]);
    assert.equal(r.code, 0);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /same slug|0 hops/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('path — 두 인자 누락 시 usage + exit 1', async () => {
  const r = await run(['path', 'only-one']);
  assert.equal(r.code, 1);
  assert.match(stripAnsi(r.stderr), /from.*to.*required|both/);
});

await test('orphans — graph fixture 에서 referenced 노드 0건 보고', async () => {
  // buildGraphFixture: foo (referenced by bar.relates + auth.capabilities),
  // bar (referenced by 0 — orphan? but auth domain.capabilities 가 references bar),
  // auth (root domain — no incoming references → orphan).
  // 정확한 그래프: foo, bar 둘 다 referenced. auth (domain) 만 orphan.
  const root = await buildGraphFixture();
  try {
    const r = await run(['orphans', root]);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    // domain auth 는 어디서도 reference 안 받음 → orphan 으로 등장
    assert.match(clean, /domains\/auth/);
    // foo / bar 는 referenced — orphan 아님
    assert.doesNotMatch(clean, /capabilities\/foo/);
    assert.doesNotMatch(clean, /capabilities\/bar/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('orphans --json — JSON 응답 파싱', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['orphans', root, '--json']);
    assert.equal(r.code, 0);
    const data = JSON.parse(r.stdout);
    assert.ok(Array.isArray(data.orphans));
    assert.ok(data.orphans.some((o) => o.slug === 'domains/auth'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('orphans --kind capability — 필터 적용', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['orphans', root, '--kind', 'capability']);
    assert.equal(r.code, 0);
    const clean = stripAnsi(r.stdout);
    // capability 인 orphan 0 (foo, bar 둘 다 referenced)
    assert.match(clean, /vault clean ✓|orphan 0/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('query — kind=capability AND has(elements)', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run([
      'query',
      'kind=capability AND has(elements)',
      root,
    ]);
    assert.equal(r.code, 0);
    const clean = stripAnsi(r.stdout);
    // Only foo has elements; bar has relates only.
    assert.match(clean, /capabilities\/foo/);
    assert.doesNotMatch(clean, /capabilities\/bar.*\n/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('rename — dry-run preview, no disk change', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run([
      'rename',
      'capabilities/foo',
      'capabilities/foo-renamed',
      root,
    ]);
    assert.equal(r.code, 0);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /dry-run/);
    assert.match(clean, /capabilities\/foo-renamed/);
    // foo.md 그대로 존재 (dry-run)
    assert.equal(existsSyncTest(join(root, 'capabilities/foo.md')), true);
    assert.equal(
      existsSyncTest(join(root, 'capabilities/foo-renamed.md')),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('rename --confirm — 파일 이동 + backlink redirect', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run([
      'rename',
      'capabilities/foo',
      'capabilities/foo-renamed',
      root,
      '--confirm',
    ]);
    assert.equal(r.code, 0, `stderr: ${r.stderr}`);
    assert.equal(existsSyncTest(join(root, 'capabilities/foo.md')), false);
    assert.equal(
      existsSyncTest(join(root, 'capabilities/foo-renamed.md')),
      true,
    );
    // bar 의 relates 가 redirect 됐는지
    const barText = readFileSync(
      join(root, 'capabilities/bar.md'),
      'utf-8',
    );
    assert.match(barText, /capabilities\/foo-renamed/);
    assert.doesNotMatch(barText, /relates:.*\bcapabilities\/foo\b(?!-renamed)/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('delete — backlinks 있으면 dry-run 에서 경고', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['delete', 'capabilities/foo', root]);
    assert.equal(r.code, 0);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /dry-run/);
    assert.match(clean, /backlink/);
    assert.match(clean, /--force/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('delete --confirm (no backlinks) — 파일 삭제', async () => {
  const root = withVault([
    {
      slug: 'capabilities/lonely',
      content:
        '---\nkind: capability\nslug: capabilities/lonely\ntitle: Lonely\ndomain: domains/auth\n---\n',
    },
  ]);
  try {
    const r = await run([
      'delete',
      'capabilities/lonely',
      root,
      '--confirm',
    ]);
    assert.equal(r.code, 0, `stderr: ${r.stderr}`);
    assert.equal(
      existsSyncTest(join(root, 'capabilities/lonely.md')),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('merge — dry-run preview', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run([
      'merge',
      'capabilities/foo',
      'capabilities/bar',
      root,
    ]);
    assert.equal(r.code, 0);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /dry-run/);
    assert.match(clean, /capabilities\/foo/);
    assert.match(clean, /capabilities\/bar/);
    // foo.md 그대로 존재 (dry-run)
    assert.equal(existsSyncTest(join(root, 'capabilities/foo.md')), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── analyze --apply (R+ — agent-less bootstrap) ─────────────────────────
//
// CLI 가 analyze_repo_structure 결과를 add_concepts + add_relations 배치로
// land. /ontology-bootstrap skill 의 CLI 짝.

function makeRepoFixture() {
  const repo = mkdtempSync(join(tmpdir(), 'cli-repo-'));
  writeFileSync(
    join(repo, 'package.json'),
    JSON.stringify(
      { name: 'test-app', description: 'Test app for analyze --apply' },
      null,
      2,
    ),
    'utf-8',
  );
  // FSD-ish layout — features 한 두개 만들어 capability 후보 생성.
  mkdirSync(join(repo, 'src', 'features', 'auth'), { recursive: true });
  mkdirSync(join(repo, 'src', 'features', 'billing'), { recursive: true });
  return repo;
}

await test('analyze --apply — concepts/relations vault 에 land', async () => {
  const vault = withVault([]);
  const repo = makeRepoFixture();
  try {
    const r = await run([
      'analyze',
      repo,
      '--vault',
      vault,
      '--apply',
    ]);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /analyze --apply/);
    assert.match(clean, /concepts/);
    // project (test-app) 노드가 vault 에 land 됐어야.
    const projectFile = join(vault, 'test-app.md');
    assert.equal(existsSyncTest(projectFile), true, 'project file landed');
    const fm = readFileSync(projectFile, 'utf-8');
    assert.match(fm, /kind: project/);
    // analyze 가 pkg.description 을 title 로 사용 (혹은 fallback humanize).
    assert.match(fm, /title: Test app for analyze --apply/);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('analyze (default, no --apply) — vault 변경 0', async () => {
  const vault = withVault([]);
  const repo = makeRepoFixture();
  try {
    const r = await run(['analyze', repo, '--vault', vault]);
    assert.equal(r.code, 0);
    // vault 에 새 .md 파일이 *없어야* 함 (default 는 read-only).
    assert.equal(
      existsSyncTest(join(vault, 'test-app.md')),
      false,
      'project file 안 만들어짐 (default mode)',
    );
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('analyze --apply 두 번째 실행 → "already existed" 카운트, errors 0', async () => {
  const vault = withVault([]);
  const repo = makeRepoFixture();
  try {
    const r1 = await run(['analyze', repo, '--vault', vault, '--apply']);
    assert.equal(r1.code, 0);
    const r2 = await run(['analyze', repo, '--vault', vault, '--apply']);
    assert.equal(r2.code, 0, `2번째 실행 실패: ${r2.stdout}\n${r2.stderr}`);
    const clean = stripAnsi(r2.stdout);
    // 모두 already existed (concept side) + 모두 already existed (relation side, idempotent).
    assert.match(clean, /already existed/);
    // errors 0
    assert.match(clean, /0 errors/);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('analyze --apply — 마지막 vault census 라인 (R+ cycle 38)', async () => {
  const vault = withVault([]);
  const repo = makeRepoFixture();
  try {
    const r = await run(['analyze', repo, '--vault', vault, '--apply']);
    assert.equal(r.code, 0);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /vault now has \d+ nodes/);
    assert.match(clean, /project=1/);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('analyze --apply --json — vaultCensus 필드 (R+ cycle 38)', async () => {
  const vault = withVault([]);
  const repo = makeRepoFixture();
  try {
    const r = await run([
      'analyze',
      repo,
      '--vault',
      vault,
      '--apply',
      '--json',
    ]);
    assert.equal(r.code, 0);
    const data = JSON.parse(r.stdout);
    assert.ok(data.vaultCensus);
    assert.equal(typeof data.vaultCensus.total, 'number');
    assert.ok(data.vaultCensus.total >= 1);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('analyze --apply --json — applied / summary 필드 노출', async () => {
  const vault = withVault([]);
  const repo = makeRepoFixture();
  try {
    const r = await run([
      'analyze',
      repo,
      '--vault',
      vault,
      '--apply',
      '--json',
    ]);
    assert.equal(r.code, 0);
    const data = JSON.parse(r.stdout);
    assert.ok(data.applied, 'applied 필드 있음');
    assert.ok(Array.isArray(data.applied.concepts), 'applied.concepts 배열');
    assert.ok(Array.isArray(data.applied.relations), 'applied.relations 배열');
    assert.ok(data.summary, 'summary 필드 있음');
    assert.equal(typeof data.summary.errors, 'number');
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

// ── infer-imports --apply (R+ — agent-less depends_on landing) ──────────
//
// analyze --apply 의 짝. moduleEdges 를 depends_on 관계로 batch land.

function makeImportRepo() {
  // 두 capability (a, b) 가 a → b 로 import. moduleEdges 가 1 개 나옴.
  const repo = mkdtempSync(join(tmpdir(), 'cli-imp-'));
  mkdirSync(join(repo, 'src', 'a'), { recursive: true });
  mkdirSync(join(repo, 'src', 'b'), { recursive: true });
  writeFileSync(
    join(repo, 'src', 'a', 'index.ts'),
    "import { x } from '../b';\nexport const z = x;\n",
    'utf-8',
  );
  writeFileSync(
    join(repo, 'src', 'b', 'index.ts'),
    'export const x = 1;\n',
    'utf-8',
  );
  return repo;
}

await test('infer-imports --apply — depends_on 관계 land (endpoints 존재 시)', async () => {
  const vault = withVault([
    {
      slug: 'a',
      content: '---\nkind: capability\ntitle: A\ndomain: x\n---\n',
    },
    {
      slug: 'b',
      content: '---\nkind: capability\ntitle: B\ndomain: x\n---\n',
    },
  ]);
  const repo = makeImportRepo();
  try {
    const r = await run([
      'infer-imports',
      repo,
      '--vault',
      vault,
      '--apply',
    ]);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /infer-imports --apply/);
    assert.match(clean, /landed|already existed/);
    // a.md 의 frontmatter 에 dependencies (inline 또는 list) 에 b 포함.
    const aDoc = readFileSync(join(vault, 'a.md'), 'utf-8');
    assert.match(aDoc, /dependencies:.*\bb\b/s);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('infer-imports (default) — vault 변경 0', async () => {
  const vault = withVault([
    {
      slug: 'a',
      content: '---\nkind: capability\ntitle: A\ndomain: x\n---\n',
    },
  ]);
  const repo = makeImportRepo();
  try {
    const before = readFileSync(join(vault, 'a.md'), 'utf-8');
    const r = await run(['infer-imports', repo, '--vault', vault]);
    assert.equal(r.code, 0);
    const after = readFileSync(join(vault, 'a.md'), 'utf-8');
    assert.equal(after, before, 'a.md 내용 그대로 (default 모드)');
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('infer-imports --apply — endpoint 없으면 row-level error, batch 살아남음', async () => {
  // vault 에 a 만 있고 b 가 없음 — a → b edge 는 fail 행, batch 자체는 OK.
  const vault = withVault([
    {
      slug: 'a',
      content: '---\nkind: capability\ntitle: A\ndomain: x\n---\n',
    },
  ]);
  const repo = makeImportRepo();
  try {
    const r = await run([
      'infer-imports',
      repo,
      '--vault',
      vault,
      '--apply',
    ]);
    // 적어도 한 row 가 fail → exit 1.
    assert.equal(r.code, 1, `expected exit 1; stdout: ${r.stdout}`);
    const clean = stripAnsi(r.stdout);
    // 에러 행 노출.
    assert.match(clean, /✗|does not exist|errors/);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('infer-imports --apply — 마지막 vault census 라인 (R+ cycle 38)', async () => {
  const vault = withVault([
    { slug: 'a', content: '---\nkind: capability\ntitle: A\ndomain: x\n---\n' },
    { slug: 'b', content: '---\nkind: capability\ntitle: B\ndomain: x\n---\n' },
  ]);
  const repo = makeImportRepo();
  try {
    const r = await run([
      'infer-imports',
      repo,
      '--vault',
      vault,
      '--apply',
    ]);
    assert.equal(r.code, 0);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /vault now has \d+ nodes/);
    assert.match(clean, /capability=2/);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('infer-imports --apply --json — applied / summary 필드 노출', async () => {
  const vault = withVault([
    {
      slug: 'a',
      content: '---\nkind: capability\ntitle: A\ndomain: x\n---\n',
    },
    {
      slug: 'b',
      content: '---\nkind: capability\ntitle: B\ndomain: x\n---\n',
    },
  ]);
  const repo = makeImportRepo();
  try {
    const r = await run([
      'infer-imports',
      repo,
      '--vault',
      vault,
      '--apply',
      '--json',
    ]);
    assert.equal(r.code, 0);
    const data = JSON.parse(r.stdout);
    assert.ok(data.applied, 'applied 필드');
    assert.ok(Array.isArray(data.applied.relations), 'applied.relations 배열');
    assert.ok(data.summary, 'summary 필드');
    assert.equal(typeof data.summary.errors, 'number');
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

// ── infer-imports --threshold N (R+ — weak edge 차단) ────────────────────

function makeStrongImportRepo() {
  // a 가 b 를 3번 import (count 3), c 를 1번 import (count 1).
  const repo = mkdtempSync(join(tmpdir(), 'cli-thr-'));
  mkdirSync(join(repo, 'src', 'a'), { recursive: true });
  mkdirSync(join(repo, 'src', 'b'), { recursive: true });
  mkdirSync(join(repo, 'src', 'c'), { recursive: true });
  // a 안 3개 파일이 b 를 import → b 는 count=3
  writeFileSync(
    join(repo, 'src', 'a', 'one.ts'),
    "import { x } from '../b';\nexport const a1 = x;\n",
    'utf-8',
  );
  writeFileSync(
    join(repo, 'src', 'a', 'two.ts'),
    "import { x } from '../b';\nexport const a2 = x;\n",
    'utf-8',
  );
  writeFileSync(
    join(repo, 'src', 'a', 'three.ts'),
    "import { x } from '../b';\nexport const a3 = x;\n",
    'utf-8',
  );
  // a/four 만 c 를 import → c 는 count=1 (weak)
  writeFileSync(
    join(repo, 'src', 'a', 'four.ts'),
    "import { y } from '../c';\nexport const a4 = y;\n",
    'utf-8',
  );
  writeFileSync(
    join(repo, 'src', 'b', 'index.ts'),
    'export const x = 1;\n',
    'utf-8',
  );
  writeFileSync(
    join(repo, 'src', 'c', 'index.ts'),
    'export const y = 1;\n',
    'utf-8',
  );
  return repo;
}

await test('infer-imports --threshold 3 — count < 3 edges 필터 (preview 모드)', async () => {
  const vault = withVault([]);
  const repo = makeStrongImportRepo();
  try {
    // 사전 — threshold 없이는 a→b · a→c 두 edge 모두 보여야 함.
    const noThr = await run([
      'infer-imports',
      repo,
      '--vault',
      vault,
      '--json',
    ]);
    assert.equal(noThr.code, 0);
    const noThrData = JSON.parse(noThr.stdout);
    assert.ok(
      noThrData.moduleEdges.length >= 2,
      `expected 2+ edges, got ${noThrData.moduleEdges.length}`,
    );

    // threshold 3 — count < 3 인 a→c 는 제외.
    const r = await run([
      'infer-imports',
      repo,
      '--vault',
      vault,
      '--threshold',
      '3',
      '--json',
    ]);
    assert.equal(r.code, 0);
    const data = JSON.parse(r.stdout);
    assert.ok(data.moduleEdges.length < noThrData.moduleEdges.length);
    for (const m of data.moduleEdges) {
      assert.ok(m.count >= 3, `${m.from}→${m.to} count=${m.count} should be ≥3`);
    }
    // thresholdApplied 메타데이터.
    assert.ok(data.thresholdApplied);
    assert.equal(data.thresholdApplied.threshold, 3);
    assert.ok(data.thresholdApplied.filteredOut >= 1);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('infer-imports --threshold 3 --apply — 약한 edge 는 land 안 됨', async () => {
  // vault 에 a, b, c 모두 존재 — threshold 없으면 a→b, a→c 둘 다 land.
  // threshold 3 면 a→b 만 land, a→c 는 filtered out (depend on c 안 생김).
  const vault = withVault([
    { slug: 'a', content: '---\nkind: capability\ntitle: A\ndomain: x\n---\n' },
    { slug: 'b', content: '---\nkind: capability\ntitle: B\ndomain: x\n---\n' },
    { slug: 'c', content: '---\nkind: capability\ntitle: C\ndomain: x\n---\n' },
  ]);
  const repo = makeStrongImportRepo();
  try {
    const r = await run([
      'infer-imports',
      repo,
      '--vault',
      vault,
      '--apply',
      '--threshold',
      '3',
    ]);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const aDoc = readFileSync(join(vault, 'a.md'), 'utf-8');
    // a 는 b 의존 (count=3, ≥ threshold).
    assert.match(aDoc, /dependencies:.*\bb\b/s);
    // a 는 c 의존 *없음* (count=1, < threshold) — filter out.
    assert.doesNotMatch(aDoc, /\bc\b/);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('infer-imports --threshold 0 (또는 미지정) — 변경 없음', async () => {
  const vault = withVault([]);
  const repo = makeStrongImportRepo();
  try {
    const r = await run([
      'infer-imports',
      repo,
      '--vault',
      vault,
      '--threshold',
      '1',
      '--json',
    ]);
    // threshold=1 이면 count >= 1 — 사실상 모든 edge. 필터 메타데이터도 안 붙음
    // (코드가 threshold > 1 일 때만 필터).
    assert.equal(r.code, 0);
    const data = JSON.parse(r.stdout);
    assert.equal(data.thresholdApplied, undefined);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('infer-imports --threshold abc — 잘못된 입력 거부', async () => {
  const vault = withVault([]);
  const repo = makeStrongImportRepo();
  try {
    const r = await run([
      'infer-imports',
      repo,
      '--vault',
      vault,
      '--threshold',
      'abc',
    ]);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /threshold/i);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

// ── bootstrap (R+ — analyze --apply + infer-imports --apply 합본) ───────

function makeFullRepo() {
  // FSD-ish layout — cycle 35 fix 후 analyze 와 infer_imports 가 같은 slug
  // ("auth" / "billing") 을 만들어 bootstrap 의 imports 단계가 endpoint 매치
  // 가능. 이전 cycle 34 에선 생성된 generic layout 으로 우회했음.
  const repo = mkdtempSync(join(tmpdir(), 'cli-bs-'));
  writeFileSync(
    join(repo, 'package.json'),
    JSON.stringify({ name: 'bs-app', description: 'BS app' }, null, 2),
    'utf-8',
  );
  mkdirSync(join(repo, 'src', 'features', 'auth'), { recursive: true });
  mkdirSync(join(repo, 'src', 'features', 'billing'), { recursive: true });
  writeFileSync(
    join(repo, 'src', 'features', 'auth', 'index.ts'),
    "import { x } from '../billing';\nexport const a = x;\n",
    'utf-8',
  );
  writeFileSync(
    join(repo, 'src', 'features', 'billing', 'index.ts'),
    'export const x = 1;\n',
    'utf-8',
  );
  return repo;
}

await test('bootstrap — analyze + infer-imports 한 명령으로 land (FSD slug parity, cycle 35)', async () => {
  const vault = withVault([]);
  const repo = makeFullRepo();
  try {
    const r = await run(['bootstrap', repo, '--vault', vault]);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /1\) analyze/);
    assert.match(clean, /2\) imports/);
    // project + capability 노드 land
    assert.equal(existsSyncTest(join(vault, 'bs-app.md')), true, 'project');
    assert.equal(existsSyncTest(join(vault, 'auth.md')), true, 'auth capability');
    assert.equal(
      existsSyncTest(join(vault, 'billing.md')),
      true,
      'billing capability',
    );
    // R+ — FSD slug parity 확인. analyze 가 "auth" / "billing" 으로 capability
    // 만들고, infer_imports 의 module slug 도 "auth" → "billing" 으로 일치해야
    // depends_on 에지가 진짜 land 됨. cycle 34 known issue 의 회귀 차단.
    const authDoc = readFileSync(join(vault, 'auth.md'), 'utf-8');
    assert.match(
      authDoc,
      /dependencies:.*\bbilling\b/s,
      `auth.md should depend_on billing — got: ${authDoc}`,
    );
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('bootstrap --skip-imports — 1단계 (analyze) 만, imports 영역 skipped 표시', async () => {
  const vault = withVault([]);
  const repo = makeFullRepo();
  try {
    const r = await run([
      'bootstrap',
      repo,
      '--vault',
      vault,
      '--skip-imports',
    ]);
    assert.equal(r.code, 0);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /1\) analyze/);
    assert.match(clean, /skipped \(--skip-imports\)/);
    assert.equal(existsSyncTest(join(vault, 'bs-app.md')), true);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('bootstrap --json — analyze / imports / summary 모두 단일 JSON', async () => {
  const vault = withVault([]);
  const repo = makeFullRepo();
  try {
    const r = await run(['bootstrap', repo, '--vault', vault, '--json']);
    assert.equal(r.code, 0);
    const data = JSON.parse(r.stdout);
    assert.ok(data.analyze, 'analyze 필드');
    assert.ok(Array.isArray(data.analyze.concepts));
    assert.ok(Array.isArray(data.analyze.relations));
    assert.ok(data.imports, 'imports 필드');
    assert.ok(Array.isArray(data.imports.relations));
    assert.ok(data.summary, 'summary 필드');
    assert.equal(typeof data.summary.errors, 'number');
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('bootstrap --threshold 3 — 약한 import (count<3) 안 land', async () => {
  // billing 는 1번만 import 됨 → threshold 3 면 import edge 안 land.
  const vault = withVault([]);
  const repo = makeFullRepo();
  try {
    const r = await run([
      'bootstrap',
      repo,
      '--vault',
      vault,
      '--threshold',
      '3',
      '--json',
    ]);
    assert.equal(r.code, 0);
    const data = JSON.parse(r.stdout);
    // imports 의 thresholdApplied 메타데이터.
    assert.ok(data.imports.thresholdApplied);
    assert.equal(data.imports.thresholdApplied.threshold, 3);
    // import relations 거의 0 (모두 약함).
    assert.equal(data.imports.relations.length, 0);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('bootstrap — 마지막에 vault census 한 줄 (R+ cycle 37)', async () => {
  const vault = withVault([]);
  const repo = makeFullRepo();
  try {
    const r = await run(['bootstrap', repo, '--vault', vault]);
    assert.equal(r.code, 0);
    const clean = stripAnsi(r.stdout);
    // census 라인 — \"vault now has N nodes (project=1 · capability=2 · ...)\"
    assert.match(clean, /vault now has \d+ nodes/);
    // 적어도 project + capability 카운트 표시.
    assert.match(clean, /project=1/);
    assert.match(clean, /capability=/);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('bootstrap --json — vaultCensus 필드 노출 (R+ cycle 37)', async () => {
  const vault = withVault([]);
  const repo = makeFullRepo();
  try {
    const r = await run(['bootstrap', repo, '--vault', vault, '--json']);
    assert.equal(r.code, 0);
    const data = JSON.parse(r.stdout);
    assert.ok(data.vaultCensus, 'vaultCensus 필드');
    assert.equal(typeof data.vaultCensus.total, 'number');
    assert.ok(data.vaultCensus.byKind, 'byKind 객체');
    assert.ok(data.vaultCensus.total >= 3, 'project + 2 capability 최소');
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('bootstrap 두번째 실행 — idempotent (errors 0)', async () => {
  const vault = withVault([]);
  const repo = makeFullRepo();
  try {
    const r1 = await run(['bootstrap', repo, '--vault', vault]);
    assert.equal(r1.code, 0);
    const r2 = await run(['bootstrap', repo, '--vault', vault]);
    assert.equal(r2.code, 0, `2nd run failed: ${r2.stdout}`);
    const clean = stripAnsi(r2.stdout);
    assert.match(clean, /already existed/);
    // errors 0 — 모든 행이 already exists / alreadyExists.
    assert.match(clean, /0 errors/);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

console.log(`\ncli integration: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
