'use client';

import { useSyncExternalStore } from 'react';

/**
 * Whose file the hero CTA offers. Only mac and windows have files, so Linux falls to the mac
 * default. The UA only answers "Windows or not": `navigator.platform` says `MacIntel` on Apple
 * Silicon too, so mac defaults to Apple Silicon with Intel one step down.
 */
export type VisitorDesktopPlatform = 'mac' | 'windows' | 'handheld';

/** A handheld cannot install a file, so it gets the browser map first. iPadOS reports a Mac UA and passes as a Mac. */
export function detectVisitorDesktopPlatform(userAgent: string): VisitorDesktopPlatform {
  if (/iPhone|iPod|Android.*Mobile|Windows Phone/i.test(userAgent)) return 'handheld';
  return /Windows/i.test(userAgent) ? 'windows' : 'mac';
}

const subscribeNever = () => () => {};
const clientSnapshot = () => detectVisitorDesktopPlatform(navigator.userAgent);
// Static export paints the mac default; the client snapshot splits once after mount.
const serverSnapshot = (): VisitorDesktopPlatform => 'mac';

export function useVisitorDesktopPlatform(): VisitorDesktopPlatform {
  return useSyncExternalStore(subscribeNever, clientSnapshot, serverSnapshot);
}
