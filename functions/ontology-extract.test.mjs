// 단순 smoke test (Node:test 기반, vitest 없이 작동).
//   node --test functions/ontology-extract.test.mjs
//
// JS mirror 가 TS canonical 과 같은 출력을 내는지 핵심 시나리오만 검증.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseOntologyDocument,
  buildExtractionPrompt,
  validateExtractionOutput,
  callClaude,
  extractOntology,
  extractOntologyChunked,
  splitMarkdownByLength,
  mergeOntologyExtractions,
  buildOntologyOutputRecord,
  DEFAULT_ONTOLOGY_CLASSES,
  DEFAULT_ONTOLOGY_RELATIONS,
  LlmCallError,
  // T-12 mirror
  normalizeSlug,
  resolveCanonicalNodeId,
  createStubPlaceholder,
  mergeStubPlaceholders,
} from './ontology-extract.js';

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
tags:
  - auth
relates:
  - type: depends_on
    target: iam
---

## 요약

로그인 기능.
`;

const FREEFORM_DOC = `# 자유 글\n\nfrontmatter 없음.\n`;

test('parseOntologyDocument — strict doc grade A', () => {
  const r = parseOntologyDocument(STRICT_DOC);
  assert.equal(r.grade, 'A');
  assert.equal(r.frontmatter.id, 'auth-login');
  assert.equal(r.frontmatter.kind, 'capability');
  assert.deepEqual(r.frontmatter.aliases, ['sign in']);
  assert.deepEqual(r.frontmatter.tags, ['auth']);
  assert.equal(r.frontmatter.relates.length, 1);
  assert.equal(r.frontmatter.relates[0].type, 'depends_on');
  assert.equal(r.frontmatter.relates[0].target, 'iam');
  assert.ok(r.body.startsWith('## 요약'));
});

test('parseOntologyDocument — freeform grade C', () => {
  const r = parseOntologyDocument(FREEFORM_DOC);
  assert.equal(r.grade, 'C');
  assert.match(r.warnings.join('\n'), /등급 C/);
});

test('buildExtractionPrompt — confidence cap by grade', () => {
  const a = buildExtractionPrompt({
    parsedDoc: parseOntologyDocument(STRICT_DOC),
    classes: [{ id: 'project', description: '프로젝트' }],
    relations: [
      { id: 'depends_on', category: 'behavior', sourceClassIds: [], targetClassIds: [] },
    ],
    extractorVersion: 'ontology-v1',
  });
  assert.equal(a.confidenceCap, 1.0);
  assert.match(a.system, /TBox/);

  const c = buildExtractionPrompt({
    parsedDoc: parseOntologyDocument(FREEFORM_DOC),
    classes: [],
    relations: [],
    extractorVersion: 'ontology-v1',
  });
  assert.equal(c.confidenceCap, 0.59);
});

test('validateExtractionOutput — happy path', () => {
  const r = validateExtractionOutput({
    summary: 's',
    nodes: [
      {
        tempId: 'a',
        title: 'A',
        kind: 'capability',
        projectIds: ['p'],
        summary: '',
        confidence: 0.9,
      },
    ],
    edges: [],
    warnings: [],
  });
  assert.equal(r.ok, true);
  assert.equal(r.value.nodes.length, 1);
});

test('validateExtractionOutput — drops invalid kind', () => {
  const r = validateExtractionOutput({
    summary: 's',
    nodes: [
      {
        tempId: 'a',
        title: 'A',
        kind: 'concept', // 5 종 enum 에 없음
        projectIds: [],
        summary: '',
        confidence: 0.9,
      },
    ],
    edges: [],
    warnings: [],
  });
  assert.equal(r.value.nodes.length, 0);
  assert.ok(r.errors.some((e) => e.path.includes('kind')));
});

test('callClaude — auth error mapping', async () => {
  const fakeFetch = async () => new Response('', { status: 401 });
  await assert.rejects(
    () => callClaude({ apiKey: 'k', system: 's', user: 'u', fetch: fakeFetch }),
    (err) => err instanceof LlmCallError && err.code === 'auth',
  );
});

