// `oh-my-ontology workspace-brief [vault]` — first-contact + next actions.
// MCP `query_ontology({operation: 'workspace_brief'})` thin wrapper.

import { callMcpTool } from '../lib/mcp-call.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';

const COLORS = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  yellow: '\x1b[33m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};
const KIND_COLORS = {
  project: COLORS.magenta,
  domain: COLORS.blue,
  capability: COLORS.cyan,
  element: COLORS.green,
  document: COLORS.dim,
  'vault-readme': COLORS.dim,
};
const SEVERITY_COLORS = {
  fail: COLORS.red,
  warn: COLORS.yellow,
  info: COLORS.dim,
};

export async function runWorkspaceBrief(args) {
  const { vault, json, error } = parseArgs(args);
  if (error) {
    process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${error}\n`);
    printUsage();
    return 1;
  }
  const vaultRoot = resolveVaultRoot(vault);
  let result;
  try {
    result = await callMcpTool(vaultRoot, 'query_ontology', { operation: 'workspace_brief' });
  } catch (err) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }
  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return 0;
  }
  render(result);
  return 0;
}

function render(result) {
  const status = result?.status ?? 'unknown';
  const sum = result?.summary ?? {};
  const sc = status === 'healthy' ? COLORS.green : status === 'unhealthy' ? COLORS.red : COLORS.yellow;
  process.stdout.write(
    `${COLORS.bold}workspace brief${COLORS.reset} ${sc}${status}${COLORS.reset}` +
      ` ${COLORS.dim}— ${sum.nodes ?? 0} 노드 · ${sum.edges ?? 0} 관계` +
      ` · ${sum.projects ?? 0} 프로젝트 · ${sum.domains ?? 0} 도메인${COLORS.reset}\n\n`,
  );

  // Hotspots (degree 상위)
  const hotspots = Array.isArray(result?.hotspots) ? result.hotspots : [];
  if (hotspots.length > 0) {
    process.stdout.write(`${COLORS.dim}HOTSPOTS${COLORS.reset} ${COLORS.dim}(degree 상위)${COLORS.reset}\n`);
    for (let i = 0; i < Math.min(hotspots.length, 5); i += 1) {
      const h = hotspots[i];
      const kc = KIND_COLORS[h.kind] || COLORS.dim;
      const rank = String(i + 1).padStart(2);
      process.stdout.write(
        `  ${COLORS.bold}${rank}${COLORS.reset} ${kc}${h.slug.padEnd(50)}${COLORS.reset}` +
          ` ${COLORS.dim}deg ${h.degree}${COLORS.reset}\n`,
      );
    }
    process.stdout.write('\n');
  }

  // Projects 요약
  const projects = result?.projects?.maps ?? [];
  if (projects.length > 0) {
    process.stdout.write(`${COLORS.dim}PROJECT 별 노드 수${COLORS.reset}\n`);
    for (const p of projects) {
      const pn = p.node?.title || p.project;
      const ps = p.summary ?? {};
      process.stdout.write(
        `  ${COLORS.magenta}${pn.padEnd(30)}${COLORS.reset}` +
          ` ${COLORS.dim}${ps.nodes ?? 0} 노드 · ${ps.domains ?? 0} 도메인 · ${ps.capabilities ?? 0} 역량 · ${ps.elements ?? 0} 요소${COLORS.reset}\n`,
      );
    }
    process.stdout.write('\n');
  }

  // Next actions
  const next = Array.isArray(result?.nextActions) ? result.nextActions : [];
  if (next.length > 0) {
    process.stdout.write(`${COLORS.dim}NEXT ACTIONS${COLORS.reset}\n`);
    for (const a of next) {
      const sev = SEVERITY_COLORS[a.severity] || COLORS.dim;
      process.stdout.write(
        `  ${sev}[${(a.severity || 'info').padEnd(4)}]${COLORS.reset}` +
          ` ${COLORS.bold}${a.kind}${COLORS.reset}` +
          ` ${COLORS.dim}× ${a.count ?? '?'}${COLORS.reset}\n`,
      );
      if (a.message) process.stdout.write(`         ${COLORS.dim}${a.message}${COLORS.reset}\n`);
    }
  }
}

function parseArgs(args) {
  const flags = { vault: '.', json: false };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = args[++i] || '.';
    else if (a.startsWith('--vault=')) flags.vault = a.slice('--vault='.length);
    else if (a === '--json') flags.json = true;
    else if (a.startsWith('--')) return { error: `unknown flag: ${a}` };
    else positional.push(a);
  }
  if (positional.length > 0 && flags.vault === '.') flags.vault = positional[0];
  return { vault: flags.vault, json: flags.json };
}

function printUsage() {
  process.stderr.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  oh-my-ontology workspace-brief [vault] [--json]\n\n` +
      `first-contact dashboard: status + hotspots + project 요약 + next actions.\n`,
  );
}
