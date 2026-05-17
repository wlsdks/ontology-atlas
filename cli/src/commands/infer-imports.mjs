// R17 — `oh-my-ontology infer-imports [rootPath]`
// MCP infer_imports wrapper. moduleEdges (capability A → B) 가 add_relation
// depends_on 후보. side effect 0.

import { resolve } from 'node:path';
import { callMcpTool } from '../lib/mcp-call.mjs';
import { assertRelationBatchResult } from '../lib/batch-results.mjs';
import { assertInferImportsResult } from '../lib/import-analysis-results.mjs';
import { getVaultCensus, writeVaultCensus } from '../lib/vault-census.mjs';
import {
  formatUnknownFlagError,
  parseBoundedPositiveIntegerFlag,
  parsePositiveIntegerFlag,
  parseVaultFlag,
  resolveSingleRootPathArg,
} from '../lib/cli-args.mjs';

const MAX_FILES_CAP = 50000;
const ALLOWED_FLAGS = ['--vault', '--json', '--apply', '--max-files', '--threshold'];

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
  const { rootPath, vault, json, maxFiles, apply, threshold, error, help } =
    parseArgs(args);
  if (help) {
    printUsage(process.stdout);
    return 0;
  }
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
    assertInferImportsResult(result);
  } catch (err) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  infer_imports: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }

  // R+ — --threshold N 필터 (count >= N). 큰 codebase 의 약한 import (count=1
  // accidental) 가 ontology 에 노이즈 들어가는 걸 차단. moduleEdges 만 적용
  // (file-level edges/external/unresolved 는 그대로 — agent diagnostic 용).
  let filteredOut = 0;
  if (threshold && threshold > 1 && Array.isArray(result.moduleEdges)) {
    const before = result.moduleEdges.length;
    result.moduleEdges = result.moduleEdges.filter(
      (m) => Number(m.count) >= threshold,
    );
    filteredOut = before - result.moduleEdges.length;
    result.thresholdApplied = { threshold, filteredOut };
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
  const edgeKindSummary = formatEdgeKindSummary(result.edges ?? []);

  process.stdout.write(
    `${COLORS.bold}infer-imports${COLORS.reset} ${COLORS.dim}${target}${COLORS.reset} ` +
      `${COLORS.dim}— ${result.filesScanned} files / ${fileEdges} edges / ${ext} external / ${unres} unresolved${COLORS.reset}\n\n`,
  );

  if (edgeKindSummary) {
    process.stdout.write(
      `  ${COLORS.bold}edge kinds${COLORS.reset} ${COLORS.dim}${edgeKindSummary}${COLORS.reset}\n\n`,
    );
  }

  if (filteredOut > 0) {
    process.stdout.write(
      `  ${COLORS.dim}--threshold ${threshold} filtered ${filteredOut} weak edges (count < ${threshold})${COLORS.reset}\n\n`,
    );
  }

  if (modEdges.length > 0) {
    process.stdout.write(
      `  ${COLORS.bold}module edges${COLORS.reset} ${COLORS.dim}(${modEdges.length}) — depends_on candidates${COLORS.reset}\n`,
    );
    for (const m of modEdges.slice(0, 16)) {
      const kindSummary = formatKindCounts(m.kindCounts);
      const kindSuffix = kindSummary ? ` ${COLORS.dim}(${kindSummary})${COLORS.reset}` : '';
      process.stdout.write(
        `    ${COLORS.cyan}${m.from}${COLORS.reset} ${COLORS.dim}—depends_on→${COLORS.reset} ${COLORS.cyan}${m.to}${COLORS.reset} ${COLORS.dim}× ${m.count}${COLORS.reset}${kindSuffix}\n`,
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
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = { vault: null, json: false, apply: false };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--json') flags.json = true;
    else if (a === '--apply') flags.apply = true;
    else if (a === '--max-files')
      flags.maxFiles = parseBoundedPositiveIntegerFlag('--max-files', args[++i], { max: MAX_FILES_CAP });
    else if (a.startsWith('--max-files='))
      flags.maxFiles = parseBoundedPositiveIntegerFlag('--max-files', a.slice('--max-files='.length), { max: MAX_FILES_CAP });
    else if (a === '--threshold') {
      const v = parsePositiveIntegerFlag('--threshold', args[++i]);
      if (v instanceof Error) return { error: v.message };
      flags.threshold = v;
    } else if (a.startsWith('--threshold=')) {
      const v = parsePositiveIntegerFlag('--threshold', a.slice('--threshold='.length));
      if (v instanceof Error) return { error: v.message };
      flags.threshold = v;
    } else if (a.startsWith('--')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    else positional.push(a);
  }
  for (const value of Object.values(flags)) {
    if (value instanceof Error) return { error: value.message };
  }
  if (flags.vault === false) return { error: '--vault requires a path' };
  const rootResult = resolveSingleRootPathArg({ positional });
  if (rootResult.error) return rootResult;
  return {
    rootPath: rootResult.rootPath,
    vault: flags.vault || '.',
    json: flags.json,
    apply: flags.apply,
    maxFiles: flags.maxFiles,
    threshold: flags.threshold,
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
      assertRelationBatchResult(res, `add_relations chunk @${i}`, { expectedCount: chunk.length });
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
  // R+ — apply 흐름 마무리 census (cycle 38, shared helper).
  const vaultCensus = await getVaultCensus(vaultRoot);

  if (json) {
    process.stdout.write(
      JSON.stringify(
        {
          rootPath: result.rootPath,
          filesScanned: result.filesScanned,
          applied: { relations: allRows },
          summary,
          vaultCensus,
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
  writeVaultCensus(vaultCensus);
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

function formatEdgeKindSummary(edges) {
  const counts = new Map();
  for (const edge of edges) {
    const kind = typeof edge.kind === 'string' && edge.kind.trim()
      ? edge.kind.trim()
      : 'unknown';
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return ['static', 'dynamic', 'require', 'reexport', 'side', 'unknown']
    .filter((kind) => counts.has(kind))
    .map((kind) => `${kind}=${counts.get(kind)}`)
    .join(' · ');
}

function formatKindCounts(kindCounts) {
  if (!kindCounts || typeof kindCounts !== 'object' || Array.isArray(kindCounts)) {
    return '';
  }
  return ['static', 'dynamic', 'require', 'reexport', 'side', 'unknown']
    .filter((kind) => Number.isInteger(kindCounts[kind]) && kindCounts[kind] > 0)
    .map((kind) => `${kind}=${kindCounts[kind]}`)
    .join(' · ');
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  oh-my-ontology infer-imports [rootPath] [--vault path] [--apply] [--json]\n` +
      `                              [--max-files N] [--threshold N]\n\n` +
      `${COLORS.bold}What it does:${COLORS.reset}\n` +
      `  Walk TS/JS files (default: src,lib,app,packages → fallback rootPath),\n` +
      `  parse imports (static / dynamic / require / re-export / side-effect),\n` +
      `  resolve relative imports, tsconfig paths, and fallback @/* aliases,\n` +
      `  classify external (npm) separately and unresolved aliases explicitly,\n` +
      `  collapse to module edges (capability A → B with import count).\n\n` +
      `  Default: ${COLORS.bold}side effect 0${COLORS.reset} — vault 변경 안 함, moduleEdges 만 출력.\n` +
      `  ${COLORS.bold}--apply${COLORS.reset}: moduleEdges 를 depends_on 관계로 batch land\n` +
      `  (50 단위 chunk, partial — 없는 endpoint 는 row-level error).\n` +
      `  ${COLORS.bold}--threshold N${COLORS.reset}: count < N 인 약한 module edge 를 필터.\n` +
      `  큰 codebase 의 accidental cross-feature import 가 ontology 에\n` +
      `  들어가는 걸 차단. preview / --apply / --json 모두 적용.\n` +
      `  ${COLORS.bold}--max-files N${COLORS.reset}: default 5000, max ${MAX_FILES_CAP} hard stop.\n\n` +
      `${COLORS.bold}Examples:${COLORS.reset}\n` +
      `  oh-my-ontology infer-imports                       # preview only\n` +
      `  oh-my-ontology infer-imports ~/my-app --json       # machine output\n` +
      `  oh-my-ontology infer-imports --apply               # land depends_on edges\n` +
      `  oh-my-ontology infer-imports --apply --threshold 3 # only count ≥ 3 edges\n`,
  );
}
