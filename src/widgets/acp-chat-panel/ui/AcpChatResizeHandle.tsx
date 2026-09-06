'use client';

import { useCallback, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import {
  CHAT_WIDTH_MIN,
  CHAT_WIDTH_STEP,
  defaultChatWidth,
  maxChatWidth,
} from '../model/panel-width';

/**
 * **The panel's left edge, grabbed and dragged.**
 *
 * ## Why it is not a button
 *
 * This is not something you press but **the boundary between two panes**. ARIA has
 * a role for exactly that (`separator` — focusable, it is a window splitter), and
 * that role also states the current, minimum and maximum values. As a button it
 * would tell assistive technology the lie that it is "pressable", and nothing would
 * explain why the arrow keys work.
 *
 * ## Why the keyboard works too
 *
 * A feature discoverable only by dragging and usable only by dragging is the
 * *drag-only discovery* this repository forbids. It takes focus and moves 16px per
 * ← / →.
 *
 * ## Why the visible line is 1px while the grab area is wider
 *
 * Making someone hit exactly 1px with a mouse is not a target but a test (Fitts).
 * All that is visible is the panel's own boundary line, and the area the hand
 * reaches is widened either side of it — nothing extra is drawn on screen.
 */
export function AcpChatResizeHandle({
  width,
  onWidth,
  onCommit,
}: {
  width: number;
  /** Every frame during the drag — it does not store. */
  onWidth: (width: number) => void;
  /** Once on release — that is when it stores. */
  onCommit: (width: number) => void;
}) {
  const t = useTranslations('acpChat');
  const [dragging, setDragging] = useState(false);
  /** The (pointer X, width) at drag start — computing from relative movement is what keeps it from jumping. */
  const originRef = useRef<{ x: number; width: number } | null>(null);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
  // Primary button only. A window is not dragged with the right or an auxiliary button.
      if (event.button !== 0) return;
      event.preventDefault();
      originRef.current = { x: event.clientX, width };
      setDragging(true);
      /*
       * **Capture the pointer** to this element. Without it, a fast drag carries the
       * pointer over the map canvas, the move events go there, and the panel stops
       * following the hand.
       */
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [width],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const origin = originRef.current;
      if (!origin) return;
  // The panel is docked right — dragging **left** widens it.
      onWidth(origin.width + (origin.x - event.clientX));
    },
    [onWidth],
  );

  const endDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!originRef.current) return;
      originRef.current = null;
      setDragging(false);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      onCommit(width);
    },
    [onCommit, width],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
  // Left is the widening direction — it has to match the drag so hand and key say the same thing.
      const delta =
        event.key === 'ArrowLeft' ? CHAT_WIDTH_STEP : event.key === 'ArrowRight' ? -CHAT_WIDTH_STEP : 0;
      if (delta === 0) return;
      event.preventDefault();
      onCommit(width + delta);
    },
    [onCommit, width],
  );

  const viewport = typeof window === 'undefined' ? 0 : window.innerWidth;

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t('resize')}
      aria-valuenow={Math.round(width)}
      aria-valuemin={CHAT_WIDTH_MIN}
      aria-valuemax={Math.round(maxChatWidth(viewport))}
      tabIndex={0}
      data-testid="acp-chat-resize"
      data-dragging={dragging ? 'true' : 'false'}
      title={t('resizeHint')}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
  /*
        Double-click returns to the default width — a way back for someone who lost it while
        dragging. **This screen's default**, not the constant: on a 1040px window the two are
        different numbers, and a way back that lands somewhere the panel never opened is not
        a way back (2026-09-06, alongside `defaultChatWidth`).
      */
      onDoubleClick={() => onCommit(defaultChatWidth(viewport))}
      /*
       * The grab area straddles the panel's left boundary (`-left-1` plus `w-2`).
       * All that is visible is one indigo line while focused or dragging; the rest of
       * the time the panel's existing border stands in for it — no new line is added
       * to the screen.
       */
      className={`absolute -left-1 top-0 z-10 h-full w-2 cursor-col-resize bg-transparent
        transition-colors after:absolute after:inset-y-0 after:left-1 after:w-px
        after:bg-transparent after:transition-colors
        hover:after:bg-[color:var(--color-indigo-a46)]
        focus-visible:outline-none focus-visible:bg-[color:var(--color-indigo-a22)]
        focus-visible:after:bg-[color:var(--color-indigo-accent)]
        data-[dragging=true]:after:bg-[color:var(--color-indigo-accent)]`}
    />
  );
}
