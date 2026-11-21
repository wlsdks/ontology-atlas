/**
 * The native bridge for connecting an agent, the counterpart of `src-tauri/src/agent_setup.rs`. On the
 * web everything returns null or fails: a browser cannot know the absolute path of the folder it
 * opened, so no runnable agent config can be written and the UI degrades honestly.
 */
import { invoke as tauriInvoke, isTauri } from '@tauri-apps/api/core';

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function getInvoke(): TauriInvoke | null {
  if (typeof window === 'undefined') return null;
  if (!isTauri()) return null;
  return (command, args) => tauriInvoke(command, args);
}

export interface BundledMcpServer {
  path: string | null;
  available: boolean;
  reason: string | null;
}

export async function readBundledMcpServer(): Promise<BundledMcpServer> {
  const invoke = getInvoke();
  if (!invoke) {
    /*
     * `reason` is `null` on the web: it carries a diagnosis shown verbatim, and a browser has nothing to
     * diagnose.
     */
    return { path: null, available: false, reason: null };
  }
  return invoke<BundledMcpServer>('mcp_bundled_server');
}
