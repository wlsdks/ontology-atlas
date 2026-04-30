import { describe, expect, it } from 'vitest';
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from '@/entities/knowledge-graph';
import type { OntologyClass } from '@/entities/ontology-class';
import type { OntologyRelation } from '@/entities/ontology-relation';
import {
  exportPayloadToJson,
  serializeOntologyExportV1,
  suggestExportFilename,
} from './serialize';
import { ONTOLOGY_EXPORT_VERSION } from './types';

const NOW = new Date('2026-04-28T12:34:56.000Z');

const SAMPLE_NODES: KnowledgeGraphNode[] = [
  {
    id: 'capability.auth-login',
    title: '로그인',
    kind: 'capability',
    projectIds: ['iam'],
    evidenceIds: ['doc-auth-login'],
    lastApprovedAt: new Date('2026-04-27T00:00:00Z'),
    lastApprovedBy: 'uid-1',
    summary: '사용자 로그인 흐름',
  },
  {
    id: 'capability.auth-logout',
    title: '로그아웃',
    kind: 'capability',
    projectIds: ['iam'],
    evidenceIds: [],
    lastApprovedAt: new Date('2026-04-26T00:00:00Z'),
    lastApprovedBy: 'uid-1',
    source: 'manual',
    manualAuthor: 'uid-2',
    manualNote: 'auth-login 짝꿍',
  },
];

const SAMPLE_EDGES: KnowledgeGraphEdge[] = [
  {
    id: 'depends_on:capability.auth-login->capability.session',
    from: 'capability.auth-login',
    to: 'capability.session',
    type: 'depends_on',
    projectIds: ['iam'],
    evidenceIds: ['doc-auth-login'],
    lastApprovedAt: new Date('2026-04-27T00:00:00Z'),
    lastApprovedBy: 'uid-1',
  },
];

const SAMPLE_CLASS: OntologyClass = {
  id: 'capability',
  name: '역량',
  description: '도메인 능력',
  version: 1,
  createdBy: 'system',
  createdAt: new Date('2026-04-25T00:00:00Z'),
};

const SAMPLE_RELATION: OntologyRelation = {
  id: 'depends_on',
  name: '의존',
  sourceClassIds: [],
  targetClassIds: [],
  category: 'behavior',
  symmetric: false,
  transitive: false,
  version: 1,
  createdBy: 'system',
  createdAt: new Date('2026-04-25T00:00:00Z'),
};

