'use client';

import { useEffect, useEffectEvent, useRef } from 'react';
import {
  DESTINATION_BY_KEY,
  DESTINATION_HREF,
  NAV_LEADER_KEY,
  NAV_LEADER_WINDOW_MS,
  type DestinationId,
} from '@/shared/config/destinations';

/**
 * Destination shortcuts — press `G`, then the destination's letter.
 *
 * The grammar and the reason for a leader key live in
 * `shared/config/destinations.ts`; this file only turns that grammar into
 * keyboard events.
 *
 * **Three places it must not fire.**
 *
 * 1. **While typing** — `input`, `textarea`, `contentEditable`. Navigating away
 *    mid-word is a defect, not a shortcut.
 * 2. **With a modifier held** — `⌘G` (find next) and `⌃G` belong to the browser
 *    and the OS. The leader is `G` pressed with **no** modifier.
 * 3. **While a blocking surface is open** — modals and sheets are meant to block
 *    what is behind them (`.claude/rules/design.md` forbids a modal without
 *    modality), and that promise has to hold for the keyboard too. `G D` with
 *    the settings sheet open would leave the sheet up while the screen behind it
 *    changed.
 *
 *    **The check reads the DOM instead of trusting the caller.** As a `disabled`
 *    prop, whoever writes the next modal forgets the wiring — this repo has
 *    already paid that once (the rail utility slot was registered per page and
 *    the studio missed it). `aria-modal="true"` is something these surfaces
 *    **already** carry, so the accessibility attribute *is* the wiring and a new
 *    modal is covered for free. `disabled` stays anyway: a caller needs some way
 *    to report a non-modal state that owns the keyboard, such as the gateway.
 *
 * **Why the leader lives in a `useRef`.** Having pressed the leader changes
 * nothing on screen. In `useState` it would re-render the whole app on every
 * leader press, charging that cost to the most frequent input.
 */
/**
 * Is a blocking surface **actually rendered** right now.
 *
 * ⚠️ **A single `querySelector('[aria-modal="true"]')` is wrong** (2026-08-09,
 * caught by e2e). It returns the document's **first** match, which may not be on
 * screen — surfaces here stay in the DOM through their exit animation
 * (`EXIT_WINDOW_MS` in `use-presence.ts`) and take `aria-hidden` meanwhile. If a
 * hidden one matches first, **the destination shortcuts die permanently** with
 * no clue on screen; opening the settings sheet reproduced exactly that.
 *
 * So scan them all and block only if one is rendered — the test is what is on
 * screen, not what is in the tree.
 */
function blockingSurfaceOpen(): boolean {
  for (const el of document.querySelectorAll('[aria-modal="true"]')) {
    if (el.closest('[aria-hidden="true"]')) continue;
    if (el.getClientRects().length === 0) continue;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    if (Number(style.opacity) < 0.05) continue;
    return true;
  }
  return false;
}

/**
 * Is this key that letter — **without losing to the IME or the keyboard layout.**
 *
 * ⚠️ **Reading `event.key` alone kills the feature entirely while a Korean IME
 * is on** (2026-08-10, measured in the installed app). With Hangul input active,
 * the physical `G` reports `event.key` as `hah` and `P` as `e`. No modifier was
 * held, focus was on body, no blocking surface was open — the letter simply did
 * not match `DESTINATION_BY_KEY`.
 *
 * **Korean is this product's primary language**, so that is not an exotic
 * environment but the owner's and the target users' normal state, and browser
 * e2e cannot catch it in principle because it types Latin.
 *
 * So either match passes:
 *
 * - `event.code === 'KeyG'` — the **physical position**, independent of any IME
 *   (Korean, Japanese, Chinese).
 * - `event.key === 'g'` — the **printed letter**, which is what the user
 *   actually presses on a non-QWERTY Latin layout (AZERTY, Dvorak).
 *
 * Either one alone loses the other case: `code` alone makes AZERTY users press
 * `A` to produce `KeyQ`, and `key` alone does nothing under Hangul.
 */
export function matchesLetter(event: Pick<KeyboardEvent, 'key' | 'code'>, letter: string): boolean {
  if (event.key.toLowerCase() === letter) return true;
  return event.code === `Key${letter.toUpperCase()}`;
}

