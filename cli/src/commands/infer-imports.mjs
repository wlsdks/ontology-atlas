// R17 — `oh-my-ontology infer-imports [rootPath]`
// MCP infer_imports wrapper. moduleEdges (capability A → B) 가 add_relation
// depends_on 후보. side effect 0.

import { resolve } from 'node:path';
import { callMcpTool } from '../lib/mcp-call.mjs';

const COLORS = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

export async function runInferImports(args) {
  const { rootPath, vault, json, maxFiles, error } = parseArgs(args);
  if (error) {
    process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${error}\n`);
    printUsage();
    return 1;
  }

  const target = resolve(process.cwd(), rootPath);
  const vaultRoot = resolve(process.cwd(), vault);

  let result;
  try {
    result = await callMcpTool(vaultRoot, 'infer_imports', {
      rootPath: target,
      maxFiles,
    });
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

  const fileEdges = result.edges?.length ?? 0;
  const ext = result.externalImports?.length ?? 0;
  const unres = result.unresolved?.length ?? 0;
  const modEdges = result.moduleEdges ?? [];

  process.stdout.write(
    `${COLORS.bold}infer-imports${COLORS.reset} ${COLORS.dim}${target}${COLORS.reset} ` +
      `${COLORS.dim}— ${result.filesScanned} files / ${fileEdges} edges / ${ext} external / ${unres} unresolved${COLORS.reset}\n\n`,
  );

  if (modEdges.length > 0) {
    process.stdout.write(
      `  ${COLORS.bold}module edges${COLORS.reset} ${COLORS.dim}(${modEdges.length}) — depends_on candidates${COLORS.reset}\n`,
    );
    for (const m of modEdges.slice(0, 16)) {
      process.stdout.write(
        `    ${COLORS.cyan}${m.from}${COLORS.reset} ${COLORS.dim}—depends_on→${COLORS.reset} ${COLORS.cyan}${m.to}${COLORS.reset} ${COLORS.dim}× ${m.count}${COLORS.reset}\n`,
      );
    }
    if (modEdges.length > 16)
      process.stdout.write(
        `    ${COLORS.dim}… ${modEdges.length - 16} more${COLORS.reset}\n`,
      );
    process.stdout.write('\n');
  }

  process.stdout.write(
    `${COLORS.dim}side effect 0 — vault 변경 안 함. 채택 module edges 는 ${COLORS.reset}` +
      `${COLORS.bold}add_relation${COLORS.reset}` +
      `${COLORS.dim} (mcp) 또는 vault 의 frontmatter dependencies: 에 명시.${COLORS.reset}\n`,
  );
  return 0;
}

function parseArgs(args) {
  const flags = { vault: '.', json: false };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = args[++i] || '.';
    else if (a.startsWith('--vault=')) flags.vault = a.slice('--vault='.length);
    else if (a === '--json') flags.json = true;
    else if (a === '--max-files')
      flags.maxFiles = Number(args[++i]) || undefined;
    else if (a.startsWith('--max-files='))
      flags.maxFiles = Number(a.slice('--max-files='.length)) || undefined;
    else if (a.startsWith('--')) return { error: `unknown flag: ${a}` };
    else positional.push(a);
  }
  return {
    rootPath: positional[0] ?? '.',
    vault: flags.vault,
    json: flags.json,
    maxFiles: flags.maxFiles,
  };
}

function printUsage() {
  process.stderr.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  oh-my-ontology infer-imports [rootPath] [--vault path] [--json] [--max-files N]\n\n` +
      `${COLORS.bold}What it does:${COLORS.reset}\n` +
      `  Walk TS/JS files (default: src,lib,app,packages → fallback rootPath),\n` +
      `  parse imports (static / dynamic / require / re-export / side-effect),\n` +
      `  resolve relative paths, classify external (npm) vs internal (relative),\n` +
      `  collapse to module edges (capability A → B with import count).\n\n` +
      `  ${COLORS.bold}side effect 0${COLORS.reset} — vault 변경 안 함. moduleEdges 가\n` +
      `  AI agent 또는 사용자가 ${COLORS.bold}add_relation depends_on${COLORS.reset} 후보로 사용.\n\n` +
      `${COLORS.bold}Example:${COLORS.reset}\n` +
      `  oh-my-ontology infer-imports\n` +
      `  oh-my-ontology infer-imports ~/my-app --json --max-files 10000\n`,
  );
}