test('extractOntology — full pipeline with mock LLM', async () => {
  const mockLlmFn = async () => ({
    text: JSON.stringify({
      summary: 'OK',
      nodes: [
        {
          tempId: 'auth-login',
          title: '로그인',
          kind: 'capability',
          projectIds: ['aslan-maps'],
          summary: '',
          confidence: 0.95,
        },
      ],
      edges: [],
      warnings: [],
    }),
    usage: { inputTokens: 100, outputTokens: 50, estimatedCostUsd: 0.0011 },
    latencyMs: 1200,
    model: 'claude-sonnet-4-6',
    stopReason: 'end_turn',
  });

  const result = await extractOntology({
    markdown: STRICT_DOC,
    classes: [{ id: 'capability' }],
    relations: [{ id: 'depends_on', category: 'behavior' }],
    apiKey: 'k',
    extractorVersion: 'ontology-v1',
    callLlmFn: mockLlmFn,
  });

  assert.equal(result.grade, 'A');
  assert.equal(result.output.nodes.length, 1);
  assert.equal(result.output.nodes[0].confidence, 0.95);
  assert.equal(result.usage.inputTokens, 100);
  assert.equal(result.validationErrors.length, 0);
});

test('extractOntology — confidence cap by grade C', async () => {
  const mockLlmFn = async () => ({
    text: JSON.stringify({
      summary: 'forced low',
      nodes: [
        {
          tempId: 'doc',
          title: 'Doc',
          kind: 'document',
          projectIds: [],
          summary: '',
          confidence: 0.95, // LLM tries to claim high confidence
        },
      ],
      edges: [],
      warnings: [],
    }),
    usage: { inputTokens: 0, outputTokens: 0 },
    latencyMs: 100,
    model: 'claude-sonnet-4-6',
    stopReason: 'end_turn',
  });

  const result = await extractOntology({
    markdown: FREEFORM_DOC,
    classes: [],
    relations: [],
    apiKey: 'k',
    extractorVersion: 'ontology-v1',
    callLlmFn: mockLlmFn,
  });
  assert.equal(result.grade, 'C');
  // capped to 0.59 even though LLM said 0.95.
  assert.equal(result.output.nodes[0].confidence, 0.59);
});

test('extractOntology — strips markdown fences from LLM output', async () => {
  const mockLlmFn = async () => ({
    text: '```json\n{"summary":"x","nodes":[],"edges":[],"warnings":[]}\n```',
    usage: { inputTokens: 0, outputTokens: 0 },
    latencyMs: 0,
    model: 'claude-sonnet-4-6',
    stopReason: 'end_turn',
  });
  const result = await extractOntology({
    markdown: STRICT_DOC,
    classes: [],
    relations: [],
    apiKey: 'k',
    extractorVersion: 'ontology-v1',
    callLlmFn: mockLlmFn,
  });
  assert.equal(result.output.summary, 'x');
});

test('seeds — DEFAULT_ONTOLOGY_CLASSES has 6 (T-12 unknown 추가), DEFAULT_ONTOLOGY_RELATIONS has 7', () => {
  assert.equal(DEFAULT_ONTOLOGY_CLASSES.length, 6);
  const classIds = DEFAULT_ONTOLOGY_CLASSES.map((c) => c.id).sort();
  assert.deepEqual(classIds, [
    'capability',
    'document',
    'domain',
    'element',
    'project',
    'unknown',
  ]);
  assert.equal(DEFAULT_ONTOLOGY_RELATIONS.length, 7);
  const relIds = DEFAULT_ONTOLOGY_RELATIONS.map((r) => r.id).sort();
  assert.deepEqual(relIds, [
    'belongs_to',
    'contains',
    'depends_on',
    'describes',
    'implements',
    'related_to',
    'uses',
  ]);
});

