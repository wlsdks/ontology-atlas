import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isImeComposing } from './ime-composition';

let field: HTMLTextAreaElement;

beforeEach(() => {
  field = document.createElement('textarea');
  document.body.append(field);
});

afterEach(() => {
  field.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function pressEnter(target: EventTarget, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, ...init });
  target.dispatchEvent(event);
  return event;
}

function endComposition(target: EventTarget): void {
  target.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '한' }));
}

function asEngine(vendor: string): void {
  vi.spyOn(navigator, 'vendor', 'get').mockReturnValue(vendor);
}

describe('isImeComposing', () => {
  it('lets a plain Enter through', () => {
    expect(isImeComposing(pressEnter(field, { keyCode: 13 }))).toBe(false);
  });

  it('holds an Enter the browser marks as composing', () => {
    expect(isImeComposing(pressEnter(field, { isComposing: true }))).toBe(true);
  });

  it('holds an Enter the IME processed even when isComposing is false', () => {
    expect(isImeComposing(pressEnter(field, { keyCode: 229 }))).toBe(true);
  });

  it('reads the native event behind a React keyboard event', () => {
    const composing = pressEnter(field, { isComposing: true });
    const plain = pressEnter(field, { keyCode: 13 });
    expect(isImeComposing({ nativeEvent: composing } as ReactKeyboardEvent)).toBe(true);
    expect(isImeComposing({ nativeEvent: plain } as ReactKeyboardEvent)).toBe(false);
  });

  describe('WebKit, where compositionend fires before the keydown that ended it', () => {
    beforeEach(() => asEngine('Apple Computer, Inc.'));

    it('holds the first keydown after compositionend and sends the next one', () => {
      endComposition(field);
      const commit = pressEnter(field, { keyCode: 13 });
      expect(isImeComposing(commit)).toBe(true);
      expect(isImeComposing(commit), 'a second handler for the same keydown disagrees').toBe(true);
      expect(isImeComposing(pressEnter(field, { keyCode: 13 }))).toBe(false);
    });

    it('still sends the Enter after a 229 commit keydown', () => {
      endComposition(field);
      expect(isImeComposing(pressEnter(field, { keyCode: 229 }))).toBe(true);
      expect(isImeComposing(pressEnter(field, { keyCode: 13 }))).toBe(false);
    });

    it('sends an Enter pressed long after a composition the pointer confirmed', () => {
      vi.useFakeTimers();
      endComposition(field);
      vi.advanceTimersByTime(1_000);
      expect(isImeComposing(pressEnter(field, { keyCode: 13 }))).toBe(false);
    });

    it('sends an Enter on another field', () => {
      const other = document.createElement('input');
      document.body.append(other);
      endComposition(field);
      expect(isImeComposing(pressEnter(other, { keyCode: 13 }))).toBe(false);
      other.remove();
    });
  });

  it('lets Chromium send the keydown that follows compositionend', () => {
    asEngine('Google Inc.');
    expect(isImeComposing(pressEnter(field, { isComposing: true, keyCode: 229 }))).toBe(true);
    endComposition(field);
    expect(isImeComposing(pressEnter(field, { keyCode: 13 }))).toBe(false);
  });
});
