import { describe, expect, it } from 'vitest';
import { parseOntologyDocument } from './parse';

const STRICT_DOC = `---
id: auth-login
kind: capability
project: aslan-maps
domain: authentication
title: 로그인
status: active
version: 1
aliases:
  - sign in
  - 로그인 기능
tags:
  - auth
  - p0
relates:
  - type: depends_on
    target: iam
  - type: implements
    target: auth-policy
    note: "auth policy 를 구현"
---

## 요약

이메일 / OAuth 두 경로로 로그인.
`;

const LENIENT_DOC = `---
id: project-card
kind: element
project: aslan-maps
title: 프로젝트 카드
version: 1
---

## 요약

토폴로지 캔버스에서 한 프로젝트를 표현하는 카드 노드.
`;

const FREEFORM_DOC = `# 잡노트 — 어쩌면 프로젝트가 될 것

…자유 글…
`;

describe('parseOntologyDocument — 등급 A (strict)', () => {
  const result = parseOntologyDocument(STRICT_DOC);

  it('classifies as grade A', () => {
    expect(result.grade).toBe('A');
  });

  it('extracts all required + recommended fields', () => {
    expect(result.frontmatter.id).toBe('auth-login');
    expect(result.frontmatter.kind).toBe('capability');
    expect(result.frontmatter.project).toBe('aslan-maps');
    expect(result.frontmatter.title).toBe('로그인');
    expect(result.frontmatter.version).toBe(1);
    expect(result.frontmatter.domain).toBe('authentication');
    expect(result.frontmatter.status).toBe('active');
  });

  it('parses block-style aliases and tags', () => {
    expect(result.frontmatter.aliases).toEqual(['sign in', '로그인 기능']);
    expect(result.frontmatter.tags).toEqual(['auth', 'p0']);
  });

  it('parses relates block with type/target/note', () => {
    expect(result.frontmatter.relates).toHaveLength(2);
    expect(result.frontmatter.relates?.[0]).toEqual({
      type: 'depends_on',
      target: 'iam',
    });
    expect(result.frontmatter.relates?.[1]).toEqual({
      type: 'implements',
      target: 'auth-policy',
      note: 'auth policy 를 구현',
    });
  });

  it('strips frontmatter from body', () => {
    expect(result.body.startsWith('## 요약')).toBe(true);
    expect(result.body.includes('---')).toBe(false);
  });

  it('produces no warnings for valid document', () => {
    expect(result.warnings).toEqual([]);
  });
});

describe('parseOntologyDocument — 등급 B (lenient, element 인데 elementType 누락)', () => {
  const result = parseOntologyDocument(LENIENT_DOC);

  it('classifies as grade B', () => {
    expect(result.grade).toBe('B');
  });

  it('still extracts required fields', () => {
    expect(result.frontmatter.id).toBe('project-card');
    expect(result.frontmatter.kind).toBe('element');
    expect(result.frontmatter.title).toBe('프로젝트 카드');
  });

  it('does not have elementType', () => {
    expect(result.frontmatter.elementType).toBeUndefined();
  });
});

describe('parseOntologyDocument — 등급 C (freeform)', () => {
  const result = parseOntologyDocument(FREEFORM_DOC);

  it('classifies as grade C', () => {
    expect(result.grade).toBe('C');
  });

  it('returns body as-is', () => {
    expect(result.body).toBe(FREEFORM_DOC);
  });

  it('produces a warning explaining the auto-block', () => {
    expect(result.warnings.join('\n')).toMatch(/등급 C/);
    expect(result.warnings.join('\n')).toMatch(/frontmatter/);
  });
});

describe('parseOntologyDocument — 검증 경고', () => {
  it('warns on invalid kind', () => {
    const md = `---
id: foo
kind: invalid-kind
project: aslan-maps
title: 잘못된 kind
version: 1
---
`;
    const result = parseOntologyDocument(md);
    expect(result.warnings.some((w) => w.includes('kind'))).toBe(true);
    expect(result.frontmatter.kind).toBeUndefined();
  });

  it('warns on invalid id pattern', () => {
    const md = `---
id: NotKebab
kind: project
project: aslan
title: bad id
version: 1
---
`;
    const result = parseOntologyDocument(md);
    expect(result.warnings.some((w) => w.includes('id'))).toBe(true);
  });

  it('warns on relates target equal to self', () => {
    const md = `---
id: self-ref
kind: project
project: self-ref
title: self ref
version: 1
relates:
  - type: depends_on
    target: self-ref
---
`;
    const result = parseOntologyDocument(md);
    expect(result.warnings.some((w) => w.includes('자기 자신'))).toBe(true);
  });

  it('rejects unknown edge type in relates', () => {
    const md = `---
id: foo
kind: capability
project: aslan
title: foo
version: 1
relates:
  - type: eats
    target: bar
---
`;
    const result = parseOntologyDocument(md);
    expect(result.warnings.some((w) => w.includes('eats'))).toBe(true);
    expect(result.frontmatter.relates).toBeUndefined();
  });

  it('warns on invalid elementType when kind=element', () => {
    const md = `---
id: foo
kind: element
project: aslan
title: foo
version: 1
elementType: weird-type
---
`;
    const result = parseOntologyDocument(md);
    expect(result.warnings.some((w) => w.includes('elementType'))).toBe(true);
  });
});

describe('parseOntologyDocument — inline arrays still work', () => {
  it('parses inline tags', () => {
    const md = `---
id: foo
kind: capability
project: aslan
title: foo
version: 1
tags: [a, b, "c d"]
---

body
`;
    const result = parseOntologyDocument(md);
    expect(result.frontmatter.tags).toEqual(['a', 'b', 'c d']);
  });
});

describe('parseOntologyDocument — element with valid elementType is grade A', () => {
  it('classifies as A when elementType present', () => {
    const md = `---
id: login-api
kind: element
project: aslan
domain: auth
title: Login API
status: active
version: 1
elementType: api
aliases: [login-endpoint]
tags: [auth]
---

body
`;
    const result = parseOntologyDocument(md);
    expect(result.grade).toBe('A');
    expect(result.frontmatter.elementType).toBe('api');
  });
});