test('buildOntologyOutputRecord — produces Firestore-shaped doc', () => {
  const extraction = {
    output: {
      summary: 's',
      nodes: [
        {
          tempId: 'a',
          title: 'A',
          kind: 'capability',
          projectIds: ['p'],
          summary: '',
          confidence: 0.9,
        },
      ],
      edges: [],
      warnings: [],
    },
    grade: 'A',
    usage: { inputTokens: 100, outputTokens: 50, estimatedCostUsd: 0.001 },
    latencyMs: 1200,
    validationErrors: [],
  };
  const record = buildOntologyOutputRecord({
    accountId: null,
    jobId: 'job-1',
    documentId: 'doc-1',
    documentVersionId: 'v-1',
    extractorVersion: 'ontology-v1',
    extraction,
    serverTimestamp: { _internal: 'ts' },
  });
  assert.equal(record.jobId, 'job-1');
  assert.equal(record.documentId, 'doc-1');
  assert.equal(record.provider, 'anthropic');
  assert.equal(record.grade, 'A');
  assert.equal(record.nodes.length, 1);
  assert.equal(record.usage.estimatedCostUsd, 0.001);
  assert.equal(record.latencyMs, 1200);
  assert.equal(record.validationErrorCount, 0);
  assert.equal(record.createdAt._internal, 'ts');
  assert.ok(!('accountId' in record), 'null accountId 는 record 에 포함 안 됨');
});

test('buildOntologyOutputRecord — accountId 가 string 이면 포함', () => {
  const record = buildOntologyOutputRecord({
    accountId: 'acc-1',
    jobId: 'job-1',
    documentId: 'doc-1',
    documentVersionId: 'v-1',
    extractorVersion: 'ontology-v1',
    extraction: {
      output: { summary: '', nodes: [], edges: [], warnings: [] },
      grade: 'C',
      usage: { inputTokens: 0, outputTokens: 0 },
      latencyMs: 0,
      validationErrors: [],
    },
    serverTimestamp: 't',
  });
  assert.equal(record.accountId, 'acc-1');
});

test('full integration — STRICT_DOC + DEFAULT TBox + mock LLM', async () => {
  // T-4e integration smoke: 실제 사용될 TBox 시드와 STRICT_DOC 으로 풀
  // 파이프라인 통과. mock LLM 으로 외부 의존 차단.
  const mockLlmFn = async ({ system, user }) => {
    // prompt 가 TBox 5 클래스 + 7 관계를 포함하는지 자체 확인
    assert.match(system, /\bproject\b/);
    assert.match(system, /\belement\b/);
    assert.match(system, /\bdepends_on\b/);
    assert.match(system, /\bdescribes\b/);
    assert.match(user, /auth-login/);
    return {
      text: JSON.stringify({
        summary: 'login spec',
        nodes: [
          {
            tempId: 'auth-login',
            title: '로그인',
            kind: 'capability',
            projectIds: ['aslan-maps'],
            summary: '이메일 / OAuth',
            confidence: 0.91,
            evidence: [{ excerpt: '로그인 기능' }],
          },
        ],
        edges: [],
        warnings: [],
      }),
      usage: { inputTokens: 1500, outputTokens: 300 },
      latencyMs: 1800,
      model: 'claude-sonnet-4-6',
      stopReason: 'end_turn',
    };
  };
  const result = await extractOntology({
    markdown: STRICT_DOC,
    classes: DEFAULT_ONTOLOGY_CLASSES,
    relations: DEFAULT_ONTOLOGY_RELATIONS,
    apiKey: 'test',
    extractorVersion: 'ontology-v1',
    documentId: 'doc-test',
    callLlmFn: mockLlmFn,
  });

  assert.equal(result.grade, 'A');
  assert.equal(result.output.nodes.length, 1);
  assert.equal(result.output.nodes[0].confidence, 0.91); // not capped (grade A)
  assert.equal(result.usage.inputTokens, 1500);

  // record 빌드까지 시뮬레이션
  const record = buildOntologyOutputRecord({
    accountId: null,
    jobId: 'job-x',
    documentId: 'doc-test',
    documentVersionId: 'v-test',
    extractorVersion: 'ontology-v1',
    extraction: result,
    serverTimestamp: 'mock-ts',
  });
  assert.equal(record.provider, 'anthropic');
  assert.equal(record.nodes.length, 1);
  assert.equal(record.grade, 'A');
});

