'use client';

import { useEffect, useState } from 'react';

import { SECRET_PROVIDERS, secretStatus, subscribeSecretChange } from './tauri-secrets';

/**
 * Should the agent dock start open. Only when the LLM bridge exists (installed app) and at least one
 * vendor key exists on this machine; only existence is read. `null` means not known yet: callers do
 * nothing, avoiding a hydration mismatch or an open-then-closed flash.
 */
export function useAgentDockDefaultOpen(): boolean | null {
  const [defaultOpen, setDefaultOpen] = useState<boolean | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => subscribeSecretChange(() => setNonce((n) => n + 1)), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // With no bridge (web), `secretStatus` returns `null` immediately without any IPC, so
      // this loop ends in three instant returns and settles on `false`. **The point is that
      // there is no synchronous branch** — calling setState directly in the effect body
      // causes a cascading render, which lint already flags.
      for (const provider of SECRET_PROVIDERS) {
        const status = await secretStatus(provider);
        if (cancelled) return;
        if (status?.stored) {
          setDefaultOpen(true);
          return;
        }
      }
      if (!cancelled) setDefaultOpen(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return defaultOpen;
}
