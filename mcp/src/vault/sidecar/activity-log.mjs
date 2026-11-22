// Agent activity log, `.ontology-atlas/activity.jsonl`: the local audit log.
// One line is appended best-effort after a successful vault write, and a failed
// append never fails the write. Nothing is transmitted.

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
 * Line schema v1 (new fields are optional and keep v):
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
 * Agent name for one line: heartbeat > connect greeting > null. A heartbeat is a
 * person's registered intent, the greeting's clientInfo.name a default; with
 * neither, no name is invented.
 */
export function resolveAgentName(rootPath, clientInfo) {
  const heartbeat = readHeartbeatAgent(rootPath);
  if (heartbeat) return heartbeat;
  const fromHello = clientInfo?.name;
  return typeof fromHello === 'string' && fromHello.trim() ? fromHello.trim() : null;
}

/** Best-effort append plus rotation; never throws. Returns whether the line was recorded. */
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

/** The log's tail. Corrupt lines are skipped rather than letting one hide the rest. */
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
