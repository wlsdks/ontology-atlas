import type { McpServerLaunch } from '@/shared/config';

/** Wires the loaded vault into ACP without a user-written config; a Codex name collision silently discards the injected server, so use a distinct session name. */
import { PROJECT_VAULT_DIR } from '@/shared/lib/vault-folder/project-vault-dir';

export const VAULT_MCP_SERVER_NAME = 'atlas-vault';

export interface AcpMcpServer {
  name: string;
  command: string;
  args: string[];
  env: Array<{ name: string; value: string }>;
}

export interface ExistingVaultMcpRegistration {
  command: string | null | undefined;
  validForCurrentVault: boolean;
}

/** The config file this runtime's CLI reads itself from the working folder; wiring there too would run our server twice. Only measured runtimes are listed: an unmeasured one could end with no tools. */
const MEASURED_SELF_READ_SLOT: Readonly<Record<string, 'codex-config'>> = {
  'codex-acp': 'codex-config',
};

export function vaultSelfReadSlot(runtimeId: string | null | undefined): 'codex-config' | null {
  if (typeof runtimeId !== 'string') return null;
  return MEASURED_SELF_READ_SLOT[runtimeId] ?? null;
}

/**
 * Skipping on "a registration exists" alone is wrong: a stale path or a different `OATLAS_VAULT` yields no tools or the
 * wrong vault. It counts as the same only when it passes full validation for the current vault and the command matches exactly.
 */
export function vaultAlreadyRegisters(
  launch: McpServerLaunch | null,
  registration: ExistingVaultMcpRegistration | null | undefined,
): boolean {
  if (!launch || !registration?.validForCurrentVault) return false;
  if (typeof registration.command !== 'string') return false;
  const registeredCommand = registration.command.trim();
  return registeredCommand.length > 0 && registeredCommand === launch.command.trim();
}

/** By name, not a non-empty list: external connectors share the array and would otherwise inherit the `atlas-vault` auto-allow. */
export function hasVaultMcpServer(servers: readonly unknown[] | null | undefined): boolean {
  if (!Array.isArray(servers)) return false;
  return servers.some(
    (server) => (server as { name?: unknown } | null)?.name === VAULT_MCP_SERVER_NAME,
  );
}

/** Read back from the env `vaultMcpServers` writes (`OATLAS_WRITE_CONSENT=on`, only for runtimes that do not already ask), not from the runtime name. */
export function vaultWriteConsentOn(servers: readonly unknown[] | null | undefined): boolean {
  if (!Array.isArray(servers)) return false;
  return servers.some((server) => {
    if ((server as { name?: unknown } | null)?.name !== VAULT_MCP_SERVER_NAME) return false;
    const env = (server as { env?: unknown } | null)?.env;
    if (!Array.isArray(env)) return false;
    return env.some(
      (entry) =>
        (entry as { name?: unknown } | null)?.name === 'OATLAS_WRITE_CONSENT' &&
        (entry as { value?: unknown }).value === 'on',
    );
  });
}

/** Empty when there is no known way to launch it (a nonexistent path gives a session with tools quietly absent) or the vault already registers the same server (see `vaultAlreadyRegisters`). */
export function vaultMcpServers(
  launch: McpServerLaunch | null,
  vaultPath: string | null,
  registration?: ExistingVaultMcpRegistration | null,
  options?: { ownsWriteGate?: boolean;sourceRoot?:string },
): AcpMcpServer[] {
  if (!launch || !vaultPath) return [];
  // A matching vault/command does not prove that the registration reads this bound code folder.
  // Preserve ordinary deduplication; explicitly scoped analysis needs its own known-root server.
  if (!options?.sourceRoot&&vaultAlreadyRegisters(launch, registration)) return [];
  /*
   * One checkpoint per session, held by whoever can: a runtime with app-owned config isolation (Claude) already asks,
   * so the server gate is on for the rest, an unmeasured runtime included.
   */
  const serverGate = options?.ownsWriteGate === true ? null : 'on';
  const projectRoot = options?.sourceRoot??projectRootForVault(vaultPath);
  return [
    {
      name: VAULT_MCP_SERVER_NAME,
      command: launch.command,
      args: [...launch.args],
      env: [
        { name: 'OATLAS_VAULT', value: vaultPath },
        // With the vault at `<project>/atlas`, MCP would resolve its code root to the vault itself; `projectRootForVault`
        // returns a path only for the shape Atlas creates.
        ...(projectRoot ? [{ name: 'OATLAS_REPO_ROOT', value: projectRoot }] : []),
        ...(serverGate ? [{ name: 'OATLAS_WRITE_CONSENT', value: serverGate }] : []),
      ],
    },
  ];
}

/** null when the vault is not one Atlas created: recognition is by `PROJECT_VAULT_DIR` only, since naming the parent of `~/notes` as a code root would point the survey at a home directory. */
export function projectRootForVault(vaultPath: string): string | null {
  const trimmed = vaultPath.trim().replace(/[/\\]+$/, '');
  if (!trimmed) return null;
  const parts = trimmed.split(/[/\\]/);
  const name = parts.pop();
  if (name !== PROJECT_VAULT_DIR) return null;
  const parent = parts.join(trimmed.includes('\\') && !trimmed.includes('/') ? '\\' : '/');
  // A parent of `''` means the vault sat at a filesystem root; there is no project there.
  return parent ? parent : null;
}
