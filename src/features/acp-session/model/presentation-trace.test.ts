import { describe, expect, it } from 'vitest';

import type { AcpEvent } from './use-acp-session';
import {
  buildAcpPresentationTrace,
  presentationRelationKey,
  presentationRelationKeysForGraphEdge,
} from './presentation-trace';

const knownSlugs = new Set([
  'ontology-atlas',
  'domains/agent-integration',
  'capabilities/mcp-server',
]);

function read(
  id: string,
  slug: string,
  overrides: Partial<Extract<AcpEvent, { kind: 'tool' }>> = {},
): Extract<AcpEvent, { kind: 'tool' }> {
  return {
    kind: 'tool',
    id,
    title: 'mcp__atlas-vault__get_concept',
    toolKind: 'read',
    status: 'completed',
    rawInput: { slug, body: 'full' },
    ...overrides,
  };
}

function sourceHiddenTurn(answer: string): AcpEvent[] {
  return [
    { kind: 'user', id: 'u-1', text: '이 온톨로지의 DNA를 설명해줘.' },
    read('read-project', 'ontology-atlas'),
    read('read-domain', 'domains/agent-integration'),
    read('read-capability', 'capabilities/mcp-server'),
    { kind: 'agent', id: 'a-1', text: answer },
  ];
}

function codexRead(
  id: string,
  slugs: string[],
): Extract<AcpEvent, { kind: 'tool' }> {
  return {
    kind: 'tool',
    id,
    title: 'mcp.ontology-atlas.get_concepts',
    toolKind: 'execute',
    status: 'completed',
    rawInput: {
      server: 'ontology-atlas',
      tool: 'get_concepts',
      arguments: { slugs, body: 'full' },
    },
  };
}

const citedAnswer = [
  '### 왜 존재하나요?',
  'ontology-atlas 는 코드베이스의 제품 의미를 사람이 판단하도록 돕습니다.',
  '',
  '### 누가 책임지나요?',
  'domains/agent-integration 이 에이전트 연결 경계를 책임집니다.',
  '',
  '### 어떻게 구현되나요?',
  'capabilities/mcp-server 가 그 능력을 제공합니다. 영향의 완전성은 아직 unknown 입니다.',
].join('\n');
const presentationRequest = '이 온톨로지의 DNA를 설명해줘.';

function buildTrace(
  overrides: Partial<Parameters<typeof buildAcpPresentationTrace>[0]> = {},
) {
  return buildAcpPresentationTrace({
    intent: 'business-flow',
    expectedUserText: presentationRequest,
    sessionStatus: 'ready',
    events: sourceHiddenTurn(citedAnswer),
    knownSlugs,
    knownRelations: new Set(),
    ...overrides,
  });
}

