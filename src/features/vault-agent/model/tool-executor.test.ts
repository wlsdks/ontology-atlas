// 실행기의 단 하나의 불변식: **모델의 write 호출은 디스크에 닿지 않는다.**
//
// 이 파일은 그것을 두 층으로 잠근다:
// ① 타입 수준 — 실행기가 받는 포트에 쓰기 메서드가 없다는 것을 컴파일로 증명.
// ② 행동 수준 — write 도구를 흘려도 fs mock 호출이 0회.
import { describe, expect, it, vi } from 'vitest';

import type { KnowledgeGraphEdge, KnowledgeGraphNode } from '@/entities/knowledge-graph';

import { createToolExecutor } from './tool-executor';
import type { VaultReadPort } from './vault-read-port';
import type { NormalizedToolCall } from './provider-adapter';
import { AGENT_TOOL_RESULT_CHAR_CAP } from './types';

function node(
  id: string,
  overrides: Partial<KnowledgeGraphNode> = {},
): KnowledgeGraphNode {
  return {
    id,
    title: id.split(':')[1] ?? id,
    kind: id.split(':')[0] ?? 'capability',
    projectIds: [],
    evidenceIds: [`capabilities/${id.split(':')[1]}`],
    hasOwnDocument: true,
    lastApprovedAt: new Date(0),
    lastApprovedBy: 'vault-frontmatter',
    ...overrides,
  };
}

function edge(from: string, to: string, type = 'depends_on'): KnowledgeGraphEdge {
  return {
    id: `${from}--${type}-->${to}`,
    from,
    to,
    type,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: 'vault-frontmatter',
  };
}

const readDocText = vi.fn(async (slug: string) => `# ${slug}\n\n본문입니다.`);

function makePort(overrides: Partial<VaultReadPort> = {}): VaultReadPort {
  return {
    nodes: [
      node('capability:payment'),
      node('capability:refund'),
      node('capability:ghost', {
        hasOwnDocument: false,
        evidenceIds: ['capabilities/payment'],
        ref: 'src/lib/ghost.ts',
      }),
    ],
    edges: [edge('capability:payment', 'capability:ghost')],
    docs: [
      {
        slug: 'capabilities/payment',
        path: 'capabilities/payment.md',
        title: 'payment',
        kind: 'capability',
        domain: 'billing',
        frontmatter: { kind: 'capability', domain: 'billing' },
        excerpt: '결제 처리',
        mtime: 1_700_000_000_000,
      },
      {
        slug: 'capabilities/refund',
        path: 'capabilities/refund.md',
        title: 'refund',
        kind: 'capability',
        frontmatter: { kind: 'capability' },
        excerpt: '환불',
        mtime: 1_700_000_001_000,
      },
    ],
    readDocText,
    ...overrides,
  };
}

function call(name: string, args: unknown = {}): NormalizedToolCall {
  return { id: 't1', name, args, argsInvalid: false };
}

describe('tool-executor — 쓰기 무접촉', () => {
  it('포트 타입에는 쓰기 메서드가 없다 (구조적 증명)', () => {
    // 이 배열이 포트의 전부다. 여기 쓰기 이름이 들어오면 실행기가 디스크에
    // 닿을 수 있게 되고, 그 순간 "동의 없는 쓰기 0" 이 규율로 강등된다.
    const port = makePort();
    expect(Object.keys(port).sort()).toEqual(['docs', 'edges', 'nodes', 'readDocText']);
    for (const key of Object.keys(port)) {
      expect(key).not.toMatch(/write|save|create|delete|patch|update|remove/i);
    }
  });

  it('write 도구를 흘려도 파일 접근이 0회이고 제안 의사만 돌아온다', async () => {
    const fsSpy = vi.fn();
    const execute = createToolExecutor(makePort({ readDocText: fsSpy as never }));
    for (const name of [
      'add_concept',
      'add_concepts',
      'add_relation',
      'add_relations',
      'patch_concept',
    ]) {
      const result = await execute(call(name, { slug: 'capabilities/payment' }));
      expect(result.outcome).toBe('blocked-write');
      expect(result.writeIntent?.name).toBe(name);
      // 화면 행이 "썼다" 고 말하면 안 된다.
      expect(result.summary).toContain('아직 쓰지 않음');
    }
    expect(fsSpy).not.toHaveBeenCalled();
  });

  it('vault-only 에이전트는 competency 자격 서명을 제안으로 우회할 수 없다', async () => {
    const execute = createToolExecutor(makePort());

    const result = await execute(call('patch_concept', {
      slug: 'sample-product',
      body: '## Competency answers\n\n### abilities — answered\n\nOnly one domain is covered.',
    }));

    expect(result.outcome).toBe('error');
    expect(result.isError).toBe(true);
    expect(result.writeIntent).toBeUndefined();
    expect(result.content).toBe(
      'Source-backed competency qualification must be created through the MCP builder.',
    );
  });

  it('목록에 없는 도구는 실행 0 + 오류 반환', async () => {
    const execute = createToolExecutor(makePort());
    const result = await execute(call('delete_concept', { slug: 'x' }));
    expect(result.outcome).toBe('unknown-tool');
    expect(result.isError).toBe(true);
  });

  it('볼트 밖을 보는 도구도 같은 경로로 막힌다', async () => {
    const execute = createToolExecutor(makePort());
    for (const name of ['analyze_repo_structure', 'index_project', 'infer_imports']) {
      expect((await execute(call(name))).outcome).toBe('unknown-tool');
    }
  });

  it('깨진 인자는 실행 전에 걸리고 모델에게 정정 기회를 준다', async () => {
    const execute = createToolExecutor(makePort());
    const result = await execute({
      id: 't1',
      name: 'get_concept',
      args: {},
      argsInvalid: true,
    });
    expect(result.outcome).toBe('args-invalid');
    expect(result.isError).toBe(true);
  });
});

