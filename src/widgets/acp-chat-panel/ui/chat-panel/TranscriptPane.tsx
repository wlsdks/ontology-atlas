import type { ReactNode, RefObject } from 'react';
import { ArrowDown } from 'lucide-react';

import { Surface } from '@/shared/ui';
import { ChromeChip } from '@/shared/ui/chrome-chip';

import type { ChatT } from './types';

export function TranscriptPane({
  t,
  listRef,
  contentRef,
  jumpShown,
  inert,
  mask,
  onScrolledChange,
  onJumpToLatest,
  children,
}: {
  t: ChatT;
  listRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  jumpShown: boolean;
  inert: boolean;
  mask: string | undefined;
  onScrolledChange: (scrolled: boolean) => void;
  onJumpToLatest: () => void;
  children: ReactNode;
}) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={listRef}
        data-testid="acp-chat-transcript"
        data-jump-band={jumpShown ? 'true' : undefined}
        inert={inert ? true : undefined}
        onScroll={(event) => onScrolledChange(event.currentTarget.scrollTop > 1)}
        style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
        className="atlas-scroll-quiet flex min-h-0 flex-1 flex-col overflow-y-auto"
      >

        <div ref={contentRef} className="flex flex-1 flex-col gap-3">
          {children}
        </div>
      </div>
      <Surface
        open={jumpShown}
        origin="bottom center"
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center px-2"
      >
        <ChromeChip
          data-testid="acp-chat-jump-latest"
          icon={<ArrowDown aria-hidden className="text-[color:var(--color-indigo-accent)]" />}
          onClick={onJumpToLatest}
          className="pointer-events-auto max-w-full"
        >
          {t('jumpToLatest')}
        </ChromeChip>
      </Surface>
    </div>
  );
}
