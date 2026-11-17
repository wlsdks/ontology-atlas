import { createContext } from 'react';

import { resolveActiveNavDestination } from './nav-destination';

/** The attribute `AppShell` puts on the pane the route crossfade captures. */
const PANE_SELECTOR = '[data-app-shell-pane]';

function surfacePath(href: string): string {
  const path = href.split(/[?#]/, 1)[0] ?? '';
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

/** What a press on an in-app link looks like to the decision below. */
export interface PaneLinkPress {
  defaultPrevented: boolean;
  button: number;
  modified: boolean;
  /** The anchor's `target`, empty when it has none. */
  target: string;
  download: boolean;
  /** Whether the anchor sits inside the pane; a link in an overlay above it does not. */
  insidePane: boolean;
}

/**
 * Whether a link press replaces the pane with another route's screen, which crossfades as a rail
 * press does. A link in an overlay closes that overlay over the new screen instead, a change of
 * query or hash keeps the screen, and the map arrives through its own overlay.
 */
export function linkPressSwapsPane(press: PaneLinkPress, href: string, currentPathname: string): boolean {
  if (press.defaultPrevented || press.button !== 0 || press.modified || press.download) return false;
  if (press.target !== '' && press.target !== '_self') return false;
  if (!press.insidePane) return false;
  if (!href.startsWith('/')) return false;
  const destination = surfacePath(href);
  if (destination === surfacePath(currentPathname)) return false;
  return resolveActiveNavDestination(destination) !== 'map';
}

export function isInsidePane(element: Element): boolean {
  return element.closest(PANE_SELECTOR) !== null;
}

/** What the shell that owns the pane offers the links inside it; absent where no pane exists. */
export interface PaneNavigation {
  /** The current locale-free pathname. */
  pathname: string;
  /** Changes route with the pane crossfade. */
  crossfadeTo(href: string, options: { replace?: boolean; scroll?: boolean; locale?: string }): void;
}

export const PaneNavigationContext = createContext<PaneNavigation | null>(null);
