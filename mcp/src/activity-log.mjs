// Agent activity log — `.ontology-atlas/activity.jsonl`.
//
// The implementation of the trust charter's "local audit log". One line is
// appended best-effort right after a successful vault write — **a failed append
// never fails the write** (the log is the side effect, the write is the point).
// Nothing is transmitted; the file never leaves the vault.
//
// Rejected alternatives: extending the heartbeat (it pollutes the snapshot
// contract) and deriving the log from git (it cannot capture activity before a
// commit). Append-only JSONL was adopted instead.

import {
  appendVaultSidecarLine,
  readVaultSidecarText,
  replaceVaultSidecarText,
} from './vault-sidecar.mjs';

export const ACTIVITY_LOG_RELATIVE_PATH = '.ontology-atlas/activity.jsonl';
const ACTIVITY_LOG_FILENAME = 'activity.jsonl';
const HEARTBEAT_FILENAME = 'agent-activity.json';

/** Rotation cap: past it, the first half is dropped — simple and deterministic. */
export const ACTIVITY_LOG_MAX_LINES = 4000;

/**
 * Line schema v1 (a minimal contract — new fields are optional and do not bump v):
 *   {"v":1,"at":ISO,"tool":string,"target":string,"summary":string,
 *    "agent":string|null,"why":string|null}
 */
export function buildActivityEntry({ tool, target, summary, agent = null, why = null, at = null }) {
  return {
    v: 1,
    at: at ?? new Date().toISOString(),
    tool: String(tool),
    target: String(target),
    summary: String(summary),
    agent: agent ? String(agent) : null,
    why: why ? String(why) : null,
  };
}

/** Reads the agent name from the heartbeat file: null when absent or corrupt (never fabricated). */
export function readHeartbeatAgent(rootPath) {
  try {
    const stored = readVaultSidecarText(rootPath, HEARTBEAT_FILENAME);
    if (!stored) return null;
    const parsed = JSON.parse(stored.text);
    const agent = parsed?.agent;
    return typeof agent === 'string' && agent.trim() ? agent.trim() : null;
  } catch {
    return null;
  }
}

/**
 * The agent name for one activity line — **heartbeat > connect greeting > null**
 * (2026-08-13).
 *
 * Only the heartbeat file (registered explicitly via the CLI `agent-activity`)
 * used to be consulted, so every unregistered agent's activity piled up as
 * `agent: null` — while the MCP initialize greeting **already carries**
 * clientInfo.name ("claude-code" and friends). Do not throw away a fact the
 * server knows. The heartbeat wins because registration is intent (a person chose
 * that name) while the greeting is a default. With neither, null — no name is
 * invented, the same discipline as readHeartbeatAgent.
 */
export function resolveAgentName(rootPath, clientInfo) {
  const heartbeat = readHeartbeatAgent(rootPath);
  if (heartbeat) return heartbeat;
  const fromHello = clientInfo?.name;
  return typeof fromHello === 'string' && fromHello.trim() ? fromHello.trim() : null;
}

/**
 * Best-effort append plus rotation. Never throws, whatever fails.
 * Returns whether the line was recorded (for tests; callers may ignore it).
 */
export function appendActivityEntry(rootPath, entry) {
  try {
    appendVaultSidecarLine(rootPath, ACTIVITY_LOG_FILENAME, JSON.stringify(entry));
    rotateIfNeeded(rootPath);
    return true;
  } catch {
    return false;
  }
}

function rotateIfNeeded(rootPath) {
  try {
    const stored = readVaultSidecarText(rootPath, ACTIVITY_LOG_FILENAME);
    if (!stored) return;
    const lines = stored.text.split('\n').filter(Boolean);
    if (lines.length <= ACTIVITY_LOG_MAX_LINES) return;
    const kept = lines.slice(Math.floor(lines.length / 2));
    replaceVaultSidecarText(rootPath, ACTIVITY_LOG_FILENAME, `${kept.join('\n')}\n`, {
      expectedRevision: stored.revision,
    });
  } catch {
    /* best-effort */
  }
}

/**
 * Reads the tail of the log for the digest and the CLI. Corrupt lines are skipped:
 * an audit log should be shown as it is, but a parser dying and hiding all of it
 * is worse.
 */
export function readActivityEntries(rootPath, { limit = 100, sinceMs = null } = {}) {
  try {
    const stored = readVaultSidecarText(rootPath, ACTIVITY_LOG_FILENAME);
    if (!stored) return [];
    const entries = [];
    for (const line of stored.text.split('\n')) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed?.v !== 1 || typeof parsed.at !== 'string') continue;
        if (sinceMs !== null && Date.parse(parsed.at) < sinceMs) continue;
        entries.push(parsed);
      } catch {
        /* skip broken line */
      }
    }
    return entries.slice(-limit);
  } catch {
    return [];
  }
}
