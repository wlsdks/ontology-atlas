import { describe, expect, it } from 'vitest';
import { validateExtractionOutput } from './validate-output';

const VALID_OUTPUT = {
  summary: '인증 도메인의 로그인 기능에 대한 spec.',
  nodes: [
    {
      tempId: 'auth-login',
      title: '로그인',
      kind: 'capability',
      projectIds: ['aslan-maps'],
      summary: '이메일 / OAuth 로그인',
      confidence: 0.92,
      evidence: [{ excerpt: '두 경로로 로그인' }],
    },
    {
      tempId: 'login-action',
      title: 'LoginAction',
      kind: 'element',
      projectIds: ['aslan-maps'],
      summary: 'API 엔드포인트',
      confidence: 0.8,
      elementType: 'api',
      evidence: [{ excerpt: 'LoginAction api endpoint' }],
    },
  ],
  edges: [
    {
      tempId: 'login-impl',
      fromTempId: 'login-action',
      toTempId: 'auth-login',
      type: 'implements',
      confidence: 0.78,
      evidence: [{ excerpt: 'LoginAction implements auth-login' }],
    },
  ],
  warnings: [],
};

describe('validateExtractionOutput — happy path', () => {
  it('accepts a well-formed output', () => {
    const result = validateExtractionOutput(VALID_OUTPUT);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.value?.nodes).toHaveLength(2);
    expect(result.value?.edges).toHaveLength(1);
  });

  it('preserves elementType and evidence', () => {
    const result = validateExtractionOutput(VALID_OUTPUT);
    expect(result.value?.nodes[1]!.elementType).toBe('api');
    expect(result.value?.nodes[0]!.evidence?.[0]?.excerpt).toBe('두 경로로 로그인');
  });
});

describe('validateExtractionOutput — top-level guards', () => {
  it('rejects non-object input', () => {
    const result = validateExtractionOutput('not an object');
    expect(result.ok).toBe(false);
  });

  it('treats missing summary as empty + records error', () => {
    const result = validateExtractionOutput({
      nodes: [],
      edges: [],
      warnings: [],
    });
    expect(result.ok).toBe(true);
    expect(result.value?.summary).toBe('');
    expect(result.errors.some((e) => e.path === 'summary')).toBe(true);
  });

  it('records error when nodes is not an array', () => {
    const result = validateExtractionOutput({
      summary: '',
      nodes: 'not array',
      edges: [],
      warnings: [],
    });
    expect(result.errors.some((e) => e.path === 'nodes')).toBe(true);
  });
});

describe('validateExtractionOutput — node validation', () => {
  it('rejects node with invalid kind', () => {
    const result = validateExtractionOutput({
      summary: '',
      nodes: [
        { tempId: 'a', title: 'A', kind: 'unknown', projectIds: [], confidence: 0.5 },
      ],
      edges: [],
      warnings: [],
    });
    expect(result.errors.some((e) => e.path === 'nodes[0].kind')).toBe(true);
    expect(result.value?.nodes).toHaveLength(0);
  });

  it('rejects node with confidence outside [0,1]', () => {
    const result = validateExtractionOutput({
      summary: '',
      nodes: [
        {
          tempId: 'a',
          title: 'A',
          kind: 'capability',
          projectIds: [],
          summary: '',
          confidence: 1.5,
        },
      ],
      edges: [],
      warnings: [],
    });
    expect(result.errors.some((e) => e.path === 'nodes[0].confidence')).toBe(true);
  });

  it('drops duplicate tempId nodes', () => {
    const result = validateExtractionOutput({
      summary: '',
      nodes: [
        {
          tempId: 'a',
          title: 'A1',
          kind: 'capability',
          projectIds: [],
          summary: '',
          confidence: 0.5,
          evidence: [{ excerpt: 'e' }],
        },
        {
          tempId: 'a',
          title: 'A2',
          kind: 'capability',
          projectIds: [],
          summary: '',
          confidence: 0.5,
          evidence: [{ excerpt: 'e' }],
        },
      ],
      edges: [],
      warnings: [],
    });
    expect(result.value?.nodes).toHaveLength(1);
    expect(result.errors.some((e) => e.message.includes('중복'))).toBe(true);
  });
});

describe('validateExtractionOutput — edge validation', () => {
  const baseNodes = [
    {
      tempId: 'a',
      title: 'A',
      kind: 'capability',
      projectIds: [],
      summary: '',
      confidence: 0.7,
    },
    {
      tempId: 'b',
      title: 'B',
      kind: 'element',
      projectIds: [],
      summary: '',
      confidence: 0.7,
    },
  ];

  it('accepts a valid edge between known nodes', () => {
    const result = validateExtractionOutput({
      summary: '',
      nodes: baseNodes,
      edges: [
        {
          tempId: 'e1',
          fromTempId: 'b',
          toTempId: 'a',
          type: 'implements',
          confidence: 0.7,
        },
      ],
      warnings: [],
    });
    expect(result.value?.edges).toHaveLength(1);
  });

  it('rejects edge referencing unknown nodes', () => {
    const result = validateExtractionOutput({
      summary: '',
      nodes: baseNodes,
      edges: [
        {
          tempId: 'e1',
          fromTempId: 'ghost',
          toTempId: 'a',
          type: 'depends_on',
          confidence: 0.7,
        },
      ],
      warnings: [],
    });
    expect(result.value?.edges).toHaveLength(0);
    expect(result.errors.some((e) => e.path === 'edges[0].fromTempId')).toBe(true);
  });

  it('rejects edge with unknown type', () => {
    const result = validateExtractionOutput({
      summary: '',
      nodes: baseNodes,
      edges: [
        {
          tempId: 'e1',
          fromTempId: 'a',
          toTempId: 'b',
          type: 'eats',
          confidence: 0.7,
        },
      ],
      warnings: [],
    });
    expect(result.errors.some((e) => e.path === 'edges[0].type')).toBe(true);
  });

  it('rejects self-loop edges', () => {
    const result = validateExtractionOutput({
      summary: '',
      nodes: baseNodes,
      edges: [
        {
          tempId: 'e1',
          fromTempId: 'a',
          toTempId: 'a',
          type: 'related_to',
          confidence: 0.5,
        },
      ],
      warnings: [],
    });
    expect(result.value?.edges).toHaveLength(0);
    expect(result.errors.some((e) => e.message.includes('self-loop'))).toBe(true);
  });
});

describe('validateExtractionOutput — evidence validation', () => {
  it('rejects evidence with empty excerpt', () => {
    const result = validateExtractionOutput({
      summary: '',
      nodes: [
        {
          tempId: 'a',
          title: 'A',
          kind: 'capability',
          projectIds: [],
          summary: '',
          confidence: 0.9,
          evidence: [{ excerpt: '' }],
        },
      ],
      edges: [],
      warnings: [],
    });
    expect(result.errors.some((e) => e.path.includes('excerpt'))).toBe(true);
  });

  it('rejects evidence with excerpt > 240 chars', () => {
    const long = 'x'.repeat(241);
    const result = validateExtractionOutput({
      summary: '',
      nodes: [
        {
          tempId: 'a',
          title: 'A',
          kind: 'capability',
          projectIds: [],
          summary: '',
          confidence: 0.9,
          evidence: [{ excerpt: long }],
        },
      ],
      edges: [],
      warnings: [],
    });
    expect(result.errors.some((e) => e.message.includes('240자 초과'))).toBe(true);
  });
});
