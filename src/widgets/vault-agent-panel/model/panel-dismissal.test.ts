import { afterEach, describe, expect, it } from 'vitest';

import { focusIsOutsidePanel, isEscapeInsidePanel, openerToRemember } from './panel-dismissal';

afterEach(() => {
  document.body.innerHTML = '';
});

function seat() {
  document.body.innerHTML =
    '<button id="outside"></button><aside id="panel"><textarea id="inside"></textarea></aside>';
  return {
    panel: document.getElementById('panel')!,
    inside: document.getElementById('inside')!,
    outside: document.getElementById('outside')!,
  };
}

const press = (target: EventTarget, extra: Partial<KeyboardEvent> = {}) => ({
  key: 'Escape',
  isComposing: false,
  defaultPrevented: false,
  target,
  ...extra,
});

describe('isEscapeInsidePanel', () => {
  it('closes on Escape pressed inside the panel', () => {
    const { panel, inside } = seat();
    expect(isEscapeInsidePanel(press(inside), panel)).toBe(true);
  });

  it('ignores Escape pressed outside the panel or with no panel mounted', () => {
    const { panel, outside } = seat();
    expect(isEscapeInsidePanel(press(outside), panel)).toBe(false);
    expect(isEscapeInsidePanel(press(outside), null)).toBe(false);
  });

  it('leaves Escape to an IME or a nested surface that already used it', () => {
    const { panel, inside } = seat();
    expect(isEscapeInsidePanel(press(inside, { isComposing: true }), panel)).toBe(false);
    expect(isEscapeInsidePanel(press(inside, { defaultPrevented: true }), panel)).toBe(false);
    expect(isEscapeInsidePanel(press(inside, { key: 'Enter' }), panel)).toBe(false);
  });
});

describe('openerToRemember', () => {
  it('remembers a control outside the panel, never the body or something inside', () => {
    const { panel, inside, outside } = seat();
    expect(openerToRemember(outside, panel)).toBe(outside);
    expect(openerToRemember(inside, panel)).toBeNull();
    expect(openerToRemember(document.body, panel)).toBeNull();
    expect(openerToRemember(null, panel)).toBeNull();
  });
});

describe('focusIsOutsidePanel', () => {
  it('is true only when focus rests on a real control outside the panel', () => {
    const { panel, inside, outside } = seat();
    expect(focusIsOutsidePanel(outside, panel)).toBe(true);
    expect(focusIsOutsidePanel(inside, panel)).toBe(false);
    expect(focusIsOutsidePanel(document.body, panel)).toBe(false);
    expect(focusIsOutsidePanel(null, panel)).toBe(false);
  });
});
