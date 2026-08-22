// Magic-moment instrumentation for the north star in
// docs/plans/PRODUCT-PLAN-2026-07.md §4/§9: reaching, within 5 minutes of
// absorb/init, the first moment an agent answers while citing a vault node.
//
// LOCAL ONLY — this file never leaves the user's disk and is never
// transmitted anywhere (docs/plans/PRODUCT-PLAN-2026-07.md §7, trust charter
// clause ②: zero silent collection). It records two kinds of timestamp:
//   - a baseline: `init`'s completion time, or `absorb --write`'s completion
//     time if that ran more recently (either counts as "the moment the vault
//     became worth asking").
//   - `moment`: the first time an agent-facing read happened afterward. This
//     is stamped from the CLI's own `agent-brief` command (the cheapest safe
//     proxy for "an agent read the vault and answered") — NOT from the MCP
//     `query_ontology(operation:'agent_brief')` / `get_concept` tools. Those
//     two are declared read-only (`readOnlyHint: true`) in the MCP tool
//     inventory; adding a disk write as a side effect of a "read" tool would
//     quietly break that contract. If you drive the vault through an AI
//     agent's direct MCP calls instead of the CLI, run
//     `ontology-atlas moment --mark` by hand right after it answers citing a
//     node to record the same moment.
//
// `cli/src/commands/moment.mjs` is the human-facing surface for this file.

import {
  readVaultSidecarText,
  replaceVaultSidecarText,
} from './vault-sidecar.mjs';

export const TELEMETRY_RELATIVE_PATH = '.ontology-atlas/telemetry.local.json';
const TELEMETRY_FILENAME = 'telemetry.local.json';
// North star (PRODUCT-PLAN-2026-07.md §4): moment reached within 5 minutes.
export const MOMENT_TARGET_MS = 5 * 60 * 1000;

function defaultTelemetry() {
  return {
    '//': 'local only, never transmitted: see AGENTS.md trust charter (PRODUCT-PLAN-2026-07.md §7)',
    initCompletedAt: null,
    absorbWriteCompletedAt: null,
    moment: null,
  };
}

function readTelemetryState(vaultRoot) {
  let stored;
  try {
    stored = readVaultSidecarText(vaultRoot, TELEMETRY_FILENAME);
  } catch (error) {
    return { telemetry: defaultTelemetry(), revision: null, error };
  }
  if (!stored) return { telemetry: defaultTelemetry(), revision: null, error: null };
  try {
    const parsed = JSON.parse(stored.text);
    const telemetry = !parsed || typeof parsed !== 'object' || Array.isArray(parsed)
      ? defaultTelemetry()
      : { ...defaultTelemetry(), ...parsed };
    return { telemetry, revision: stored.revision, error: null };
  } catch {
    return { telemetry: defaultTelemetry(), revision: stored.revision, error: null };
  }
}

export function readTelemetry(vaultRoot) {
  return readTelemetryState(vaultRoot).telemetry;
}

function writeTelemetry(vaultRoot, telemetry, expectedRevision) {
  replaceVaultSidecarText(
    vaultRoot,
    TELEMETRY_FILENAME,
    `${JSON.stringify(telemetry, null, 2)}\n`,
    { expectedRevision },
  );
  return telemetry;
}

export function stampInitCompleted(vaultRoot, at = new Date().toISOString()) {
  const current = readTelemetryState(vaultRoot);
  if (current.error) throw current.error;
  const telemetry = current.telemetry;
  telemetry.initCompletedAt = at;
  return writeTelemetry(vaultRoot, telemetry, current.revision);
}

export function stampAbsorbWriteCompleted(vaultRoot, at = new Date().toISOString()) {
  const current = readTelemetryState(vaultRoot);
  if (current.error) throw current.error;
  const telemetry = current.telemetry;
  telemetry.absorbWriteCompletedAt = at;
  return writeTelemetry(vaultRoot, telemetry, current.revision);
}

function baselineMsFromTelemetry(telemetry) {
  const candidates = [telemetry.initCompletedAt, telemetry.absorbWriteCompletedAt]
    .filter((value) => typeof value === 'string' && value.length > 0)
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value));
  if (candidates.length === 0) return null;
  return Math.max(...candidates);
}

// Stamps `moment` only the first time it is called for a given vault —
// re-running an agent-facing read after the moment has already fired never
// overwrites the original measurement.
export function stampMomentIfFirst(vaultRoot, { source, at = new Date().toISOString() } = {}) {
  const current = readTelemetryState(vaultRoot);
  if (current.error) throw current.error;
  const telemetry = current.telemetry;
  if (telemetry.moment) return telemetry;
  const baselineMs = baselineMsFromTelemetry(telemetry);
  const momentMs = Date.parse(at);
  const elapsedMs =
    baselineMs !== null && Number.isFinite(momentMs) ? Math.max(0, momentMs - baselineMs) : null;
  telemetry.moment = { at, source: source || 'unknown', elapsedMs };
  return writeTelemetry(vaultRoot, telemetry, current.revision);
}

export function momentSummary(vaultRoot) {
  const telemetry = readTelemetry(vaultRoot);
  const baselineMs = baselineMsFromTelemetry(telemetry);
  const elapsedMs = telemetry.moment && typeof telemetry.moment.elapsedMs === 'number'
    ? telemetry.moment.elapsedMs
    : null;
  return {
    hasBaseline: baselineMs !== null,
    initCompletedAt: telemetry.initCompletedAt,
    absorbWriteCompletedAt: telemetry.absorbWriteCompletedAt,
    moment: telemetry.moment,
    targetMs: MOMENT_TARGET_MS,
    withinTarget: elapsedMs === null ? null : elapsedMs <= MOMENT_TARGET_MS,
  };
}
