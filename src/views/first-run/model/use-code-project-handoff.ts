'use client';

import { useCallback, useRef } from 'react';

import { isGuardedRuntime } from '@/features/acp-session';
import { buildFromCodePrompt, type ProjectVaultLocation } from '@/features/first-run-starter';
import { queueAgentChatIntent, requestAgentChat } from '@/shared/lib/agent-chat/agent-chat-intent';
import { detectAcpRuntimes } from '@/shared/lib/agent-chat/tauri-acp';

/**
 * Hands the new project folder to a coding agent only when one is ready at the press. Without
 * one the folder still opens and nothing is queued, so no request waits to be sent later.
 */
export function useCodeProjectHandoff() {
  const agentReady = useRef<Promise<boolean> | null>(null);

  const prepare = useCallback(() => {
    agentReady.current = detectAcpRuntimes()
      .then((runtimes) =>
        (runtimes ?? []).some(
          (runtime) =>
            runtime.state === 'ready' &&
            runtime.verified &&
            isGuardedRuntime(runtime.id, runtime.isolated),
        ),
      )
      .catch(() => false);
  }, []);

  const handoff = useCallback((location: ProjectVaultLocation) => {
    void (agentReady.current ?? Promise.resolve(false)).then((ready) => {
      if (!ready) return;
      const prompt = buildFromCodePrompt(location.projectRoot, null);
      /* The map may not be mounted yet; its next mount reads the queued request. */
      if (!requestAgentChat(null, prompt)) queueAgentChatIntent(null, prompt);
    });
  }, []);

  return { prepare, handoff };
}
