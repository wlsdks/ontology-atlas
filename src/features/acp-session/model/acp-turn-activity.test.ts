import { describe, expect, it } from 'vitest';

import type { AcpEvent, PendingPermission } from './use-acp-session';
import { deriveAcpTurnActivity } from './acp-turn-activity';

const known = new Set(['capabilities/reviewed-ontology-writing']);

describe('deriveAcpTurnActivity', () => {
  it('대기 중인 검증 도구에서 목표와 대상을 뽑는다', () => {
    const events: AcpEvent[] = [
      { kind: 'user', id: 'u1', text: '관계 편집 흐름을 확인해줘' },
      {
        kind: 'tool',
        id: 't1',
        title: 'validate_vault',
        toolKind: 'read',
        status: 'pending',
        rawInput: { slug: 'capabilities/reviewed-ontology-writing' },
      },
    ];
    expect(deriveAcpTurnActivity('thinking', events, null, known)).toEqual({
      state: 'verifying',
      summary: '관계 편집 흐름을 확인해줘',
      ontologySlug: 'capabilities/reviewed-ontology-writing',
      toolName: 'validate_vault',
    });
  });

  it('사람의 권한 확인을 기다리면 blocked 로 말한다', () => {
    const pending = {
      request: {
        title: null,
        toolCallId: 'tool-relation',
        toolName: 'mcp__atlas-vault__add_relation',
        toolKind: 'write',
        filePath: null,
        rawInput: { from: 'capabilities/reviewed-ontology-writing' },
        reviewKind: 'ontology-write',
        options: [],
      },
      resolve: () => undefined,
    } satisfies PendingPermission;
    expect(
      deriveAcpTurnActivity(
        'thinking',
        [{ kind: 'user', id: 'u1', text: '관계를 추가해줘' }],
        pending,
        known,
      ),
    ).toMatchObject({ state: 'blocked', summary: '관계를 추가해줘' });
  });

  it('차례가 아니면 활동을 만들지 않는다', () => {
    expect(deriveAcpTurnActivity('ready', [], null, known)).toBeNull();
  });
});
