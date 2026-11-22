"use client";

import { useEffect, useState } from "react";

import { isGuardedRuntime } from "@/features/acp-session";
import { detectAcpRuntimes, isAcpBridgeAvailable } from "@/shared/lib/agent-chat/tauri-acp";

type DetectedRuntimes = Awaited<ReturnType<typeof detectAcpRuntimes>>;

export interface GuardedAcpRuntime {
  id: string;
  label: string;
}

/** The first runtime that is logged in, verified and guarded, or null: a round never runs on any other. */
export function pickGuardedRuntime(detected: DetectedRuntimes): GuardedAcpRuntime | null {
  const usable = (detected ?? []).find(
    (candidate) => candidate.state === "ready" && candidate.verified && isGuardedRuntime(candidate.id, candidate.isolated),
  );
  return usable ? { id: usable.id, label: usable.label } : null;
}

/** The same two-step scan the Library runs: the fast pass names tools on disk, only the login probe makes `ready`. */
export function useGuardedAcpRuntime(rootPath: string | null): GuardedAcpRuntime | null {
  const [runtime, setRuntime] = useState<GuardedAcpRuntime | null>(null);
  useEffect(() => {
    if (!isAcpBridgeAvailable()) return;
    let cancelled = false;
    const apply = (detected: DetectedRuntimes) => {
      if (!cancelled) setRuntime(pickGuardedRuntime(detected));
    };
    void detectAcpRuntimes()
      .then((fast) => {
        apply(fast);
        return detectAcpRuntimes({ probeLogin: true });
      })
      .then(apply)
      .catch(() => {
        if (!cancelled) setRuntime(null);
      });
    return () => {
      cancelled = true;
    };
  }, [rootPath]);
  return runtime;
}
