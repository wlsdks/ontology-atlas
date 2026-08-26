'use client';

import { useEffect, useState } from 'react';

import { detectAcpRuntimes, isAcpBridgeAvailable } from '@/shared/lib/tauri-acp';

/**
 * Whether the drafting sentence can be handed to an agent from here, or only to the clipboard.
 *
 * ⚠️ **The hole this closes was one I shipped.** The empty-state button queues the sentence and
 * moves to the map, and the map resolves the runner as `runtimeId ?? acpRuntime?.id` — with
 * neither, it returns early and the queued sentence is **consumed and discarded**. So with no
 * agent connected the person pressed a button, changed screens, and nothing happened: the same
 * defect the button was built to fix, relocated one route to the right.
 *
 * ⚠️ **A browser is not a degraded desktop.** `isAcpBridgeAvailable()` is synchronous and false
 * outside Tauri, so the web answer is immediate and certain — a browser cannot spawn a process,
 * which `.claude/rules/surfaces.md` says to state as an impossibility rather than a gap. Only the
 * desktop needs the asynchronous probe.
 *
 * ⚠️ **The runner has to be named, and finding that out cost an installed-app run.** The first
 * version queued `runtimeId: null`, on the reasoning that the map already reads
 * `runtimeId ?? acpRuntime?.id`. Pressed in the real app it navigated and **nothing opened**: a
 * runner being *startable on this machine* is not the same as one being *selected in the map's
 * state*, and on a fresh mount there is no selection to fall back to, so the sentence was consumed
 * and discarded. The unit test passed throughout, because it only asked whether something was
 * queued — not whether the map could act on it. So the hook returns the id it found.
 *
 * ⚠️ **`ready` is not the only startable state.** `cli-unknown` means launchable but unverifiable
 * on our side — work left for us, not the person — so hiding the agent path there would blame them
 * for our gap. `login-needed` is excluded on purpose: the screen would say ready and then die with
 * an authentication error only once a conversation opened, which is the exact failure that state
 * was introduced to stop.
 */
type DraftHandoffRoute = 'checking' | 'agent' | 'clipboard';

export interface DraftHandoff {
  route: DraftHandoffRoute;
  /** The runner to hand the sentence to. Never null while the route is `agent`. */
  runtimeId: string | null;
}

const STARTABLE = new Set(['ready', 'cli-unknown']);

export function useDraftHandoffRoute(): DraftHandoff {
  const [handoff, setHandoff] = useState<DraftHandoff>(() => ({
    route: isAcpBridgeAvailable() ? 'checking' : 'clipboard',
    runtimeId: null,
  }));

  useEffect(() => {
    if (!isAcpBridgeAvailable()) return;
    let cancelled = false;
    void detectAcpRuntimes()
      .then((runtimes) => {
        if (cancelled) return;
        const startable = (runtimes ?? []).find((runtime) => STARTABLE.has(runtime.state));
        setHandoff(
          startable
            ? { route: 'agent', runtimeId: startable.id }
            : { route: 'clipboard', runtimeId: null },
        );
      })
      .catch(() => {
        // A probe that failed is not a reachable agent. The clipboard path always works.
        if (!cancelled) setHandoff({ route: 'clipboard', runtimeId: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return handoff;
}
