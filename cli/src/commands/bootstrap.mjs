// R+ — `oh-my-ontology bootstrap [rootPath]`
//
// 1줄 full bootstrap. analyze --apply (노드) → infer-imports --apply (depends_on
// 엣지) 를 한 명령으로 묶는다. agent-less 환경 (CI · plain shell) 또는 새 repo
// 진입 직후 가장 자주 쓰는 흐름이라 명령으로 승격.
//
// 흐름:
//   1. analyze_repo_structure → add_concepts + add_relations (cycle 29)
//   2. infer_imports → add_relations (depends_on, cycle 30)
//   3. 통합 summary 출력 (concepts landed/existing/errors + relations)
//
// 옵션:
//   --vault path             vault 위치 (default cwd)
//   --max-depth N            analyze folder depth
//   --max-files N            infer-imports file cap
//   --threshold N            infer-imports 약한 edge 차단 (cycle 33, default 없음)
//   --skip-imports           1단계 (analyze) 만 — import graph 안 건드림
//   --json                   머신 가독 출력 (모든 단계 결과 합쳐 한 JSON)
//
// exit: 0 if 모든 단계 errors 0, 1 if 어느 단계 errors > 0, 2 if mcp 실패.

import { resolve } from 'node:path';
import { callMcpTool } from '../lib/mcp-call.mjs';
import { getVaultCensus, writeVaultCensus } from '../lib/vault-census.mjs';

const COLORS = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

