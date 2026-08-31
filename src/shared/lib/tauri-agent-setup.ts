/**
 * The native bridge for connecting an agent — the counterpart of
 * `src-tauri/src/agent_setup.rs`.
 *
 * On the web everything returns null or fails. A browser structurally cannot
 * know the absolute path of the folder it opened (by the File System Access
 * API's design), and without an absolute path no runnable agent config can be
 * written. That is a boundary, not a defect — the UI has to degrade honestly
 * here.
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

/** Path to the MCP server inside the app bundle. `available: false` on the web. */
export async function readBundledMcpServer(): Promise<BundledMcpServer> {
  const invoke = getInvoke();
  if (!invoke) {
    /*
     * ⚠️ `reason` is **null** on the web, and that is the point. It carries a *diagnosis* the
     * screen shows verbatim, and a browser has nothing to diagnose: not being the installed app
     * is the ordinary state of a web session, and the panel already says so in the reader's own
     * language. Filling this with an English sentence put untranslated developer prose one render
     * away from a Korean screen (census state 5d, 2026-08-31).
     */
    return { path: null, available: false, reason: null };
  }
  return invoke<BundledMcpServer>('mcp_bundled_server');
}