test('canonical mirror — normalizeSlug / resolveCanonicalNodeId / createStubPlaceholder', () => {
  // smoke — TS canonical 와 동일 동작인지 확인
  assert.equal(normalizeSlug('AuthLogin'), 'authlogin');
  assert.equal(normalizeSlug('로그인'), '로그인');
  assert.equal(normalizeSlug('Auth! V2'), 'auth-v2');
  assert.equal(normalizeSlug(''), 'unknown');

  const r1 = resolveCanonicalNodeId({
    tempId: 'n1',
    title: '로그인',
    kind: 'capability',
    frontmatterId: 'auth-login',
    frontmatterKind: 'capability',
  });
  assert.equal(r1.canonicalId, 'capability:auth-login');
  assert.equal(r1.source, 'frontmatter-id');

  const r2 = resolveCanonicalNodeId({
    tempId: 'n1',
    title: 'X',
    kind: 'element',
    frontmatterId: 'a',
    frontmatterKind: 'capability', // 충돌
  });
  assert.equal(r2.canonicalId, 'capability:a');
  assert.match(r2.conflictWarning, /충돌/);

  const r3 = resolveCanonicalNodeId({
    tempId: 'n1',
    title: 'Title',
    kind: 'element',
    primaryProjectId: 'aslan-maps',
  });
  assert.equal(r3.canonicalId, 'element:aslan-maps:title');
  assert.equal(r3.source, 'legacy-slug');

  const stub = createStubPlaceholder({
    targetId: 'iam',
    declaredType: 'depends_on',
    pendingFromId: 'capability:auth-login',
    evidenceDocumentId: 'doc-1',
  });
  assert.equal(stub.id, 'unknown:iam');
  assert.equal(stub.kind, 'unknown');
  assert.equal(stub.pendingType, 'depends_on');
  assert.equal(stub.isStub, true);

  const merged = mergeStubPlaceholders([
    createStubPlaceholder({
      targetId: 'iam',
      declaredType: 'depends_on',
      pendingFromId: 'a',
      evidenceDocumentId: 'doc-1',
    }),
    createStubPlaceholder({
      targetId: 'iam',
      declaredType: 'uses',
      pendingFromId: 'b',
      evidenceDocumentId: 'doc-2',
    }),
  ]);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].evidenceIds.sort(), ['doc-1', 'doc-2']);
});

test('extractOntology — frontmatter relates 가 추출 노드와 매칭되면 정상 edge', async () => {
  const doc = `---
id: auth-login
kind: capability
project: aslan-maps
title: 로그인
status: active
version: 1
aliases: [sign in]
tags: [auth]
relates:
  - type: implements
    target: login-action
---

## 요약
로그인.
`;

  const mockLlmFn = async () =>
    ({
      text: JSON.stringify({
        summary: 's',
        nodes: [
          {
            tempId: 'login-action',
            title: 'LoginAction',
            kind: 'element',
            projectIds: ['aslan-maps'],
            summary: '',
            confidence: 0.9,
          },
        ],
        edges: [],
        warnings: [],
      }),
      usage: { inputTokens: 0, outputTokens: 0 },
      latencyMs: 0,
      model: 'claude-sonnet-4-6',
      stopReason: 'end_turn',
    });

  const result = await extractOntology({
    markdown: doc,
    classes: DEFAULT_ONTOLOGY_CLASSES,
    relations: DEFAULT_ONTOLOGY_RELATIONS,
    apiKey: 'k',
    extractorVersion: 'ontology-v1',
    callLlmFn: mockLlmFn,
  });

  // 매칭된 frontmatter relates → 정상 edge (강등 X)
  const fmEdge = result.output.edges.find(
    (e) => e.fromTempId === 'auth-login' && e.toTempId === 'login-action',
  );
  assert.ok(fmEdge, 'frontmatter edge 가 생성되어야 함');
  assert.equal(fmEdge.type, 'implements'); // 원본 type 보존
  assert.equal(fmEdge.confidence, 1.0);
  // stubs 는 0
  assert.equal(result.output.stubs.length, 0);
});

