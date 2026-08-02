'use client';

import { Fragment } from 'react';

import { AGENT_ROUND_CAP } from '@/features/vault-agent';
import type { AgentEvent, AgentTurn, CitedParagraph } from '@/features/vault-agent';

import { AgentToolLine } from './AgentToolLine';

export interface AgentTranscriptLabels {
  you: string;
  lookingAt: (title: string) => string;
  wholeMap: string;
  /** `unread` 갈래 — 이 턴에 읽은 것이 하나도 없다. */
  unsupported: string;
  /** `uncited` 갈래 — 읽었는데 인용 표기만 없다. 강등이 아니라 보정이다. */
  uncited: string;
  charsLabel: (chars: number) => string;
  thinking: string;
  thinkingSeconds: (seconds: number) => string;
  /** 1행 라벨 — 사람 언어. 원값(글자수)은 `footerDetail` 로 내려간다. */
  footer: (args: { provider: string; rounds: number }) => string;
  /** hover 로만 오는 원값. 데이터를 지우는 게 아니라 렌더만 내린다. */
  footerDetail: (args: { chars: number }) => string;
  nextStepTitle: string;
  /** 실패한 턴의 되돌아갈 길 — 같은 말을 입력칸에 다시 앉힌다(전송 아님). */
  retryTitle: string;
  /**
   * `unread` 갈래의 되돌아갈 길 — 같은 슬롯, 다른 문구.
   *
   * **멈춘 이유(라운드)를 이 한 줄이 함께 나른다.** 「도구를 한 번도 안
   * 부르고 멈췄어요」를 별도 알림 줄로 세우면 한 턴에 경고가 셋이 되고,
   * 셋이 되는 순간 그 경고들은 벽지가 된다.
   */
  regroundTitle: (args: { round: number; cap: number }) => string;
}

/**
 * 사람이 손을 써야 하는 알림 — 여기서 대화가 **멎는다**. 나머지(중단·상한
 * 도달)는 진행 상황 보고라 조용해도 된다.
 *
 * 구분이 필요한 이유: 이전에는 여섯 코드가 모두 같은 회색 마이크로 라벨이라
 * "호출 한도예요" 가 화면에서 가장 조용한 문장이었다. 멎은 이유는 그 턴에서
 * 가장 중요한 사실이다(Tufte — 잉크는 데이터에).
 */
/**
 * 되돌아갈 칩이 **제목으로 흡수하는** 알림 코드. 데이터에는 남고 화면에서만
 * 접힌다 — 같은 사실을 두 줄로 말하지 않기 위한 것이지, 사실을 지우는 것이
 * 아니다(타입 코드는 인계·기록의 근거로 계속 읽힌다).
 */
const ABSORBED_BY_RECOVERY: ReadonlySet<string> = new Set(['no-tool-call']);
const EMPTY_CODES: ReadonlySet<string> = new Set();

const BLOCKING_NOTICES: ReadonlySet<string> = new Set([
  'network-failed',
  'rate-limited',
  'rejected',
  'audit-blocked',
  'provider-refused',
  'failed',
]);

/**
 * 대화 본문 — 아래로만 자란다.
 *
 * 인용은 칩이 되고, 칩을 누르면 지도가 **기존 ego 포커스와 완전히 같은
 * 문법**으로 이동한다. 같은 동작은 같게 보여야 한다 — 지도 노드 클릭과 칩
 * 클릭이 다른 모션이면 결함이다. 그래서 여기서는 카메라를 직접 움직이지
 * 않고 `onFocusNode` 하나만 부른다(지도 선택 경로와 같은 함수).
 */
