/**
 * Registers the in-app agent's own name in the vault.
 *
 * **Why (measured 2026-08-17, owner instruction).** Every node records its
 * author in `created_by` — `human`, or `agent:<name>`. Everything the in-app
 * agent created read `agent:unknown`, even though the server knew the name (the
 * same write logged `codex-mcp-client` to `activity.jsonl`). Dropping the name
 * was deliberate: that field is permanent in the vault, so it accepts only a
 * name a person deliberately registered and never an automatic guess (ledger,
 * 2026-07-31). The defect was that **there was no way to register one**: MCP had
 * no such tool, the app only ever read the heartbeat, and the CLI command does
 * not exist for someone who installed only the app. The rule was right and
 * unkeepable.
 *
 * The app registers on the person's behalf (owner instruction): turning the
 * agent on and choosing which tool to talk to *is* the deliberate choice, and
 * the app knows it.
 *
 * **Why one turn, not one session.** A fresh heartbeat lights the "agent
 * working" indicator on the rail (`hasFreshAgentHeartbeat`). Lighting it for a
 * session that was merely opened would make the screen claim something that has
 * not happened — the same discipline the chat pane already follows. So the
 * heartbeat is written when a message is sent and cleared when the turn ends:
 * writes only happen inside a turn, so `created_by` gets its name while idle
 * time leaves no trace.
 *
 * **The map ring lights only on a subject the tool actually named.** The focus
 * ring reads `heartbeat.focus.ontologySlug`, and the app fills that field only
 * when the ACP tool input matches a slug in the current vault. An unnamed or
 * unknown subject stays null rather than pretending to know.
 */

import type { AgentActivityHeartbeat } from "@/entities/vault-session";
import type { AcpTurnActivity } from "@/features/acp-session/model/acp-turn-activity";

/** Where the heartbeat lives — the same sidecar folder as `agent-activity.json`. */
const AGENT_HEARTBEAT_VAULT_DIR = ".ontology-atlas";
const AGENT_HEARTBEAT_VAULT_FILE = "agent-activity.json";

/**
 * The heartbeat for one turn. Narrows what ACP actually reported — tool kind and
 * permission wait — into planning/editing/verifying/blocked. Plan and files stay
 * empty because ACP does not disclose them.
 */
export function buildAcpTurnHeartbeat({
  agent,
  at,
  activity,
}: {
  agent: string;
  at: Date;
  activity: AcpTurnActivity;
}): AgentActivityHeartbeat {
  return {
    agent,
    state: activity.state,
    focus: {
      summary: activity.summary,
      ontologySlug: activity.ontologySlug,
      files: [],
    },
    plan: [],
    evidence: {
      mcp: activity.toolName ? [activity.toolName] : [],
      source: [],
      codegraph: [],
      verification: [],
    },
    updatedAt: at.toISOString(),
  };
}

/**
 * What to write in the vault for this runtime: the runtime id verbatim, so the
 * recorded name matches the tool the person picked on screen exactly and no
 * second naming scheme appears. A malformed id registers nothing — unknown is
 * better left unknown.
 */
export function acpHeartbeatAgentName(runtimeId: unknown): string | null {
  if (typeof runtimeId !== "string") return null;
  const trimmed = runtimeId.trim();
  if (trimmed.length === 0 || trimmed.length > 100) return null;
  return /^[a-z0-9][a-z0-9._-]*$/i.test(trimmed) ? trimmed : null;
}

/** The one path that writes or clears the heartbeat; file access lives only here. */
export interface AcpHeartbeatStore {
  write(heartbeat: AgentActivityHeartbeat): Promise<void>;
  clear(): Promise<void>;
}

export function createVaultAcpHeartbeatStore(
  handle: FileSystemDirectoryHandle,
): AcpHeartbeatStore {
  const dir = (create: boolean) =>
    handle.getDirectoryHandle(AGENT_HEARTBEAT_VAULT_DIR, { create });
  // Preserves call order so a stage update and the end-of-turn clear cannot overtake each other in file I/O.
  let tail: Promise<void> = Promise.resolve();
  const enqueue = (operation: () => Promise<void>): Promise<void> => {
    const next = tail.catch(() => undefined).then(operation);
    tail = next;
    return next;
  };
  return {
    write(heartbeat) {
      return enqueue(async () => {
        const sidecar = await dir(true);
        const file = await sidecar.getFileHandle(AGENT_HEARTBEAT_VAULT_FILE, { create: true });
        const writable = await file.createWritable();
        await writable.write(`${JSON.stringify(heartbeat, null, 2)}\n`);
        await writable.close();
      });
    },
    clear() {
      return enqueue(async () => {
        try {
          await (await dir(false)).removeEntry(AGENT_HEARTBEAT_VAULT_FILE);
        } catch {
          /* already gone — a failed delete is harmless */
        }
      });
    },
  };
}
