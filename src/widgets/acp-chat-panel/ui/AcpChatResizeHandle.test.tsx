import { fireEvent, render, screen } from '@testing-library/react';
import { IntlProvider } from 'use-intl';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import koMessages from '../../../../messages/ko.json';
import { AcpChatResizeHandle } from './AcpChatResizeHandle';
import { CHAT_WIDTH_STEP, defaultChatWidth } from '../model/panel-width';

/** Dragging cannot be verified through the accessibility layer, so it is measured here. */
beforeAll(() => {
  // jsdom has no pointer capture — pretending it does is enough for the handlers to run.
  Object.assign(HTMLElement.prototype, {
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    hasPointerCapture: () => true,
  });
});

function renderHandle(width = defaultChatWidth(window.innerWidth)) {
  const onWidth = vi.fn();
  const onCommit = vi.fn();
  render(
    <IntlProvider locale="ko" messages={koMessages}>
      <AcpChatResizeHandle width={width} onWidth={onWidth} onCommit={onCommit} />
    </IntlProvider>,
  );
  return { handle: screen.getByTestId('acp-chat-resize'), onWidth, onCommit };
}

describe('chat column width: set by dragging', () => {
  it('dragging left widens it, because the panel hugs the right edge and that direction means more', () => {
    const { handle, onWidth } = renderHandle(420);
    fireEvent.pointerDown(handle, { button: 0, clientX: 1000, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 940, pointerId: 1 });
    expect(onWidth).toHaveBeenLastCalledWith(480);
  });

  it('dragging right narrows it', () => {
    const { handle, onWidth } = renderHandle(420);
    fireEvent.pointerDown(handle, { button: 0, clientX: 1000, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 1060, pointerId: 1 });
    expect(onWidth).toHaveBeenLastCalledWith(360);
  });

  it('a mouse passing over without a press does nothing', () => {
    const { handle, onWidth } = renderHandle();
    fireEvent.pointerMove(handle, { clientX: 900, pointerId: 1 });
    expect(onWidth).not.toHaveBeenCalled();
  });

  it('a non-primary button does not start a drag, so the right button never drags the panel', () => {
    const { handle, onWidth } = renderHandle();
    fireEvent.pointerDown(handle, { button: 2, clientX: 1000, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 900, pointerId: 1 });
    expect(onWidth).not.toHaveBeenCalled();
  });

  it('saves **once** on release, not on every frame while dragging', () => {
    const { handle, onCommit } = renderHandle(420);
    fireEvent.pointerDown(handle, { button: 0, clientX: 1000, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 980, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 960, pointerId: 1 });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('a cancelled drag counts as finished, so it never stays captured', () => {
    const { handle, onCommit } = renderHandle();
    fireEvent.pointerDown(handle, { button: 0, clientX: 1000, pointerId: 1 });
    fireEvent.pointerCancel(handle, { pointerId: 1 });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});

describe('chat column width: the keyboard works too', () => {
  it('left arrow widens and right arrow narrows, the same directions as dragging', () => {
    const { handle, onCommit } = renderHandle(420);
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(onCommit).toHaveBeenLastCalledWith(420 + CHAT_WIDTH_STEP);
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(onCommit).toHaveBeenLastCalledWith(420 - CHAT_WIDTH_STEP);
  });

  it('lets other keys pass through untouched', () => {
    const { handle, onCommit } = renderHandle();
    fireEvent.keyDown(handle, { key: 'a' });
    expect(onCommit).not.toHaveBeenCalled();
  });

  /*
   * The way back is **this window's** default, not the constant. On a narrow window the two
   * differ, and returning to a width the panel would never have opened at is not a return.
   */
  it('a double press restores the default width, a way back for someone who lost it while dragging', () => {
    const { handle, onCommit } = renderHandle(900);
    fireEvent.doubleClick(handle);
    expect(onCommit).toHaveBeenCalledWith(defaultChatWidth(window.innerWidth));
  });
});

describe('chat column width: what assistive technology is told', () => {
  it('reads as a window splitter and announces its current value and range', () => {
    const { handle } = renderHandle(465);
    expect(handle.getAttribute('role')).toBe('separator');
    expect(handle.getAttribute('aria-orientation')).toBe('vertical');
    expect(handle.getAttribute('aria-valuenow')).toBe('465');
    expect(handle.getAttribute('tabindex')).toBe('0');
    // Without a name it reads only as "separator".
    expect(handle.getAttribute('aria-label')).toBeTruthy();
  });
});
