import { useLayoutEffect, useState, type RefObject } from 'react';

import {
  composerGrowth,
  composerTopIsHidden,
  snapScrollTop,
} from '@/shared/lib/agent-chat/composer-growth';

/**
 * Composer growth: from 2 rows with the content up to 6, through real `height` (not `transform`) so
 * the send button and side-branch row yield space with it. The curve is the single surface-movement
 * ramp with no spring: overshoot would shake text being read.
 *
 * An off-screen mirror measures growth: resetting the visible composer's height to `''` to read
 * `scrollHeight` collapses the box every frame and turns growth into a staircase. The mirror has the
 * same typography and width, and the visible box is never reset. `open`, `scopeAccepted` and
 * `provider` are the moments the composer **mounts**: measuring once then makes it stand at the right
 * height from the first paint.
 */
export function useComposerGrowth({
  inputRef,
  mirrorRef,
  draft,
  open,
  scopeAccepted,
  provider,
}: {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  mirrorRef: RefObject<HTMLTextAreaElement | null>;
  draft: string;
  open: boolean;
  scopeAccepted: boolean;
  provider: string | null;
}) {
  const [composerHidesTop, setComposerHidesTop] = useState(false);

  useLayoutEffect(() => {
    const input = inputRef.current;
    const mirror = mirrorRef.current;
    if (!input || !mirror) return;
    mirror.value = draft;
    const style = window.getComputedStyle(input);
    const lineHeight = Number.parseFloat(style.lineHeight);
    const growth = composerGrowth({
      lineHeight,
      paddingBlock:
        Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom),
      borderBlock:
        Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.borderBottomWidth),
      contentHeight: mirror.scrollHeight,
    });
    // Leave it alone in states that cannot be measured (SSR, jsdom, before fonts
    // load) — the default `rows` always beats collapsing to 0px.
    if (!growth) return;
    input.style.height = `${growth.height}px`;
    input.scrollTop = snapScrollTop(input.scrollTop, lineHeight);
    setComposerHidesTop(composerTopIsHidden(growth.overflowing, input.scrollTop));
  }, [draft, open, scopeAccepted, provider, inputRef, mirrorRef]);

  return { composerHidesTop, setComposerHidesTop };
}
