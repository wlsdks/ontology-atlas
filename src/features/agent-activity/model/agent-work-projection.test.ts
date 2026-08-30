import { describe, expect, it } from 'vitest';

import type { AgentActivityStatus } from '@/entities/vault-session';
import type { AgentWorkSession } from '@/shared/lib/agent-work-session';
import { deriveAgentWorkProjection } from './agent-work-projection';

const NOW = Date.parse('2026-08-22T00:00:00.000Z');

function session(overrides: Partial<AgentWorkSession> = {}): AgentWorkSession {
  return {
    id: 'task:1',
    startAt: NOW - 60_000,
    endAt: NOW - 10_000,
    entryCount: 1,
    counts: { added: 0, edited: 1, removed: 0 },
    lastTarget: 'capabilities/acp-runtime',
    lastTool: 'patch_concept',
    agent: 'codex-mcp-client',
    done: false,
    ...overrides,
  };
}

function heartbeat(overrides: Partial<AgentActivityStatus> = {}): AgentActivityStatus {
  return {
    sourcePath: '.ontology-atlas/agent-activity.json',
    exists: true,
    valid: true,
    stale: false,
    ageMs: 1_000,
    heartbeat: {
      agent: 'codex-acp',
      state: 'verifying',
      focus: {
        summary: '관계 편집 흐름을 확인해줘',
        ontologySlug: 'capabilities/reviewed-ontology-writing',
        files: [],
      },
      plan: ['변경 결과 확인'],
      evidence: { mcp: ['validate_vault'], source: [], codegraph: [], verification: [] },
      updatedAt: new Date(NOW - 1_000).toISOString(),
    },
    reviewMode: 'ontology-focus',
    reviewTarget: {
      kind: 'ontology',
      ontologySlug: 'capabilities/reviewed-ontology-writing',
      files: [],
      label: 'capabilities/reviewed-ontology-writing',
    },
    proof: { count: 1, sources: { mcp: 1, source: 0, verification: 0 }, label: '1' },
    refreshRequest: {
      required: false,
      reason: null,
      previousAgent: null,
      previousState: null,
      previousFocus: null,
      previousOntologySlug: null,
      previousFiles: [],
      previousAgeMs: null,
      command: null,
      message: null,
    },
    errorMessage: null,
    ...overrides,
  };
}

describe('deriveAgentWorkProjection', () => {
  it('fresh heartbeat 는 실제 live 단계·목표·대상을 이긴다', () => {
    expect(deriveAgentWorkProjection(heartbeat(), [session()], NOW)).toMatchObject({
      mode: 'live',
      agentName: 'Codex',
      phase: 'verifying',
      summary: '관계 편집 흐름을 확인해줘',
      targetSlug: 'capabilities/reviewed-ontology-writing',
      nextStep: '변경 결과 확인',
    });
  });

  it('인앱 ACP 이벤트는 다음 sidecar 폴링을 기다리지 않고 현재 상태를 이긴다', () => {
    expect(
      deriveAgentWorkProjection(heartbeat(), [session()], NOW, {
        rawAgentName: 'codex-acp',
        phase: 'editing',
        summary: '관계 변경안을 준비하고 있어요',
        targetSlug: 'capabilities/contextual-editing',
        lastTool: 'add_relation',
        updatedAt: NOW,
      }),
    ).toMatchObject({
      mode: 'live',
      agentName: 'Codex',
      phase: 'editing',
      summary: '관계 변경안을 준비하고 있어요',
      targetSlug: 'capabilities/contextual-editing',
      lastTool: 'add_relation',
      updatedAt: NOW,
    });
  });

  it('heartbeat 없이 최근 쓰기만 있으면 작업 중이라고 단정하지 않는다', () => {
    expect(deriveAgentWorkProjection(null, [session()], NOW)).toMatchObject({
      mode: 'recent-write',
      agentName: 'Codex',
      phase: null,
      targetSlug: 'capabilities/acp-runtime',
    });
  });

  it('조용해진 작업은 completed 로 남긴다', () => {
    expect(deriveAgentWorkProjection(null, [session({ done: true })], NOW)).toMatchObject({
      mode: 'completed',
      agentName: 'Codex',
    });
  });
});
