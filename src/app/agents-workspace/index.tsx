'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

import { AgentsPage } from '@/views/agents';
import { McpPage } from '@/views/mcp';

/**
 * **One Agents page, MCP folded in below** (owner, 2026-09-18, on the header-tab strip that
 * had held Agents and MCP side by side since the 2026-09-17 merge: *"this way of showing
 * them at the top is very bad… it should be folded in here"*, pointing at the page body).
 *
 * The strip spent a 56px chrome band on two words and left the rest of it empty; the two
 * were one subject — the coding tools on this computer and the wire they use — split by a
 * tab nobody needed. Now `AgentsPage` is the page and `McpPage` is its last section, with
 * an `h2` and its own share/connectors switch under `?mcp=`. No view imports the other:
 * this layer hands one to the other as children.
 *
 * `?tab=mcp` stays what `/mcp/` redirects into and what `DESTINATION_HREF.mcp` names, so
 * every older link and the installed app's deep link (`ontology-atlas://mcp?install=…`)
 * keep resolving: the section is on the page, and the parameter scrolls to it.
 */
export function AgentsWorkspace() {
  const params = useSearchParams();
  const wantsMcp = params.get('tab') === 'mcp';

  useEffect(() => {
    if (!wantsMcp) return;
    document.getElementById('agents-mcp')?.scrollIntoView({ block: 'start' });
  }, [wantsMcp]);

  return (
    <div data-testid="agents-workspace" className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto">
      <AgentsPage>
        <McpPage embedded />
      </AgentsPage>
    </div>
  );
}
