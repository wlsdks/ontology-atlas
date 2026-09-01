#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { evaluatePoPilot, parsePoPilot, pilotCheckFailures } from './lib/po-pilot.mjs';

const DEFAULT_PILOT = 'docs/PO-PILOT.md';

function help() {
  return `Usage:
  pnpm po:pilot [-- --check] [--json] [--as-of=YYYY-MM-DD] [--file=<path>]

Validate the typed Atlas PO pilot register, calculate review utility and council
avoidance, enforce the 14/21-day sunset, and refuse an unsupported permanent
keep. During the collection window --check succeeds when the register is valid.
`;
}

export function parsePoPilotArgs(argv) {
  const result = { check: false, json: false, file: DEFAULT_PILOT };
  for (const arg of argv) {
    if (arg === '--') continue;
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--check') result.check = true;
    else if (arg === '--json') result.json = true;
    else if (arg.startsWith('--as-of=')) result.asOf = arg.slice('--as-of='.length);
    else if (arg.startsWith('--file=')) result.file = arg.slice('--file='.length);
    else throw new Error(`unknown argument: ${arg}`);
  }
  return result;
}

const percent = (value) => (value === null ? 'unmeasured' : `${Math.round(value * 100)}%`);

export function formatPoPilot(result) {
  const { metrics } = result;
  return [
    `[po-pilot] ${result.phase} · eligible=${metrics.eligibleDecisions}/${result.deadlines.target} · outcome=${result.outcome}`,
    `[po-pilot] review-delta=${percent(metrics.materialDeltaRate)} · reversible-no-council=${percent(metrics.reversibleCouncilAvoidanceRate)} · turns=${metrics.reviewerTurns}`,
    `[po-pilot] proof-resolved=${percent(metrics.proofResolvedRate)} · owner-clear=${percent(metrics.ownerClearRate)} · boundary-misses=${metrics.boundaryMisses} · unresolved-boundaries=${metrics.unresolvedBoundaries}`,
    `[po-pilot] deadline=${result.deadlines.decision} · sparse-extension=${result.deadlines.sparseExtension}${result.dueReason ? ` · due=${result.dueReason}` : ''}`,
  ].join('\n');
}

export function runPoPilot(argv, io = console) {
  try {
    const args = parsePoPilotArgs(argv);
    if (args.help) {
      io.log(help());
      return 0;
    }
    const pilot = parsePoPilot(readFileSync(args.file, 'utf8'));
    const result = evaluatePoPilot(pilot, args.asOf);
    const failures = pilotCheckFailures(result);
    io.log(args.json ? JSON.stringify(result, null, 2) : formatPoPilot(result));
    if (failures.length > 0) {
      for (const failure of failures) io.error(`[po-pilot] FAIL: ${failure}`);
      return 1;
    }
    if (args.check && result.phase === 'invalid-keep') return 1;
    return 0;
  } catch (error) {
    io.error(error.message.startsWith('[po-pilot]') ? error.message : `[po-pilot] ${error.message}`);
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runPoPilot(process.argv.slice(2));
}
