'use client';

/**
 * Asks once whether an agent can be attached from here.
 *
 * The installed app knows the path of the MCP server inside its own bundle, which is what makes
 * one-click possible; a browser does not. This hook returns that one fact and the screen branches on
 * it. The native side is not re-asked on every render (it does not change for the app's lifetime).
 */
import { useEffect, useState } from 'react';

import {
  agentServerFromBundle,
  agentServerUnavailable,
  type AgentServerAvailability,
} from '@/shared/config';
import { readBundledMcpServer } from '@/shared/lib/tauri-agent-setup';

export function useAgentServer(): AgentServerAvailability {
  const [availability, setAvailability] = useState<AgentServerAvailability>(() =>
    agentServerUnavailable(null),
  );

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