export function AgentTranscript({
  turns,
  labels,
  providerLabel,
  onFocusNode,
  onPrefill,
  renderProposal,
  elapsedSeconds,
}: {
  turns: readonly AgentTurn[];
  labels: AgentTranscriptLabels;
  providerLabel: string;
  onFocusNode: (slug: string) => void;
  /** 다음 한 걸음 칩 — 입력칸에 문장을 앉힐 뿐, 전송하지 않는다. */
  onPrefill: (text: string) => void;
  renderProposal: (event: Extract<AgentEvent, { kind: 'proposal' }>) => React.ReactNode;
  elapsedSeconds: number | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      {turns.map((turn) => {
        /**
         * 이 턴의 **결론** 한 자리. 인용 없는 답의 강등은 여기에만 붙는다 —
         * 도구를 부르기 전 "먼저 읽어볼게요" 같은 중간 서술은 볼트에 대한
         * 주장이 아니므로 경고할 것이 없고, 한 턴에 같은 경고가 세 번 붙으면
         * 그 경고는 벽지가 된다(2026-07-27 실측: 3회/턴).
         */
        const lastAssistant = turn.events.reduce(
          (found, event, index) => (event.kind === 'assistant' ? index : found),
          -1,
        );
        /** 실패한 턴에서 다시 시도할 원문 — 이 턴을 연 사용자 본인의 말. */
        const askedEvent = turn.events.find((event) => event.kind === 'user');
        const asked = askedEvent?.kind === 'user' ? askedEvent.text : null;
        /**
         * 결론이 **아무것도 안 읽고 나온 답**인가. 그때만 되돌아갈 길을 준다 —
         * 「읽었는데 표기를 안 했다」 는 고칠 문제가 아니라 정확한 자기
         * 서술이라, 거기에 컨트롤을 붙이면 없는 문제를 있는 것처럼 만든다.
         */
        const conclusion = lastAssistant >= 0 ? turn.events[lastAssistant] : null;
        const unread =
          conclusion?.kind === 'assistant' && conclusion.grounding === 'unread';
        // 같은 자리, 같은 문법. 이유가 둘이라 문구만 갈린다.
        const recoveryTitle =
          turn.status === 'failed'
            ? labels.retryTitle
            : unread
              ? labels.regroundTitle({ round: turn.roundsUsed, cap: AGENT_ROUND_CAP })
              : null;
        const showsRecovery = Boolean(recoveryTitle && asked);
        /**
         * **알림 줄을 칩이 흡수한다.** `no-tool-call` 은 데이터 층에 그대로
         * 남아 있고(다음 사람이 프로그램으로 읽을 수 있어야 한다), 화면에서만
         * 되돌아갈 칩의 제목으로 접힌다 — 같은 사실을 두 줄로 말하지 않는다.
         *
         * 칩이 안 서는 경우(원 질문을 잃은 턴)에는 **알림이 그대로 남는다**.
         * 흡수는 흡수하는 쪽이 실제로 있을 때만 성립한다.
         */
        const absorbedCodes: ReadonlySet<string> = showsRecovery
          ? ABSORBED_BY_RECOVERY
          : EMPTY_CODES;
        return (
        <section key={turn.id} data-testid="agent-turn" data-turn-status={turn.status}>
          {turn.events.map((event, index) => (
            <Fragment key={`${turn.id}-${index}`}>
              {renderEvent(
                event,
                labels,
                onFocusNode,
                onPrefill,
                renderProposal,
                index === lastAssistant,
                absorbedCodes,
              )}
            </Fragment>
          ))}

          {turn.status === 'running' || turn.status === 'sending' ? (
            <p
              data-testid="agent-pending"
              className="mt-2 flex items-center gap-2 text-label tracking-label text-[color:var(--color-text-quaternary)]"
            >
              <span
                aria-hidden="true"
                data-testid="agent-pending-dot"
                className="agent-pending-dot size-1 rounded-full bg-[color:var(--color-text-quaternary)]"
              />
              {elapsedSeconds !== null && elapsedSeconds >= 5
                ? labels.thinkingSeconds(elapsedSeconds)
                : labels.thinking}
            </p>
          ) : null}

          {/* 멎은 턴에는 **되돌아갈 길**을 준다. 이유만 말하고 길을 안 주면
              그 자리가 막다른 골목이 된다. 「다음 한 걸음」과 같은 문법이라
              새 상호작용을 배우지 않아도 된다 — 누르면 같은 말이 입력칸에
              앉을 뿐, 전송은 언제나 [보내기]다.

              같은 슬롯을 **볼트를 아예 안 본 턴**도 쓴다. 새 배너를 세우지
              않는 이유: 이미 있는 칩 하나를 채우는 것으로 끝나고, 사용자가
              배울 상호작용도 그대로 하나다. */}
          {showsRecovery && asked ? (
            <div data-testid="agent-retry" className="mt-2 flex flex-col gap-1.5">
              <p
                data-testid="agent-retry-title"
                className="text-label tracking-label text-[color:var(--color-text-quaternary)]"
              >
                {recoveryTitle}
              </p>
              <button
                type="button"
                data-testid="agent-retry-chip"
                onClick={() => onPrefill(asked)}
                className="flex min-h-11 w-full items-center rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-2.5 py-2 text-left text-caption leading-caption text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-indigo-accent)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]"
              >
                <span className="line-clamp-2 [word-break:keep-all]">{asked}</span>
              </button>
            </div>
          ) : null}

          {/* 푸터는 상시 1행 예약 — 답이 와도 위 내용이 밀리지 않는다.

              **글자수는 여기서 hover 로 내려갔다** (2026-08-02). 한 라운드의
              고정비가 18,934자(시스템 안내 8,500 + 도구 스키마 10,122)라
              「이 턴 40,036자」는 사용자 데이터의 크기가 아니다 — 같은 화면의
              읽기 줄 합계는 1,336자였고, 총량은 그것의 30배이며 대부분 도구
              스키마다. 상시 노출되면 화면에서 가장 큰 숫자가 가장 뜻 없는
              숫자가 된다. 데이터(`sentChars`)는 그대로 있고 렌더만 내렸다. */}
          <p
            data-testid="agent-turn-footer"
            title={
              turn.auditCount > 0 ? labels.footerDetail({ chars: turn.sentChars }) : undefined
            }
            className="mt-2 h-5 truncate text-label tracking-label text-[color:var(--color-text-quaternary)]"
          >
            {turn.auditCount > 0
              ? labels.footer({ provider: providerLabel, rounds: turn.auditCount })
              : ''}
          </p>
        </section>
        );
      })}
    </div>
  );
}

