/**
 * The agent panel's element id, named by its toggle's `aria-controls`. It lives here because the
 * panel loads lazily: importing it from the widget would pull the panel into the map's first bundle.
 */
export const VAULT_AGENT_PANEL_ID = "vault-agent-panel";
