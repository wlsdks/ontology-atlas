'use client';

import { AgentsPage } from '@/views/agents';
import { McpPage } from '@/views/mcp';
import { useVaultConnectors } from '@/features/mcp-connectors';
import { useLocalVault } from '@/entities/vault-session';
import { selectOpenVaultHandle } from '@/shared/lib/select-open-vault-handle';

/**
 * **One Agents page, MCP as its second tab in the body** (owner, 2026-09-19: *"I don't want
 * agents and MCP stacked on one screen with a scroll — split them into tabs, pick one, see that
 * one."*). The strip is the page's own, under the title; the 2026-09-18 objection was to a
 * header band, not to tabs.
 *
 * `AgentsPage` owns the strip and the tool list; `McpPage` is the MCP tab's body and is handed
 * in as children so that neither view imports the other. Only the selected tab mounts.
 *
 * **One connectors store, read by both the strip and the panel.** The count beside the MCP tab
 * has to change the moment a switch is flipped, and a second `useVaultConnectors` inside the
 * MCP tab would be a second reader of the same file that never learns about the first one's
 * writes — the two-canonical-stores defect `.claude/rules/forbidden.md` names. So this layer
 * owns it and hands it to both.
 *
 * `?tab=mcp` stays what `/mcp/` redirects into and what `DESTINATION_HREF.mcp` names, so every
 * older link and the installed app's deep link (`ontology-atlas://mcp?install=…`) keep resolving.
 */
export function AgentsWorkspace() {
  const localVault = useLocalVault();
  // Kept across a rescan: a null handle here re-read the connectors from nothing each time.
  const handle = selectOpenVaultHandle(localVault.status, localVault.handle);
  const connectors = useVaultConnectors(handle);
  const mcpCount =
    connectors.status === 'ready'
      ? connectors.connectors.filter((connector) => connector.enabled).length
      : undefined;

  // No wrapper: `AgentsPage`'s `<main>` is the shell slot's first child, as every destination's
  // is. A wrapper with its own `overflow-y-auto` was a second scroll container inside the slot,
  // and the scroll-end gate measured the slot as never scrolling (CI, 2026-09-18).
  return (
    <AgentsPage mcpCount={mcpCount}>
      <McpPage embedded connectors={connectors} handle={handle} />
    </AgentsPage>
  );
}
