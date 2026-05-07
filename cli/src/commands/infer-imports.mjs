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
  const { rootPath, vault, json, maxFiles, apply, error } = parseArgs(args);
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

  // R+ — --apply 분기. moduleEdges 를 depends_on 관계로 batch land.
  // analyze --apply (cycle 29) 와 짝 — agent-less full bootstrap pair.
  if (apply) {
    return await runApply(vaultRoot, result, json);
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
  const flags = { vault: '.', json: false, apply: false };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = args[++i] || '.';
    else if (a.startsWith('--vault=')) flags.vault = a.slice('--vault='.length);
    else if (a === '--json') flags.json = true;
    else if (a === '--apply') flags.apply = true;
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
    apply: flags.apply,
    maxFiles: flags.maxFiles,
  };
}

// R+ — moduleEdges → depends_on 관계 batch land. analyze --apply 의 짝.
// 50 cap 초과시 자동 chunk 분할 — moduleEdges 는 큰 codebase 면 100+ 도 쉽게.
async function runApply(vaultRoot, result, json) {
  const moduleEdges = result.moduleEdges ?? [];
  const relations = moduleEdges.map((m) => ({
    from: m.from,
    to: m.to,
    type: 'depends_on',
  }));

  // chunk in batches of 50 (add_relations cap).
  const allRows = [];
  for (let i = 0; i < relations.length; i += 50) {
    const chunk = relations.slice(i, i + 50);
    let res;
    try {
      res = await callMcpTool(vaultRoot, 'add_relations', { relations: chunk });
    } catch (err) {
      process.stderr.write(
        `${COLORS.red}error${COLORS.reset}  add_relations chunk @${i}: ` +
          `${err instanceof Error ? err.message : String(err)}\n`,
      );
      return 2;
    }
    for (const row of res.relations ?? []) allRows.push(row);
  }

  const summary = summarizeRelations(allRows);

  if (json) {
    process.stdout.write(
      JSON.stringify(
        {
          rootPath: result.rootPath,
          filesScanned: result.filesScanned,
          applied: { relations: allRows },
          summary,
        },
        null,
        2,
      ) + '\n',
    );
    return summary.errors === 0 ? 0 : 1;
  }

  process.stdout.write(
    `${COLORS.bold}infer-imports --apply${COLORS.reset} ${COLORS.dim}vault=${vaultRoot}${COLORS.reset}\n\n`,
  );
  process.stdout.write(
    `  ${COLORS.bold}depends_on relations${COLORS.reset}  ` +
      `${COLORS.green}${summary.landed}${COLORS.reset} landed · ` +
      `${COLORS.dim}${summary.existing}${COLORS.reset} already existed · ` +
      `${summary.errors > 0 ? COLORS.red : COLORS.dim}${summary.errors}${COLORS.reset} errors ` +
      `${COLORS.dim}(of ${allRows.length} edges)${COLORS.reset}\n\n`,
  );
  // 에러 행만 노출 (성공/idempotent 는 noise). 큰 codebase 면 모두 missing
  // slug 일 수 있어 first 12 만 표시.
  let errCount = 0;
  for (const row of allRows) {
    if (row.ok === false) {
      if (errCount < 12) {
        process.stdout.write(
          `  ${COLORS.red}✗${COLORS.reset} ${row.from} —${row.type}→ ${row.to} ${COLORS.dim}— ${row.error}${COLORS.reset}\n`,
        );
      }
      errCount += 1;
    }
  }
  if (errCount > 12) {
    process.stdout.write(
      `  ${COLORS.dim}… ${errCount - 12} more errors${COLORS.reset}\n`,
    );
  }
  return summary.errors === 0 ? 0 : 1;
}

function summarizeRelations(rows) {
  let landed = 0;
  let existing = 0;
  let errors = 0;
  for (const r of rows) {
    if (r.ok === true && r.alreadyExists) existing += 1;
    else if (r.ok === true) landed += 1;
    else errors += 1;
  }
  return { landed, existing, errors };
}

function printUsage() {
  process.stderr.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  oh-my-ontology infer-imports [rootPath] [--vault path] [--apply] [--json] [--max-files N]\n\n` +
      `${COLORS.bold}What it does:${COLORS.reset}\n` +
      `  Walk TS/JS files (default: src,lib,app,packages → fallback rootPath),\n` +
      `  parse imports (static / dynamic / require / re-export / side-effect),\n` +
      `  resolve relative paths, classify external (npm) vs internal (relative),\n` +
      `  collapse to module edges (capability A → B with import count).\n\n` +
      `  Default: ${COLORS.bold}side effect 0${COLORS.reset} — vault 변경 안 함, moduleEdges 만 출력.\n` +
      `  ${COLORS.bold}--apply${COLORS.reset}: moduleEdges 를 depends_on 관계로 batch land\n` +
      `  (50 단위 chunk, partial — 없는 endpoint 는 row-level error).\n\n` +
      `${COLORS.bold}Examples:${COLORS.reset}\n` +
      `  oh-my-ontology infer-imports                    # preview only\n` +
      `  oh-my-ontology infer-imports ~/my-app --json    # machine output\n` +
      `  oh-my-ontology infer-imports --apply            # land depends_on edges\n`,
  );
}