export async function runBootstrap(args) {
  const parsed = parseArgs(args);
  if (parsed.error) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  ${parsed.error}\n`,
    );
    printUsage();
    return 1;
  }

  const target = resolve(process.cwd(), parsed.rootPath);
  const vaultRoot = resolve(process.cwd(), parsed.vault);

  // Stage 1 — analyze + apply.
  let analyzeResult;
  try {
    analyzeResult = await callMcpTool(vaultRoot, 'analyze_repo_structure', {
      rootPath: target,
      maxDepth: parsed.maxDepth,
    });
  } catch (err) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  analyze: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }

  const concepts = collectConcepts(analyzeResult);
  let conceptsRows = [];
  if (concepts.length > 0) {
    try {
      const r = await callMcpTool(vaultRoot, 'add_concepts', { concepts });
      conceptsRows = r.concepts ?? [];
    } catch (err) {
      process.stderr.write(
        `${COLORS.red}error${COLORS.reset}  add_concepts: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      return 2;
    }
  }

  const suggested = analyzeResult.suggestedRelations ?? [];
  const analyzeRelationsRows = await applyRelations(vaultRoot, suggested);
  if (analyzeRelationsRows === null) return 2;

  // Stage 2 — infer-imports + apply (--skip-imports 면 생략).
  let importsResult = null;
  let importsRows = [];
  if (!parsed.skipImports) {
    try {
      importsResult = await callMcpTool(vaultRoot, 'infer_imports', {
        rootPath: target,
        maxFiles: parsed.maxFiles,
      });
    } catch (err) {
      process.stderr.write(
        `${COLORS.red}error${COLORS.reset}  infer_imports: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      return 2;
    }
    let edges = Array.isArray(importsResult.moduleEdges)
      ? importsResult.moduleEdges
      : [];
    let filteredOut = 0;
    if (parsed.threshold && parsed.threshold > 1) {
      const before = edges.length;
      edges = edges.filter((m) => Number(m.count) >= parsed.threshold);
      filteredOut = before - edges.length;
      importsResult.thresholdApplied = {
        threshold: parsed.threshold,
        filteredOut,
      };
    }
    const importRelations = edges.map((e) => ({
      from: e.from,
      to: e.to,
      type: 'depends_on',
    }));
    const rows = await applyRelations(vaultRoot, importRelations);
    if (rows === null) return 2;
    importsRows = rows;
  }

  const summary = combineSummary(
    conceptsRows,
    analyzeRelationsRows,
    importsRows,
  );

  // R+ — 마지막 census. 사용자가 \"방금 뭐 land 됐나?\" 를 1줄로 인지.
  // analyze --apply / infer-imports --apply 와 같은 helper 공유 (cycle 38).
  const vaultCensus = await getVaultCensus(vaultRoot);

  if (parsed.json) {
    process.stdout.write(
      JSON.stringify(
        {
          rootPath: analyzeResult.rootPath,
          framework: analyzeResult.framework,
          analyze: {
            concepts: conceptsRows,
            relations: analyzeRelationsRows,
          },
          imports: parsed.skipImports
            ? null
            : {
                filesScanned: importsResult?.filesScanned,
                thresholdApplied: importsResult?.thresholdApplied,
                relations: importsRows,
              },
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
    `${COLORS.bold}bootstrap${COLORS.reset} ${COLORS.dim}repo=${target}\n           vault=${vaultRoot}${COLORS.reset}\n\n`,
  );
  process.stdout.write(
    `  ${COLORS.bold}1) analyze${COLORS.reset}    concepts: ` +
      `${COLORS.green}${summary.conceptsLanded}${COLORS.reset} landed · ` +
      `${COLORS.dim}${summary.conceptsExisting}${COLORS.reset} already existed · ` +
      `${summary.conceptsErrors > 0 ? COLORS.red : COLORS.dim}${summary.conceptsErrors}${COLORS.reset} errors\n`,
  );
  process.stdout.write(
    `                relations (suggested): ` +
      `${COLORS.green}${summary.analyzeRelationsLanded}${COLORS.reset} landed · ` +
      `${COLORS.dim}${summary.analyzeRelationsExisting}${COLORS.reset} already existed · ` +
      `${summary.analyzeRelationsErrors > 0 ? COLORS.red : COLORS.dim}${summary.analyzeRelationsErrors}${COLORS.reset} errors\n`,
  );
  if (parsed.skipImports) {
    process.stdout.write(
      `  ${COLORS.dim}2) imports     skipped (--skip-imports)${COLORS.reset}\n`,
    );
  } else {
    const thr = importsResult?.thresholdApplied;
    process.stdout.write(
      `  ${COLORS.bold}2) imports${COLORS.reset}    depends_on: ` +
        `${COLORS.green}${summary.importsLanded}${COLORS.reset} landed · ` +
        `${COLORS.dim}${summary.importsExisting}${COLORS.reset} already existed · ` +
        `${summary.importsErrors > 0 ? COLORS.red : COLORS.dim}${summary.importsErrors}${COLORS.reset} errors` +
        (thr
          ? ` ${COLORS.dim}(--threshold ${thr.threshold} filtered ${thr.filteredOut})${COLORS.reset}`
          : '') +
        '\n',
    );
  }
  process.stdout.write('\n');

  // 에러 행만 노출 — first 12 + summary.
  let errCount = 0;
  for (const row of conceptsRows) {
    if (row.ok === false) {
      if (errCount < 12) {
        process.stdout.write(
          `  ${COLORS.red}✗${COLORS.reset} concept ${row.slug} ${COLORS.dim}— ${row.error}${COLORS.reset}\n`,
        );
      }
      errCount += 1;
    }
  }
  for (const row of analyzeRelationsRows) {
    if (row.ok === false) {
      if (errCount < 12) {
        process.stdout.write(
          `  ${COLORS.red}✗${COLORS.reset} suggested ${row.from} —${row.type}→ ${row.to} ${COLORS.dim}— ${row.error}${COLORS.reset}\n`,
        );
      }
      errCount += 1;
    }
  }
  for (const row of importsRows) {
    if (row.ok === false) {
      if (errCount < 12) {
        process.stdout.write(
          `  ${COLORS.red}✗${COLORS.reset} import ${row.from} —${row.type}→ ${row.to} ${COLORS.dim}— ${row.error}${COLORS.reset}\n`,
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

  // R+ — \"vault now has N nodes (...)\" 한 줄 (shared helper).
  writeVaultCensus(vaultCensus);

  return summary.errors === 0 ? 0 : 1;
}

function collectConcepts(analyzeResult) {
  const out = [];
  if (analyzeResult.project) {
    out.push({
      slug: analyzeResult.project.slug,
      kind: 'project',
      title: analyzeResult.project.title,
    });
  }
  for (const d of analyzeResult.domains ?? []) {
    out.push({ slug: d.slug, kind: 'domain', title: d.title });
  }
  for (const c of analyzeResult.capabilities ?? []) {
    out.push({
      slug: c.slug,
      kind: 'capability',
      title: c.title,
      ...(c.domain ? { domain: c.domain } : {}),
    });
  }
  for (const e of analyzeResult.elements ?? []) {
    out.push({
      slug: e.slug,
      kind: 'element',
      title: e.title,
      ...(e.domain ? { domain: e.domain } : {}),
    });
  }
  return out;
}

// add_relations 의 50-row chunk 분할. 호출 실패 (mcp throw) 시 null 리턴.
async function applyRelations(vaultRoot, relations) {
  if (!Array.isArray(relations) || relations.length === 0) return [];
  const all = [];
  for (let i = 0; i < relations.length; i += 50) {
    const chunk = relations.slice(i, i + 50);
    let res;
    try {
      res = await callMcpTool(vaultRoot, 'add_relations', { relations: chunk });
    } catch (err) {
      process.stderr.write(
        `${COLORS.red}error${COLORS.reset}  add_relations chunk @${i}: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      return null;
    }
    for (const r of res.relations ?? []) all.push(r);
  }
  return all;
}

