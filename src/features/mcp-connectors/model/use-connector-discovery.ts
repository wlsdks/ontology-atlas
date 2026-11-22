import { useEffect, useState } from 'react';

import {
  discoverMcpConnectors,
  type ConnectorDiscoveryState,
} from '@/shared/lib/connectors/tauri-connectors';

/** The scan of this machine's own MCP configs for the folder's path, with a state for every answer. */
export function useConnectorDiscovery(vaultPath: string | null): ConnectorDiscoveryState {
  // Three named states: with only `null` for "not answered", a rejected scan left the screen reading forever and the name-collision warning never fired.
  const [discovery, setDiscovery] = useState<ConnectorDiscoveryState>({ status: 'scanning' });
  useEffect(() => {
    let cancelled = false;
    // No synchronous reset to `scanning` (`react-hooks/set-state-in-effect`); the values describe this machine, not the folder.
    void discoverMcpConnectors(vaultPath)
      .then((result) => {
        if (cancelled) return;
        // `null` is the web path (no bridge); a settled call without a list must not paint "nothing is registered".
        setDiscovery(
          Array.isArray(result?.connectors)
            ? { status: 'done', connectors: result.connectors }
            : { status: 'failed' },
        );
      })
      .catch(() => {
        if (!cancelled) setDiscovery({ status: 'failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [vaultPath]);
  return discovery;
}