test('extractOntology — 미존재 relates.target → stub + related_to 강등', async () => {
  const doc = `---
id: auth-login
kind: capability
project: aslan-maps
title: 로그인
status: active
version: 1
aliases: [sign in]
tags: [auth]
relates:
  - type: depends_on
    target: iam-service
---

## 요약
iam 의존.
`;

  const mockLlmFn = async () =>
    ({
      text: JSON.stringify({
        summary: 's',
        nodes: [],
        edges: [],
        warnings: [],
      }),
      usage: { inputTokens: 0, outputTokens: 0 },
      latencyMs: 0,
      model: 'claude-sonnet-4-6',
      stopReason: 'end_turn',
    });

  const result = await extractOntology({
    markdown: doc,
    classes: DEFAULT_ONTOLOGY_CLASSES,
    relations: DEFAULT_ONTOLOGY_RELATIONS,
    apiKey: 'k',
    extractorVersion: 'ontology-v1',
    documentId: 'doc-x',
    callLlmFn: mockLlmFn,
  });

  // stub 1 개
  assert.equal(result.output.stubs.length, 1);
  const stub = result.output.stubs[0];
  assert.equal(stub.id, 'unknown:iam-service');
  assert.equal(stub.kind, 'unknown');
  assert.equal(stub.pendingType, 'depends_on');
  assert.equal(stub.pendingFromId, 'capability:auth-login');
  assert.deepEqual(stub.evidenceIds, ['doc-x']);

  // edge 1 개 — type 강등
  const fmEdge = result.output.edges.find((e) => e.toTempId === 'iam-service');
  assert.ok(fmEdge);
  assert.equal(fmEdge.type, 'related_to'); // 강등
  assert.equal(fmEdge.confidence, 1.0);
  assert.match(fmEdge.warnings[0], /stub/);

  // warnings 에 surface
  assert.ok(result.output.warnings.some((w) => w.includes('stub')));
});

test('extractOntology — frontmatter id 없으면 relates 처리 안 함 + warning', async () => {
  const doc = `# 자유 글\n\n없음.\n`; // freeform → no id
  const mockLlmFn = async () =>
    ({
      text: JSON.stringify({ summary: '', nodes: [], edges: [], warnings: [] }),
      usage: { inputTokens: 0, outputTokens: 0 },
      latencyMs: 0,
      model: 'claude-sonnet-4-6',
      stopReason: 'end_turn',
    });
  const result = await extractOntology({
    markdown: doc,
    classes: DEFAULT_ONTOLOGY_CLASSES,
    relations: DEFAULT_ONTOLOGY_RELATIONS,
    apiKey: 'k',
    extractorVersion: 'ontology-v1',
    callLlmFn: mockLlmFn,
  });
  assert.equal(result.output.stubs.length, 0);
});

