import { createContext } from 'react';

import { keepsRoute, resolveActiveNavDestination } from './nav-destination';

const PANE_SELECTOR = '[data-app-shell-pane]';

export interface PaneLinkPress {
  defaultPrevented: boolean;
  button: number;
  modified: boolean;
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
  if (keepsRoute(href, currentPathname)) return false;
  return resolveActiveNavDestination(href.split(/[?#]/, 1)[0] ?? href) !== 'map';
}

export function isInsidePane(element: Element): boolean {
  return element.closest(PANE_SELECTOR) !== null;
}

/** What the shell that owns the pane offers the links inside it; absent where no pane exists. */
export interface PaneNavigation {
  pathname: string;
  crossfadeTo(href: string, options: { replace?: boolean; scroll?: boolean; locale?: string }): void;
}

export const PaneNavigationContext = createContext<PaneNavigation | null>(null);
