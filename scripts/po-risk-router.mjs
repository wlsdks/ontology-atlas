#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

import {
  PO_DOORS,
  PO_EVIDENCE_STATES,
  PO_RISK_ROUTES,
  routePoDecision,
} from './lib/po-risk-router.mjs';

function help() {
  return `Usage:
  pnpm po:route -- --mechanical [--json]
  pnpm po:route -- --door=<two-way|one-way> --evidence=<observed|inferred|unknown> \\
    --risk=<none|meaning|positioning|scope> [--sovereignty-affected] [--json]

Routes Atlas work to maintenance checks, a compact solo pass, or two independent
reviewers. --sovereignty-affected always selects the meaning route and cannot be
self-exempted. A one-way decision must name one primary Atlas risk.
`;
}

export function parsePoRouteArgs(argv) {
  const parsed = {
    mechanical: false,
    sovereigntyAffected: false,
    json: false,
  };

  for (const arg of argv) {
    if (arg === '--') continue;
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--mechanical') parsed.mechanical = true;
    else if (arg === '--sovereignty-affected') parsed.sovereigntyAffected = true;
    else if (arg === '--json') parsed.json = true;
    else if (arg.startsWith('--door=')) parsed.door = arg.slice('--door='.length);
    else if (arg.startsWith('--evidence=')) parsed.evidence = arg.slice('--evidence='.length);
    else if (arg.startsWith('--risk=')) parsed.primaryRisk = arg.slice('--risk='.length);
    else throw new Error(`unknown argument: ${arg}`);
  }

  return parsed;
}

export function formatPoRoute(result) {
  const reviewers = result.reviewers.length > 0 ? result.reviewers.join(',') : 'none';
  return [
    `[po-route] ${result.route}`,
    `record=${result.record ? 'yes' : 'no'}`,
    `reviewers=${reviewers}`,
    `next=${result.nextAction}`,
    `rebuttal=${result.rebuttal}`,
  ].join(' · ');
}

export function runPoRoute(argv, io = console) {
  try {
    const parsed = parsePoRouteArgs(argv);
    if (parsed.help) {
      io.log(help());
      return 0;
    }
    const result = routePoDecision(parsed);
    io.log(parsed.json ? JSON.stringify(result, null, 2) : formatPoRoute(result));
    return 0;
  } catch (error) {
    io.error(`[po-route] ${error.message}`);
    io.error(`doors=${PO_DOORS.join(',')} evidence=${PO_EVIDENCE_STATES.join(',')} risks=none,${Object.keys(PO_RISK_ROUTES).join(',')}`);
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runPoRoute(process.argv.slice(2));
}
