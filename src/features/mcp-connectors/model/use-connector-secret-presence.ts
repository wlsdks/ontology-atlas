import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ConnectorRecord } from '@/shared/lib/connectors/connector-record';
import {
  connectorSecretStatus,
  subscribeConnectorSecretChange,
} from '@/shared/lib/connectors/tauri-connector-secrets';

import { ownRefs } from './connector-secrets';

/** Read at the panel because the row decides whether the switch may turn on. `null` means the keychain was never asked (a browser); treating that as none would call every web connector broken. */
export function useConnectorSecretPresence(
  connectors: readonly ConnectorRecord[],
  canStoreSecrets: boolean,
): ReadonlySet<string> | null {
  const refs = useMemo(
    () => connectors.flatMap((connector) => ownRefs(connector.id, [...connector.env, ...connector.headers])),
    [connectors],
  );
  const key = refs.join('\u0000');
  const [stored, setStored] = useState<ReadonlySet<string> | null>(null);

  const read = useCallback(async () => {
    const present = await Promise.all(
      key
        .split('\u0000')
        .filter(Boolean)
        .map(async (reference) => {
          const status = await connectorSecretStatus(reference);
          return status?.stored ? reference : null;
        }),
    );
    return new Set(present.filter((reference): reference is string => reference !== null));
  }, [key]);

  useEffect(() => {
    if (!canStoreSecrets) {
      return;
    }
    let cancelled = false;
    const refresh = () => {
      void read().then((next) => {
        if (!cancelled) setStored(next);
      });
    };
    refresh();
    // A token saved from another panel changes what this one says; only the re-ask moment is
    // shared, the keychain stays the source of truth.
    const stop = subscribeConnectorSecretChange(refresh);
    return () => {
      cancelled = true;
      stop();
    };
  }, [canStoreSecrets, read]);

  return canStoreSecrets ? stored : null;
}
