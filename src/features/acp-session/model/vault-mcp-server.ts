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
import { PROJECT_VAULT_DIR } from '@/shared/lib/project-vault-dir';

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
 * Was the vault server itself wired into this session?
 *
 * ⚠️ **Not "is the list non-empty"** (2026-09-05). The list stopped being ours alone the moment
 * external connectors could join it: a person with a Notion connector switched on and no bundled
 * MCP binary would have had a non-empty array, so the session would have claimed a vault server it
 * never wired — and passed `atlas-vault` as an auto-allowed name, handing that auto-allow to
 * whatever else answers to it. The entry is looked for by name instead.
 */
export function hasVaultMcpServer(servers: readonly unknown[] | null | undefined): boolean {
  if (!Array.isArray(servers)) return false;
  return servers.some(
    (server) => (server as { name?: unknown } | null)?.name === VAULT_MCP_SERVER_NAME,
  );
}

/**
 * Is the **server-side** write checkpoint on for this session?
 *
 * Derived from the same value that produces it, never from the runtime name: `vaultMcpServers`
 * writes `OATLAS_WRITE_CONSENT=on` only for a runtime whose own configuration does not already ask.
 * The screen's reassurance that "changes through Atlas tools still stop at the server" is true only
 * while that env is actually being passed, so it is read back rather than assumed — a sentence the
 * machinery does not keep is the failure this repository keeps catching.
 *
 * ⚠️ **Only the vault server's own entry is read** (2026-09-05). This used to scan every entry in
 * the array. With external connectors in that array, any one of them carrying an environment
 * variable of that name would have turned the screen's checkpoint claim on for a gate that is not
 * there — a sentence made true by somebody else's config file.
 */
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
  const projectRoot = projectRootForVault(vaultPath);
  return [
    {
      name: VAULT_MCP_SERVER_NAME,
      command: launch.command,
      args: [...launch.args],
      env: [
        { name: 'OATLAS_VAULT', value: vaultPath },
        /*
         * ⚠️ **The repository root, when we actually know it** (measured in the installed app,
         * 2026-08-25). This used to be omitted on the reasoning that the vault might sit outside the
         * repository, so guessing would pin a wrong value. That was right while every vault lived
         * beside its project — and it broke the moment maps moved inside one.
         *
         * With the vault at `<project>/atlas`, MCP resolved its code root to the vault itself, which
         * holds the map and none of the product. The agent surveyed a folder containing four seeded
         * files, refused to look one level up, and reported it could not start — so the door built
         * to make a map from somebody's code could not see their code.
         *
         * `projectRootForVault` returns a path only for the shape Atlas itself creates. Anywhere
         * else it returns null and the previous behaviour stands: MCP finds the root on its own.
         */
        ...(projectRoot ? [{ name: 'OATLAS_REPO_ROOT', value: projectRoot }] : []),
        ...(serverGate ? [{ name: 'OATLAS_WRITE_CONSENT', value: serverGate }] : []),
      ],
    },
  ];
}

/**
 * The project a vault was created inside, or `null` when this vault is not one of ours.
 *
 * Recognition is by the folder name Atlas creates (`PROJECT_VAULT_DIR`) and nothing else. A vault
 * somebody keeps at `~/notes` has no project above it, and naming its parent as a code root would
 * point the survey at their home directory — the exact wrong-root failure the old comment guarded
 * against, which is why that guard survives for every other shape.
 */
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
