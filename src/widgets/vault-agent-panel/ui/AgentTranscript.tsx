'use client';

import { Fragment } from 'react';

import { AGENT_ROUND_CAP } from '@/features/vault-agent';
import type { AgentEvent, AgentTurn, CitedParagraph } from '@/features/vault-agent';

import { AgentToolLine } from './AgentToolLine';
import { controlClass } from '@/shared/ui';

export interface AgentTranscriptLabels {
  you: string;
  lookingAt: (title: string) => string;
  wholeMap: string;
  unsupported: string;
  uncited: string;
  charsLabel: (chars: number) => string;
  thinking: string;
  thinkingSeconds: (seconds: number) => string;
  footer: (args: { provider: string; rounds: number }) => string;
  footerDetail: (args: { chars: number }) => string;
  nextStepTitle: string;
  retryTitle: string;
  /**
   * The way back from the `unread` branch, same slot, different copy. It carries the stop reason
   * (the round) itself: a separate notice row would make three warnings in one turn.
   */
  regroundTitle: (args: { round: number; cap: number }) => string;
}

/**
 * Notices where a person has to act and the conversation stops; the rest (aborted, cap reached) are
 * progress reports and may stay quiet.
 */
/**
 * Notice codes the recovery chip absorbs into its title. They stay in the data and fold only on
 * screen, so the same fact is not stated in two rows.
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
 * The conversation body; it grows downward only. Citation chips move the map only through
 * `onFocusNode`, the map's own selection path, so a chip and a map click share one motion.
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
  onPrefill: (text: string) => void;
  renderProposal: (event: Extract<AgentEvent, { kind: 'proposal' }>) => React.ReactNode;
  elapsedSeconds: number | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      {turns.map((turn) => {
        /**
         * The single position for the turn's conclusion; the uncited-answer demotion attaches only here, not
         * to intermediate remarks that make no claim about the vault.
         */
        const lastAssistant = turn.events.reduce(
          (found, event, index) => (event.kind === 'assistant' ? index : found),
          -1,
        );
        const askedEvent = turn.events.find((event) => event.kind === 'user');
        const asked = askedEvent?.kind === 'user' ? askedEvent.text : null;
        /**
         * An answer produced without reading anything. Only then is a way back offered: "read but did not
         * cite" is an accurate self-description, not a problem to fix.
         */
        const conclusion = lastAssistant >= 0 ? turn.events[lastAssistant] : null;
        const unread =
          conclusion?.kind === 'assistant' && conclusion.grounding === 'unread';
        const recoveryTitle =
          turn.status === 'failed'
            ? labels.retryTitle
            : unread
              ? labels.regroundTitle({ round: turn.roundsUsed, cap: AGENT_ROUND_CAP })
              : null;
        const showsRecovery = Boolean(recoveryTitle && asked);
        /**
         * The chip absorbs the notice row: `no-tool-call` stays in the data layer and folds into the chip's
         * title only on screen. Where no chip stands (a turn that lost its question) the notice remains.
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

          {/* A stopped turn gets a way back in the same grammar as "The next step": pressing it only seats
              words in the composer, and sending is always [Send]. A turn that never read the vault uses the same chip. */}
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
                className={controlClass({
                  shape: 'card',
                  size: 'sm',
                  tone: 'secondary',
                  /* `min-h-11` is the WCAG 2.5.8 touch target — the value layer still
                     has that axis only on `link`, so it is carried per site here. */
                  className:
                    'w-full min-h-11 text-left border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] hover:border-[color:var(--color-indigo-accent)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]',
                })}
              >
                <span className="line-clamp-2 [word-break:keep-all]">{asked}</span>
              </button>
            </div>
          ) : null}

          {/* The footer always reserves one row so an arriving answer does not push content above it. The
             character count is hover-only: it is dominated by fixed tool schemas, not the user's data. */}
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
  isConclusion: boolean,
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
          {/* The screen-context echo: what the agent saw stays on screen, so moving to another node after
              sending makes the mismatch visible. */}
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
      // The judgement applies **only to the conclusion**. An intermediate remark makes no claim about the vault.
      const grounding = isConclusion ? event.grounding : 'grounded';
      const unread = grounding === 'unread';
      /**
       * An answer that read but did not cite is not demoted: the grounding exists, and the chips below
       * correct the citation. A dashed border would contradict the "Read" row just drawn.
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
          {/* Citation missing, grounding present: the read list as chips, the same component as a citation chip. */}
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
          {/* The next step comes after what landed; its entry is one short fade. */}
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
                className={controlClass({
                  shape: 'card',
                  size: 'sm',
                  tone: 'secondary',
                  /* `min-h-11` is the WCAG 2.5.8 touch target — the value layer still
                     has that axis only on `link`, so it is carried per site here. */
                  className:
                    'w-full min-h-11 text-left border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] hover:border-[color:var(--color-indigo-accent)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]',
                })}
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
      if (absorbedCodes.has(event.code)) return null;
      // The reason it stopped is drawn at body weight; progress reports (aborted, cap) stay quiet.
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
 * A chip leading to one concept. A `[[slug]]` citation and the "Sources consulted" correction use the
 * same control, so the same action never looks different.
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
      className={controlClass({ shape: "chip", size: "sm", tone: "secondary", className: "mx-0.5 max-w-full border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-1.5 py-px align-baseline tracking-label hover:border-[color:var(--color-indigo-accent)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]" })}
    >
      <span className="truncate">{label ?? tailOfSlug(slug)}</span>
    </button>
  );
}

function tailOfSlug(slug: string): string {
  const index = slug.lastIndexOf('/');
  return index >= 0 ? slug.slice(index + 1) : slug;
}

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
      // A name that was never read is not a chip — pressing it would take you nowhere.
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
