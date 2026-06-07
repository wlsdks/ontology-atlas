// `ontology-atlas agent-activity [vault]` — write/show/clear the live agent
// heartbeat that the desktop/web workbench reads from the opened vault.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { COLORS } from '../lib/colors.mjs';
import {
  formatUnknownFlagError,
  parseRawRequiredFlagValue,
  parseVaultFlag,
  resolveExclusiveVaultArg,
} from '../lib/cli-args.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import { formatAllowedValueError } from '../lib/suggestions.mjs';

const ACTIVITY_RELATIVE_PATH = '.ontology-atlas/agent-activity.json';
const ACTIVITY_STALE_AFTER_MS = 5 * 60 * 1000;
const VALID_STATES = ['planning', 'editing', 'verifying', 'blocked', 'complete'];
const ALLOWED_FLAGS = [
  '--vault',
  '--json',
  '--show',
  '--clear',
  '--agent',
  '--state',
  '--focus',
  '--summary',
  '--ontology-slug',
  '--file',
  '--plan',
  '--mcp',
  '--codegraph',
  '--verify',
  '--updated-at',
];

export function runAgentActivity(args) {
  const parsed = parseArgs(args);
  if (parsed.help) {
    printUsage(process.stdout);
    return 0;
  }
  if (parsed.error) {
    process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${parsed.error}\n`);
    printUsage();
    return 1;
  }

  const vaultRoot = resolveVaultRoot(parsed.vault);
  const activityPath = join(vaultRoot, ACTIVITY_RELATIVE_PATH);

  try {
    if (parsed.mode === 'show') {
      return showActivity({ vaultRoot, activityPath, json: parsed.json });
    }
    if (parsed.mode === 'clear') {
      return clearActivity({ vaultRoot, activityPath, json: parsed.json });
    }
    return writeActivity({
      vaultRoot,
      activityPath,
      heartbeat: buildHeartbeat(parsed),
      json: parsed.json,
    });
  } catch (err) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 1;
  }
}

function buildHeartbeat(parsed) {
  const updatedAt = parsed.updatedAt ?? new Date().toISOString();
  const parsedDate = Date.parse(updatedAt);
  if (!Number.isFinite(parsedDate)) {
    throw new Error('--updated-at must be an ISO-8601 timestamp');
  }
  return {
    agent: parsed.agent,
    state: parsed.state,
    focus: {
      summary: parsed.focus,
      ontologySlug: parsed.ontologySlug,
      files: parsed.files,
    },
    plan: parsed.plan,
    evidence: {
      mcp: parsed.mcp,
      codegraph: parsed.codegraph,
      verification: parsed.verification,
    },
    updatedAt,
  };
}

function showActivity({ vaultRoot, activityPath, json }) {
  if (!existsSync(activityPath)) {
    const result = baseResult({ vaultRoot, sideEffect: false, exists: false });
    if (json) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    else process.stdout.write(`${COLORS.yellow}missing${COLORS.reset} ${ACTIVITY_RELATIVE_PATH}\n`);
    return 1;
  }
  const raw = readFileSync(activityPath, 'utf-8');
  const parsed = parseHeartbeatRaw(raw);
  const result = baseResult({
    vaultRoot,
    sideEffect: false,
    exists: true,
    heartbeat: parsed.heartbeat,
    valid: parsed.valid,
    errorMessage: parsed.errorMessage,
  });
  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return 0;
  }
  process.stdout.write(
    `${COLORS.green}live activity${COLORS.reset} ${formatPath(vaultRoot, activityPath)}\n` +
      (!result.valid
        ? `${COLORS.yellow}      invalid activity heartbeat · ${result.errorMessage}${COLORS.reset}\n`
        : '') +
      (result.valid
        ? `${COLORS.dim}      freshness · ${result.stale ? 'stale' : 'current'}${COLORS.reset}\n`
        : '') +
      `${COLORS.dim}      review mode · ${result.reviewMode}${COLORS.reset}\n` +
      formatReviewTargetLines(result.reviewTarget) +
      (result.proof.count > 0
        ? `${COLORS.dim}      proof · ${result.proof.label}${COLORS.reset}\n`
        : '') +
      `${COLORS.dim}${result.valid ? JSON.stringify(result.heartbeat, null, 2) : raw}${COLORS.reset}\n`,
  );
  return 0;
}

function clearActivity({ vaultRoot, activityPath, json }) {
  const existed = existsSync(activityPath);
  if (existed) rmSync(activityPath);
  const result = baseResult({ vaultRoot, sideEffect: existed, exists: false, cleared: existed });
  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return 0;
  }
  process.stdout.write(
    `${COLORS.green}ok${COLORS.reset}    ${existed ? 'cleared' : 'already missing'} ${ACTIVITY_RELATIVE_PATH}\n`,
  );
  return 0;
}

function writeActivity({ vaultRoot, activityPath, heartbeat, json }) {
  mkdirSync(dirname(activityPath), { recursive: true });
  writeFileSync(activityPath, JSON.stringify(heartbeat, null, 2) + '\n', 'utf-8');
  const result = baseResult({ vaultRoot, sideEffect: true, exists: true, heartbeat });
  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return 0;
  }
  process.stdout.write(
    `${COLORS.green}ok${COLORS.reset}    wrote ${formatPath(vaultRoot, activityPath)}\n` +
      `${COLORS.dim}      ${heartbeat.agent} · ${heartbeat.state} · ${heartbeat.focus.summary ?? 'no focus'}${COLORS.reset}\n` +
      `${COLORS.dim}      freshness · ${result.stale ? 'stale' : 'current'}${COLORS.reset}\n` +
      `${COLORS.dim}      review mode · ${result.reviewMode}${COLORS.reset}\n` +
      formatReviewTargetLines(result.reviewTarget) +
      (result.proof.count > 0
        ? `${COLORS.dim}      proof · ${result.proof.label}${COLORS.reset}\n`
        : ''),
  );
  return 0;
}

function formatReviewTargetLines(reviewTarget) {
  if (reviewTarget.kind === 'none') return '';
  return (
    `${COLORS.dim}      review target kind · ${reviewTarget.kind}${COLORS.reset}\n` +
    `${COLORS.dim}      review target · ${reviewTarget.label}${COLORS.reset}\n`
  );
}

function parseHeartbeatRaw(raw) {
  let heartbeat = null;
  try {
    heartbeat = JSON.parse(raw);
  } catch {
    return {
      valid: false,
      heartbeat: null,
      errorMessage: 'invalid activity heartbeat JSON',
    };
  }
  const validationError = validateHeartbeatShape(heartbeat);
  if (validationError) {
    return {
      valid: false,
      heartbeat: null,
      errorMessage: validationError,
    };
  }
  return {
    valid: true,
    heartbeat,
    errorMessage: null,
  };
}

function validateHeartbeatShape(heartbeat) {
  if (!heartbeat || typeof heartbeat !== 'object') return 'invalid activity heartbeat shape';
  if (typeof heartbeat.agent !== 'string' || !heartbeat.agent.trim()) return 'agent is required';
  if (typeof heartbeat.state !== 'string' || !VALID_STATES.includes(heartbeat.state)) {
    return 'state is invalid';
  }
  if (typeof heartbeat.updatedAt !== 'string' || !heartbeat.updatedAt.trim()) {
    return 'updatedAt is required';
  }
  if (!Number.isFinite(Date.parse(heartbeat.updatedAt))) return 'updatedAt is invalid';
  return null;
}

function baseResult({
  vaultRoot,
  sideEffect,
  exists,
  heartbeat = null,
  cleared = false,
  valid = Boolean(heartbeat),
  errorMessage = null,
}) {
  const freshness = deriveFreshness(heartbeat, valid);
  return {
    operation: 'agent_activity',
    sideEffect,
    vaultRoot,
    path: ACTIVITY_RELATIVE_PATH,
    absolutePath: join(vaultRoot, ACTIVITY_RELATIVE_PATH),
    exists,
    cleared,
    valid,
    stale: freshness.stale,
    ageMs: freshness.ageMs,
    reviewMode: deriveReviewMode(heartbeat),
    reviewTarget: deriveReviewTarget(heartbeat),
    proof: deriveProofSummary(heartbeat),
    heartbeat,
    errorMessage,
  };
}

function deriveFreshness(heartbeat, valid) {
  if (!valid || !heartbeat || typeof heartbeat !== 'object') {
    return { stale: false, ageMs: null };
  }
  const updatedAtMs = Date.parse(heartbeat.updatedAt);
  if (!Number.isFinite(updatedAtMs)) return { stale: false, ageMs: null };
  const ageMs = Math.max(0, Date.now() - updatedAtMs);
  return {
    stale: ageMs > ACTIVITY_STALE_AFTER_MS,
    ageMs,
  };
}

function deriveReviewMode(heartbeat) {
  if (!heartbeat || typeof heartbeat !== 'object') return 'none';
  const focus = heartbeat.focus && typeof heartbeat.focus === 'object' ? heartbeat.focus : {};
  if (typeof focus.ontologySlug === 'string' && focus.ontologySlug.trim()) {
    return 'ontology-focus';
  }
  if (
    Array.isArray(focus.files) &&
    focus.files.some((file) => typeof file === 'string' && file.trim())
  ) {
    return 'business-extraction';
  }
  return 'none';
}

function deriveProofSummary(heartbeat) {
  const evidence =
    heartbeat &&
    typeof heartbeat === 'object' &&
    heartbeat.evidence &&
    typeof heartbeat.evidence === 'object'
      ? heartbeat.evidence
      : {};
  const sources = {
    mcp: Array.isArray(evidence.mcp) ? evidence.mcp.length : 0,
    codegraph: Array.isArray(evidence.codegraph) ? evidence.codegraph.length : 0,
    verification: Array.isArray(evidence.verification) ? evidence.verification.length : 0,
  };
  const labelParts = [
    ['MCP', sources.mcp],
    ['CodeGraph', sources.codegraph],
    ['Verify', sources.verification],
  ].filter(([, count]) => count > 0);
  return {
    count: sources.mcp + sources.codegraph + sources.verification,
    sources,
    label: labelParts.map(([label, count]) => `${label} · ${count}`).join(', '),
  };
}

function deriveReviewTarget(heartbeat) {
  if (!heartbeat || typeof heartbeat !== 'object') {
    return {
      kind: 'none',
      ontologySlug: null,
      files: [],
      label: 'none',
    };
  }
  const focus = heartbeat.focus && typeof heartbeat.focus === 'object' ? heartbeat.focus : {};
  const files = Array.isArray(focus.files)
    ? focus.files.filter((file) => typeof file === 'string' && file.trim())
    : [];
  if (typeof focus.ontologySlug === 'string' && focus.ontologySlug.trim()) {
    const ontologySlug = focus.ontologySlug.trim();
    return {
      kind: 'ontology',
      ontologySlug,
      files,
      label: `ontology · ${ontologySlug}`,
    };
  }
  if (files.length > 0) {
    const suffix = files.length === 1 ? files[0] : `${files[0]} +${files.length - 1}`;
    return {
      kind: 'source',
      ontologySlug: null,
      files,
      label: `source · ${suffix}`,
    };
  }
  return {
    kind: 'none',
    ontologySlug: null,
    files: [],
    label: 'none',
  };
}

function formatPath(vaultRoot, activityPath) {
  return relative(process.cwd(), activityPath) || ACTIVITY_RELATIVE_PATH;
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = {
    vault: null,
    json: false,
    show: false,
    clear: false,
    files: [],
    plan: [],
    mcp: [],
    codegraph: [],
    verification: [],
  };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--json') flags.json = true;
    else if (a === '--show') flags.show = true;
    else if (a === '--clear') flags.clear = true;
    else if (a === '--agent') flags.agent = parseCleanFlag('--agent', args[++i]);
    else if (a.startsWith('--agent=')) flags.agent = parseCleanFlag('--agent', a.slice('--agent='.length));
    else if (a === '--state') flags.state = parseCleanFlag('--state', args[++i]);
    else if (a.startsWith('--state=')) flags.state = parseCleanFlag('--state', a.slice('--state='.length));
    else if (a === '--focus' || a === '--summary') flags.focus = parseCleanFlag(a, args[++i], { nullable: true });
    else if (a.startsWith('--focus=')) flags.focus = parseCleanFlag('--focus', a.slice('--focus='.length), { nullable: true });
    else if (a.startsWith('--summary=')) flags.focus = parseCleanFlag('--summary', a.slice('--summary='.length), { nullable: true });
    else if (a === '--ontology-slug') flags.ontologySlug = parseCleanFlag('--ontology-slug', args[++i], { nullable: true });
    else if (a.startsWith('--ontology-slug=')) flags.ontologySlug = parseCleanFlag('--ontology-slug', a.slice('--ontology-slug='.length), { nullable: true });
    else if (a === '--file') flags.files.push(parseFileFlag(args[++i]));
    else if (a.startsWith('--file=')) flags.files.push(parseFileFlag(a.slice('--file='.length)));
    else if (a === '--plan') flags.plan.push(parseCleanFlag('--plan', args[++i]));
    else if (a.startsWith('--plan=')) flags.plan.push(parseCleanFlag('--plan', a.slice('--plan='.length)));
    else if (a === '--mcp') flags.mcp.push(parseCleanFlag('--mcp', args[++i]));
    else if (a.startsWith('--mcp=')) flags.mcp.push(parseCleanFlag('--mcp', a.slice('--mcp='.length)));
    else if (a === '--codegraph') flags.codegraph.push(parseCleanFlag('--codegraph', args[++i]));
    else if (a.startsWith('--codegraph=')) flags.codegraph.push(parseCleanFlag('--codegraph', a.slice('--codegraph='.length)));
    else if (a === '--verify') flags.verification.push(parseCleanFlag('--verify', args[++i]));
    else if (a.startsWith('--verify=')) flags.verification.push(parseCleanFlag('--verify', a.slice('--verify='.length)));
    else if (a === '--updated-at') flags.updatedAt = parseCleanFlag('--updated-at', args[++i]);
    else if (a.startsWith('--updated-at=')) flags.updatedAt = parseCleanFlag('--updated-at', a.slice('--updated-at='.length));
    else if (a.startsWith('-')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    else positional.push(a);
  }

  const vaultResult = resolveExclusiveVaultArg({ vault: flags.vault, positional });
  if (vaultResult.error) return vaultResult;
  for (const value of [
    flags.agent,
    flags.state,
    flags.focus,
    flags.ontologySlug,
    flags.updatedAt,
    ...flags.files,
    ...flags.plan,
    ...flags.mcp,
    ...flags.codegraph,
    ...flags.verification,
  ]) {
    if (value instanceof Error) return { error: value.message };
  }
  if (flags.show && flags.clear) return { error: 'pass only one of --show or --clear' };
  const mode = flags.show ? 'show' : flags.clear ? 'clear' : 'write';
  if (mode === 'write') {
    if (!flags.agent) return { error: '--agent is required when writing activity' };
    if (!flags.state) return { error: '--state is required when writing activity' };
    if (!VALID_STATES.includes(flags.state)) {
      return { error: formatAllowedValueError('--state', flags.state, VALID_STATES) };
    }
  }
  return {
    mode,
    vault: vaultResult.vault,
    json: flags.json,
    agent: flags.agent,
    state: flags.state,
    focus: flags.focus ?? null,
    ontologySlug: flags.ontologySlug ?? null,
    files: flags.files,
    plan: flags.plan,
    mcp: flags.mcp,
    codegraph: flags.codegraph,
    verification: flags.verification,
    updatedAt: flags.updatedAt,
  };
}

function parseCleanFlag(flag, value, { nullable = false } = {}) {
  const parsed = parseRawRequiredFlagValue(flag, value, { rejectSingleDash: true });
  if (parsed instanceof Error) return parsed;
  const trimmed = parsed.trim();
  if (!trimmed) return nullable ? null : new Error(`${flag} must be a non-empty string`);
  if (trimmed !== parsed) return new Error(`${flag} must not have leading or trailing whitespace`);
  if (trimmed.includes('\0')) return new Error(`${flag} must not contain a null byte`);
  return trimmed;
}

function parseFileFlag(value) {
  const parsed = parseRawRequiredFlagValue('--file', value, { rejectSingleDash: true });
  if (parsed instanceof Error) return parsed;
  const trimmed = parsed.trim();
  if (!trimmed) return new Error('--file must be a non-empty string');
  if (trimmed.includes('\0')) return new Error('--file must not contain a null byte');
  return trimmed;
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  ontology-atlas agent-activity [vault] --agent codex --state editing --focus "..." [--json]\n` +
      `       [--ontology-slug slug] [--file path] [--plan step]\n` +
      `       [--mcp call] [--codegraph call] [--verify command] [--updated-at ISO]\n` +
      `  ontology-atlas agent-activity [vault] --show [--json]\n` +
      `  ontology-atlas agent-activity [vault] --clear [--json]\n\n` +
      `Writes ${ACTIVITY_RELATIVE_PATH}, the explicit live activity heartbeat Atlas reads from the opened vault.\n` +
      `State must be one of: ${VALID_STATES.join(' / ')}.\n` +
      `Repeat --file, --plan, --mcp, --codegraph, and --verify to add multiple entries.\n`,
  );
}
