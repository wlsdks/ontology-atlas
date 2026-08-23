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
  /** The `unread` branch — nothing at all was read in this turn. */
  unsupported: string;
  /** The `uncited` branch — it read, but the citation is missing. A correction, not a demotion. */
  uncited: string;
  charsLabel: (chars: number) => string;
  thinking: string;
  thinkingSeconds: (seconds: number) => string;
  /** One-line label, in human language. The raw value (character count) drops to `footerDetail`. */
  footer: (args: { provider: string; rounds: number }) => string;
  /** The raw value, available only on hover. The data is not erased; only the render is demoted. */
  footerDetail: (args: { chars: number }) => string;
  nextStepTitle: string;
  /** The way back from a failed turn — it seats the same words in the composer again (it does not send). */
  retryTitle: string;
  /**
   * The way back from the `unread` branch — same slot, different copy.
   *
   * **This one line carries the reason it stopped (the round) along with it.**
   * Standing "It stopped without calling a tool once" (it stopped without calling a tool
   * once) as a separate notice row makes three warnings in one turn, and at three
   * they become wallpaper.
   */
  regroundTitle: (args: { round: number; cap: number }) => string;
}

/**
 * Notices where a person has to act — the conversation **stops** here. The rest
 * (aborted, cap reached) are progress reports and may stay quiet.
 *
 * Why the distinction is needed: all six codes used to be the same grey micro
 * label, which made "you hit the call limit" the quietest sentence on screen. The
 * reason it stopped is the most important fact in that turn (Tufte — ink to the data).
 */
