/**
 * The agent panel's element id. Its toolbar toggle names it in `aria-controls`, and a
 * close hands focus back to that toggle through it. It lives here rather than in the
 * panel's widget because the panel is loaded lazily and the toggle is not: importing
 * the id from the widget would pull the whole panel into the map's first bundle.
 */
export const VAULT_AGENT_PANEL_ID = "vault-agent-panel";