/** Which destination's letter this event is, or `null`. */
function destinationForEvent(
  event: Pick<KeyboardEvent, 'key' | 'code'>,
): DestinationId | null {
  for (const [letter, id] of Object.entries(DESTINATION_BY_KEY)) {
    if (matchesLetter(event, letter)) return id;
  }
  return null;
}

export interface DestinationShortcutOptions {
  /** Takes the user to a destination. The caller owns the router so that `shared` never knows about it. */
  navigate: (href: string, id: DestinationId) => void;
  /** True while a blocking surface is open. */
  disabled?: boolean;
  /** Context-dependent overrides for the default href; falls back to `DESTINATION_HREF`. */
  hrefOverrides?: Partial<Record<DestinationId, string>>;
  /**
   * Called when navigation was refused because a blocking surface is open —
   * **only once the user has actually named a destination**.
   *
   * ⚠️ Without it the studio was a **keyboard trap** (found in the 2026-08-10
   * full review). Arriving at the studio opens a "what would you like to do?"
   * chooser, which is `aria-modal`, so the shortcuts refuse as designed — and
   * said nothing. In the review, `G I`, `G P`, `G K` and `G G` all did nothing
   * after `G S`, with no clue on screen.
   *
   * The fix is not to let shortcuts through the modal: a modal that does not
   * block is not a modal, and it may hold unsaved input. Say **why** instead —
   * the same prescription as any other dead end.
   */
  onBlockedByOverlay?: (() => void) | null;
}

export function useDestinationShortcuts({
  navigate,
  disabled = false,
  hrefOverrides,
  onBlockedByOverlay = null,
}: DestinationShortcutOptions) {
  /**
   * When the leader was pressed; `null` means it was not.
   *
   * ⚠️ **Do not use `event.timeStamp`** (2026-08-10, measured in the installed
   * app). The first version read the time from `event.timeStamp` and treated 0
   * as "not pressed". It worked in Chromium and passed e2e, but **in the
   * installed app (WKWebView) no leader combination fired at all** — neither
   * `G P` nor `G M`. `?` worked on the same screen, so the keys were reaching
   * the WebView.
   *
   * So the clock is detached from the event: the time comes from
   * `performance.now()` and "was it pressed" is **is it non-null**. Overloading
   * 0 to also mean "not pressed" makes the whole feature vanish, with no clue on
   * screen, the moment a runtime hands out 0.
  */
  const leaderAt = useRef<number | null>(null);
  const navigateToDestination = useEffectEvent((id: DestinationId) => {
    navigate(hrefOverrides?.[id] ?? DESTINATION_HREF[id], id);
  });
  const reportBlockedByOverlay = useEffectEvent(() => {
    onBlockedByOverlay?.();
  });

  useEffect(() => {
    if (disabled) {
      leaderAt.current = null;
      return;
    }
    const handler = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;

      const now = performance.now();

      if (leaderAt.current !== null && now - leaderAt.current <= NAV_LEADER_WINDOW_MS) {
        const id = destinationForEvent(event);
        leaderAt.current = null;
        if (!id) return;
        event.preventDefault();
        /*
         * With a blocking surface up, **say so instead of navigating** (rule 3
         * above, `onBlockedByOverlay`). The check is deferred to here because it
         * should only speak once the user has named a destination — checking on
         * every key would pour guidance out while they type inside the modal.
        */
        if (blockingSurfaceOpen()) {
          reportBlockedByOverlay();
          return;
        }
        navigateToDestination(id);
        return;
      }

      /*
       * **The leader is remembered even while a blocking surface is up.** Cutting
       * out here would stop `G` then `P` from ever counting as naming a
       * destination, so the branch above would never run and the silence would
       * come back (a test caught this). The refusal lives in that one branch, so
       * "blocked" and "told about it" stay in the same place.
       *
       * Start a new leader. `G G` (git) requires the leader itself to be usable
       * as the second letter, and the block above decides that first — so the
       * order matters.
       */
      leaderAt.current = matchesLetter(event, NAV_LEADER_KEY) ? now : null;
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [disabled]);
}
