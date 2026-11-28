import { useCallback, useEffect, useState, type RefObject } from 'react';

import { snapScrollTop } from '@/shared/lib/agent-chat/composer-growth';

/**
 * Puts a sentence into the composer so it reads from the beginning: from a chip (`prefill`) or handed
 * over from outside (`prefillRequest`, such as "Ask the agent" on a queue row). Neither sends.
 */
export function useDraftSeating({
  inputRef,
  setDraft,
  prefillRequest,
}: {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  setDraft: (text: string) => void;
  /** `nonce` lets the same sentence be seated again. */
  prefillRequest?: { text: string; nonce: number } | null;
}) {
  /**
   * Caret at the end, view on the first line. `input.select()` would make the next keystroke erase the
   * chosen sentence and scroll to the last line, so `scrollTop` is snapped to the 20px line grid
   * (alignment, so it holds under reduced motion).
   */
  const seatDraft = useCallback((input: HTMLTextAreaElement) => {
    input.focus();
    const end = input.value.length;
    // APIs that may be missing in jsdom and older WebViews are called only when present.
    if (typeof input.setSelectionRange === 'function') input.setSelectionRange(end, end);
    const lineHeight = Number.parseFloat(window.getComputedStyle(input).lineHeight);
    input.scrollTop = snapScrollTop(0, lineHeight);
  }, []);

  /**
   * Seated in the frame the chip was pressed. Seating waits for `requestAnimationFrame`, as right after
   * `setDraft` React has not written the value yet.
   */
  const prefill = useCallback(
    (text: string) => {
      setDraft(text);
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      window.requestAnimationFrame(() => {
        const current = inputRef.current;
        if (current) seatDraft(current);
      });
    },
    [inputRef, seatDraft, setDraft],
  );

  /**
   * A first message handed over from outside is taken as an adjustment during render, not an effect:
   * an effect paints the stale value once first, which reads as a late response. It seats only when
   * `nonce` changes, so a draft being edited is not overwritten every render.
   */
  const prefillNonce = prefillRequest?.nonce ?? null;
  const prefillText = prefillRequest?.text ?? null;
  const [seenPrefillNonce, setSeenPrefillNonce] = useState<number | null>(null);
  if (prefillNonce !== null && prefillText && prefillNonce !== seenPrefillNonce) {
    setSeenPrefillNonce(prefillNonce);
    setDraft(prefillText);
  }
  // Focus and caret are DOM operations, so they happen after render — the value is already in by then.
  useEffect(() => {
    if (seenPrefillNonce === null) return;
    const input = inputRef.current;
    if (!input) return;
    seatDraft(input);
  }, [seenPrefillNonce, seatDraft, inputRef]);

  return prefill;
}