function renderEvent(
  event: AgentEvent,
  labels: AgentTranscriptLabels,
  onFocusNode: (slug: string) => void,
  onPrefill: (text: string) => void,
  renderProposal: (event: Extract<AgentEvent, { kind: 'proposal' }>) => React.ReactNode,
  /** 이 턴의 마지막 답인가 — 강등 경고는 결론에만 붙는다. */
  isConclusion: boolean,
  /** 되돌아갈 칩이 제목으로 흡수한 알림 코드 — 화면에서만 접힌다. */
  absorbedCodes: ReadonlySet<string>,
) {
  switch (event.kind) {
    case 'user':
      return (
        <div data-testid="agent-user-turn" className="mb-3">
          <p className="text-body leading-body text-[color:var(--color-text-primary)] [word-break:keep-all]">
            <span className="mr-1.5 text-[color:var(--color-text-quaternary)]">
              {labels.you}
            </span>
            {event.text}
          </p>
          {/* 화면 문맥 에코 — 에이전트가 본 것이 항상 화면에 남는다. 보내고
              나서 다른 노드로 옮겨가면 어긋남이 보이고, 그게 수정 신호다. */}
          <p
            data-testid="agent-screen-context-echo"
            className="mt-1 text-label tracking-label text-[color:var(--color-text-quaternary)]"
          >
            {event.screenContext.focusedSlug
              ? labels.lookingAt(
                  event.screenContext.focusedTitle ?? event.screenContext.focusedSlug,
                )
              : labels.wholeMap}
          </p>
        </div>
      );

    case 'toolLine':
      return (
        <ul className="mb-1 list-none">
          <AgentToolLine call={event.call} charsLabel={labels.charsLabel} />
        </ul>
      );

    case 'assistant': {
      // 판정은 **결론에만**. 중간 서술은 볼트에 대한 주장이 아니다.
      const grounding = isConclusion ? event.grounding : 'grounded';
      /** 아무것도 안 읽고 나온 답 — 근거 있는 문장과 같은 무게로 그릴 수 없다. */
      const unread = grounding === 'unread';
      /**
       * 읽었는데 표기만 없는 답. **강등하지 않는다** — 근거는 실제로 있고,
       * 화면이 그 목록을 칩으로 보정한다. 여기에 파선 테두리를 두면 화면이
       * 자기가 방금 그린 「읽음」 줄을 부정하게 된다.
       */
      const sources = grounding === 'uncited' ? (event.sources ?? []) : [];
      return (
        <div
          data-testid="agent-answer"
          data-grounding={grounding}
          data-demoted={unread ? 'true' : 'false'}
          className={[
            'mb-2 flex flex-col gap-2',
            unread
              ? 'border-l border-dashed border-[color:var(--color-border-strong)] pl-3'
              : '',
          ].join(' ')}
        >
          {unread ? (
            <p
              data-testid="agent-answer-unsupported"
              className="text-label tracking-label text-[color:var(--color-text-quaternary)]"
            >
              {labels.unsupported}
            </p>
          ) : null}
          {event.paragraphs.map((paragraph, index) => (
            <CitedText key={index} paragraph={paragraph} onFocusNode={onFocusNode} />
          ))}
          {/* 표기가 없어도 근거는 있었다 — 읽은 목록을 그대로 칩으로 놓는다.
              인용 칩과 **같은 컴포넌트**라 누르면 같은 곳으로 간다(지도 ego
              포커스). 새 상호작용 0. */}
          {sources.length > 0 ? (
            <p
              data-testid="agent-answer-sources"
              className="flex flex-wrap items-center gap-1 text-label tracking-label text-[color:var(--color-text-quaternary)]"
            >
              <span className="mr-0.5">{labels.uncited}</span>
              {sources.map((slug) => (
                <ConceptChip key={slug} slug={slug} onFocusNode={onFocusNode} />
              ))}
            </p>
          ) : null}
          {/* 다음 한 걸음 — 반영을 먼저 보이고, 그 다음에 권한다. 순서가 곧
              서사이므로 이 줄은 답 **뒤에** 오고, 등장은 짧은 페이드 하나다
              (숫자 굴림·강조 펄스 같은 장식은 없다). */}
          {event.nextStep ? (
            <div
              data-testid="agent-next-step"
              className="agent-next-step-in mt-1 flex flex-col gap-1.5"
            >
              <p className="text-label tracking-label text-[color:var(--color-text-quaternary)]">
                {labels.nextStepTitle}
              </p>
              <button
                type="button"
                data-testid="agent-next-step-chip"
                onClick={() => onPrefill(event.nextStep ?? '')}
                className="flex min-h-11 w-full items-center rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-2.5 py-2 text-left text-caption leading-caption text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-indigo-accent)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]"
              >
                <span className="line-clamp-2 [word-break:keep-all]">{event.nextStep}</span>
              </button>
            </div>
          ) : null}
        </div>
      );
    }

    case 'proposal':
      return renderProposal(event);

    case 'notice': {
      // 되돌아갈 칩이 제목으로 이미 말한 사실은 줄을 하나 더 쓰지 않는다.
      if (absorbedCodes.has(event.code)) return null;
      // 멎은 이유는 그 턴에서 가장 중요한 사실이라 본문 무게로 그린다.
      // 진행 보고(중단·상한)는 종전대로 조용하다.
      const blocking = BLOCKING_NOTICES.has(event.code);
      return (
        <p
          data-testid="agent-notice"
          data-notice-code={event.code}
          data-notice-weight={blocking ? 'blocking' : 'quiet'}
          className={
            blocking
              ? 'mb-2 text-body leading-body text-[color:var(--color-text-secondary)] [word-break:keep-all]'
              : 'mb-2 text-label tracking-label text-[color:var(--color-text-tertiary)]'
          }
        >
          {event.text}
        </p>
      );
    }

    default:
      return null;
  }
}

