import { describe, expect, it } from 'vitest';

import {
  buildDomainMarkdown,
  buildProjectMarkdown,
  deriveBootstrapPlan,
  domainDocSlug,
  selectedElements,
  type BootstrapDocInput,
} from './bootstrap-candidates';

const doc = (slug: string, title = '', fm: Record<string, unknown> = {}): BootstrapDocInput => ({
  slug,
  title,
  frontmatter: fm,
});

/** The same folder as the reproduction scenario — my-saas. */
const MY_SAAS = [
  doc('README', 'my-saas'),
  doc('docs/architecture', 'Architecture'),
  doc('docs/api', 'API'),
  doc('notes/todo', 'TODO'),
];

describe('deriveBootstrapPlan', () => {
  it('루트 README 는 project 제목이 되고 element 후보에서 빠진다', () => {
    const plan = deriveBootstrapPlan(MY_SAAS, 'fallback-folder');
    expect(plan.projectTitle).toBe('my-saas');
    expect(plan.elements.map((e) => e.slug)).not.toContain('README');
  });

  it('1뎁스 폴더가 domain 후보가 되고 문서 수 내림차순으로 정렬된다', () => {
    const plan = deriveBootstrapPlan(MY_SAAS, 'x');
    expect(plan.domains).toEqual([
      { name: 'docs', docCount: 2 },
      { name: 'notes', docCount: 1 },
    ]);
  });

  it('폴더 문서는 element 후보가 되고 자기 최상위 폴더를 domain 으로 갖는다', () => {
    const plan = deriveBootstrapPlan(MY_SAAS, 'x');
    expect(plan.elements).toEqual([
      { slug: 'docs/architecture', title: 'Architecture', domain: 'docs' },
      { slug: 'docs/api', title: 'API', domain: 'docs' },
      { slug: 'notes/todo', title: 'TODO', domain: 'notes' },
    ]);
  });

  it('README 가 없으면 vault 폴더 이름이 project 제목이 된다', () => {
    const plan = deriveBootstrapPlan([doc('docs/a', 'A')], 'my-vault');
    expect(plan.projectTitle).toBe('my-vault');
  });

  it('이미 kind: 를 가진 문서는 후보에서 빠지고 부분 구축 카운트로 집계된다', () => {
    const plan = deriveBootstrapPlan(
      [...MY_SAAS, doc('domains/auth', 'Auth', { kind: 'domain' })],
      'x',
    );
    expect(plan.alreadyTypedCount).toBe(1);
    expect(plan.elements.map((e) => e.slug)).not.toContain('domains/auth');
  });

  it('루트 레벨 문서(README 제외)는 domain 없는 element 가 된다', () => {
    const plan = deriveBootstrapPlan([doc('README', 'p'), doc('CONTRIBUTING', 'Contributing')], 'x');
    expect(plan.elements).toEqual([{ slug: 'CONTRIBUTING', title: 'Contributing', domain: null }]);
  });

  it('project slug 충돌 시 대체 slug 를 쓴다', () => {
    const plan = deriveBootstrapPlan([doc('project', 'Existing')], 'x');
    expect(plan.projectSlug).toBe('ontology-project');
  });

  it('제목 없는 문서는 파일명이 제목이 된다', () => {
    const plan = deriveBootstrapPlan([doc('docs/setup-guide')], 'x');
    expect(plan.elements[0].title).toBe('setup-guide');
  });
});

describe('selectedElements', () => {
  it('승인된 domain 의 문서와 루트 문서만 남는다', () => {
    const plan = deriveBootstrapPlan([...MY_SAAS, doc('LICENSE-NOTES', 'License')], 'x');
    const picked = selectedElements(plan, new Set(['docs']));
    expect(picked.map((e) => e.slug)).toEqual(['docs/architecture', 'docs/api', 'LICENSE-NOTES']);
  });
});

