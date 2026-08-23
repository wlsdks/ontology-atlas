'use client';

import { useEffect, useState } from 'react';

import { SECRET_PROVIDERS, secretStatus, subscribeSecretChange } from './tauri-secrets';

/**
 * Should the agent dock **start open**.
 *
 * **Why not simply "always open".** The owner's requirement was
 * *"If I chat immediately, it should proceed automatically, so keep it in sight"* — the dock should be in
 * sight so you can just start chatting. That means a dock in a **usable** state. Defaulting
 * it open on a machine with no key would give a **locked panel** permanent ownership of the
 * right third of the screen: the letter of the request, not the request.
 *
 * So it opens only when both hold:
 * 1. The LLM bridge exists (i.e. the installed app). The web cannot do this in principle, so
 *    the dock does not exist there.
 * 2. At least one vendor key exists on this machine — **only the existence** is read here,
 *    not even the last four characters.
 *
 * **Why a hook, and why here.** Every screen showing the dock must reach the same answer;
 * two screens computing it separately means one gets fixed and they diverge, a failure mode
 * this repo has hit repeatedly. It is also the way back after entering a key: this listens
 * to `subscribeSecretChange`, so saving a key in the settings sheet opens the dock without a
 * reload.
 *
 * `null` means "not known yet", not "closed". Pretending to know on the first frame either
 * mismatches the server render (hydration) or flashes open-then-closed, so callers do
 * nothing while it is `null`.
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
