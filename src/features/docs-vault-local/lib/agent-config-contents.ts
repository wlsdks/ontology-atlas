import { bundledServerLaunch, type McpServerLaunch } from '@/shared/config';

import { buildCodexConfigToml, buildMcpConfigJson } from '@/entities/vault-session';

export { bundledServerLaunch };

/**
 * What "connect an agent" writes into each config file. `OATLAS_VAULT` is relative to where the
 * config sits, or a config at the repo root reads the root as the vault; self-verification cannot
 * catch that because it spawns the vault path directly. `.mcp.json.example` alone uses an
 * absolute path, because it is registered from another working directory.
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

/** "." when the config and the vault share a folder. */
export function vaultPathRelativeToConfigRoot(configRoot: string, vaultPath: string): string {
  if (configRoot === vaultPath) return '.';
  if (vaultPath.startsWith(`${configRoot}/`)) return vaultPath.slice(configRoot.length + 1);
  return vaultPath;
}

/**
 * Replaces only our `ontology-atlas` entry and keeps servers someone else registered, matching
 * the CLI's `agent-setup --write`. An unreadable file is left untouched and reported, because
 * overwriting a file you cannot read deletes it.
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
