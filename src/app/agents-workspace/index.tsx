'use client';

import { AgentsPage } from '@/views/agents';
import { McpPage } from '@/views/mcp';
import { useVaultConnectors } from '@/features/mcp-connectors';
import { useLocalVault } from '@/entities/vault-session';
import { selectOpenVaultHandle } from '@/shared/lib/select-open-vault-handle';

/**
 * One Agents page with MCP as its second body tab; only the selected tab mounts. `McpPage` is
 * handed in as children so neither view imports the other.
 *
 * This layer owns the one connectors store and hands it to both the tab count and the panel: a
 * second `useVaultConnectors` would never learn of the first one's writes, the two-canonical-
 * stores defect `.claude/rules/local-first.md` names. `?tab=mcp` is what `/mcp/` and the app's
 * deep link (`ontology-atlas://mcp?install=…`) resolve into.
 */
export function AgentsWorkspace() {
  const localVault = useLocalVault();
  // Kept across a rescan, or the connectors are re-read from nothing each time.
  const handle = selectOpenVaultHandle(localVault.status, localVault.handle);
  const connectors = useVaultConnectors(handle);
  const mcpCount =
    connectors.status === 'ready'
      ? connectors.connectors.filter(connectors.isOnHere).length
      : undefined;

  // No wrapper: `AgentsPage`'s `<main>` must be the shell slot's first child, or a second
  // scroll container hides the slot's scroll from the scroll-end gate.
  return (
    <AgentsPage mcpCount={mcpCount}>
      <McpPage connectors={connectors} handle={handle} />
    </AgentsPage>
  );
}