const CITATION_PATTERN = /\[\[([^[\]]+)\]\]/g;

/**
 * 개념 하나로 가는 칩. 본문 안의 `[[slug]]` 인용과, 표기가 없을 때 화면이
 * 보정으로 놓는 「참고한 자료」가 **같은 컨트롤**을 쓴다 — 같은 동작이 다르게
 * 보이면 그것이 결함이다.
 */
function ConceptChip({
  slug,
  label,
  onFocusNode,
}: {
  slug: string;
  label?: string;
  onFocusNode: (slug: string) => void;
}) {
  return (
    <button
      type="button"
      data-testid="agent-citation-chip"
      data-citation-slug={slug}
      onClick={() => onFocusNode(slug)}
      className="mx-0.5 inline-flex max-w-full items-center rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-1.5 py-px align-baseline text-label tracking-label text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-indigo-accent)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]"
    >
      <span className="truncate">{label ?? tailOfSlug(slug)}</span>
    </button>
  );
}

/** 칩에는 이름만 앉힌다 — 경로 전체는 한 줄을 다 먹고 정보를 더 주지 않는다. */
function tailOfSlug(slug: string): string {
  const index = slug.lastIndexOf('/');
  return index >= 0 ? slug.slice(index + 1) : slug;
}

/** `[[slug]]` 을 칩으로 — 누르면 지도가 그 개념으로 이동한다. */
function CitedText({
  paragraph,
  onFocusNode,
}: {
  paragraph: CitedParagraph;
  onFocusNode: (slug: string) => void;
}) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  for (const match of paragraph.text.matchAll(CITATION_PATTERN)) {
    const start = match.index ?? 0;
    if (start > cursor) parts.push(paragraph.text.slice(cursor, start));
    const raw = match[1].trim();
    const resolved =
      paragraph.citations.find((slug) => slug === raw || slug.endsWith(`/${raw}`)) ?? null;
    if (resolved) {
      parts.push(
        <ConceptChip key={`chip-${key++}`} slug={resolved} label={raw} onFocusNode={onFocusNode} />,
      );
    } else {
      // 읽은 적 없는 이름은 칩이 아니다 — 누르면 빈 곳으로 데려간다.
      parts.push(raw);
    }
    cursor = start + match[0].length;
  }
  if (cursor < paragraph.text.length) parts.push(paragraph.text.slice(cursor));

  return (
    <p className="text-body leading-body text-[color:var(--color-text-secondary)] [word-break:keep-all]">
      {parts}
    </p>
  );
}