describe('serializeOntologyExportV1', () => {
  it('기본 — version + exportedAt + nodes/edges 모두 직렬화', () => {
    const result = serializeOntologyExportV1(
      {
        exportedBy: 'uid-1',
        accountId: 'acc-1',
        nodes: SAMPLE_NODES,
        edges: SAMPLE_EDGES,
      },
      NOW,
    );
    expect(result.version).toBe(ONTOLOGY_EXPORT_VERSION);
    expect(result.exportedAt).toBe('2026-04-28T12:34:56.000Z');
    expect(result.exportedBy).toBe('uid-1');
    expect(result.accountId).toBe('acc-1');
    expect(result.tboxVersionId).toBe('legacy-v0'); // tboxVersionId 미지정 default
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
    expect(result.tbox.classes).toEqual([]);
    expect(result.tbox.relations).toEqual([]);
  });

  it('Date → ISO 직렬화 (모든 노드/엣지 fields)', () => {
    const result = serializeOntologyExportV1(
      {
        exportedBy: 'uid-1',
        accountId: 'acc-1',
        nodes: SAMPLE_NODES,
        edges: SAMPLE_EDGES,
      },
      NOW,
    );
    expect(result.nodes[0]?.lastApprovedAt).toBe('2026-04-27T00:00:00.000Z');
    expect(result.edges[0]?.lastApprovedAt).toBe('2026-04-27T00:00:00.000Z');
  });

  it('정렬 — id ASC 으로 결정적 출력 (round-trip diff 0)', () => {
    // 입력 순서를 바꿔도 결과 같음
    const result = serializeOntologyExportV1(
      {
        exportedBy: 'uid-1',
        accountId: 'acc-1',
        nodes: [...SAMPLE_NODES].reverse(),
        edges: SAMPLE_EDGES,
      },
      NOW,
    );
    expect(result.nodes[0]?.id).toBe('capability.auth-login');
    expect(result.nodes[1]?.id).toBe('capability.auth-logout');
  });

  it('options.classes / options.relations 포함 시 정렬·직렬화', () => {
    const result = serializeOntologyExportV1(
      {
        exportedBy: 'uid-1',
        accountId: 'acc-1',
        tboxVersionId: 'v3',
        nodes: SAMPLE_NODES,
        edges: SAMPLE_EDGES,
        options: {
          classes: [SAMPLE_CLASS],
          relations: [SAMPLE_RELATION],
          note: '백업 2026-04-28',
        },
      },
      NOW,
    );
    expect(result.tboxVersionId).toBe('v3');
    expect(result.note).toBe('백업 2026-04-28');
    expect(result.tbox.classes).toHaveLength(1);
    expect(result.tbox.classes[0]?.createdAt).toBe('2026-04-25T00:00:00.000Z');
    expect(result.tbox.relations).toHaveLength(1);
    expect(result.tbox.relations[0]?.symmetric).toBe(false);
  });

  it('manual 노드의 source/manualAuthor/manualNote 보존', () => {
    const result = serializeOntologyExportV1(
      {
        exportedBy: 'uid-1',
        accountId: 'acc-1',
        nodes: SAMPLE_NODES,
        edges: [],
      },
      NOW,
    );
    const manualNode = result.nodes.find((n) => n.id === 'capability.auth-logout');
    expect(manualNode?.source).toBe('manual');
    expect(manualNode?.manualAuthor).toBe('uid-2');
    expect(manualNode?.manualNote).toBe('auth-login 짝꿍');
  });

  it('빈 input — 0 nodes / 0 edges 도 정상 payload', () => {
    const result = serializeOntologyExportV1(
      {
        exportedBy: 'uid-1',
        accountId: 'acc-1',
        nodes: [],
        edges: [],
      },
      NOW,
    );
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.version).toBe(ONTOLOGY_EXPORT_VERSION);
  });

  it('publishedAt undefined 노드 — payload 에서도 undefined', () => {
    const result = serializeOntologyExportV1(
      {
        exportedBy: 'uid-1',
        accountId: 'acc-1',
        nodes: SAMPLE_NODES,
        edges: [],
      },
      NOW,
    );
    expect(result.nodes[0]?.publishedAt).toBeUndefined();
  });
});

describe('exportPayloadToJson', () => {
  it('JSON.parse round-trip — 의미 보존', () => {
    const payload = serializeOntologyExportV1(
      {
        exportedBy: 'uid-1',
        accountId: 'acc-1',
        nodes: SAMPLE_NODES,
        edges: SAMPLE_EDGES,
      },
      NOW,
    );
    const json = exportPayloadToJson(payload);
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(ONTOLOGY_EXPORT_VERSION);
    expect(parsed.nodes[0]?.id).toBe('capability.auth-login');
  });

  it('pretty=true — 들여쓰기 적용', () => {
    const payload = serializeOntologyExportV1(
      { exportedBy: 'uid-1', accountId: 'acc-1', nodes: [], edges: [] },
      NOW,
    );
    const json = exportPayloadToJson(payload, { pretty: true });
    expect(json).toContain('\n');
    expect(json).toContain('  '); // 2-space indent
  });

  it('pretty=false (default) — 들여쓰기 없음', () => {
    const payload = serializeOntologyExportV1(
      { exportedBy: 'uid-1', accountId: 'acc-1', nodes: [], edges: [] },
      NOW,
    );
    const json = exportPayloadToJson(payload);
    expect(json).not.toContain('\n');
  });
});

describe('suggestExportFilename', () => {
  it('accountId + date 기반 안전한 파일명', () => {
    const payload = serializeOntologyExportV1(
      { exportedBy: 'uid-1', accountId: 'acc-1', nodes: [], edges: [] },
      NOW,
    );
    expect(suggestExportFilename(payload)).toBe('ontology-export-acc-1-2026-04-28.json');
  });

  it('특수문자 포함 accountId — 안전 문자만', () => {
    const payload = serializeOntologyExportV1(
      { exportedBy: 'uid-1', accountId: 'acc/with spaces!', nodes: [], edges: [] },
      NOW,
    );
    const filename = suggestExportFilename(payload);
    expect(filename).toContain('ontology-export-');
    expect(filename).toContain('-2026-04-28.json');
    // 특수문자 제거 — slash / space / ! 모두 -
    expect(filename).not.toContain('/');
    expect(filename).not.toContain(' ');
    expect(filename).not.toContain('!');
  });
});
