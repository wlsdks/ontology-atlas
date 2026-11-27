'use client';

import { useEffect, useState } from 'react';

import {
  isLocalEndpointReady,
  readLocalEndpoint,
  subscribeLocalEndpointChange,
  type LocalEndpointSettings,
} from '@/shared/lib/llm-connection/local-endpoint';
import {
  LOCAL_PROVIDER,
  SECRET_PROVIDERS,
  secretStatus,
  subscribeSecretChange,
  type ConnectionProvider,
} from '@/shared/lib/llm-connection/tauri-secrets';

/**
 * Which connection this computer has: a typed address with a chosen model wins, otherwise the first
 * vendor in registration order (`secrets.rs`'s allowlist order) with a stored key. No picker exists,
 * and the full key never arrives here, so only "there is one" is known.
 */
export function useConnectionProvider({ open }: { open: boolean }) {
  const [provider, setProvider] = useState<ConnectionProvider | null>(null);
  /**
   * The connect-by-address settings live in localStorage, not the keychain (not a secret), and a
   * signal arrives when the settings sheet changes them.
   */
  const [localEndpoint, setLocalEndpoint] = useState<LocalEndpointSettings | null>(null);
  /** A key or address was saved in the settings sheet: only re-runs the query below. */
  const [changeNonce, setChangeNonce] = useState(0);

  useEffect(() => {
    if (!open) return undefined;
    const bump = () => setChangeNonce((value) => value + 1);
    const offSecret = subscribeSecretChange(bump);
    const offLocal = subscribeLocalEndpointChange(bump);
    return () => {
      offSecret();
      offLocal();
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      /**
       * The address path comes first: it is reached only by someone who typed an address, verified the
       * connection and chose a model, so an old key must not override that. The panel footer states which
       * one is live, by provider name and host.
       */
      const local = readLocalEndpoint();
      if (isLocalEndpointReady(local)) {
        if (!cancelled) {
          setLocalEndpoint(local);
          setProvider(LOCAL_PROVIDER);
        }
        return;
      }
      if (!cancelled) setLocalEndpoint(null);
      for (const candidate of SECRET_PROVIDERS) {
        const status = await secretStatus(candidate);
        if (cancelled) return;
        if (status?.stored) {
          setProvider(candidate);
          return;
        }
      }
      if (!cancelled) setProvider(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, changeNonce]);

  return { provider, localEndpoint };
}
