import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true, invoke: vi.fn() }));

import { canArchiveMeaningTransitions } from './tauri-meaning-transition-archive';

const originalPlatform = window.navigator.platform;
afterEach(() => Object.defineProperty(window.navigator, 'platform', { configurable: true, value: originalPlatform }));

describe('meaning transition archive capability', () => {
  it('refuses Windows until stable native root identity exists', () => {
    Object.defineProperty(window.navigator, 'platform', { configurable: true, value: 'Win32' });
    expect(canArchiveMeaningTransitions()).toBe(false);
  });

  it('allows the installed Unix app to ask native code for stable identity', () => {
    Object.defineProperty(window.navigator, 'platform', { configurable: true, value: 'MacIntel' });
    expect(canArchiveMeaningTransitions()).toBe(true);
  });
});