test('extractOntology — canonicalIds 결과가 output 에 포함 (approval flow 용)', async () => {
  const doc = `---
id: auth-login
kind: capability
project: aslan-maps
title: 로그인
version: 1
---
body
`;
  const mockLlmFn = async () =>
    ({
      text: JSON.stringify({
        summary: 's',
        nodes: [
          {
            tempId: 'auth-login',
            title: '로그인',
            kind: 'capability',
            projectIds: ['aslan-maps'],
            summary: '',
            confidence: 0.9,
          },
          {
            tempId: 'side-action',
            title: 'Side',
            kind: 'element',
            projectIds: ['aslan-maps'],
            summary: '',
            confidence: 0.7,
          },
        ],
        edges: [],
        warnings: [],
      }),
      usage: { inputTokens: 0, outputTokens: 0 },
      latencyMs: 0,
      model: 'claude-sonnet-4-6',
      stopReason: 'end_turn',
    });
  const result = await extractOntology({
    markdown: doc,
    classes: DEFAULT_ONTOLOGY_CLASSES,
    relations: DEFAULT_ONTOLOGY_RELATIONS,
    apiKey: 'k',
    extractorVersion: 'ontology-v1',
    callLlmFn: mockLlmFn,
  });
  assert.equal(result.output.canonicalIds.length, 2);
  // tempId === frontmatter id 인 노드는 frontmatter-id source
  const authMapping = result.output.canonicalIds.find(
    (c) => c.sourceTempId === 'auth-login',
  );
  assert.equal(authMapping.canonicalId, 'capability:auth-login');
  assert.equal(authMapping.source, 'frontmatter-id');
  // 다른 노드는 legacy slug
  const sideMapping = result.output.canonicalIds.find(
    (c) => c.sourceTempId === 'side-action',
  );
  assert.equal(sideMapping.canonicalId, 'element:aslan-maps:side');
  assert.equal(sideMapping.source, 'legacy-slug');
});

