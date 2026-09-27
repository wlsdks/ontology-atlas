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

const MY_SAAS = [
  doc('README', 'my-saas'),
  doc('docs/architecture', 'Architecture'),
  doc('docs/api', 'API'),
  doc('notes/todo', 'TODO'),
];

describe('deriveBootstrapPlan', () => {
  it('uses the root README as the project title and excludes it from element candidates', () => {
    const plan = deriveBootstrapPlan(MY_SAAS, 'fallback-folder');
    expect(plan.projectTitle).toBe('my-saas');
    expect(plan.elements.map((e) => e.slug)).not.toContain('README');
  });

  it('turns top-level folders into domain candidates sorted by document count descending', () => {
    const plan = deriveBootstrapPlan(MY_SAAS, 'x');
    expect(plan.domains).toEqual([
      { name: 'docs', docCount: 2 },
      { name: 'notes', docCount: 1 },
    ]);
  });

  it('turns folder documents into element candidates owned by their top-level folder domain', () => {
    const plan = deriveBootstrapPlan(MY_SAAS, 'x');
    expect(plan.elements).toEqual([
      { slug: 'docs/architecture', title: 'Architecture', domain: 'docs' },
      { slug: 'docs/api', title: 'API', domain: 'docs' },
      { slug: 'notes/todo', title: 'TODO', domain: 'notes' },
    ]);
  });

  it('uses the vault folder name as the project title when there is no README', () => {
    const plan = deriveBootstrapPlan([doc('docs/a', 'A')], 'my-vault');
    expect(plan.projectTitle).toBe('my-vault');
  });

  it('excludes documents that already have kind and counts them as partially built', () => {
    const plan = deriveBootstrapPlan(
      [...MY_SAAS, doc('domains/auth', 'Auth', { kind: 'domain' })],
      'x',
    );
    expect(plan.alreadyTypedCount).toBe(1);
    expect(plan.elements.map((e) => e.slug)).not.toContain('domains/auth');
  });

  it('turns root-level documents other than README into elements without a domain', () => {
    const plan = deriveBootstrapPlan([doc('README', 'p'), doc('CONTRIBUTING', 'Contributing')], 'x');
    expect(plan.elements).toEqual([{ slug: 'CONTRIBUTING', title: 'Contributing', domain: null }]);
  });

  it('uses a fallback project slug on collision', () => {
    const plan = deriveBootstrapPlan([doc('project', 'Existing')], 'x');
    expect(plan.projectSlug).toBe('ontology-project');
  });

  it('uses the file name as the title of an untitled document', () => {
    const plan = deriveBootstrapPlan([doc('docs/setup-guide')], 'x');
    expect(plan.elements[0].title).toBe('setup-guide');
  });
});

describe('selectedElements', () => {
  it('keeps only root documents and documents of approved domains', () => {
    const plan = deriveBootstrapPlan([...MY_SAAS, doc('LICENSE-NOTES', 'License')], 'x');
    const picked = selectedElements(plan, new Set(['docs']));
    expect(picked.map((e) => e.slug)).toEqual(['docs/architecture', 'docs/api', 'LICENSE-NOTES']);
  });
});

