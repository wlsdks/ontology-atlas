import type { Dispatch, RefObject, SetStateAction } from 'react';

import type { AcpSlashCommand } from '@/features/acp-session';
import { COMPOSER_MIN_ROWS } from '@/shared/lib/composer-growth';
import { isImeComposing } from '@/shared/lib/ime-composition';
import { Textarea } from '@/shared/ui';

import type { ChatT, SeatedDetail } from './types';

interface ComposerInputProps {
  t: ChatT;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  mirrorRef: RefObject<HTMLTextAreaElement | null>;
  draft: string;
  setDraft: Dispatch<SetStateAction<string>>;
  setSeatedDetail: Dispatch<SetStateAction<SeatedDetail | null>>;
  composerFocused: boolean;
  setComposerFocused: (focused: boolean) => void;
  composerSubject: string | null;
  canType: boolean;
  slash: {
    open: boolean;
    matches: readonly AcpSlashCommand[];
    activeIndex: number;
    setActive: Dispatch<SetStateAction<number>>;
    setDismissed: Dispatch<SetStateAction<boolean>>;
    choose: (name: string) => void;
  };
  submit: () => void;
}

export function ComposerInput({
  t,
  inputRef,
  mirrorRef,
  draft,
  setDraft,
  setSeatedDetail,
  composerFocused,
  setComposerFocused,
  composerSubject,
  canType,
  slash,
  submit,
}: ComposerInputProps) {
  return (
    <div className="relative" data-acp-composer>
      <Textarea
        ref={inputRef}
        aria-label={t('composerLabel')}
        placeholder={composerFocused && draft.length === 0 ? '' : composerSubject ? t('composerPlaceholderSubject', { subject: composerSubject }) : t('composerPlaceholder')}
        frame="bare"
        className="w-full"
        rows={COMPOSER_MIN_ROWS}
        value={draft}
        disabled={!canType}
        style={{
          minHeight: 'var(--touch-target-min)',
          transitionProperty: 'height',
          transitionDuration: 'var(--motion-base)',
          transitionTimingFunction: 'var(--motion-ease)',
        }}
        onFocus={() => setComposerFocused(true)}
        onBlur={() => setComposerFocused(false)}
        onChange={(e) => {
          setDraft(e.target.value);

          if (!e.target.value.trim()) setSeatedDetail(null);

          slash.setDismissed(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && isImeComposing(e)) return;
          if (slash.open) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              const step = e.key === 'ArrowDown' ? 1 : -1;
              slash.setActive(
                (prev) => (prev + step + slash.matches.length) % slash.matches.length,
              );
              return;
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              slash.choose(slash.matches[slash.activeIndex]?.name ?? slash.matches[0].name);
              return;
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              slash.setDismissed(true);
              return;
            }
          }

          if (e.key === 'Escape') {
            // With text here the key is claimed: the hosts' close handlers stand down on defaultPrevented.
            if (draft.trim().length > 0) e.preventDefault();
            return;
          }
          if (e.key !== 'Enter') return;
          if (e.shiftKey) return;
          e.preventDefault();
          submit();
        }}
      />

      <Textarea
        ref={mirrorRef}
        aria-hidden
        tabIndex={-1}
        readOnly
        aria-label={t('composerLabel')}
        frame="bare"
        rows={1}
        data-testid="acp-chat-composer-mirror"
        className="pointer-events-none invisible absolute inset-x-0 top-0 h-0 overflow-hidden"
      />
    </div>
  );
}