test('extractOntology — invalid JSON throws LlmCallError(invalid_response)', async () => {
  const mockLlmFn = async () => ({
    text: 'not json',
    usage: { inputTokens: 0, outputTokens: 0 },
    latencyMs: 0,
    model: 'claude-sonnet-4-6',
    stopReason: 'end_turn',
  });
  await assert.rejects(
    () =>
      extractOntology({
        markdown: STRICT_DOC,
        classes: [],
        relations: [],
        apiKey: 'k',
        extractorVersion: 'ontology-v1',
        callLlmFn: mockLlmFn,
      }),
    (err) => err instanceof LlmCallError && err.code === 'invalid_response',
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// A0-3 chunk 분해 + merge
// ─────────────────────────────────────────────────────────────────────────────

test('splitMarkdownByLength — 짧은 입력은 단일 chunk', () => {
  const md = '# Title\n\n본문 내용.';
  const chunks = splitMarkdownByLength(md, 1000);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0], md);
});

test('splitMarkdownByLength — heading 경계 우선 분할', () => {
  const md = `# A\n\n${'a'.repeat(200)}\n\n## B\n\n${'b'.repeat(200)}\n\n## C\n\n${'c'.repeat(200)}`;
  const chunks = splitMarkdownByLength(md, 250);
  assert.ok(chunks.length >= 2);
  // 두 번째 chunk 가 ## 또는 # 으로 시작해야 (line 시작 heading boundary).
  const startsWithHeading = chunks.slice(1).every((c) => /^#{1,6} /.test(c));
  assert.ok(startsWithHeading, `chunks must start with heading: ${chunks.map((c) => c.slice(0, 10))}`);
});

test('splitMarkdownByLength — heading 없으면 paragraph 경계 사용', () => {
  const md = `${'a'.repeat(150)}\n\n${'b'.repeat(150)}\n\n${'c'.repeat(150)}`;
  const chunks = splitMarkdownByLength(md, 200);
  assert.ok(chunks.length >= 2);
  // 합쳐서 원본 길이 보존.
  assert.equal(chunks.join(''), md);
});

test('splitMarkdownByLength — heading/paragraph 둘 다 없으면 hard cut', () => {
  const md = 'x'.repeat(500);
  const chunks = splitMarkdownByLength(md, 100);
  assert.equal(chunks.length, 5);
  for (const c of chunks) assert.ok(c.length <= 100);
  assert.equal(chunks.join(''), md);
});

test('mergeOntologyExtractions — 노드 (kind, title) dedup, edge 충돌 회피', () => {
  const r1 = {
    output: {
      nodes: [
        { tempId: 't1', kind: 'capability', title: '사용자 로그인', confidence: 0.7 },
        { tempId: 't2', kind: 'element', title: 'JWT 토큰', confidence: 0.6 },
      ],
      edges: [
        { tempId: 'e1', type: 'uses', fromTempId: 't1', toTempId: 't2', confidence: 0.5 },
      ],
    },
    grade: 'B',
    usage: { inputTokens: 100, outputTokens: 50, estimatedCostUsd: 0.001 },
    latencyMs: 800,
  };
  const r2 = {
    output: {
      nodes: [
        // 같은 (kind, title) — confidence 더 높으니 갱신.
        { tempId: 't1', kind: 'capability', title: '사용자 로그인', confidence: 0.95 },
        { tempId: 't2', kind: 'element', title: 'Refresh 토큰', confidence: 0.8 },
      ],
      edges: [
        // 같은 의미 edge — chunk 1 의 (uses, 로그인→토큰) 와 다른 to 라 새 edge.
        { tempId: 'e1', type: 'uses', fromTempId: 't1', toTempId: 't2', confidence: 0.65 },
      ],
    },
    grade: 'C',
    usage: { inputTokens: 80, outputTokens: 40, estimatedCostUsd: 0.0008 },
    latencyMs: 600,
  };
  const merged = mergeOntologyExtractions([r1, r2]);
  // 노드 — 로그인 (1), JWT (1), Refresh (1) = 3.
  assert.equal(merged.output.nodes.length, 3);
  const login = merged.output.nodes.find((n) => n.title === '사용자 로그인');
  assert.equal(login.confidence, 0.95); // 더 높은 confidence 채택.
  // 엣지 — 두 chunk 의 edge 가 다른 to 노드 가리킴 → 별도 edge 2.
  assert.equal(merged.output.edges.length, 2);
  // usage 합산.
  assert.equal(merged.usage.inputTokens, 180);
  assert.equal(merged.usage.outputTokens, 90);
  assert.ok(Math.abs(merged.usage.estimatedCostUsd - 0.0018) < 1e-9);
  assert.equal(merged.latencyMs, 1400);
  // grade 가장 보수적 (C).
  assert.equal(merged.grade, 'C');
  assert.equal(merged.chunkCount, 2);
});

test('extractOntologyChunked — 한 chunk 면 단일 호출', async () => {
  let callCount = 0;
  const mockLlmFn = async () => {
    callCount += 1;
    return {
      text: JSON.stringify({
        version: 1,
        documentId: 'd',
        baseConfidence: 0.7,
        warnings: [],
        nodes: [],
        edges: [],
      }),
      usage: { inputTokens: 10, outputTokens: 5, estimatedCostUsd: 0.0001 },
      latencyMs: 100,
      model: 'claude-sonnet-4-6',
      stopReason: 'end_turn',
    };
  };
  const r = await extractOntologyChunked({
    markdown: '# 짧은 문서\n\n본문.',
    classes: [],
    relations: [],
    apiKey: 'k',
    extractorVersion: 'ontology-v1',
    callLlmFn: mockLlmFn,
    maxChunkSize: 1000,
  });
  assert.equal(callCount, 1);
  // 단일 chunk 라 chunkCount 미설정 (extractOntology 직접 반환).
  assert.equal(r.chunkCount, undefined);
});

test('extractOntologyChunked — maxChunks 초과 시 cost_cap throw', async () => {
  const md = 'x'.repeat(10_000);
  await assert.rejects(
    () =>
      extractOntologyChunked({
        markdown: md,
        classes: [],
        relations: [],
        apiKey: 'k',
        extractorVersion: 'ontology-v1',
        callLlmFn: async () => { throw new Error('should not call LLM'); },
        maxChunkSize: 1000, // → 10 chunks
        maxChunks: 3, // 3 한도 → throw
      }),
    (err) => err instanceof Error && err.message.startsWith('[cost_cap]'),
  );
});
