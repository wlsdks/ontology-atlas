// `ontology-atlas moment [vault]` — Slice 0 magic-moment instrumentation
// readout (docs/PRODUCT-PLAN-2026-07.md §4/§9 북극성: "흡수/init 직후
// 에이전트가 vault 노드를 인용하며 답하는 첫 순간" ≤5분 도달).
//
// Reads `.ontology-atlas/telemetry.local.json` (written by `init`, `absorb
// --write`, and `agent-brief` — see ../lib/telemetry.mjs) and prints the
// elapsed init/absorb → first-agent-read time, if it has been recorded yet.
//
// --mark manually records the moment right now. This is the fallback for
// workflows where an AI agent calls the MCP tools (query_ontology
// operation:'agent_brief' / get_concept) directly instead of going through
// this CLI: both are declared read-only (readOnlyHint: true) in the MCP
// tool inventory, so adding a disk write as a side effect there would
// quietly break that contract — they are intentionally NOT instrumented.

import { COLORS } from '../lib/colors.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import { MOMENT_TARGET_MS, momentSummary, stampMomentIfFirst } from '../lib/telemetry.mjs';
import { formatUnknownFlagError, resolveExclusiveVaultArg } from '../lib/cli-args.mjs';

const ALLOWED_FLAGS = ['--vault', '--json', '--mark'];

export function runMoment(args) {
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
  if (parsed.mark) {
    stampMomentIfFirst(vaultRoot, { source: 'manual' });
  }
  const summary = momentSummary(vaultRoot);

  if (parsed.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return 0;
  }
  render(summary);
  return 0;
}

function render(summary) {
  process.stdout.write(`${COLORS.bold}moment${COLORS.reset} ${COLORS.dim}Slice 0 magic-moment readout${COLORS.reset}\n\n`);

  if (!summary.hasBaseline) {
    process.stdout.write(
      `${COLORS.yellow}no init/absorb baseline yet${COLORS.reset} — run ` +
        `${COLORS.cyan}ontology-atlas init --quick-start${COLORS.reset} or ` +
        `${COLORS.cyan}ontology-atlas absorb <file> --write${COLORS.reset} first.\n`,
    );
    return;
  }

  if (summary.initCompletedAt) {
    process.stdout.write(`init completed        ${summary.initCompletedAt}\n`);
  }
  if (summary.absorbWriteCompletedAt) {
    process.stdout.write(`absorb --write        ${summary.absorbWriteCompletedAt}\n`);
  }

  if (!summary.moment) {
    process.stdout.write(
      `\n${COLORS.yellow}moment not reached yet${COLORS.reset} — run ` +
        `${COLORS.cyan}ontology-atlas agent-brief${COLORS.reset} once your agent answers citing a vault\n` +
        `node, or ${COLORS.cyan}ontology-atlas moment --mark${COLORS.reset} by hand if your agent calls the\n` +
        `MCP tools directly (agent_brief/get_concept are read-only and are not auto-stamped).\n`,
    );
    return;
  }

  const elapsedLabel = formatElapsed(summary.moment.elapsedMs);
  const withinLabel =
    summary.withinTarget === true
      ? `${COLORS.green}within the ≤5min target${COLORS.reset}`
      : summary.withinTarget === false
        ? `${COLORS.red}past the ≤5min target${COLORS.reset}`
        : `${COLORS.dim}target unknown (no baseline)${COLORS.reset}`;
  process.stdout.write(
    `\n${COLORS.green}moment reached${COLORS.reset}        ${summary.moment.at} via ${summary.moment.source}\n` +
      `elapsed               ${elapsedLabel} — ${withinLabel}\n`,
  );
}

function formatElapsed(elapsedMs) {
  if (typeof elapsedMs !== 'number' || !Number.isFinite(elapsedMs)) return 'unknown';
  const totalSeconds = Math.round(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = { vault: null, json: false, mark: false };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = args[++i];
    else if (a.startsWith('--vault=')) flags.vault = a.slice('--vault='.length);
    else if (a === '--json') flags.json = true;
    else if (a === '--mark') flags.mark = true;
    else if (a.startsWith('-')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    else positional.push(a);
  }
  const vaultResult = resolveExclusiveVaultArg({ vault: flags.vault, positional });
  if (vaultResult.error) return vaultResult;
  return { vault: vaultResult.vault, json: flags.json, mark: flags.mark };
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  ontology-atlas moment [vault] [--mark] [--json]\n\n` +
      `  Prints the Slice 0 magic-moment north star (PRODUCT-PLAN-2026-07.md §4/§9):\n` +
      `  the elapsed time from ${COLORS.bold}init${COLORS.reset}/${COLORS.bold}absorb --write${COLORS.reset} to the first ` +
      `${COLORS.bold}agent-brief${COLORS.reset} run afterward,\n` +
      `  target ≤5 minutes. All data lives in ${COLORS.dim}.ontology-atlas/telemetry.local.json${COLORS.reset} — local\n` +
      `  only, never transmitted.\n\n` +
      `${COLORS.bold}options:${COLORS.reset}\n` +
      `  --mark   manually stamp the moment now — fallback for agents that call the\n` +
      `           MCP tools (agent_brief/get_concept) directly instead of this CLI;\n` +
      `           those two are read-only and are not auto-stamped\n` +
      `  --json   machine-readable momentSummary output\n` +
      `  --vault path   target vault (default: cwd)\n\n` +
      `${COLORS.bold}examples:${COLORS.reset}\n` +
      `  ontology-atlas moment\n` +
      `  ontology-atlas moment --mark\n`,
  );
}