/**
 * Notice codes the recovery chip **absorbs into its title**. They stay in the data
 * and are folded only on screen — this is to avoid stating the same fact in two
 * rows, not to erase the fact (the type code is still read as the basis for handoff
 * and for the record).
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
 * The conversation body — it grows downward only.
 *
 * Citations become chips, and pressing one moves the map with **exactly the same
 * grammar as the existing ego focus**. The same action has to look the same — a map
 * node click and a chip click using different motion would be a defect. So the
 * camera is never moved directly here; only `onFocusNode` is called (the same
 * function as the map's own selection path).
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
  /** The next-step chip — it only seats a sentence in the composer; it does not send. */
  onPrefill: (text: string) => void;
  renderProposal: (event: Extract<AgentEvent, { kind: 'proposal' }>) => React.ReactNode;
  elapsedSeconds: number | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      {turns.map((turn) => {
        /**
         * The single position for this turn's **conclusion**. The demotion for an
         * uncited answer attaches only here — an intermediate remark before a tool is
         * called, like "let me read first", makes no claim about the vault so there is
         * nothing to warn about, and three copies of the same warning in one turn make
         * that warning wallpaper (measured 2026-07-27: 3 per turn).
         */
        const lastAssistant = turn.events.reduce(
          (found, event, index) => (event.kind === 'assistant' ? index : found),
          -1,
        );
        /** The original text to retry from a failed turn — the words of the user who opened this turn. */
        const askedEvent = turn.events.find((event) => event.kind === 'user');
        const asked = askedEvent?.kind === 'user' ? askedEvent.text : null;
        /**
         * Is the conclusion **an answer produced without reading anything**? Only then
         * is a way back offered — 「it read but did not cite」 is not a problem to fix
         * but an accurate self-description, so attaching a control there invents a
         * problem that does not exist.
         */
        const conclusion = lastAssistant >= 0 ? turn.events[lastAssistant] : null;
        const unread =
          conclusion?.kind === 'assistant' && conclusion.grounding === 'unread';
        // Same position, same grammar. Two reasons, so only the copy differs.
        const recoveryTitle =
          turn.status === 'failed'
            ? labels.retryTitle
            : unread
              ? labels.regroundTitle({ round: turn.roundsUsed, cap: AGENT_ROUND_CAP })
              : null;
        const showsRecovery = Boolean(recoveryTitle && asked);
        /**
         * **The chip absorbs the notice row.** `no-tool-call` stays in the data layer
         * intact (the next person has to be able to read it programmatically) and is
         * folded into the recovery chip's title only on screen — the same fact is not
         * stated in two rows.
         *
         * Where no chip stands (a turn that lost its original question) **the notice
         * remains**. Absorption only holds when the absorbing side actually exists.
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

          {/* A stopped turn is given **a way back**. Stating the reason without giving
              a route makes that position a dead end. It uses the same grammar as
              "The next step", so no new interaction has to be learned —
              pressing it only seats the same words in the composer, and sending is
              always [Send].

              A turn that **never looked at the vault at all** uses the same slot. Why
              no new banner: filling one existing chip is the whole of it, and the user
              still has exactly one interaction to learn. */}
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
                    'w-full min-h-11 text-left border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] hover:border-[color:var(--color-indigo-accent)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]',
                })}
              >
                <span className="line-clamp-2 [word-break:keep-all]">{asked}</span>
              </button>
            </div>
          ) : null}

          {/* The footer always reserves one row — an arriving answer does not push the
              content above it.

              **The character count dropped to hover here** (2026-08-02). A round's
              fixed cost is 18,934 characters (8,500 of system guidance plus 10,122 of
              tool schemas), so "This turn: 40,036 chars" is not the size of the user's data —
              the read rows on the same screen totalled 1,336 characters, and the total
              is 30× that, mostly tool schemas. Permanently visible, the largest number
              on screen becomes the most meaningless one. The data (`sentChars`) is
              unchanged; only the render was demoted. */}
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
  /** Is this the turn's last answer? The demotion warning attaches only to the conclusion. */
  isConclusion: boolean,
  /** Notice codes the recovery chip absorbed into its title — folded on screen only. */
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
          {/* The screen-context echo — what the agent saw always stays on screen. Moving
              to another node after sending makes the mismatch visible, and that is the
              signal to correct. */}
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
      /** An answer produced without reading anything — it cannot be drawn at the same weight as a grounded one. */
      const unread = grounding === 'unread';
      /**
       * An answer that read but did not cite. **It is not demoted** — the grounding
       * really exists, and the screen corrects by showing that list as chips. A dashed
       * border here would make the screen contradict the "Read" row it just drew.
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
          {/* The citation was missing but the grounding was there — the read list is laid
              out as chips directly. It is the **same component** as a citation chip, so
              pressing goes to the same place (map ego focus). Zero new interactions. */}
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
          {/* The next step — what landed is shown first, and the suggestion comes after.
              Order is narrative, so this row comes **after** the answer, and its entry is
              one short fade (no decoration such as rolling numbers or emphasis pulses). */}
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
                    'w-full min-h-11 text-left border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] hover:border-[color:var(--color-indigo-accent)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]',
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
      // A fact the recovery chip's title already states does not spend another row.
      if (absorbedCodes.has(event.code)) return null;
      // The reason it stopped is the most important fact in that turn, so it is drawn at
      // body weight. Progress reports (aborted, cap) stay quiet as before.
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
 * A chip leading to one concept. A `[[slug]]` citation inside the body and the
 * "Sources consulted" the screen lays out as a correction when the
 * citation is missing use **the same control** — the same action looking different
 * is itself the defect.
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
      className={controlClass({ shape: "chip", tone: "secondary", className: "mx-0.5 max-w-full border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-1.5 py-px align-baseline text-label tracking-label hover:border-[color:var(--color-indigo-accent)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]" })}
    >
      <span className="truncate">{label ?? tailOfSlug(slug)}</span>
    </button>
  );
}

/** Only the name is seated in a chip — the full path eats a whole row and adds no information. */
function tailOfSlug(slug: string): string {
  const index = slug.lastIndexOf('/');
  return index >= 0 ? slug.slice(index + 1) : slug;
}

/** `[[slug]]` as a chip — pressing it moves the map to that concept. */
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
