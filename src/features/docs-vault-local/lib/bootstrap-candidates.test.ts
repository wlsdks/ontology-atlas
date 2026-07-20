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

/** discovery.md 의 재현 시나리오와 동일한 폴더 — my-saas. */
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
  it('kind: project + 승인된 domains + 루트 elements 를 frontmatter 로 노출한다', () => {
    const plan = deriveBootstrapPlan([...MY_SAAS, doc('CONTRIBUTING', 'Contributing')], 'x');
    const md = buildProjectMarkdown(plan, new Set(['docs', 'notes']));
    expect(md).toContain('kind: project');
    expect(md).toContain('title: my-saas');
    expect(md).toContain('domains:\n  - docs\n  - notes');
    expect(md).toContain('elements:\n  - CONTRIBUTING');
    // frontmatter 블록이 올바르게 닫힌다
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
    // 대문자·공백 폴더 — tail 은 slugify, 폴더 경로는 원문 유지
    expect(domainDocSlug('User Guides')).toBe('User Guides/user-guides');
  });

  it('kind: domain frontmatter + 평문 본문을 만든다', () => {
    const md = buildDomainMarkdown({ name: 'docs', docCount: 3 });
    expect(md).toContain('kind: domain');
    expect(md).toContain('title: docs');
    expect(md).toContain('문서 3개');
    expect(md.startsWith('---\n')).toBe(true);
  });
});
