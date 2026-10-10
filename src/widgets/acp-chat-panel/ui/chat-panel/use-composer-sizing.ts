import { useEffect, useLayoutEffect, type RefObject } from 'react';

import { composerGrowth, composerMaxRows, snapScrollTop } from '@/shared/lib/composer-growth';

export function useComposerSizing({
  draft,
  inputRef,
  mirrorRef,
  panelRef,
  composerFocusRequest,
}: {
  draft: string;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  mirrorRef: RefObject<HTMLTextAreaElement | null>;
  panelRef: RefObject<HTMLElement | null>;
  composerFocusRequest: number;
}) {
  useLayoutEffect(() => {
    const input = inputRef.current;
    const mirror = mirrorRef.current;
    if (!input || !mirror) return;
    mirror.value = draft;
    const style = window.getComputedStyle(input);
    const lineHeight = Number.parseFloat(style.lineHeight);
    const growth = composerGrowth(
      {
        lineHeight,
        paddingBlock: Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom),
        borderBlock:
          Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.borderBottomWidth),
        contentHeight: mirror.scrollHeight,
      },

      composerMaxRows(panelRef.current?.clientHeight ?? 0, lineHeight),
    );

    if (!growth) return;
    input.style.height = `${growth.height}px`;
    input.scrollTop = snapScrollTop(input.scrollTop, lineHeight);
  }, [draft, inputRef, mirrorRef, panelRef]);

  useEffect(() => {
    if (composerFocusRequest === 0) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [composerFocusRequest, inputRef]);
}