describe('buildProjectMarkdown', () => {
  it('생성하는 project에 fresh lowercase UUIDv4 uid를 넣는다', () => {
    const plan = deriveBootstrapPlan(MY_SAAS, 'x');
    const first = buildProjectMarkdown(plan, new Set(['docs']));
    const second = buildProjectMarkdown(plan, new Set(['docs']));
    const uidPattern = /^uid: ([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/m;

    expect(first).toMatch(uidPattern);
    expect(second).toMatch(uidPattern);
    expect(first.match(uidPattern)?.[1]).not.toBe(second.match(uidPattern)?.[1]);
  });

  it('kind: project + 승인된 domains + 루트 elements 를 frontmatter 로 노출한다', () => {
    const plan = deriveBootstrapPlan([...MY_SAAS, doc('CONTRIBUTING', 'Contributing')], 'x');
    const md = buildProjectMarkdown(plan, new Set(['docs', 'notes']));
    expect(md).toContain('kind: project');
    expect(md).toContain('title: my-saas');
    expect(md).toContain('domains:\n  - docs\n  - notes');
    expect(md).toContain('elements:\n  - CONTRIBUTING');
    // The frontmatter block closes correctly.
    expect(md.startsWith('---\n')).toBe(true);
    expect(md.split('---').length).toBeGreaterThanOrEqual(3);
  });

  it('거부된 domain 은 frontmatter 에서 빠진다', () => {
    const plan = deriveBootstrapPlan(MY_SAAS, 'x');
    const md = buildProjectMarkdown(plan, new Set(['docs']));
    expect(md).toContain('  - docs');
    expect(md).not.toContain('  - notes');
  });
});

describe('domainDocSlug · buildDomainMarkdown (재검 마찰 D — 도메인 파일화)', () => {
  it('파일 tail 이 derive 의 slugifyName ref 와 일치한다', () => {
    expect(domainDocSlug('docs')).toBe('docs/docs');
    // Folder names with capitals and spaces — the tail is slugified, the folder path stays verbatim.
    expect(domainDocSlug('User Guides')).toBe('User Guides/user-guides');
  });

  it('kind: domain frontmatter + 평문 본문을 만든다', () => {
    const md = buildDomainMarkdown({ name: 'docs', docCount: 3 });
    expect(md).toContain('kind: domain');
    expect(md).toContain('title: docs');
    expect(md).toContain('문서 3개');
    expect(md.startsWith('---\n')).toBe(true);
  });

  it('생성하는 domain에 fresh lowercase UUIDv4 uid를 넣는다', () => {
    const first = buildDomainMarkdown({ name: 'docs', docCount: 3 });
    const second = buildDomainMarkdown({ name: 'docs', docCount: 3 });
    const uidPattern = /^uid: ([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/m;

    expect(first).toMatch(uidPattern);
    expect(second).toMatch(uidPattern);
    expect(first.match(uidPattern)?.[1]).not.toBe(second.match(uidPattern)?.[1]);
  });
});

/**
 * **Do not write into someone else's files** — an already-shipped defect found in the PO council,
 * 2026-08-09.
 *
 * "Build a map from my documents" treats any slug in `manifest.docs` as a candidate and, on approval,
 * writes `uid`, `kind`, and `title` into that file. When a user opens a skills folder as their
 * document store, the `SKILL.md` files come straight into that list — measured, 105 candidates were
 * all `SKILL.md`. Those files are owned by the Claude runtime and the marketplace, and that folder is
 * a git checkout, so an update overwrites whatever we wrote.
 *
 * The property this test locks: *a `SKILL.md` owned by the runtime per its spec never enters the
 * candidates.* The test follows the official spec exactly — the file is named `SKILL.md`, it has both
 * required keys (`name`, `description`), and it has no `kind`.
 */
describe('런타임이 소유한 SKILL.md 는 후보에 넣지 않는다', () => {
  const skill = (slug: string) => ({
    slug,
    title: 'SKILL',
    frontmatter: { name: slug.split('/')[0], description: 'Does a thing. Use when asked.' },
  });

  it('스킬 폴더를 열면 후보가 0이고, 몇 개를 뺐는지 센다', () => {
    const plan = deriveBootstrapPlan(
      [skill('pdf/SKILL'), skill('docx/SKILL'), skill('xlsx/SKILL')],
      'skills',
    );
    expect(plan.elements, '남의 SKILL.md 에 쓸 후보가 만들어졌다').toEqual([]);
    expect(plan.runtimeOwnedSkipped, '왜 비었는지 화면이 말할 수 있어야 한다').toBe(3);
  });

  it('평범한 문서는 그대로 후보다 — 계기가 무엇이든 걸러내면 안 된다', () => {
    const plan = deriveBootstrapPlan(
      [
        skill('pdf/SKILL'),
        { slug: 'domains/orders', title: '주문', frontmatter: {} },
        { slug: 'notes/handover', title: '인계', frontmatter: {} },
      ],
      'vault',
    );
    expect(plan.elements.map((e) => e.slug).sort()).toEqual(['domains/orders', 'notes/handover']);
    expect(plan.runtimeOwnedSkipped).toBe(1);
  });

  it('SKILL.md 라도 이미 kind 가 있으면 우리 노드다 — 이 규칙이 가로채지 않는다', () => {
    const plan = deriveBootstrapPlan(
      [{ slug: 'x/SKILL', title: 'x', frontmatter: { name: 'x', description: 'd', kind: 'element' } }],
      'vault',
    );
    // It already has a kind, so it counts as "already typed", not as runtime-owned.
    expect(plan.runtimeOwnedSkipped).toBe(0);
    expect(plan.alreadyTypedCount).toBe(1);
  });

  it('이름이 SKILL 이어도 필수 두 키가 없으면 스킬이 아니다 — 그냥 문서다', () => {
    const plan = deriveBootstrapPlan(
      [{ slug: 'notes/SKILL', title: '스킬이라는 제목의 메모', frontmatter: {} }],
      'vault',
    );
    expect(plan.runtimeOwnedSkipped).toBe(0);
    expect(plan.elements.map((e) => e.slug)).toEqual(['notes/SKILL']);
  });
});
