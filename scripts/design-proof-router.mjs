#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

import { DESIGN_CHANGE_SIGNALS, routeDesignProof } from './lib/design-proof-router.mjs';

function help() {
  return `Usage:
  pnpm design:route -- --change=<change> [--change=<change>] [--json]

Supply every observable design change. Atlas derives directions, council seats,
and the smallest proof set. Every rendered class includes the iterative Computer
Use baseline/checkpoint/final loop; motion additionally includes real screen
recording. Repeat --change or pass a comma-separated list.

Changes:
  ${Object.keys(DESIGN_CHANGE_SIGNALS).join('\n  ')}
`;
}

const appendValues = (target, value) => {
  for (const item of value.split(',').map((part) => part.trim()).filter(Boolean)) target.push(item);
};

export function parseDesignRouteArgs(argv) {
  const parsed = { changes: [], json: false };
  for (const arg of argv) {
    if (arg === '--') continue;
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--json') parsed.json = true;
    else if (arg.startsWith('--change=')) appendValues(parsed.changes, arg.slice('--change='.length));
    else throw new Error(`unknown argument: ${arg}`);
  }
  return parsed;
}

export function formatDesignRoute(result) {
  const proofPlan = result.proofs.map((item) => `${item.name}:${item.scope}`).join(',');
  const seats = result.council.seats.length > 0 ? result.council.seats.join(',') : 'none';
  return [
    `[design-route:v${result.policyVersion}]`,
    `directions=${result.directions ? 'yes' : 'no'}`,
    `council=${result.council.required ? 'yes' : 'no'}`,
    `seats=${seats}`,
    `proof=${proofPlan}`,
    `sequence=${result.sequence.join('>')}`,
    `because=${result.reasons.join(' + ')}`,
  ].join(' · ');
}

export function runDesignRoute(argv, io = console) {
  try {
    const parsed = parseDesignRouteArgs(argv);
    if (parsed.help) {
      io.log(help());
      return 0;
    }
    const result = routeDesignProof(parsed);
    io.log(parsed.json ? JSON.stringify(result, null, 2) : formatDesignRoute(result));
    return 0;
  } catch (error) {
    io.error(`[design-route] ${error.message}`);
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runDesignRoute(process.argv.slice(2));
}
