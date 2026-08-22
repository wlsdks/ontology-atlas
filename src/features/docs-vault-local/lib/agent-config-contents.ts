import { bundledServerLaunch, type McpServerLaunch } from '@/shared/config';

import { buildCodexConfigToml, buildMcpConfigJson } from './ontology-starter';

export { bundledServerLaunch };

/**
 * What the "connect an agent" button puts into each config file.
 *
 * `OATLAS_VAULT` must be **relative to where the config file sits**. If the config lands at the repo
 * top level and the vault is a folder beneath it, the value is that subpath rather than `.`. Measured
 * in the installed app (2026-07-27), only `.mcp.json` had `.` pinned, producing a config that read
 * the repo root as the vault — and self-verification could not catch it because it uses the vault
 * path directly as a spawn argument. Hence the tests here.
 *
 * `.mcp.json.example` alone uses an absolute path. It exists to be registered from a different
 * working directory, where a relative path would be useless.
 */
export function agentConfigContents({
  fileName,
  launch,
  vaultRelative,
  vaultAbsolute,
}: {
  fileName: string;
  launch: McpServerLaunch;
  vaultRelative: string;
  vaultAbsolute: string;
}): string {
  if (fileName === '.mcp.json.example') {
    return buildMcpConfigJson('vault', vaultAbsolute, launch);
  }
  if (fileName === '.codex/config.toml') {
    return buildCodexConfigToml(vaultRelative, launch);
  }
  return buildMcpConfigJson('vault', vaultRelative, launch);
}

/** The path pointing at the vault from where the config sits. "." when they share a folder. */
export function vaultPathRelativeToConfigRoot(configRoot: string, vaultPath: string): string {
  if (configRoot === vaultPath) return '.';
  if (vaultPath.startsWith(`${configRoot}/`)) return vaultPath.slice(configRoot.length + 1);
  return vaultPath;
}

/**
 * **Do not erase servers someone else registered.**
 *
 * **Why** (caught in review, 2026-08-16). "Connect an agent" **built `.mcp.json` from scratch** and
 * overwrote it wholesale. So if that repository had other MCP servers registered, **one click
 * removed all of them.** The only way back is git — and if the file was never committed, not even that.
 *
 * The sharp part: **for the same file, the CLI does exactly the opposite.** The CLI's
 * `agent-setup --write` replaces only our entry and preserves the rest, and when the situation is
 * ambiguous it does not touch the file at all and emits a separate copy to merge from. One file, two
 * surfaces, opposite directions of safety — and the app side had no check for it.
 *
 * We contribute one entry, `ontology-atlas`. Only that slot is changed and everything else is left
 * alone. If the file cannot be read, **nothing is done and that is said** — overwriting a file you
 * cannot read is the same as deleting it.
 */
export function mergeMcpServersJson(
  currentContents: string | null,
  nextContents: string,
): { ok: true; text: string } | { ok: false; reason: 'unreadable' } {
  if (currentContents === null || currentContents.trim() === '') {
    return { ok: true, text: nextContents };
  }
  let current: unknown;
  let next: unknown;
  try {
    current = JSON.parse(currentContents);
    next = JSON.parse(nextContents);
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
  if (!isPlainObject(current) || !isPlainObject(next)) return { ok: false, reason: 'unreadable' };

  const currentServers = current.mcpServers;
  if (currentServers !== undefined && !isPlainObject(currentServers)) {
    // `mcpServers` is not in a shape we recognize — leave it alone.
    return { ok: false, reason: 'unreadable' };
  }
  const ours = isPlainObject(next.mcpServers) ? next.mcpServers['ontology-atlas'] : undefined;
  if (ours === undefined) return { ok: false, reason: 'unreadable' };

  const merged = {
    ...current,
    mcpServers: { ...(currentServers ?? {}), 'ontology-atlas': ours },
  };
  return { ok: true, text: `${JSON.stringify(merged, null, 2)}\n` };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
