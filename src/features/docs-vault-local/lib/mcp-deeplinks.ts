/**
 * One-click MCP deeplinks for Cursor (base64 JSON in `config`) and VS Code (url-encoded JSON),
 * both carrying the stdio triple. They need an absolute `OATLAS_VAULT` path, which a browser
 * cannot know, so they are null on the web, and a launch method; the app's bundled binary path
 * stays valid because the link is built and opened locally.
 */

import { MCP_SERVER_NAME, type McpServerLaunch } from "@/shared/config";

export { MCP_SERVER_NAME };

export interface McpStdioConfig {
  command: string;
  args: readonly string[];
  env: { OATLAS_VAULT: string };
}

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
 * UTF-8-safe base64 for non-latin1 vault paths; `btoa` alone is latin1-only.
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

export function buildVsCodeMcpDeeplink(
  vaultPath: string | null | undefined,
  launch: McpServerLaunch | null | undefined,
): string | null {
  const config = buildMcpDeeplinkConfig(vaultPath, launch);
  if (!config) return null;
  const payload = { name: MCP_SERVER_NAME, ...config };
  return `vscode:mcp/install?${encodeURIComponent(JSON.stringify(payload))}`;
}
