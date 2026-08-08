import assert from 'node:assert/strict';
import test from 'node:test';

import {
  auditSkills,
  classifyReferences,
  distinctiveTerms,
  parseSkill,
} from './audit-claude-skills.mjs';

/**
 * 스킬 무결성 계기가 **정말 무언가를 보고 있는지** 잠근다.
 *
 * 이 도구는 발견용이라 게이트가 아니다. 그러나 발견 도구도 틀리면 엉뚱한 것을
 * 고치게 만든다 — 이번 라운드에 **두 번** 그랬다.
 *
 * **① 참조를 한 덩어리로 셌다.** 죽은 참조 700건 중 666건은 「프로젝트에 있으면
 * 읽어라」식 조건부라 결함이 아니었다.
 *
 * **② 로드되지 않는 파일을 셌다(더 컸다).** `~/.claude/plugins` 를 통째로 훑어
 * **207개**를 보고했는데, 정본은 `installed_plugins.json`(플러그인당 installPath
 * 하나)이고 실제 로드는 **60개**였다. 나머지는 버전별 다운로드 캐시와 설치도
 * 안 한 카탈로그 클론이었다. 좁히니 이름 충돌 38→**2**, 강한 겹침 41→**1쌍**,
 * 깨진 자기참조 37→**0**(7건 전부 저장소 루트에 실재하는 오탐)이 됐다.
 *
 * 그 잘못된 숫자로 카운슬 브리프를 썼고, 다섯 자리 중 셋이 그것을 근거로 판정한
 * 뒤 한 자리가 잡아냈다. **분모를 틀리면 결론이 틀린다** — 이 시험이 잠그는 것이
 * 그 분모다.
 */

const SKILL = (name, description, body = '') =>
  `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}`;

test('parseSkill — 발동을 정하는 두 값을 뽑는다', () => {
  const parsed = parseSkill(SKILL('pdf', 'Extract text from PDF files', 'body here'));
  assert.equal(parsed.name, 'pdf');
  assert.equal(parsed.description, 'Extract text from PDF files');
  assert.match(parsed.body, /body here/);
});

test('parseSkill — 접힌 여러 줄 설명도 한 줄로 모은다', () => {
  const raw = '---\nname: x\ndescription: |-\n  first line\n  second line\n---\n\nbody';
  const parsed = parseSkill(raw);
  assert.match(parsed.description, /first line/);
  assert.match(parsed.description, /second line/);
});

test('parseSkill — frontmatter 가 없으면 null (스킬이 아니다)', () => {
  assert.equal(parseSkill('# just markdown\n'), null);
});

test('distinctiveTerms — 어느 스킬에나 나오는 말은 뺀다', () => {
  const terms = distinctiveTerms('Use this skill when the user wants to create a PDF invoice');
  assert.ok(terms.includes('pdf'), 'pdf 는 남아야 한다');
  assert.ok(terms.includes('invoice'), 'invoice 는 남아야 한다');
  for (const generic of ['use', 'this', 'skill', 'when', 'user', 'wants', 'create']) {
    assert.ok(!terms.includes(generic), `"${generic}" 은 빠져야 한다 — 안 빼면 모든 쌍이 겹쳐 보인다`);
  }
});

test('classifyReferences — 자기 폴더 참조와 조건부 참조를 가른다', () => {
  const { bundled, conditional } = classifyReferences(
    'Read references/spec.md and scripts/run.py. If the project has src/tokens.js or docs/design.md, read those too.',
  );
  assert.deepEqual(bundled.sort(), ['references/spec.md', 'scripts/run.py']);
  assert.ok(conditional.includes('src/tokens.js'));
  assert.ok(conditional.includes('docs/design.md'));
});

test('auditSkills — 같은 이름인데 설명이 다른 것을 위험으로 표시한다', () => {
  const skills = [
    { name: 'dup', description: 'Build frontend interfaces', body: '', file: '/a/SKILL.md', terms: ['frontend'] },
    { name: 'dup', description: 'Guidance for visual design', body: '', file: '/b/SKILL.md', terms: ['visual'] },
    { name: 'same', description: 'identical text', body: '', file: '/c/SKILL.md', terms: ['identical'] },
    { name: 'same', description: 'identical text', body: '', file: '/d/SKILL.md', terms: ['identical'] },
  ];
  const report = auditSkills(skills, { exists: () => true });
  assert.equal(report.total, 4);
  assert.equal(report.uniqueNames, 2);
  const dup = report.duplicates.find((d) => d.name === 'dup');
  const same = report.duplicates.find((d) => d.name === 'same');
  assert.equal(dup.descriptionsDiffer, true, '설명이 다르면 발동 조건이 경쟁한다 — 표시해야 한다');
  assert.equal(same.descriptionsDiffer, false, '설명이 같으면 사본일 뿐이다');
});

