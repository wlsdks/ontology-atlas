import { describe, expect, it } from 'vitest';
import { buildExtractionPrompt } from './build-prompt';
import { parseOntologyDocument } from '@/shared/lib/ontology-frontmatter';
import type { OntologyClass } from '@/entities/ontology-class';
import type { OntologyRelation } from '@/entities/ontology-relation';

// shared/lib 테스트라 entities 값 import 금지 (FSD 경계). 미니 시드를
// 로컬 inline. 핵심 5+7 형태만 검증하면 충분.
const ts = new Date('2026-04-27T00:00:00Z');
const CLASSES: OntologyClass[] = [
  { id: 'project', name: '프로젝트', description: '제품 단위', version: 1, createdBy: 'sys', createdAt: ts },
  { id: 'domain', name: '도메인', description: '문제 영역', version: 1, createdBy: 'sys', createdAt: ts },
  { id: 'capability', name: '역량', description: '기능 능력', version: 1, createdBy: 'sys', createdAt: ts },
  { id: 'element', name: '요소', description: '구현체', version: 1, createdBy: 'sys', createdAt: ts },
  { id: 'document', name: '문서', description: '근거', version: 1, createdBy: 'sys', createdAt: ts },
];
const RELATIONS: OntologyRelation[] = [
  { id: 'contains', name: '포함', sourceClassIds: ['project','domain','capability'], targetClassIds: ['domain','capability','element'], category: 'structure', symmetric: false, transitive: true, version: 1, createdBy: 'sys', createdAt: ts },
  { id: 'belongs_to', name: '소속', sourceClassIds: ['domain','capability','element'], targetClassIds: ['project','domain','capability'], category: 'structure', symmetric: false, transitive: true, version: 1, createdBy: 'sys', createdAt: ts },
  { id: 'depends_on', name: '의존', sourceClassIds: [], targetClassIds: [], category: 'behavior', symmetric: false, transitive: false, version: 1, createdBy: 'sys', createdAt: ts },
  { id: 'implements', name: '구현', sourceClassIds: ['element'], targetClassIds: ['capability'], category: 'behavior', symmetric: false, transitive: false, version: 1, createdBy: 'sys', createdAt: ts },
  { id: 'uses', name: '사용', sourceClassIds: ['element','capability'], targetClassIds: ['element'], category: 'behavior', symmetric: false, transitive: false, version: 1, createdBy: 'sys', createdAt: ts },
  { id: 'describes', name: '설명', sourceClassIds: ['document'], targetClassIds: ['project','domain','capability','element'], category: 'evidence', symmetric: false, transitive: false, version: 1, createdBy: 'sys', createdAt: ts },
  { id: 'related_to', name: '연관', sourceClassIds: [], targetClassIds: [], category: 'weak', symmetric: true, transitive: false, version: 1, createdBy: 'sys', createdAt: ts },
];

const STRICT_DOC = `---
id: auth-login
kind: capability
project: aslan-maps
domain: authentication
title: 로그인
status: active
version: 1
aliases: [sign in]
tags: [auth]
relates:
  - type: depends_on
    target: iam
---

## 요약

로그인 기능.
`;

const FREEFORM_DOC = `# 자유 글

frontmatter 없음.
`;

describe('buildExtractionPrompt — confidence cap by grade', () => {
  it('grade A → cap 1.0', () => {
    const parsed = parseOntologyDocument(STRICT_DOC);
    expect(parsed.grade).toBe('A');
    const result = buildExtractionPrompt({
      parsedDoc: parsed,
      classes: CLASSES,
      relations: RELATIONS,
      extractorVersion: 'test-1',
    });
    expect(result.confidenceCap).toBe(1);
  });

  it('grade C → cap 0.59 (자동 반영 금지)', () => {
    const parsed = parseOntologyDocument(FREEFORM_DOC);
    expect(parsed.grade).toBe('C');
    const result = buildExtractionPrompt({
      parsedDoc: parsed,
      classes: CLASSES,
      relations: RELATIONS,
      extractorVersion: 'test-1',
    });
    expect(result.confidenceCap).toBe(0.59);
  });
});

describe('buildExtractionPrompt — system prompt content', () => {
  const parsed = parseOntologyDocument(STRICT_DOC);
  const result = buildExtractionPrompt({
    parsedDoc: parsed,
    classes: CLASSES,
    relations: RELATIONS,
    extractorVersion: 'test-1',
    documentId: 'doc-123',
  });

  it('lists every TBox class', () => {
    for (const cls of CLASSES) {
      expect(result.system).toContain(`\`${cls.id}\``);
    }
  });

  it('lists every TBox relation with category', () => {
    for (const rel of RELATIONS) {
      expect(result.system).toContain(`\`${rel.id}\``);
      expect(result.system).toContain(`(${rel.category})`);
    }
  });

  it('mentions transitive flag for contains', () => {
    // contains 는 transitive=true.
    expect(result.system).toMatch(/contains.*transitive/);
  });

  it('embeds the document grade and confidence cap', () => {
    expect(result.system).toContain('grade A');
    expect(result.system).toContain('1');
  });

  it('forbids self-loop edges', () => {
    expect(result.system).toMatch(/Self-loop|self-loop|from == to/);
  });

  it('includes extractor version trail', () => {
    expect(result.system).toContain('extractorVersion: test-1');
    expect(result.system).toContain('documentId=doc-123');
  });

  it('requires JSON-only output', () => {
    expect(result.system).toMatch(/JSON only/);
  });
});

describe('buildExtractionPrompt — user prompt content', () => {
  const parsed = parseOntologyDocument(STRICT_DOC);
  const result = buildExtractionPrompt({
    parsedDoc: parsed,
    classes: CLASSES,
    relations: RELATIONS,
    extractorVersion: 'test-1',
  });

  it('embeds frontmatter facts', () => {
    expect(result.user).toContain('auth-login');
    expect(result.user).toContain('capability');
    expect(result.user).toContain('aslan-maps');
  });

  it('embeds the relates declaration as ground-truth edges', () => {
    expect(result.user).toContain('depends_on');
    expect(result.user).toContain('iam');
    expect(result.user).toMatch(/confidence 1\.0/);
  });

  it('includes the body content for extraction', () => {
    expect(result.user).toContain('## 요약');
    expect(result.user).toContain('로그인 기능');
  });
});

describe('buildExtractionPrompt — freeform document', () => {
  const parsed = parseOntologyDocument(FREEFORM_DOC);
  const result = buildExtractionPrompt({
    parsedDoc: parsed,
    classes: CLASSES,
    relations: RELATIONS,
    extractorVersion: 'test-1',
  });

  it('still produces a valid prompt with grade C', () => {
    expect(result.system).toContain('grade C');
    expect(result.confidenceCap).toBe(0.59);
  });

  it('user section says no declared frontmatter', () => {
    expect(result.user).toContain('no declared frontmatter');
  });
});