describe('ACP 온톨로지 DNA 발표 trace', () => {
  it('완료된 source-hidden turn을 인용과 실제 read tool id가 묶인 장면으로 만든다', () => {
    const result = buildTrace();

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.scenes).toHaveLength(3);
    expect(result.scenes.map((scene) => scene.focus)).toEqual([
      { slug: 'ontology-atlas', toolCallId: 'read-project' },
      { slug: 'domains/agent-integration', toolCallId: 'read-domain' },
      { slug: 'capabilities/mcp-server', toolCallId: 'read-capability' },
    ]);
    expect(result.scenes[2].qualification).toBe('limited');
    expect(result.sourceHidden).toEqual({
      proven: true,
      atlasReadCalls: 3,
      fullBodyConcepts: 3,
      toolDiscoveryCalls: 0,
      nonAtlasSourceCalls: 0,
    });
  });

  it('Codex ACP의 검증된 dotted MCP envelope도 source-hidden read로 판독한다', () => {
    const result = buildTrace({
      events: [
        { kind: 'user', id: 'u-1', text: presentationRequest },
        codexRead('codex-batch', [...knownSlugs]),
        { kind: 'agent', id: 'a-1', text: citedAnswer },
      ],
    });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.sourceHidden).toMatchObject({
      atlasReadCalls: 1,
      fullBodyConcepts: 3,
      nonAtlasSourceCalls: 0,
    });
    expect(result.scenes.every((scene) => scene.focus.toolCallId === 'codex-batch')).toBe(true);
  });

  it('dotted title과 raw envelope의 server/tool이 다르면 실행 행을 신뢰하지 않는다', () => {
    const mismatched = codexRead('codex-batch', [...knownSlugs]);
    mismatched.rawInput = {
      server: 'other',
      tool: 'get_concepts',
      arguments: { slugs: [...knownSlugs], body: 'full' },
    };

    expect(buildTrace({
      events: [
        { kind: 'user', id: 'u-1', text: presentationRequest },
        mismatched,
        { kind: 'agent', id: 'a-1', text: citedAnswer },
      ],
    })).toMatchObject({
      status: 'blocked',
      reason: 'source_hidden_unproven',
    });
  });

  it('일반 파일 도구가 한 번이라도 섞이면 source-hidden 발표로 승격하지 않는다', () => {
    const events = sourceHiddenTurn(citedAnswer);
    events.splice(2, 0, {
      kind: 'tool',
      id: 'source-read',
      title: 'Read src/secret.ts',
      toolKind: 'read',
      status: 'completed',
      rawInput: { file_path: 'src/secret.ts' },
    });

    expect(buildTrace({ events })).toMatchObject({
      status: 'blocked',
      reason: 'source_hidden_unproven',
    });
  });

  it('MCP 도구를 찾는 ToolSearch는 허용하지만 장면 인용 근거로 세지 않는다', () => {
    const events = sourceHiddenTurn(citedAnswer);
    events.splice(1, 0, {
      kind: 'tool',
      id: 'tool-search',
      title: 'ToolSearch',
      toolKind: 'search',
      status: 'completed',
      rawInput: { query: 'ontology atlas get concept' },
    });

    const result = buildTrace({ events });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.sourceHidden).toEqual({
      proven: true,
      atlasReadCalls: 3,
      fullBodyConcepts: 3,
      toolDiscoveryCalls: 1,
      nonAtlasSourceCalls: 0,
    });
  });

  it('실패한 Atlas read는 source-hidden을 깨지 않지만 그 결과를 인용 근거로 쓰지 않는다', () => {
    const events = sourceHiddenTurn(citedAnswer);
    events.splice(1, 0, read('failed-batch', 'ontology-atlas', { status: 'failed' }));

    const result = buildTrace({ events });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.sourceHidden.atlasReadCalls).toBe(4);
    expect(result.scenes[0].focus.toolCallId).toBe('read-project');
  });

  it('본문 전체 읽기가 12개를 넘으면 집중된 발표가 아니므로 차단한다', () => {
    const manySlugs = new Set(Array.from({ length: 13 }, (_, index) => `capabilities/c${index + 1}`));
    const events: AcpEvent[] = [
      { kind: 'user', id: 'u-1', text: '발표해줘' },
      ...[...manySlugs].map((slug, index) => read(`read-${index + 1}`, slug)),
      {
        kind: 'agent',
        id: 'a-1',
        text: [
          '### 1',
          'capabilities/c1 설명.',
          '',
          '### 2',
          'capabilities/c2 설명.',
          '',
          '### 3',
          'capabilities/c3 설명.',
        ].join('\n'),
      },
    ];

    expect(buildAcpPresentationTrace({
      intent: 'business-flow',
      expectedUserText: '발표해줘',
      sessionStatus: 'ready',
      events,
      knownSlugs: manySlugs,
      knownRelations: new Set(),
    })).toMatchObject({
      status: 'blocked',
      reason: 'full_body_read_budget_exceeded',
      target: '13',
    });
  });

  it('현재 turn에서 본문 전체를 읽지 않은 slug를 인용하면 막는다', () => {
    const events = sourceHiddenTurn(citedAnswer).filter((event) => event.id !== 'read-domain');

    expect(buildTrace({ events })).toMatchObject({
      status: 'blocked',
      reason: 'citation_not_read',
      target: 'domains/agent-integration',
    });
  });

  it('full-body anchor와 함께 언급된 이웃은 읽은 근거 chip으로 승격하지 않는다', () => {
    const extraKnown = new Set([...knownSlugs, 'capabilities/unread-neighbor']);
    const answer = citedAnswer.replace(
      'ontology-atlas 는 코드베이스의 제품 의미를 사람이 판단하도록 돕습니다.',
      'ontology-atlas 는 코드베이스의 제품 의미를 사람이 판단하도록 돕고 capabilities/unread-neighbor 를 이웃으로 둡니다.',
    );
    const result = buildTrace({
      events: sourceHiddenTurn(answer),
      knownSlugs: extraKnown,
    });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.scenes[0].citations).toEqual(['ontology-atlas']);
  });

  it('인용 없는 장면을 조용히 버리지 않고 전체 발표를 막는다', () => {
    const answer = citedAnswer.replace(
      'domains/agent-integration 이 에이전트 연결 경계를 책임집니다.',
      '에이전트 연결 경계를 책임지는 영역이 있습니다.',
    );

    expect(buildTrace({ events: sourceHiddenTurn(answer) })).toMatchObject({
      status: 'blocked',
      reason: 'scene_uncited',
    });
  });

  it('첫 ### 앞의 채팅용 머리말은 장면으로 승격하지 않고 명시된 장면만 검증한다', () => {
    const result = buildTrace({
      events: sourceHiddenTurn(`온톨로지만 읽고 정리했습니다.\n\n${citedAnswer}`),
    });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.scenes).toHaveLength(3);
    expect(result.scenes[0].title).toBe('왜 존재하나요?');
  });

  it('실재하지 않는 typed relation을 문장에 넣으면 장면으로 만들지 않는다', () => {
    const relationClaim = citedAnswer.replace(
      'capabilities/mcp-server 가 그 능력을 제공합니다. 영향의 완전성은 아직 unknown 입니다.',
      'domains/agent-integration --depends_on--> capabilities/mcp-server 로 이어집니다.',
    );

    expect(buildTrace({ events: sourceHiddenTurn(relationClaim) })).toMatchObject({
      status: 'blocked',
      reason: 'relation_not_in_graph',
    });

    const allowed = buildTrace({
      events: sourceHiddenTurn(relationClaim),
      knownRelations: new Set([
        presentationRelationKey(
          'domains/agent-integration',
          'capabilities/mcp-server',
          'depends_on',
        ),
      ]),
    });
    expect(allowed.status).toBe('ready');
  });

  it('화면 그래프의 contains는 대상 kind가 증명하는 authoring relation만 복원한다', () => {
    expect(presentationRelationKeysForGraphEdge({
      from: 'domains/agent-integration',
      to: 'capabilities/mcp-server',
      type: 'contains',
      toKind: 'capability',
    })).toEqual([
      presentationRelationKey(
        'domains/agent-integration',
        'capabilities/mcp-server',
        'contains',
      ),
      presentationRelationKey(
        'domains/agent-integration',
        'capabilities/mcp-server',
        'capabilities',
      ),
    ]);
    expect(presentationRelationKeysForGraphEdge({
      from: 'ontology-atlas',
      to: 'domains/agent-integration',
      type: 'contains',
      toKind: 'domain',
    })).toEqual([
      presentationRelationKey('ontology-atlas', 'domains/agent-integration', 'contains'),
    ]);
  });

  it('kind로 복원한 capabilities authoring relation은 실제 장면 검증을 통과한다', () => {
    const relationClaim = citedAnswer.replace(
      'capabilities/mcp-server 가 그 능력을 제공합니다. 영향의 완전성은 아직 unknown 입니다.',
      'domains/agent-integration --capabilities--> capabilities/mcp-server 로 이어집니다. 영향의 완전성은 아직 unknown 입니다.',
    );
    const knownRelations = new Set(presentationRelationKeysForGraphEdge({
      from: 'domains/agent-integration',
      to: 'capabilities/mcp-server',
      type: 'contains',
      toKind: 'capability',
    }));

    expect(buildTrace({
      events: sourceHiddenTurn(relationClaim),
      knownRelations,
    }).status).toBe('ready');
  });

  it('turn이 끝나지 않았거나 발표 intent가 아니면 만들지 않는다', () => {
    expect(buildTrace({ sessionStatus: 'thinking' })).toMatchObject({
      status: 'blocked',
      reason: 'turn_incomplete',
    });

    expect(buildTrace({ intent: null })).toMatchObject({
      status: 'blocked',
      reason: 'intent_inactive',
    });
  });

  it('같은 URL에서 이어진 다른 사용자 turn은 발표 intent를 상속하지 않는다', () => {
    expect(buildTrace({
      events: [
        ...sourceHiddenTurn(citedAnswer),
        { kind: 'user', id: 'u-2', text: '두 번째 장면을 더 설명해줘.' },
        read('follow-up-read', 'domains/agent-integration'),
        { kind: 'agent', id: 'a-2', text: citedAnswer },
      ],
    })).toMatchObject({ status: 'blocked', reason: 'intent_inactive' });
  });
});
