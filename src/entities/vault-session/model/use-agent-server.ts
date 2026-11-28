/** Asks once whether an agent can be attached from here: the installed app knows the MCP server's path inside its bundle, a browser does not. The native side is not re-asked on every render. */
import { useEffect, useState } from 'react';

import {
  agentServerFromBundle,
  agentServerPending,
  agentServerUnavailable,
  type AgentServerAvailability,
} from '@/shared/config';
import { readBundledMcpServer } from '@/shared/lib/desktop-shell/tauri-bundled-mcp-server';

export function useAgentServer(): AgentServerAvailability {
  // Pending, not "no": answering unavailable first would make the installed app draw the browser's degradation card until the lookup returned.
  const [availability, setAvailability] = useState<AgentServerAvailability>(agentServerPending);

  useEffect(() => {
    let cancelled = false;
    void readBundledMcpServer()
      .then((bundled) => {
        if (cancelled) return;
        setAvailability(
          bundled.available && bundled.path
            ? agentServerFromBundle(bundled.path)
            : agentServerUnavailable(bundled.reason),
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setAvailability(
          agentServerUnavailable(error instanceof Error ? error.message : String(error)),
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return availability;
}
