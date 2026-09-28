import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fadeIn, tabSwitchFade, tokenMs, whenLoaded } from './panel-arrival';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('tokenMs', () => {
  it('reads a duration token whether the browser returns seconds or milliseconds', () => {
    expect(tokenMs('.18s')).toBe(180);
    expect(tokenMs(' 120ms ')).toBe(120);
    expect(tokenMs('')).toBe(0);
  });
});

describe('tabSwitchFade', () => {
  it('fades a Sources and Wiki switch, which shares one mounted view, on the movement step', () => {
    expect(tabSwitchFade('sources', 'wiki', false)).toBe('--motion-base');
    expect(tabSwitchFade('wiki', 'ontology', false)).toBeNull();
    expect(tabSwitchFade('ontology', 'ontology', false)).toBeNull();
  });

  it('plays every switch as an opacity fade on the short step under reduced motion', () => {
    expect(tabSwitchFade('wiki', 'ontology', true)).toBe('--motion-fast');
    expect(tabSwitchFade('rounds', 'sources', true)).toBe('--motion-fast');
    expect(tabSwitchFade('rounds', 'rounds', true)).toBeNull();
  });
});

describe('fadeIn', () => {
  it('animates opacity only, on the named token and the entry curve', () => {
    const host = document.createElement('div');
    host.style.setProperty('--motion-fast', '120ms');
    host.style.setProperty('--motion-ease', 'cubic-bezier(0.25, 0.1, 0.25, 1)');
    document.body.append(host);
    const animate = vi.fn();
    host.animate = animate as unknown as HTMLElement['animate'];
    fadeIn(host, '--motion-fast');
    expect(animate).toHaveBeenCalledWith([{ opacity: 0 }, { opacity: 1 }], {
      duration: 120,
      easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
    });
  });
});

describe('whenLoaded', () => {
  it('waits for the loading placeholder to leave, then reports the arrival once', async () => {
    const host = document.createElement('div');
    const placeholder = document.createElement('main');
    placeholder.setAttribute('data-route-loading', 'true');
    host.append(placeholder);
    document.body.append(host);
    const arrived = vi.fn();
    whenLoaded(host, arrived);
    host.replaceChildren(document.createElement('section'));
    await Promise.resolve();
    host.append(document.createElement('p'));
    await Promise.resolve();
    expect(arrived).toHaveBeenCalledTimes(1);
  });

  it('does nothing for content that arrived with the panel', () => {
    const host = document.createElement('div');
    host.append(document.createElement('section'));
    const arrived = vi.fn();
    expect(whenLoaded(host, arrived)).toBeUndefined();
    expect(arrived).not.toHaveBeenCalled();
  });
});

describe('the tab panel enter', () => {
  it('fades a whole pane without travel, so it never becomes the containing block of a fixed popover', () => {
    const css = readFileSync(path.join(__dirname, 'library-workspace.module.css'), 'utf8');
    const keyframes = css.slice(css.indexOf('@keyframes libraryPanelIn'));
    expect(keyframes).toContain('opacity');
    expect(keyframes).not.toMatch(/transform|translate|scale/);
  });
});
