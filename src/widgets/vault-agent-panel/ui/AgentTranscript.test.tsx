// 대화 본문의 세 계약: 진행 표시는 실제 사건만 · 근거 판정은 두 갈래 · 칩은 지도로.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { AgentTurn } from '@/features/vault-agent';

import { AgentTranscript, type AgentTranscriptLabels } from './AgentTranscript';

const labels: AgentTranscriptLabels = {
  you: '나:',
  lookingAt: (title) => `화면: ${title} 을(를) 보는 중`,
  wholeMap: '화면: 지도 전체를 보는 중',
  unsupported: '이 턴에는 볼트를 읽지 않고 답했어요.',
  uncited: '이 턴에 읽은 자료:',
  charsLabel: (chars) => `${chars}자`,
  thinking: '생각 중',
  thinkingSeconds: (seconds) => `생각 중 · ${seconds}초`,
  footer: ({ provider, rounds }) => `${provider} · ${rounds}건`,
  footerDetail: ({ chars }) => `이 턴에 오간 글 ${chars}자`,
  nextStepTitle: '다음 한 걸음',
  retryTitle: '다시 해볼까요',
  regroundTitle: ({ round, cap }) => `${round}/${cap}번째에서 멈췄어요 — 읽고 다시 답하게 하기`,
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
  const onPrefill = vi.fn();
  render(
    <AgentTranscript
      turns={[t]}
      labels={labels}
      providerLabel="Anthropic"
      onFocusNode={onFocusNode}
      onPrefill={onPrefill}
      renderProposal={() => null}
      elapsedSeconds={elapsedSeconds}
    />,
  );
  return { onFocusNode, onPrefill };
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

  it('아무것도 안 읽고 나온 답은 강등해서 그린다', () => {
    renderTranscript(
      turn({
        events: [
          ...turn().events,
          {
            kind: 'assistant',
            paragraphs: [{ text: '제 생각에는요', citations: [] }],
            grounding: 'unread',
          },
        ],
      }),
    );
    expect(screen.getByTestId('agent-answer')).toHaveAttribute('data-demoted', 'true');
    expect(screen.getByTestId('agent-answer-unsupported')).toBeInTheDocument();
  });

  /**
   * 2026-08-02 회귀 차단 — 실측 턴에서 도구를 4번 부르고 1,336자를 읽어
   * 화면에 「읽음: capabilities/checkout 635자」까지 찍어 놓고, 네 줄 아래에서
   * 「읽은 근거 없이 답했어요」가 떴다. 화면이 자기 화면을 부정한 것이다.
   */
  it('읽었는데 표기만 없는 답은 강등하지 않고 읽은 목록으로 보정한다', () => {
    const { onFocusNode } = renderTranscript(
      turn({
        events: [
          ...turn().events,
          {
            kind: 'assistant',
            paragraphs: [{ text: 'capabilities/checkout 은 결제의 시작점이에요.', citations: [] }],
            grounding: 'uncited',
            sources: ['capabilities/checkout', 'capabilities/refund'],
          },
        ],
      }),
    );
    expect(screen.getByTestId('agent-answer')).toHaveAttribute('data-demoted', 'false');
    expect(screen.queryByTestId('agent-answer-unsupported')).not.toBeInTheDocument();
    const chips = screen.getAllByTestId('agent-citation-chip');
    expect(chips.map((chip) => chip.dataset.citationSlug)).toEqual([
      'capabilities/checkout',
      'capabilities/refund',
    ]);
    // 보정 칩도 인용 칩과 **같은 경로**를 탄다 — 같은 동작이 다르게 보이면 결함.
    fireEvent.click(chips[0]);
    expect(onFocusNode).toHaveBeenCalledWith('capabilities/checkout');
    // 컨트롤은 붙이지 않는다: 이건 고칠 문제가 아니라 정확한 자기 서술이다.
    expect(screen.queryByTestId('agent-retry')).not.toBeInTheDocument();
  });

  /**
   * 2026-08-02 합집합 정정 — 처음 구현은 강등 문장 + `no-tool-call` 알림 줄 +
   * 칩 제목으로 **한 턴에 경고를 셋** 세웠다(상호작용석의 칩 처방과 작업대석의
   * 알림 처방을 둘 다 실은 결과). 셋이 되는 순간 그 경고들은 벽지가 된다 —
   * 이 파일이 이미 2026-07-27 에 배운 것과 같은 실패다. 알림은 칩 제목이
   * 흡수하고, **타입 코드는 데이터에 그대로 남는다.**
   */
  const noToolCallTurn = () =>
    turn({
      roundsUsed: 1,
      events: [
        ...turn().events,
        {
          kind: 'assistant',
          paragraphs: [{ text: '아마 그럴 거예요.', citations: [] }],
          grounding: 'unread',
        },
        { kind: 'notice', code: 'no-tool-call', text: '1/6번째에서 도구를 한 번도 안 부르고 멈췄어요.' },
      ],
    });

  it('아무것도 안 읽은 턴에는 되돌아갈 길이 붙는다 — 새 배너가 아니라 같은 칩 슬롯', () => {
    const { onPrefill } = renderTranscript(noToolCallTurn());
    expect(screen.getByTestId('agent-retry-title')).toHaveTextContent(
      '1/6번째에서 멈췄어요 — 읽고 다시 답하게 하기',
    );
    fireEvent.click(screen.getByTestId('agent-retry-chip'));
    expect(onPrefill).toHaveBeenCalledWith('이 개념에 빠진 연결 이어줘');
  });

  it('경고 줄은 한 턴에 둘까지다 — 알림은 칩 제목이 흡수한다', () => {
    const fixture = noToolCallTurn();
    // 데이터에는 남는다: 흡수는 렌더의 일이지 사실을 지우는 것이 아니다.
    expect(
      fixture.events.filter((event) => event.kind === 'notice' && event.code === 'no-tool-call'),
    ).toHaveLength(1);

    renderTranscript(fixture);
    const warningLines = [
      ...screen.queryAllByTestId('agent-answer-unsupported'),
      ...screen.queryAllByTestId('agent-notice'),
      ...screen.queryAllByTestId('agent-retry-title'),
    ];
    expect(warningLines.map((node) => node.dataset.testid)).toEqual([
      'agent-answer-unsupported',
      'agent-retry-title',
    ]);
  });

  it('흡수할 칩이 안 서면 알림은 그대로 남는다 — 사실이 사라지지 않는다', () => {
    // 원 질문이 없는 턴(칩이 앉힐 문장이 없다). 흡수는 흡수하는 쪽이 실제로
    // 있을 때만 성립한다.
    renderTranscript(
      turn({
        roundsUsed: 1,
        events: [
          {
            kind: 'assistant',
            paragraphs: [{ text: '아마 그럴 거예요.', citations: [] }],
            grounding: 'unread',
          },
          { kind: 'notice', code: 'no-tool-call', text: '1/6번째에서 도구를 한 번도 안 부르고 멈췄어요.' },
        ],
      }),
    );
    expect(screen.queryByTestId('agent-retry')).not.toBeInTheDocument();
    expect(screen.getByTestId('agent-notice')).toHaveAttribute(
      'data-notice-code',
      'no-tool-call',
    );
  });

  it('강등 판정은 턴의 결론에만 붙는다 — 중간 서술은 주장이 아니다', () => {
    // 구 렌더는 도구를 부르기 전 "먼저 읽어볼게요" 같은 서술에도 같은 경고를
    // 붙여 한 턴에 3회 반복됐다(2026-07-27 실측). 반복되는 최고 경고는 벽지가
    // 된다 — 경고가 값을 하려면 그 턴의 **결론**에만 서야 한다.
    renderTranscript(
      turn({
        events: [
          ...turn().events,
          {
            kind: 'assistant',
            paragraphs: [{ text: '먼저 이 개념의 문서를 읽어볼게요.', citations: [] }],
            grounding: 'unread',
          },
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
          {
            kind: 'assistant',
            paragraphs: [{ text: '제 생각에는요', citations: [] }],
            grounding: 'unread',
          },
        ],
      }),
    );
    const answers = screen.getAllByTestId('agent-answer');
    expect(answers.map((node) => node.dataset.demoted)).toEqual(['false', 'true']);
    expect(screen.getAllByTestId('agent-answer-unsupported')).toHaveLength(1);
  });

  it('멎은 턴에는 되돌아갈 길이 있다 — 누르면 같은 말이 입력칸에 앉는다', () => {
    // 이유만 말하고 길을 안 주면 그 자리가 막다른 골목이다. 전송이 아니라
    // 프리필이라 이 슬라이스의 "보내기 전에는 아무것도 나가지 않는다" 는 그대로.
    const { onPrefill } = renderTranscript(
      turn({
        status: 'failed',
        events: [
          ...turn().events,
          { kind: 'notice', code: 'rate-limited', text: '지금은 호출 한도예요.' },
        ],
      }),
    );
    // 멎은 이유는 그 턴에서 가장 중요한 사실이라 조용한 마이크로 라벨이 아니다.
    expect(screen.getByTestId('agent-notice')).toHaveAttribute(
      'data-notice-weight',
      'blocking',
    );
    fireEvent.click(screen.getByTestId('agent-retry-chip'));
    expect(onPrefill).toHaveBeenCalledWith('이 개념에 빠진 연결 이어줘');
  });

  it('진행 보고(중단·상한)는 조용한 채로 남는다', () => {
    renderTranscript(
      turn({ events: [...turn().events, { kind: 'notice', code: 'aborted', text: '여기까지 읽었어요.' }] }),
    );
    expect(screen.getByTestId('agent-notice')).toHaveAttribute('data-notice-weight', 'quiet');
    expect(screen.queryByTestId('agent-retry')).not.toBeInTheDocument();
  });

  it('인용 칩을 누르면 지도 선택과 같은 경로를 탄다', () => {
    const { onFocusNode } = renderTranscript(
      turn({
        events: [
          ...turn().events,
          {
            kind: 'assistant',
            grounding: 'grounded',
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
            grounding: 'unread',
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

  it('다음 한 걸음은 칩 하나로 붙고, 눌러도 전송하지 않는다', () => {
    // 추가 호출 0 — 이 문장은 같은 턴의 응답에서 이미 왔다. 칩은 프리필이라
    // 살아 있는 제안을 하나 더 만들지도 않는다.
    const { onPrefill } = renderTranscript(
      turn({
        events: [
          {
            kind: 'assistant',
            paragraphs: [{ text: '정의를 이렇게 제안해요.', citations: [] }],
            grounding: 'unread',
            nextStep: '「환불」과 「정산」 사이 연결을 살펴줘',
          },
        ],
      }),
    );
    expect(screen.getByTestId('agent-next-step')).toHaveTextContent('다음 한 걸음');
    fireEvent.click(screen.getByTestId('agent-next-step-chip'));
    expect(onPrefill).toHaveBeenCalledWith('「환불」과 「정산」 사이 연결을 살펴줘');
  });

  it('다음 걸음이 없으면 그 자리는 아예 없다', () => {
    renderTranscript(
      turn({
        events: [
          { kind: 'assistant', paragraphs: [{ text: '답.', citations: [] }], grounding: 'unread' },
        ],
      }),
    );
    expect(screen.queryByTestId('agent-next-step')).not.toBeInTheDocument();
  });
});
