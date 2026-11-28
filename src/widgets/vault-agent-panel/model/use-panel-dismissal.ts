import { useEffect, useRef } from 'react';

import { VAULT_AGENT_PANEL_ID } from '@/shared/config/agent/agent-panel';

import { focusIsOutsidePanel, isEscapeInsidePanel, openerToRemember } from './panel-dismissal';

/**
 * Closes the panel on Escape from inside it and hands focus back to whatever opened it. Returns the
 * ref the panel's root element carries.
 */
export function usePanelDismissal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panelRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!open) return undefined;
    // The aside is always rendered (a closed panel is 0 wide), so this node is the one
    // the cleanup below will see.
    const panel = panelRef.current;
    openerRef.current = openerToRemember(document.activeElement, panel);
    const onKey = (event: KeyboardEvent) => {
      if (!isEscapeInsidePanel(event, panel)) return;
      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (focusIsOutsidePanel(document.activeElement, panel)) return;
      // WebKit does not focus a pressed button, so the toggle that names this panel in
      // `aria-controls` stands in for the opener.
      const opener =
        openerRef.current?.isConnected
          ? openerRef.current
          : document.querySelector<HTMLElement>(`[aria-controls="${VAULT_AGENT_PANEL_ID}"]`);
      opener?.focus({ preventScroll: true });
    };
  }, [open]);
  return panelRef;
}
