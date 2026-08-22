import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import koMessages from '../../../../messages/ko.json';
import { AcpChatResizeHandle } from './AcpChatResizeHandle';
import { CHAT_WIDTH_DEFAULT, CHAT_WIDTH_STEP } from '../model/panel-width';

/**
 * Dragging **could not be verified on screen.** A synthetic drag sent through the
 * accessibility layer answered "success" while changing the width by 0px (measured
 * 2026-08-16) — the real path goes through pointer capture. Something invisible to
 * the eye and unmeasurable by automation means the next person can break it
 * silently. So it is measured here.
 */
beforeAll(() => {
  // jsdom has no pointer capture — pretending it does is enough for the handlers to run.
  Object.assign(HTMLElement.prototype, {
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    hasPointerCapture: () => true,
  });
});

function renderHandle(width = CHAT_WIDTH_DEFAULT) {
  const onWidth = vi.fn();
  const onCommit = vi.fn();
  render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <AcpChatResizeHandle width={width} onWidth={onWidth} onCommit={onCommit} />
    </NextIntlClientProvider>,
  );
  return { handle: screen.getByTestId('acp-chat-resize'), onWidth, onCommit };
}

describe('대화 칸 너비 — 끌어서 정한다', () => {
  it('왼쪽으로 끌면 넓어진다 — 패널이 오른쪽에 붙어 있으니 그 방향이 「더」다', () => {
    const { handle, onWidth } = renderHandle(420);
    fireEvent.pointerDown(handle, { button: 0, clientX: 1000, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 940, pointerId: 1 });
    expect(onWidth).toHaveBeenLastCalledWith(480);
  });

  it('오른쪽으로 끌면 좁아진다', () => {
    const { handle, onWidth } = renderHandle(420);
    fireEvent.pointerDown(handle, { button: 0, clientX: 1000, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 1060, pointerId: 1 });
    expect(onWidth).toHaveBeenLastCalledWith(360);
  });

  it('누르지 않은 채 지나가는 마우스는 아무 일도 안 한다', () => {
    const { handle, onWidth } = renderHandle();
    fireEvent.pointerMove(handle, { clientX: 900, pointerId: 1 });
    expect(onWidth).not.toHaveBeenCalled();
  });

  it('주 버튼이 아니면 끌기가 시작되지 않는다 — 오른쪽 버튼으로 창을 끌지 않는다', () => {
    const { handle, onWidth } = renderHandle();
    fireEvent.pointerDown(handle, { button: 2, clientX: 1000, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 900, pointerId: 1 });
    expect(onWidth).not.toHaveBeenCalled();
  });

  it('손을 뗄 때 **한 번만** 저장한다 — 끄는 동안 매 프레임 쓰지 않는다', () => {
    const { handle, onCommit } = renderHandle(420);
    fireEvent.pointerDown(handle, { button: 0, clientX: 1000, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 980, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 960, pointerId: 1 });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('끌다가 취소돼도 끝난 것으로 친다 — 붙잡힌 채 남지 않는다', () => {
    const { handle, onCommit } = renderHandle();
    fireEvent.pointerDown(handle, { button: 0, clientX: 1000, pointerId: 1 });
    fireEvent.pointerCancel(handle, { pointerId: 1 });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});

describe('대화 칸 너비 — 키보드로도 된다', () => {
  it('← 로 넓히고 → 로 좁힌다 — 끌기와 같은 방향이다', () => {
    const { handle, onCommit } = renderHandle(420);
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(onCommit).toHaveBeenLastCalledWith(420 + CHAT_WIDTH_STEP);
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(onCommit).toHaveBeenLastCalledWith(420 - CHAT_WIDTH_STEP);
  });

  it('다른 키는 그대로 흘려보낸다', () => {
    const { handle, onCommit } = renderHandle();
    fireEvent.keyDown(handle, { key: 'a' });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('두 번 누르면 기본 폭으로 되돌아간다 — 끌다 잃어버린 사람의 길', () => {
    const { handle, onCommit } = renderHandle(900);
    fireEvent.doubleClick(handle);
    expect(onCommit).toHaveBeenCalledWith(CHAT_WIDTH_DEFAULT);
  });
});

describe('대화 칸 너비 — 보조기술에 무엇이라고 말하나', () => {
  it('창 분할자로 읽히고 현재값·범위를 말한다', () => {
    const { handle } = renderHandle(465);
    expect(handle.getAttribute('role')).toBe('separator');
    expect(handle.getAttribute('aria-orientation')).toBe('vertical');
    expect(handle.getAttribute('aria-valuenow')).toBe('465');
    expect(handle.getAttribute('tabindex')).toBe('0');
    // Without a name it reads only as "separator".
    expect(handle.getAttribute('aria-label')).toBeTruthy();
  });
});