test('auditSkills — 이름이 다른데 트리거가 겹치는 쌍을 찾는다', () => {
  const skills = [
    { name: 'a', description: '', body: '', file: '/a', terms: ['invoice', 'pdf', 'export', 'ledger'] },
    { name: 'b', description: '', body: '', file: '/b', terms: ['invoice', 'pdf', 'export', 'receipt'] },
    { name: 'c', description: '', body: '', file: '/c', terms: ['kubernetes', 'cluster', 'pods'] },
  ];
  const report = auditSkills(skills, { exists: () => true });
  const found = report.overlaps.find((o) => (o.a === 'a' && o.b === 'b') || (o.a === 'b' && o.b === 'a'));
  assert.ok(found, 'a↔b 는 세 낱말을 공유하므로 잡혀야 한다');
  assert.ok(found.score > 0.4, `겹침 점수가 낮다: ${found?.score}`);
  assert.ok(
    !report.overlaps.some((o) => o.a === 'c' || o.b === 'c'),
    '아무것도 공유하지 않는 c 는 안 잡혀야 한다 — 안 그러면 이 계기가 무엇이든 겹쳤다고 말한다',
  );
});

test('auditSkills — 이름이 같은 쌍은 겹침으로 두 번 세지 않는다', () => {
  const skills = [
    { name: 'twin', description: '', body: '', file: '/a', terms: ['alpha', 'beta', 'gamma'] },
    { name: 'twin', description: '', body: '', file: '/b', terms: ['alpha', 'beta', 'gamma'] },
  ];
  const report = auditSkills(skills, { exists: () => true });
  assert.equal(report.overlaps.length, 0, '이름 충돌은 ① 에서 세므로 ② 에서 또 세면 순위가 오염된다');
});

/**
 * 이 시험이 지키는 핵심 — **조건부 참조를 결함으로 세지 않는다.** 여기가
 * 무너지면 「고쳐야 할 것 700건」이라는 소음이 돌아온다.
 */
test('auditSkills — 없는 조건부 참조는 결함으로 세지 않고, 없는 자기 폴더 참조만 센다', () => {
  const skills = [
    {
      name: 'x',
      description: '',
      body: 'Read references/have.md and references/gone.md. If present, read src/maybe.js.',
      file: '/skills/x/SKILL.md',
      terms: [],
    },
  ];
  const report = auditSkills(skills, {
    exists: (p) => p.endsWith('references/have.md'),
  });
  assert.equal(report.references.bundledTotal, 2);
  assert.equal(report.references.bundledMissing.length, 1);
  assert.equal(report.references.bundledMissing[0].ref, 'references/gone.md');
  assert.equal(report.references.conditionalTotal, 1);
  assert.equal(report.references.conditionalMissing, 1, '조건부는 세기는 하되');
  assert.ok(
    !report.references.bundledMissing.some((m) => m.ref.includes('maybe')),
    '조건부 참조가 결함 목록에 섞이면 안 된다',
  );
});

test('계기가 살아 있다 — 완전히 깨끗한 뭉치에서는 아무것도 보고하지 않는다', () => {
  const skills = [
    { name: 'one', description: '', body: 'references/a.md', file: '/s/one/SKILL.md', terms: ['alpha'] },
    { name: 'two', description: '', body: 'references/b.md', file: '/s/two/SKILL.md', terms: ['bravo'] },
  ];
  const report = auditSkills(skills, { exists: () => true });
  assert.equal(report.duplicates.length, 0);
  assert.equal(report.overlaps.length, 0);
  assert.equal(report.references.bundledMissing.length, 0);
});

test('installedPluginRoots — 정본이 지목한 installPath 만 돌려준다', async () => {
  const { installedPluginRoots } = await import('./audit-claude-skills.mjs');
  const roots = installedPluginRoots('/home', () => ({
    version: 2,
    plugins: {
      'a@m': [{ installPath: '/home/.claude/plugins/cache/a/1.0.0' }],
      'b@m': [{ installPath: '/home/.claude/plugins/cache/b/2.0.0' }, { installPath: '/home/.claude/plugins/cache/b/2.0.0' }],
      'c@m': [{ notAPath: true }],
    },
  }));
  assert.deepEqual(roots, [
    '/home/.claude/plugins/cache/a/1.0.0',
    '/home/.claude/plugins/cache/b/2.0.0',
  ]);
});

test('installedPluginRoots — 정본을 못 읽으면 빈 목록 (부풀린 숫자보다 「못 셌다」가 낫다)', async () => {
  const { installedPluginRoots } = await import('./audit-claude-skills.mjs');
  assert.deepEqual(
    installedPluginRoots('/home', () => {
      throw new Error('no manifest');
    }),
    [],
  );
});

/**
 * 저장소 루트에서 찾은 참조는 결함이 아니다 — 이 확인이 없을 때 우리 스킬 7건이
 * 전부 「깨진 참조」로 보고됐고 일곱 다 실재했다.
 */
test('auditSkills — 저장소 루트에 있는 참조는 깨진 것으로 세지 않는다', async () => {
  const { auditSkills } = await import('./audit-claude-skills.mjs');
  const skills = [
    {
      name: 'x',
      description: '',
      body: 'Run scripts/at-repo.mjs and scripts/nowhere.mjs.',
      file: '/skills/x/SKILL.md',
      terms: [],
    },
  ];
  const report = auditSkills(skills, {
    repoRoot: '/repo',
    exists: (p) => p === '/repo/scripts/at-repo.mjs',
  });
  assert.equal(report.references.bundledTotal, 2);
  assert.equal(report.references.repoRelative, 1, '저장소 루트에서 찾은 것은 따로 센다');
  assert.deepEqual(
    report.references.bundledMissing.map((m) => m.ref),
    ['scripts/nowhere.mjs'],
    '어디에도 없는 것만 결함이다',
  );
});
