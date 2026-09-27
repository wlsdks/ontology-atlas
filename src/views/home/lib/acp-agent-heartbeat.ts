/**
 * Registers the in-app agent's runtime name in the vault so `created_by` reads `agent:<name>`,
 * not `agent:unknown`.
 * Choosing the runtime is the person's deliberate registration; the field is permanent, so no
 * automatic guess.
 * Written when a turn starts and cleared when it ends, so the rail's "agent working" light never
 * claims an idle session.
 * `focus.ontologySlug` is set only when a tool input matches a vault slug; otherwise it stays
 * null.
 */

import type { AgentActivityHeartbeat } from "@/entities/vault-session";
import type { AcpTurnActivity } from "@/features/acp-session";

const AGENT_HEARTBEAT_VAULT_DIR = ".ontology-atlas";
const AGENT_HEARTBEAT_VAULT_FILE = "agent-activity.json";

/**
 * One turn's heartbeat: ACP tool kind and permission wait narrowed to
 * planning/editing/verifying/blocked.
 * Plan and files stay empty because ACP does not disclose them.
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
 * The runtime id verbatim, so the recorded name matches the tool picked on screen; a malformed id
 * registers nothing.
 */
export function acpHeartbeatAgentName(runtimeId: unknown): string | null {
  if (typeof runtimeId !== "string") return null;
  const trimmed = runtimeId.trim();
  if (trimmed.length === 0 || trimmed.length > 100) return null;
  return /^[a-z0-9][a-z0-9._-]*$/i.test(trimmed) ? trimmed : null;
}

export interface AcpHeartbeatStore {
  write(heartbeat: AgentActivityHeartbeat): Promise<void>;
  clear(): Promise<void>;
}

export function createVaultAcpHeartbeatStore(
  handle: FileSystemDirectoryHandle,
): AcpHeartbeatStore {
  const dir = (create: boolean) =>
    handle.getDirectoryHandle(AGENT_HEARTBEAT_VAULT_DIR, { create });
  // Serializes writes so a stage update and the end-of-turn clear cannot overtake each other.
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