describe('tool-executor — 읽기', () => {
  it('get_concept 은 mtime 을 함께 준다 (동시 수정 가드의 근거)', async () => {
    const execute = createToolExecutor(makePort());
    const result = await execute(call('get_concept', { slug: 'capabilities/payment' }));
    expect(result.outcome).toBe('ok');
    expect(result.readSlugs).toEqual(['capabilities/payment']);
    const payload = JSON.parse(result.content) as Record<string, unknown>;
    expect(payload.mtime).toBe(1_700_000_000_000);
  });

  it('볼트 본문은 신뢰할 수 없는 데이터로 래핑된다', async () => {
    const execute = createToolExecutor(makePort());
    const result = await execute(call('get_concept', { slug: 'capabilities/payment' }));
    expect(result.content).toContain('<untrusted_vault_content>');
  });

  it('이름만 불린 개념은 "없음" 이 아니라 문서 신설 안내로 돌아온다', async () => {
    // #691 계보 — 지도가 보여준 개념을 물었더니 "없음" 이 돌아오면 사람과
    // 에이전트가 같은 온톨로지를 본다는 약속이 깨진다.
    const execute = createToolExecutor(makePort());
    const result = await execute(call('get_concept', { slug: 'src/lib/ghost.ts' }));
    const payload = JSON.parse(result.content) as Record<string, unknown>;
    expect(payload.hasDocument).toBe(false);
    expect(payload.referencedBy).toContain('capabilities/payment');
    expect(String(payload.hint)).toContain('add_concept');
  });

  it('없는 이름은 오타 추측 없이 목록을 보라고 답한다', async () => {
    const execute = createToolExecutor(makePort());
    const result = await execute(call('get_concept', { slug: 'capabilities/nope' }));
    expect(result.content).toContain('list_concepts');
    expect(result.content).toContain('Do not guess');
  });

  it('list_kinds 는 문서 수와 이름만 불린 수를 같이 말한다', async () => {
    // 필드 이름은 MCP `list_kinds` 와 같다 (계약 테스트가 대조).
    const execute = createToolExecutor(makePort());
    const payload = JSON.parse((await execute(call('list_kinds'))).content) as Record<
      string,
      unknown
    >;
    expect(payload.total).toBe(2);
    expect(payload.referencedOnlyTotal).toBe(1);
    expect(payload.conceptsIncludingReferenced).toBe(3);
  });

  it('find_backlinks 는 지도 엣지가 아니라 frontmatter 원문에서 센다', async () => {
    // 지도는 관계 타입의 부분집합만 엣지로 그린다(`describes` 는 안 그린다).
    // 백링크를 엣지에서 세면 터미널의 에이전트가 보는 관계를 화면 안
    // 에이전트만 못 보게 된다.
    const execute = createToolExecutor(
      makePort({
        docs: [
          {
            slug: 'documents/notes',
            path: 'documents/notes.md',
            title: 'notes',
            kind: 'document',
            frontmatter: { kind: 'document', describes: ['capabilities/payment'] },
            excerpt: '',
          },
          {
            slug: 'capabilities/payment',
            path: 'capabilities/payment.md',
            title: 'payment',
            kind: 'capability',
            frontmatter: { kind: 'capability' },
            excerpt: '',
          },
        ],
      }),
    );
    const payload = JSON.parse(
      (await execute(call('find_backlinks', { slug: 'capabilities/payment' }))).content,
    ) as { backlinks: Array<{ slug: string; matchedKeys: string[] }> };
    expect(payload.backlinks).toEqual([
      { slug: 'documents/notes', kind: 'document', matchedKeys: ['describes'] },
    ]);
  });

  it('결과가 상한을 넘으면 잘라내고 좁히라고 알린다', async () => {
    // 통째로 실리면 사용자 비용(BYOK 요금)이 조용히 커진다.
    const many = Array.from({ length: 400 }, (_, index) => ({
      slug: `capabilities/c${index}`,
      path: `capabilities/c${index}.md`,
      title: `c${index}`,
      kind: 'capability',
      frontmatter: {},
      excerpt: 'x'.repeat(300),
      mtime: 1,
    }));
    const execute = createToolExecutor(makePort({ docs: many }));
    const result = await execute(call('list_concepts', { summary: true, limit: 400 }));
    expect(result.content).toContain('truncated');
    expect(result.content.length).toBeLessThan(7_000);
  });

  it('get_concepts 는 상한 안에서 요청한 근거 행을 고르게 남긴다', async () => {
    const parents = Array.from({ length: 8 }, (_, index) =>
      node(`domain:d${index}`, {
        kind: 'domain',
        agentSlug: `domains/d${index}`,
        evidenceIds: [`domains/d${index}`],
      }),
    );
    const children = parents.flatMap((_, parentIndex) =>
      Array.from({ length: 6 }, (_, childIndex) =>
        node(`capability:d${parentIndex}-c${childIndex}`, {
          agentSlug: `capabilities/d${parentIndex}-c${childIndex}`,
          evidenceIds: [`capabilities/d${parentIndex}-c${childIndex}`],
          hasOwnDocument: false,
        }),
      ),
    );
    const docs = parents.map((_, index) => ({
      slug: `domains/d${index}`,
      path: `domains/d${index}.md`,
      title: `Domain ${index}`,
      kind: 'domain',
      frontmatter: {
        kind: 'domain',
        description: `Domain ${index} behavior `.repeat(10),
        capabilities: Array.from(
          { length: 6 },
          (__, childIndex) => `capabilities/d${index}-c${childIndex}`,
        ),
      },
      excerpt: `Domain ${index} owns a distinct customer behavior. `.repeat(8),
      mtime: index + 1,
    }));
    const edges = parents.flatMap((parent, parentIndex) =>
      Array.from({ length: 6 }, (_, childIndex) =>
        edge(parent.id, `capability:d${parentIndex}-c${childIndex}`, 'contains'),
      ),
    );
    const execute = createToolExecutor(
      makePort({
        nodes: [...parents, ...children],
        edges,
        docs,
        readDocText: vi.fn(async (slug: string) => `${slug} meaning `.repeat(100)),
      }),
    );

    const result = await execute(
      call('get_concepts', {
        slugs: parents.map((_, index) => `domains/d${index}`),
        body: 'full',
      }),
    );
    const payload = JSON.parse(result.content) as {
      concepts: Array<{
        slug: string;
        body: string;
        bodyInfo: { returnedChars: number; truncated: boolean };
        neighborsInfo: { total: number; returned: number; truncated: boolean };
      }>;
      compacted: boolean;
      omitted: number;
    };

    expect(result.content.length).toBeLessThanOrEqual(AGENT_TOOL_RESULT_CHAR_CAP);
    expect(payload).toMatchObject({ compacted: true, omitted: 0 });
    expect(payload.concepts.map((row) => row.slug)).toEqual(
      parents.map((_, index) => `domains/d${index}`),
    );
    expect(result.readSlugs).toEqual(payload.concepts.map((row) => row.slug));
    expect(result.vaultChars).toBe(
      payload.concepts.reduce((sum, row) => sum + row.bodyInfo.returnedChars, 0),
    );
    for (const row of payload.concepts) {
      expect(row.body).toContain('<untrusted_vault_content>');
      expect(row.bodyInfo.truncated).toBe(true);
      expect(row.neighborsInfo.total).toBe(6);
      expect(row.neighborsInfo.returned).toBeGreaterThan(0);
      expect(row.neighborsInfo.truncated).toBe(true);
    }
  });

  it('find_path 는 이어진 길을 실제 slug 로 돌려준다', async () => {
    const execute = createToolExecutor(makePort());
    const result = await execute(
      call('find_path', { from: 'capabilities/payment', to: 'src/lib/ghost.ts' }),
    );
    const payload = JSON.parse(result.content) as { found: boolean; hops: string[] };
    expect(payload.found).toBe(true);
    expect(payload.hops).toEqual(['capabilities/payment', 'src/lib/ghost.ts']);
  });

  it('find_orphans 는 문서 있는 개념만 센다', async () => {
    const execute = createToolExecutor(makePort());
    const payload = JSON.parse((await execute(call('find_orphans'))).content) as {
      orphans: Array<{ slug: string }>;
    };
    expect(payload.orphans.map((row) => row.slug)).toEqual(['capabilities/refund']);
  });
});
