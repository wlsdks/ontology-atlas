'use client';

import { useSyncExternalStore } from 'react';

/**
 * Which desktop platform the visitor is on — the single decision behind whose
 * file the hero's primary CTA offers.
 *
 * **Only mac and windows**, because those are the only desktop files that exist
 * (two macOS dmgs, one Windows exe — see `model/macos-release.generated.ts`).
 * Linux has no app, so it is not something to detect and offer differently; it
 * falls through to the macOS default plus the hero's browser CTA. This repo does
 * not ship "coming soon" states.
 *
 * **One UA string is enough** because there is only one question to answer: is
 * this Windows or not. Every major browser puts `Windows` in the UA. Anything
 * finer is impossible in principle — `navigator.platform` returns `MacIntel` on
 * Apple Silicon too — so the mac side does not guess. It defaults to the
 * majority (Apple Silicon, i.e. anything bought since late 2020) and always
 * shows Intel one step down.
 *
 * **Failing to detect is the normal path.** Static export means no server
 * negotiation, so the first paint is always the macOS default and hydration
 * matches it. Windows is decided once in a mount effect and promoted from there.
 * The one-frame flash is what "everyone starts on the same screen" costs.
 */
export type VisitorDesktopPlatform = 'mac' | 'windows' | 'handheld';

/**
 * `handheld` (2026-09-02): a phone or tablet cannot install a DMG or an EXE, yet measured at a
 * phone width the filled winner read "Download for Apple Silicon". For that visitor the file is
 * the wrong first answer and the browser map is the right one; the files stay one step down.
 * iPadOS Safari reports a Mac UA, so an iPad with a keyboard is treated as a Mac — it is the
 * only tablet that can pretend, and the browser route is still on the same row.
 */
export function detectVisitorDesktopPlatform(userAgent: string): VisitorDesktopPlatform {
  if (/iPhone|iPod|Android.*Mobile|Windows Phone/i.test(userAgent)) return 'handheld';
  return /Windows/i.test(userAgent) ? 'windows' : 'mac';
}

// The UA cannot change during a session, so there is nothing to subscribe to.
const subscribeNever = () => () => {};
const clientSnapshot = () => detectVisitorDesktopPlatform(navigator.userAgent);
// Static export always renders the macOS default; the first paint matches this
// and the client snapshot splits once, right after mount.
const serverSnapshot = (): VisitorDesktopPlatform => 'mac';

export function useVisitorDesktopPlatform(): VisitorDesktopPlatform {
  return useSyncExternalStore(subscribeNever, clientSnapshot, serverSnapshot);
}
