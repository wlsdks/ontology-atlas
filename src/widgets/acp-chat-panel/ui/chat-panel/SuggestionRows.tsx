import { useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import {
  BookOpen,
  FolderGit2,
  Link2,
  ListChecks,
  Map as MapGlyph,
  PenLine,
  RefreshCw,
  Waypoints,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

import { isPressableSuggestion, type ChatSuggestion } from '@/features/acp-session';
import { cn } from '@/shared/lib/cn';
import { controlClass } from '@/shared/ui';
import { CONTROL_PRESS_TRAVEL } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';

import type { ChatT } from './types';

const KIND_GLYPH: Record<ChatSuggestion['kind'], LucideIcon> = {
  connectSource: FolderGit2,
  build: MapGlyph,
  dependencies: Workflow,
  standAlone: Link2,
  rename: PenLine,
  update: RefreshCw,
  check: ListChecks,
  nothingLeft: ListChecks,
  explainSubject: BookOpen,
  subjectImpact: Waypoints,
};

const CHOICE_CLASS = cn(
  controlClass({ shape: 'card', size: 'lg', hoverBorder: 'strong' }),
  CONTROL_PRESS_TRAVEL,
  'group/choice relative isolate w-full gap-3 bg-[color:var(--color-elevated)] text-left shadow-[inset_0_1px_0_var(--color-overlay-2)] focus-visible:border-[color:var(--color-border-strong)]',
);

/** The lifted surface fades in on a layer of its own, so hover changes opacity and nothing moves. */
const LIFT_LAYER_CLASS =
  'pointer-events-none absolute inset-0 -z-10 rounded-[inherit] bg-[color:var(--color-overlay-2)] opacity-0 transition-opacity group-hover/choice:opacity-100 group-focus-visible/choice:opacity-100 group-disabled/choice:opacity-0';

const KEY_STEP: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };

interface SuggestionRowsProps {
  t: ChatT;
  heading: string;
  testId: string;
  centered: boolean;
  items: readonly ChatSuggestion[];
  /** Choices that would send stand disabled while the session cannot take a turn. */
  canSend: boolean;
  onSelect: (suggestion: ChatSuggestion) => void;
  onDone: () => void;
}

/**
 * Measured next steps as detached buttons: one tab stop for the group, arrow keys between choices,
 * nothing focused or pressed on arrival. A press sends; **Done for now** hides the group.
 */
export function SuggestionRows({
  t,
  heading,
  testId,
  centered,
  items,
  canSend,
  onSelect,
  onDone,
}: SuggestionRowsProps) {
  const headingId = useId();
  const choices = items.filter(isPressableSuggestion);
  const [activeIndex, setActiveIndex] = useState(0);
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);
  // Every choice plus Done for now; an index past the end after the list shrinks falls back to the first.
  const stopCount = choices.length + 1;
  const tabStop = activeIndex < stopCount ? activeIndex : 0;

  if (choices.length === 0) {
    return items.length > 0 ? (
      <div className="grid gap-1.5" data-testid={testId}>
        <p
          data-testid="acp-chat-nothing-left"
          className={cn('text-label leading-label text-[color:var(--color-text-tertiary)]', centered && 'text-center')}
        >
          {t('suggest.nothingLeft')}
        </p>
      </div>
    ) : null;
  }

  const enabled = (suggestion: ChatSuggestion) => canSend || suggestion.kind === 'connectSource';
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = KEY_STEP[event.key];
    let next: number | null = null;
    if (step !== undefined) next = (tabStop + step + stopCount) % stopCount;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = stopCount - 1;
    if (next === null) return;
    event.preventDefault();
    setActiveIndex(next);
    buttonsRef.current[next]?.focus();
  };

  return (
    <div className="grid gap-2" data-testid={testId}>
      <p
        id={headingId}
        className={cn(
          'text-caption leading-caption text-[color:var(--color-text-quaternary)]',
          centered && 'text-center',
        )}
      >
        {heading}
      </p>
      <div
        role="group"
        aria-labelledby={headingId}
        data-testid="acp-chat-next-steps"
        className="flex flex-col gap-1.5"
        onKeyDown={onKeyDown}
      >
        <div className="grid auto-rows-fr gap-2">
          {choices.map((suggestion, index) => {
            const Glyph = KIND_GLYPH[suggestion.kind];
            const label = t(`suggest.${suggestion.kind}.label`, suggestion.params);
            const because = t(`suggest.${suggestion.kind}.because`, suggestion.params);
            return (
              <button
                key={suggestion.kind}
                ref={(node) => {
                  buttonsRef.current[index] = node;
                }}
                type="button"
                tabIndex={index === tabStop ? 0 : -1}
                disabled={!enabled(suggestion)}
                title={`${label}\n${because}`}
                data-testid={`acp-chat-suggestion-${suggestion.kind}`}
                className={cn(CHOICE_CLASS, 'motion-stagger-in')}
                style={{ '--motion-stagger-index': index } as CSSProperties}
                onFocus={() => setActiveIndex(index)}
                onClick={() => onSelect(suggestion)}
              >
                <span aria-hidden className={LIFT_LAYER_CLASS} />
                <span className="flex size-8 shrink-0 items-center justify-center rounded-chip border border-[color:var(--color-indigo-a22)] bg-[color:var(--color-indigo-a12)] text-[color:var(--color-indigo-text-soft)]">
                  <Glyph size={ICON_SIZE.md} aria-hidden />
                </span>
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="truncate text-body leading-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
                    {label}
                  </span>
                  <span className="truncate text-label leading-label text-[color:var(--color-text-tertiary)]">
                    {because}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <button
          ref={(node) => {
            buttonsRef.current[choices.length] = node;
          }}
          type="button"
          tabIndex={choices.length === tabStop ? 0 : -1}
          data-testid="acp-chat-next-steps-done"
          className={cn(
            controlClass({ shape: 'link', size: 'md', tone: 'default', hoverInk: 'strong' }),
            'motion-stagger-fade px-2',
            centered ? 'self-center' : 'self-start',
          )}
          style={{ '--motion-stagger-index': choices.length } as CSSProperties}
          onFocus={() => setActiveIndex(choices.length)}
          onClick={onDone}
        >
          {t('suggest.done')}
        </button>
      </div>
    </div>
  );
}

/** Text, not buttons: the rows become buttons only once the session can take them. */
export function StartingSuggestionPreview({ heading, items, labelFor }: {
  heading: string;
  items: readonly ChatSuggestion[];
  labelFor: (suggestion: ChatSuggestion) => string;
}) {
  const choices = items.filter(isPressableSuggestion);
  if (choices.length === 0) return null;
  return (
    <div className="grid w-full gap-2 border-t border-[color:var(--color-divider)] pt-4 text-center" data-testid="acp-starting-suggestions">
      <p className="text-caption leading-caption text-[color:var(--color-text-tertiary)]">{heading}</p>
      <ul className="grid gap-2">
        {choices.map((suggestion) => (
          <li
            key={suggestion.kind}
            data-testid={`acp-starting-suggestion-${suggestion.kind}`}
            className="text-balance text-label leading-label text-[color:var(--color-text-tertiary)]"
          >
            {labelFor(suggestion)}
          </li>
        ))}
      </ul>
    </div>
  );
}
