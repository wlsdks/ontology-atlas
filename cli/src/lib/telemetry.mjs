// Slice 0 — magic-moment instrumentation (PRODUCT-PLAN-2026-07.md §4/§9 북극성:
// "흡수/init 직후 에이전트가 vault 노드를 인용하며 답하는 첫 순간" ≤5분 도달).
//
// LOCAL ONLY — this file never leaves the user's disk and is never
// transmitted anywhere (PRODUCT-PLAN-2026-07.md §7 신뢰 헌장 ② "조용한 수집
// 0"). It records two kinds of timestamp:
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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const TELEMETRY_RELATIVE_PATH = '.ontology-atlas/telemetry.local.json';
// North star (PRODUCT-PLAN-2026-07.md §4): moment reached within 5 minutes.
export const MOMENT_TARGET_MS = 5 * 60 * 1000;

function telemetryPath(vaultRoot) {
  return join(vaultRoot, TELEMETRY_RELATIVE_PATH);
}

function defaultTelemetry() {
  return {
    '//': 'local only, never transmitted — see AGENTS.md trust charter (PRODUCT-PLAN-2026-07.md §7)',
    initCompletedAt: null,
    absorbWriteCompletedAt: null,
    moment: null,
  };
}

export function readTelemetry(vaultRoot) {
  const filePath = telemetryPath(vaultRoot);
  if (!existsSync(filePath)) return defaultTelemetry();
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return defaultTelemetry();
    return { ...defaultTelemetry(), ...parsed };
  } catch {
    return defaultTelemetry();
  }
}

function writeTelemetry(vaultRoot, telemetry) {
  const filePath = telemetryPath(vaultRoot);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(telemetry, null, 2)}\n`, 'utf-8');
  return telemetry;
}

export function stampInitCompleted(vaultRoot, at = new Date().toISOString()) {
  const telemetry = readTelemetry(vaultRoot);
  telemetry.initCompletedAt = at;
  return writeTelemetry(vaultRoot, telemetry);
}

export function stampAbsorbWriteCompleted(vaultRoot, at = new Date().toISOString()) {
  const telemetry = readTelemetry(vaultRoot);
  telemetry.absorbWriteCompletedAt = at;
  return writeTelemetry(vaultRoot, telemetry);
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
  const telemetry = readTelemetry(vaultRoot);
  if (telemetry.moment) return telemetry;
  const baselineMs = baselineMsFromTelemetry(telemetry);
  const momentMs = Date.parse(at);
  const elapsedMs =
    baselineMs !== null && Number.isFinite(momentMs) ? Math.max(0, momentMs - baselineMs) : null;
  telemetry.moment = { at, source: source || 'unknown', elapsedMs };
  return writeTelemetry(vaultRoot, telemetry);
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
