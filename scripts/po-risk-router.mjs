#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

import {
  PO_BOUNDARY_SIGNALS,
  PO_BOUNDARY_STATES,
  PO_CHANGE_SIGNALS,
  PO_EVIDENCE_STATES,
  PO_OUTCOMES,
  routePoDecision,
} from './lib/po-risk-router.mjs';

function help() {
  return `Usage:
  pnpm po:route -- --mechanical [--json]
  pnpm po:route -- --evidence=<observed|inferred|unknown> \\
    --outcome=<orient|explain|judge|correct|handoff> \\
    --change=<rollback-cheap|public-contract|positioning|surface-inventory|substantial-investment> \\
    [--change=<...>] \\
    --boundary=<name>:<unchanged|affected|unknown>[,<name>:<state>...] [--json]

Supply observable change facts, not a door or risk verdict. Atlas derives the
door, primary risk, and reviewer pair. Repeat --change or pass a comma-separated
list. All four boundary names are required; affected or unknown overrides
rollback-cheap and routes to one-way Evidence + Steward review.
`;
}

const appendValues = (target, value) => {
  for (const item of value.split(',').map((part) => part.trim()).filter(Boolean)) target.push(item);
};

const appendBoundaries = (target, value) => {
  for (const item of value.split(',').map((part) => part.trim()).filter(Boolean)) {
    const separator = item.indexOf(':');
    if (separator < 1) throw new Error(`boundary must use name:state; received ${item}`);
    const name = item.slice(0, separator);
    const state = item.slice(separator + 1);
    if (Object.hasOwn(target, name)) throw new Error(`boundary ${name} was supplied more than once`);
    target[name] = state;
  }
};

export function parsePoRouteArgs(argv) {
  const parsed = {
    mechanical: false,
    changes: [],
    boundaries: {},
    json: false,
  };
  const singularInputs = new Set();
  const setSingular = (name, value) => {
    if (singularInputs.has(name)) throw new Error(`${name} was supplied more than once`);
    singularInputs.add(name);
    parsed[name] = value;
  };

  for (const arg of argv) {
    if (arg === '--') continue;
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--mechanical') parsed.mechanical = true;
    else if (arg === '--json') parsed.json = true;
    else if (arg.startsWith('--evidence=')) {
      setSingular('evidence', arg.slice('--evidence='.length));
    } else if (arg.startsWith('--outcome=')) {
      setSingular('outcome', arg.slice('--outcome='.length));
    }
    else if (arg.startsWith('--change=')) appendValues(parsed.changes, arg.slice('--change='.length));
    else if (arg.startsWith('--boundary=')) {
      appendBoundaries(parsed.boundaries, arg.slice('--boundary='.length));
    } else throw new Error(`unknown argument: ${arg}`);
  }

  return parsed;
}

export function formatPoRoute(result) {
  const reviewers = result.reviewers.length > 0 ? result.reviewers.join(',') : 'none';
  return [
    `[po-route:v${result.policyVersion}] ${result.route}`,
    `door=${result.door}`,
    `outcome=${result.outcome ?? 'n/a'}`,
    `risk=${result.primaryRisk}`,
    `record=${result.record ? 'yes' : 'no'}`,
    `reviewers=${reviewers}`,
    `next=${result.nextAction}`,
    `because=${result.routeReasons.join(' + ')}`,
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
    io.error(
      `evidence=${PO_EVIDENCE_STATES.join(',')} outcomes=${Object.keys(PO_OUTCOMES).join(',')} changes=${Object.keys(PO_CHANGE_SIGNALS).join(',')} boundaries=${Object.keys(PO_BOUNDARY_SIGNALS).join(',')} boundary-states=${PO_BOUNDARY_STATES.join(',')}`,
    );
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runPoRoute(process.argv.slice(2));
}
