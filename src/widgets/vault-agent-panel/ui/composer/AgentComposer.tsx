import type { RefObject } from 'react';
import { useTranslations } from 'use-intl';

import { COMPOSER_MIN_ROWS } from '@/shared/lib/agent-chat/composer-growth';
import { isImeComposing } from '@/shared/lib/keyboard/ime-composition';
import { controlClass, fieldClass } from '@/shared/ui/control-class';

/**
 * The box class the composer and the mirror share: one string, so their typography cannot diverge
 * and make the mirror measure a different row count.
 */
const COMPOSER_BOX_CLASS = fieldClass({ multiline: true, size: 'md' });

/**
 * The message box and its Send or Stop button. Enter sends, Shift+Enter breaks the line, and an IME
 * still composing never sends. The box grows with `useComposerGrowth`, which measures through the
 * mirror textarea.
 */
export function AgentComposer({
  inputRef,
  mirrorRef,
  draft,
  onDraftChange,
  hidesTop,
  onHidesTopChange,
  hasTurns,
  running,
  canSend,
  onSubmit,
  onStop,
}: {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  mirrorRef: RefObject<HTMLTextAreaElement | null>;
  draft: string;
  onDraftChange: (text: string) => void;
  hidesTop: boolean;
  onHidesTopChange: (hidesTop: boolean) => void;
  hasTurns: boolean;
  running: boolean;
  canSend: boolean;
  onSubmit: () => void;
  onStop: () => void;
}) {
  const t = useTranslations('vaultAgentPanel');
  return (
    /* `items-end`: the primary action stays at the bottom edge as the box grows. */
    <div className="flex items-end gap-2">
      <div className="relative min-w-0 flex-1">
      <textarea
        ref={inputRef}
        data-testid="vault-agent-input"
        data-composer-hides-top={hidesTop ? 'true' : 'false'}
        value={draft}
        rows={COMPOSER_MIN_ROWS}
        disabled={running}
        onScroll={(event) => {
          const input = event.currentTarget;
          onHidesTopChange(
            input.scrollHeight > input.clientHeight && input.scrollTop > 0,
          );
        }}
        style={{
          transitionProperty: 'height',
          transitionDuration: 'var(--motion-base)',
          transitionTimingFunction: 'var(--motion-ease)',
          // The overflow signal appears only when the cap is hit and the top is
          // **actually clipped**. While growing, an overflow that is not there is
          // not advertised.
          maskImage: hidesTop
            ? 'linear-gradient(to bottom, transparent 0, #000 var(--leading-body))'
            : undefined,
        }}
        // The first-message placeholder uses the same key as the locked strip's copy, so the text stays in
        // place when a key arrives.
        placeholder={
          hasTurns ? t('placeholder') : t('placeholderFirst')
        }
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !isImeComposing(event)) {
            event.preventDefault();
            onSubmit();
          }
        }}
        className={`${COMPOSER_BOX_CLASS} block w-full text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-quaternary)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]`}
      />
      {/* The mirror that measures growth: same class, so same typography and width, and kept in place so
          the padded width matches. `invisible`, not `opacity-0`, which would still paint, join overlap
          audits and take a caret; layout still runs, so `scrollHeight` matches. */}
      <textarea
        ref={mirrorRef}
        aria-hidden="true"
        tabIndex={-1}
        readOnly
        data-testid="vault-agent-input-mirror"
        className={`${COMPOSER_BOX_CLASS} pointer-events-none invisible absolute left-0 top-0 h-0 w-full overflow-hidden`}
      />
      </div>
      {running ? (
        <button
          type="button"
          data-testid="vault-agent-stop"
          onClick={onStop}
          /* Stop and send replace each other in one position, so they take the same step: `px-3` is `lg`'s
          inset and its pair is `text-body`. */
          className={controlClass({
            shape: 'chip',
            size: 'lg',
            tone: 'strong',
            className:
              'shrink-0 justify-center font-[var(--font-weight-emphasis)] tracking-body hover:bg-[color:var(--color-overlay-2)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]',
          })}
        >
          {t('stop')}
        </button>
      ) : (
        <button
          type="button"
          data-testid="vault-agent-send"
          disabled={!canSend}
          onClick={onSubmit}
          className={controlClass({
            shape: 'chip',
            size: 'lg',
            tone: 'onAccent',
            className:
              'shrink-0 justify-center tracking-body',
          })}
        >
          {t('send')}
        </button>
      )}
    </div>
  );
}
