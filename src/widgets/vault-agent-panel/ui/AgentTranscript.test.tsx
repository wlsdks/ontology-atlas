// The body's three contracts: progress shows only real events · grounding has two branches · chips lead to the map.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { AgentTurn } from '@/features/vault-agent';

import { AgentTranscript, type AgentTranscriptLabels } from './AgentTranscript';

const labels: AgentTranscriptLabels = {
  you: '나:',
  lookingAt: (title) => `화면: ${title} 을(를) 보는 중`,
  wholeMap: '화면: 지도 전체를 보는 중',
  unsupported: '이 턴에는 볼트를 읽지 않고 답했어요.',
  uncited: '이 턴에 읽은 파일:',
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
  it('the user bubble echoes the on-screen context as is', () => {
    // What the agent saw always stays on screen — the mismatch being visible is the signal to correct.
    renderTranscript(turn());
    expect(screen.getByTestId('agent-screen-context-echo')).toHaveTextContent(
      '화면: 결제 처리 을(를) 보는 중',
    );
  });

  it('a tool row says what was read and how many characters went out, from measurement', () => {
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

  it('while running, text is always present together with the waiting dots', () => {
    // Even with the dot's pulse stopped under reduced-motion, the information must not
    // shrink — the text carries the "still working" the motion was carrying.
    renderTranscript(turn({ status: 'running' }), 2);
    expect(screen.getByTestId('agent-pending-dot')).toBeInTheDocument();
    expect(screen.getByTestId('agent-pending')).toHaveTextContent('생각 중');
  });

  it('past 5 seconds it adds the real elapsed seconds', () => {
    renderTranscript(turn({ status: 'running' }), 7);
    expect(screen.getByTestId('agent-pending')).toHaveTextContent('생각 중 · 7초');
  });

  it('an answer that read nothing is drawn demoted', () => {
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
   * The agent read grounding, yet the screen said "Answered without reading grounding"; a read answer
   * with missing notation is corrected from the read list, not demoted.
   */
  it('an answer that read something but lacks the marking is not demoted and is corrected with the list of what was read', () => {
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
    // A correction chip takes **the same path** as a citation chip — the same action looking different is a defect.
    fireEvent.click(chips[0]);
    expect(onFocusNode).toHaveBeenCalledWith('capabilities/checkout');
    // No control is attached: this is not a problem to fix but an accurate self-description.
    expect(screen.queryByTestId('agent-retry')).not.toBeInTheDocument();
  });

  /**
   * The `no-tool-call` notice is absorbed by the chip title so one turn does not stack three warnings;
   * the type code stays in the data.
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

  it('a turn that read nothing gets a way back, in the same chip slot rather than a new banner', () => {
    const { onPrefill } = renderTranscript(noToolCallTurn());
    expect(screen.getByTestId('agent-retry-title')).toHaveTextContent(
      '1/6번째에서 멈췄어요 — 읽고 다시 답하게 하기',
    );
    fireEvent.click(screen.getByTestId('agent-retry-chip'));
    expect(onPrefill).toHaveBeenCalledWith('이 개념에 빠진 연결 이어줘');
  });

  it('warning lines are limited to two per turn, and the chip title absorbs the notice', () => {
    const fixture = noToolCallTurn();
    // It remains in the data: absorption is the render's business, not erasing a fact.
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

  it('when no chip stands to absorb the notice it stays as is, so the fact does not disappear', () => {
    // A turn with no original question (no sentence for the chip to seat). Absorption
    // only holds when the absorbing side actually exists.
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

  it('the demotion verdict attaches only to the conclusion of a turn, since intermediate narration is not a claim', () => {
    // The demotion attaches only to the turn's conclusion; remarks like "let me read first" are not
    // claims and repeating the warning makes it wallpaper.
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

  it('a stalled turn has a way back, and pressing it puts the same words in the input', () => {
    // Stating a reason without giving a route makes that position a dead end. It is a
    // prefill rather than a send, so this slice's "nothing goes out before you send" holds.
    const { onPrefill } = renderTranscript(
      turn({
        status: 'failed',
        events: [
          ...turn().events,
          { kind: 'notice', code: 'rate-limited', text: '지금은 호출 한도예요.' },
        ],
      }),
    );
    // The reason it stopped is the most important fact in that turn, so it is not a quiet micro label.
    expect(screen.getByTestId('agent-notice')).toHaveAttribute(
      'data-notice-weight',
      'blocking',
    );
    fireEvent.click(screen.getByTestId('agent-retry-chip'));
    expect(onPrefill).toHaveBeenCalledWith('이 개념에 빠진 연결 이어줘');
  });

  it('progress reports (interrupted, capped) stay quiet', () => {
    renderTranscript(
      turn({ events: [...turn().events, { kind: 'notice', code: 'aborted', text: '여기까지 읽었어요.' }] }),
    );
    expect(screen.getByTestId('agent-notice')).toHaveAttribute('data-notice-weight', 'quiet');
    expect(screen.queryByTestId('agent-retry')).not.toBeInTheDocument();
  });

  it('pressing a citation chip takes the same path as selecting on the map', () => {
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

  it('a name that was never read does not become a chip', () => {
    // Drawn as a chip, pressing it would take you somewhere empty.
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

  it('the footer keeps its place even without an answer (dimension regularity)', () => {
    renderTranscript(turn({ auditCount: 0, status: 'sending' }));
    // One row is always reserved so an arriving answer does not push the content above it.
    expect(screen.getByTestId('agent-turn-footer')).toBeInTheDocument();
  });

  it('the next step attaches as one chip, and pressing it does not send', () => {
    // Zero extra calls — this sentence already arrived in the same turn's response. The
    // chip is a prefill, so it does not create a second live proposal either.
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

  it('with no next step the slot does not exist at all', () => {
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
