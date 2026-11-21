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
 * Never fires while typing, with a modifier held (`⌘G` and `⌃G` belong to the browser and OS), or
 * under a blocking surface, read from `aria-modal` in the DOM so a new modal needs no wiring. The
 * leader lives in a ref: pressing it changes nothing on screen, so it must not re-render the app.
 */

/**
 * Is a blocking surface actually rendered. Surfaces stay in the DOM through their exit animation, so
 * the first `querySelector` match may be off screen; scan all and skip leaving ones. Exported for
 * the shell's `?`, so the sheet and destination keys agree.
 */
export function blockingSurfaceOpen(): boolean {
  for (const element of document.querySelectorAll('[aria-modal="true"]')) {
    if (isLeavingSurface(element)) continue;
    if (element.getClientRects().length === 0) continue;
    const style = getComputedStyle(element);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    if (Number(style.opacity) < 0.05) continue;
    return true;
  }
  return false;
}

/**
 * A leaving surface blocks nothing: it no longer takes input. Read the first-frame marks (`inert`,
 * `aria-hidden`, `data-state="closed"`, `pointer-events: none`), not opacity. An open modal never
 * computes `pointer-events: none`, so these marks cannot let a key through.
 */
function isLeavingSurface(element: Element): boolean {
  if (element.closest('[aria-hidden="true"], [inert]')) return true;
  if (element.getAttribute('data-state') === 'closed') return true;
  return getComputedStyle(element).pointerEvents === 'none';
}

/**
 * Match either `event.code` (physical position, independent of any IME) or `event.key` (printed
 * letter on non-QWERTY Latin layouts); either alone loses the other case.
 */
function matchesLetter(event: Pick<KeyboardEvent, 'key' | 'code'>, letter: string): boolean {
  if (event.key.toLowerCase() === letter) return true;
  return event.code === `Key${letter.toUpperCase()}`;
}

/** The rail tile an alias destination is reached through; a destination with its own tile is absent. */
const HOST_TILE: Partial<Record<DestinationId, DestinationId>> = { docs: 'library', mcp: 'agents' };

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
  disabled?: boolean;
  /** Context-dependent overrides for the default href; falls back to `DESTINATION_HREF`. */
  hrefOverrides?: Partial<Record<DestinationId, string>>;
  /**
   * Called when navigation was refused because a blocking surface is open, only once the user has
   * named a destination. A modal must not let shortcuts through, so say why instead of staying silent.
   */
  onBlockedByOverlay?: (() => void) | null;
  visible?: ReadonlySet<DestinationId> | null;
}

export function useDestinationShortcuts({
  navigate,
  disabled = false,
  hrefOverrides,
  onBlockedByOverlay = null,
  visible = null,
}: DestinationShortcutOptions) {
  /**
   * When the leader was pressed; `null` means not pressed. Do not use `event.timeStamp`: WKWebView may
   * report 0, so the time comes from `performance.now()` and pressed means non-null.
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
        // A hidden destination has no tile, so its key is not a door either. Docs and MCP live on other
        // tiles (`HOST_TILE`), so each is a door while its host is.
        if (visible && !visible.has(HOST_TILE[id] ?? id)) return;
        event.preventDefault();
        /*
         * Checked only once a destination is named: checking every key would pour guidance out
         * while the user types inside the modal.
         */
        if (blockingSurfaceOpen()) {
          reportBlockedByOverlay();
          return;
        }
        navigateToDestination(id);
        return;
      }

      /*
       * Remembered under a blocking surface too, or the refusal above never runs. Set after that
       * branch so `G G` can use the leader as its second letter.
       */
      leaderAt.current = matchesLetter(event, NAV_LEADER_KEY) ? now : null;
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [disabled, visible]);
}