describe('buildProjectMarkdown', () => {
  it('gives a created project a fresh lowercase UUIDv4 uid', () => {
    const plan = deriveBootstrapPlan(MY_SAAS, 'x');
    const first = buildProjectMarkdown(plan, new Set(['docs']));
    const second = buildProjectMarkdown(plan, new Set(['docs']));
    const uidPattern = /^uid: ([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/m;

    expect(first).toMatch(uidPattern);
    expect(second).toMatch(uidPattern);
    expect(first.match(uidPattern)?.[1]).not.toBe(second.match(uidPattern)?.[1]);
  });

  it('writes kind project, approved domains and root elements to frontmatter', () => {
    const plan = deriveBootstrapPlan([...MY_SAAS, doc('CONTRIBUTING', 'Contributing')], 'x');
    const md = buildProjectMarkdown(plan, new Set(['docs', 'notes']));
    expect(md).toContain('kind: project');
    expect(md).toContain('title: my-saas');
    expect(md).toContain('domains:\n  - docs\n  - notes');
    expect(md).toContain('elements:\n  - CONTRIBUTING');
    expect(md.startsWith('---\n')).toBe(true);
    expect(md.split('---').length).toBeGreaterThanOrEqual(3);
  });

  it('omits rejected domains from frontmatter', () => {
    const plan = deriveBootstrapPlan(MY_SAAS, 'x');
    const md = buildProjectMarkdown(plan, new Set(['docs']));
    expect(md).toContain('  - docs');
    expect(md).not.toContain('  - notes');
  });
});

describe('domainDocSlug and buildDomainMarkdown', () => {
  it('matches the file tail to the derived slugifyName ref', () => {
    expect(domainDocSlug('docs')).toBe('docs/docs');
    // The tail is slugified; the folder path stays verbatim.
    expect(domainDocSlug('User Guides')).toBe('User Guides/user-guides');
  });

  it('builds kind domain frontmatter with a plain body', () => {
    const md = buildDomainMarkdown({ name: 'docs', docCount: 3 });
    expect(md).toContain('kind: domain');
    expect(md).toContain('title: docs');
    expect(md).toContain('문서 3개');
    expect(md.startsWith('---\n')).toBe(true);
  });

  it('gives a created domain a fresh lowercase UUIDv4 uid', () => {
    const first = buildDomainMarkdown({ name: 'docs', docCount: 3 });
    const second = buildDomainMarkdown({ name: 'docs', docCount: 3 });
    const uidPattern = /^uid: ([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/m;

    expect(first).toMatch(uidPattern);
    expect(second).toMatch(uidPattern);
    expect(first.match(uidPattern)?.[1]).not.toBe(second.match(uidPattern)?.[1]);
  });
});

/**
 * A runtime-owned `SKILL.md` (both spec keys `name` and `description`, no `kind`) never becomes a
 * candidate: approval would write into files the runtime and marketplace overwrite on update.
 */
describe('excludes runtime-owned SKILL.md files from candidates', () => {
  const skill = (slug: string) => ({
    slug,
    title: 'SKILL',
    frontmatter: { name: slug.split('/')[0], description: 'Does a thing. Use when asked.' },
  });

  it('yields zero candidates for a skills folder and counts the excluded files', () => {
    const plan = deriveBootstrapPlan(
      [skill('pdf/SKILL'), skill('docx/SKILL'), skill('xlsx/SKILL')],
      'skills',
    );
    expect(plan.elements, 'a candidate was created for a runtime-owned SKILL.md').toEqual([]);
    expect(plan.runtimeOwnedSkipped, 'the excluded count must explain the empty result').toBe(3);
  });

  it('keeps an ordinary document as a candidate', () => {
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

  it('treats a SKILL.md that already has kind as a vault node', () => {
    const plan = deriveBootstrapPlan(
      [{ slug: 'x/SKILL', title: 'x', frontmatter: { name: 'x', description: 'd', kind: 'element' } }],
      'vault',
    );
    // It already has a kind, so it counts as already typed, not as runtime-owned.
    expect(plan.runtimeOwnedSkipped).toBe(0);
    expect(plan.alreadyTypedCount).toBe(1);
  });

  it('treats a SKILL.md without the two required keys as an ordinary document', () => {
    const plan = deriveBootstrapPlan(
      [{ slug: 'notes/SKILL', title: '스킬이라는 제목의 메모', frontmatter: {} }],
      'vault',
    );
    expect(plan.runtimeOwnedSkipped).toBe(0);
    expect(plan.elements.map((e) => e.slug)).toEqual(['notes/SKILL']);
  });
});

/**
 * The starter's own `AGENTS.md` and `CLAUDE.md` bridge carry no `kind:` and are rewritten by the
 * next starter run (`entities/vault-session/lib/ontology-starter.ts`), so they are not candidates.
 */
describe('excludes agent instruction files from candidates', () => {
  const STARTER_OUTPUT = [
    doc('project', 'My project', { kind: 'project' }),
    doc('AGENTS'),
    doc('CLAUDE'),
    doc('domains/example', '예시 영역', { kind: 'domain' }),
  ];

  it('reports zero unmapped documents right after starting from an empty folder', () => {
    const plan = deriveBootstrapPlan(STARTER_OUTPUT, 'my-vault');
    expect(plan.elements, 'a starter instruction file became a candidate').toEqual([]);
    expect(plan.agentPointerSkipped).toBe(2);
  });

  it('excludes documents inside agent runtime folders', () => {
    const plan = deriveBootstrapPlan(
      [
        doc('.claude/rules/design'),
        doc('.agents/skills/atlas-review/README'),
        doc('.codex/config'),
        doc('GEMINI'),
        doc('notes/handover', '인계'),
      ],
      'vault',
    );
    expect(plan.elements.map((e) => e.slug)).toEqual(['notes/handover']);
    expect(plan.agentPointerSkipped).toBe(4);
  });

  it('keeps a human-written document with a similar name as a candidate', () => {
    const plan = deriveBootstrapPlan(
      [doc('docs/AGENTS', '우리 팀 에이전트 정리'), doc('claude-notes', '메모')],
      'vault',
    );
    expect(plan.elements.map((e) => e.slug).sort()).toEqual(['claude-notes', 'docs/AGENTS']);
    expect(plan.agentPointerSkipped).toBe(0);
  });
});

/**
 * The plan reports the merge `executeBootstrapPlan` performs, so the confirmation screen cannot
 * promise a file the run will not write.
 */
describe('when a project document already exists', () => {
  it('points at the existing project instead of creating a new file', () => {
    const plan = deriveBootstrapPlan(
      [
        doc('project', 'My project', { kind: 'project', title: 'My project' }),
        doc('notes/todo', 'TODO'),
      ],
      'my-vault',
    );
    expect(plan.existingProjectSlug).toBe('project');
    expect(plan.projectTitle).toBe('My project');
  });
});

/**
 * Frontmatter in a raw source breaks its verbatim promise and citation hashes, and Compile
 * rewrites wiki pages in place, so neither is a candidate.
 */
describe('excludes library files under sources/ and wiki/ from candidates', () => {
  it('yields zero candidates for a sources-and-wiki folder and counts the excluded files', () => {
    const plan = deriveBootstrapPlan(
      [
        doc('sources/quarter-plan', '분기 계획'),
        doc('sources/handbook', 'Handbook'),
        doc('wiki/quarter-plan', '분기 계획'),
        doc('wiki/handbook', 'Handbook'),
        doc('wiki/_template', '<문서 이름>'),
        doc('wiki/_log', '기록'),
        doc('.ontology-atlas/connectors', 'connectors'),
      ],
      'my-vault',
    );
    expect(plan.elements, 'a candidate would stamp kind on a library file').toEqual([]);
    expect(plan.domains, 'a library folder became a domain candidate').toEqual([]);
    expect(plan.librarySkipped, 'the excluded count must explain the empty result').toBe(7);
  });

  it('keeps a human-written document as a candidate beside library files', () => {
    const plan = deriveBootstrapPlan(
      [doc('sources/quarter-plan', '분기 계획'), doc('wiki/quarter-plan', '분기 계획'), doc('notes/plan', '계획')],
      'my-vault',
    );
    expect(plan.elements).toEqual([{ slug: 'notes/plan', title: '계획', domain: 'notes' }]);
    expect(plan.domains).toEqual([{ name: 'notes', docCount: 1 }]);
    expect(plan.librarySkipped).toBe(2);
  });

  it('applies the library rule only at the vault root, not to a nested wiki/', () => {
    const plan = deriveBootstrapPlan(
      [doc('notes/wiki/plan', '계획'), doc('notes/sources/raw', '원문 메모')],
      'my-vault',
    );
    expect(plan.elements.map((e) => e.slug).sort()).toEqual(['notes/sources/raw', 'notes/wiki/plan']);
    expect(plan.librarySkipped).toBe(0);
  });

  it('treats a document under wiki/ that has kind as a graph node', () => {
    const plan = deriveBootstrapPlan([doc('wiki/orders', '주문', { kind: 'domain' })], 'my-vault');
    expect(plan.librarySkipped).toBe(0);
    expect(plan.alreadyTypedCount).toBe(1);
  });
});
