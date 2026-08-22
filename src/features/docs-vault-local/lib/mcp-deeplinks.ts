/**
 * Per-client one-click MCP deeplink builders.
 *
 * Cursor and VS Code register an MCP server in one click via a URL scheme. Both links carry the same
 * standard stdio triple (command/args/env) and differ only in encoding:
 * - Cursor: base64(JSON) in the `config` query
 * - VS Code: url-encoded JSON in the query string
 *
 * **Both** conditions are required:
 * 1. An **absolute path** for `OATLAS_VAULT`. A browser session cannot know a folder's absolute path
 *    (a structural constraint), so this is always null on the web.
 * 2. **How to launch** the server (`McpServerLaunch`). The installed app sends the path of the binary
 *    inside its own bundle — a deeplink is built locally and opened locally, so a local absolute path
 *    stays valid.
 *
 * Before 2026-07-27 an npm publishing gate here made this **always null**. With that plan dropped and
 * the app carrying the server, this path comes alive for the first time.
 */

import { MCP_SERVER_NAME, type McpServerLaunch } from "@/shared/config";

export { MCP_SERVER_NAME };

export interface McpStdioConfig {
  command: string;
  args: readonly string[];
  env: { OATLAS_VAULT: string };
}

/**
 * The standard stdio config object to carry in a deeplink. Null when the absolute path or the launch
 * method is unknown.
 */
export function buildMcpDeeplinkConfig(
  vaultPath: string | null | undefined,
  launch: McpServerLaunch | null | undefined,
): McpStdioConfig | null {
  if (!vaultPath || !launch) return null;
  return {
    command: launch.command,
    args: launch.args,
    env: { OATLAS_VAULT: vaultPath },
  };
}

/**
 * UTF-8-safe base64 (for vault paths with non-latin1 characters). Works in both the browser (`btoa`
 * is latin1-only) and Node (Buffer).
 */
export function utf8ToBase64(input: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(input, "utf-8").toString("base64");
  }
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * The Cursor deeplink: `cursor://anysphere.cursor-deeplink/mcp/install?name=…&config=<base64>`.
 * Null when the absolute path or the launch method is unknown (the web degradation).
 */
export function buildCursorMcpDeeplink(
  vaultPath: string | null | undefined,
  launch: McpServerLaunch | null | undefined,
): string | null {
  const config = buildMcpDeeplinkConfig(vaultPath, launch);
  if (!config) return null;
  const encoded = utf8ToBase64(JSON.stringify(config));
  const params = new URLSearchParams({ name: MCP_SERVER_NAME, config: encoded });
  return `cursor://anysphere.cursor-deeplink/mcp/install?${params.toString()}`;
}

/**
 * The VS Code deeplink: `vscode:mcp/install?<url-encoded JSON>`.
 * VS Code takes the name as a field inside the config object. Null when the absolute path is unknown.
 */
export function buildVsCodeMcpDeeplink(
  vaultPath: string | null | undefined,
  launch: McpServerLaunch | null | undefined,
): string | null {
  const config = buildMcpDeeplinkConfig(vaultPath, launch);
  if (!config) return null;
  const payload = { name: MCP_SERVER_NAME, ...config };
  return `vscode:mcp/install?${encodeURIComponent(JSON.stringify(payload))}`;
}
