import type { McpServerLaunch } from '@/shared/config';

/**
 * The MCP server wired into a session automatically — **so the user never edits a config file.**
 *
 * **This is the substance of the feature.** ACP itself is something any app can attach in a few
 * weeks. What only we do is that **the person's vault is already loaded** the moment that session
 * opens. Other editors can wire MCP too, but they have no ontology to wire.
 *
 * Measured 2026-08-16: passing the bundled MCP through `session/new`'s `mcpServers` had the agent
 * call `connection_info` and `list_kinds` and read the vault's 79 nodes. The user had never created
 * a `.mcp.json` nor typed `claude mcp add`.
 *
 * **A name collision swallows it silently.** In the same measurement the codex side failed at first,
 * and the cause was not the protocol but a **name collision** — that repository's
 * `.codex/config.toml` already had `ontology-atlas`, and the adapter's deduplication **discarded
 * ours without a word**. So the server the app wires avoids names a user would plausibly write by hand.
 */
export const VAULT_MCP_SERVER_NAME = 'atlas-vault';

/** An entry in ACP `session/new`'s `mcpServers` (the stdio variant). */
export interface AcpMcpServer {
  name: string;
  command: string;
  args: string[];
  env: Array<{ name: string; value: string }>;
}

export interface ExistingVaultMcpRegistration {
  /** The launch command written in the config file. */
  command: string | null | undefined;
  /** Did it pass full config validation, not just the command but the current vault environment? */
  validForCurrentVault: boolean;
}

/**
 * The config file this runtime's CLI **reads by itself from the working folder**. If the vault has
 * already registered our server there, the app need not wire it again.
 *
 * Why it is needed (measured 2026-08-17). Opening a codex session in a vault created by `init` and
 * asking a question showed **the same server running twice**:
 *
 * - `mcp.ontology-atlas.list_kinds` → `{"total": 5, …}`  ← the vault's `.codex/config.toml`
 * - `mcp.atlas-vault.list_kinds`    → `{"total": 5, …}`  ← the one the app wired
 *
 * `ps` showed two `ontology-atlas-mcp` processes too (same parent). Renaming to `atlas-vault`
 * **dodged** the adapter's deduplication, so instead of being silently discarded it silently became
 * two copies. The model's tool list then holds the same tool under two names, and nobody tells it
 * which to use.
 *
 * **Only what was measured goes in here.** Listing an unmeasured runtime can produce **a session with
 * no tools at all** — far worse than a duplicate. So an unknown runtime is wired as before.
 * (Whether `claude-acp` reads `.mcp.json` has not been measured — the login had expired and the
 * session could not be opened.)
 */
const MEASURED_SELF_READ_SLOT: Readonly<Record<string, 'codex-config'>> = {
  'codex-acp': 'codex-config',
};

/** The config slot this runtime reads from the vault itself — `null` when unmeasured. */
export function vaultSelfReadSlot(runtimeId: string | null | undefined): 'codex-config' | null {
  if (typeof runtimeId !== 'string') return null;
  return MEASURED_SELF_READ_SLOT[runtimeId] ?? null;
}

/**
 * Is what the vault already registered **exactly what we were about to wire**?
 *
 * Skipping on "a registration exists" alone is wrong — a vault entry pointing at a stale path or a
 * different `OATLAS_VAULT` produces a session with no tools at all, or one reading the wrong vault.
 * It counts as the same only when it passes full validation for the current vault **and the command
 * matches character for character**.
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

/**
 * The one MCP server that reads this vault. **An empty array** when there is no known way to launch
 * it — passing a path that does not exist gives a session that starts while its tools are quietly absent.
 *
 * Also an empty array when the vault already registers the same server for this runtime (see
 * `vaultAlreadyRegisters` above) — which is what stops it becoming two copies.
 */
export function vaultMcpServers(
  launch: McpServerLaunch | null,
  vaultPath: string | null,
  registration?: ExistingVaultMcpRegistration | null,
  options?: { ownsWriteGate?: boolean },
): AcpMcpServer[] {
  if (!launch || !vaultPath) return [];
  if (vaultAlreadyRegisters(launch, registration)) return [];
  /*
   * **One session, one checkpoint — held by whoever can actually hold it.**
   *
   * A runtime with app-owned config isolation (Claude) already raises a permission
   * request for every tool call, so a second gate here would ask the same person the
   * same question twice. A runtime without it (Codex, measured 2026-08-24) lets an
   * Atlas MCP write reach disk with no request at all — there the server has to hold
   * the gate itself, because nobody else does.
   *
   * `ownsWriteGate` means "this runtime's own configuration already produces the
   * request", so the server gate is switched **off** for it and **on** for everyone
   * else. Defaulting to `false` is the safe direction: a runtime nobody has measured
   * gets the gate rather than a silent write path.
   */
  const serverGate = options?.ownsWriteGate === true ? null : 'on';
  return [
    {
      name: VAULT_MCP_SERVER_NAME,
      command: launch.command,
      args: [...launch.args],
      env: [
        { name: 'OATLAS_VAULT', value: vaultPath },
        // MCP finds the repository root itself when the vault is inside git. Guessing it here would
        // pin a wrong value whenever the vault sits outside the repo.
        ...(serverGate ? [{ name: 'OATLAS_WRITE_CONSENT', value: serverGate }] : []),
      ],
    },
  ];
}