function combineSummary(conceptsRows, analyzeRelRows, importsRows) {
  const conceptStats = countConcepts(conceptsRows);
  const analyzeRelStats = countRelations(analyzeRelRows);
  const importStats = countRelations(importsRows);
  return {
    conceptsLanded: conceptStats.landed,
    conceptsExisting: conceptStats.existing,
    conceptsErrors: conceptStats.errors,
    analyzeRelationsLanded: analyzeRelStats.landed,
    analyzeRelationsExisting: analyzeRelStats.existing,
    analyzeRelationsErrors: analyzeRelStats.errors,
    importsLanded: importStats.landed,
    importsExisting: importStats.existing,
    importsErrors: importStats.errors,
    errors:
      conceptStats.errors + analyzeRelStats.errors + importStats.errors,
  };
}

function countConcepts(rows) {
  let landed = 0;
  let existing = 0;
  let errors = 0;
  for (const r of rows) {
    if (r.ok === true) landed += 1;
    else if (/already exists/i.test(r.error || '')) existing += 1;
    else errors += 1;
  }
  return { landed, existing, errors };
}

function countRelations(rows) {
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

function parseArgs(args) {
  const flags = {
    vault: '.',
    json: false,
    skipImports: false,
  };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = args[++i] || '.';
    else if (a.startsWith('--vault=')) flags.vault = a.slice('--vault='.length);
    else if (a === '--json') flags.json = true;
    else if (a === '--skip-imports') flags.skipImports = true;
    else if (a === '--max-depth')
      flags.maxDepth = Number(args[++i]) || undefined;
    else if (a.startsWith('--max-depth='))
      flags.maxDepth = Number(a.slice('--max-depth='.length)) || undefined;
    else if (a === '--max-files')
      flags.maxFiles = Number(args[++i]) || undefined;
    else if (a.startsWith('--max-files='))
      flags.maxFiles = Number(a.slice('--max-files='.length)) || undefined;
    else if (a === '--threshold') {
      const v = Number(args[++i]);
      if (!Number.isFinite(v) || v < 1)
        return { error: '--threshold must be a positive integer' };
      flags.threshold = v;
    } else if (a.startsWith('--threshold=')) {
      const v = Number(a.slice('--threshold='.length));
      if (!Number.isFinite(v) || v < 1)
        return { error: '--threshold must be a positive integer' };
      flags.threshold = v;
    } else if (a.startsWith('--')) return { error: `unknown flag: ${a}` };
    else positional.push(a);
  }
  return {
    rootPath: positional[0] ?? '.',
    vault: flags.vault,
    json: flags.json,
    skipImports: flags.skipImports,
    maxDepth: flags.maxDepth,
    maxFiles: flags.maxFiles,
    threshold: flags.threshold,
  };
}

function printUsage() {
  process.stderr.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  oh-my-ontology bootstrap [rootPath] [--vault path] [--threshold N]\n` +
      `                           [--skip-imports] [--json]\n` +
      `                           [--max-depth N] [--max-files N]\n\n` +
      `${COLORS.bold}What it does:${COLORS.reset}\n` +
      `  1줄 full bootstrap. analyze --apply (노드 + suggested relations) +\n` +
      `  infer-imports --apply (depends_on edges) 를 합친 단일 명령.\n` +
      `  agent-less 환경 (CI · plain shell) 또는 새 repo 진입 직후 흐름.\n\n` +
      `${COLORS.bold}Examples:${COLORS.reset}\n` +
      `  oh-my-ontology bootstrap                       # cwd → cwd vault\n` +
      `  oh-my-ontology bootstrap ~/my-app --vault .    # 다른 repo 분석\n` +
      `  oh-my-ontology bootstrap --threshold 3         # 약한 import 차단\n` +
      `  oh-my-ontology bootstrap --skip-imports        # 노드만 (1단계)\n` +
      `  oh-my-ontology bootstrap --json                # 머신 가독\n`,
  );
}
