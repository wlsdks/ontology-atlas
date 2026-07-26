// 대화 본문의 세 계약: 진행 표시는 실제 사건만 · 인용 0 은 강등 · 칩은 지도로.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { AgentTurn } from '@/features/vault-agent';

import { AgentTranscript, type AgentTranscriptLabels } from './AgentTranscript';

const labels: AgentTranscriptLabels = {
  you: '나:',
  lookingAt: (title) => `화면: ${title} 을(를) 보는 중`,
  wholeMap: '화면: 지도 전체를 보는 중',
  unsupported: '읽은 근거 없이 답했어요.',
  charsLabel: (chars) => `${chars}자`,
  thinking: '생각 중',
  thinkingSeconds: (seconds) => `생각 중 · ${seconds}초`,
  footer: ({ provider, chars, rounds }) => `${provider} · ${chars}자 · ${rounds}건`,
};

function turn(overrides: Partial<AgentTurn> = {}): AgentTurn {
  return {
    id: 't1',
    roundsUsed: 1,
    sentChars: 1850,
    auditCount: 1,
    status: 'done',
    events: [
      {
        kind: 'user',
        text: '이 개념에 빠진 연결 이어줘',
        screenContext: {
          focusedSlug: 'capabilities/payment',
          focusedTitle: '결제 처리',
          focusedKind: 'capability',
          lenses: [],
          projectTitle: null,
          visibleNodeCount: 12,
        },
      },
    ],
    ...overrides,
  };
}

function renderTranscript(t: AgentTurn, elapsedSeconds: number | null = null) {
  const onFocusNode = vi.fn();
  render(
    <AgentTranscript
      turns={[t]}
      labels={labels}
      providerLabel="Anthropic"
      onFocusNode={onFocusNode}
      renderProposal={() => null}
      elapsedSeconds={elapsedSeconds}
    />,
  );
  return { onFocusNode };
}

describe('AgentTranscript', () => {
  it('사용자 말풍선에 화면 문맥이 그대로 에코된다', () => {
    // 에이전트가 본 것이 항상 화면에 남는다 — 어긋남이 보이는 것이 수정 신호.
    renderTranscript(turn());
    expect(screen.getByTestId('agent-screen-context-echo')).toHaveTextContent(
      '화면: 결제 처리 을(를) 보는 중',
    );
  });

  it('도구 행은 무엇을 읽고 몇 자가 나갔는지 실측으로 말한다', () => {
    renderTranscript(
      turn({
        events: [
          ...turn().events,
          {
            kind: 'toolLine',
            call: {
              id: 'c1',
              name: 'get_concept',
              args: {},
              target: 'capabilities/payment',
              sentChars: 1020,
              outcome: 'ok',
              summary: '읽음: capabilities/payment',
            },
          },
        ],
      }),
    );
    const line = screen.getByTestId('agent-tool-line');
    expect(line).toHaveTextContent('읽음: capabilities/payment');
    expect(line).toHaveTextContent('1020자');
  });

  it('진행 중에는 대기 점과 함께 텍스트가 항상 같이 있다', () => {
    // reduced-motion 에서 점의 맥동이 멈춰도 정보는 줄지 않아야 한다 —
    // 모션이 나르던 "아직 일하는 중" 을 텍스트가 그대로 나른다.
    renderTranscript(turn({ status: 'running' }), 2);
    expect(screen.getByTestId('agent-pending-dot')).toBeInTheDocument();
    expect(screen.getByTestId('agent-pending')).toHaveTextContent('생각 중');
  });

  it('5초를 넘으면 실제 경과 초를 병기한다', () => {
    renderTranscript(turn({ status: 'running' }), 7);
    expect(screen.getByTestId('agent-pending')).toHaveTextContent('생각 중 · 7초');
  });

  it('인용 0 인 답은 강등해서 그린다', () => {
    renderTranscript(
      turn({
        events: [
          ...turn().events,
          { kind: 'assistant', paragraphs: [{ text: '제 생각에는요', citations: [] }], demoted: true },
        ],
      }),
    );
    expect(screen.getByTestId('agent-answer')).toHaveAttribute('data-demoted', 'true');
    expect(screen.getByTestId('agent-answer-unsupported')).toBeInTheDocument();
  });

  it('인용 칩을 누르면 지도 선택과 같은 경로를 탄다', () => {
    const { onFocusNode } = renderTranscript(
      turn({
        events: [
          ...turn().events,
          {
            kind: 'assistant',
            demoted: false,
            paragraphs: [
              {
                text: '[[capabilities/payment]] 에 연결이 빠졌어요.',
                citations: ['capabilities/payment'],
              },
            ],
          },
        ],
      }),
    );
    fireEvent.click(screen.getByTestId('agent-citation-chip'));
    expect(onFocusNode).toHaveBeenCalledWith('capabilities/payment');
  });

  it('읽은 적 없는 이름은 칩이 되지 않는다', () => {
    // 칩으로 그리면 누르는 순간 빈 곳으로 데려간다.
    renderTranscript(
      turn({
        events: [
          ...turn().events,
          {
            kind: 'assistant',
            demoted: true,
            paragraphs: [{ text: '[[capabilities/ghost]] 를 보세요.', citations: [] }],
          },
        ],
      }),
    );
    expect(screen.queryByTestId('agent-citation-chip')).not.toBeInTheDocument();
  });

  it('푸터는 답이 없어도 자리를 지킨다 (치수 규칙성)', () => {
    renderTranscript(turn({ auditCount: 0, status: 'sending' }));
    // 답이 와도 위 내용이 밀리지 않도록 상시 1행 예약.
    expect(screen.getByTestId('agent-turn-footer')).toBeInTheDocument();
  });
});
