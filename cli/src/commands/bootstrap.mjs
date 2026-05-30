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

import { COLORS } from '../lib/colors.mjs';
import { resolve } from 'node:path';
import { callMcpTool } from '../lib/mcp-call.mjs';
import {
  assertConceptBatchResult,
  assertRelationBatchResult,
  formatConceptBatchFailureLabel,
  formatRelationBatchFailureLabel,
} from '../lib/batch-results.mjs';
import { assertInferImportsResult } from '../lib/import-analysis-results.mjs';
import { assertAnalyzeRepoStructureResult } from '../lib/repo-analysis-results.mjs';
import {
  pruneUntouchedStarterNodes,
  restorePrunedStarterNodes,
  summarizePrunedStarterNodes,
} from '../lib/prune-starters.mjs';
import { getVaultCensus, writeVaultCensus } from '../lib/vault-census.mjs';
import {
  formatUnknownFlagError,
  parseBoundedNonNegativeIntegerFlag,
  parseBoundedPositiveIntegerFlag,
  parsePositiveIntegerFlag,
  parseVaultFlag,
  resolveSingleRootPathArg,
} from '../lib/cli-args.mjs';

const MAX_DEPTH_CAP = 10;
const MAX_FILES_CAP = 50000;
const ALLOWED_FLAGS = ['--vault', '--json', '--skip-imports', '--max-depth', '--max-files', '--threshold'];


export async function runBootstrap(args) {
  const parsed = parseArgs(args);
  if (parsed.help) {
    printUsage(process.stdout);
    return 0;
  }
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
    assertAnalyzeRepoStructureResult(analyzeResult);
  } catch (err) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  analyze: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }

  const concepts = collectConcepts(analyzeResult);
  const prunedStarters =
    concepts.length > 0 ? pruneUntouchedStarterNodes(vaultRoot) : null;
  let conceptsRows = [];
  if (concepts.length > 0) {
    try {
      const r = await callMcpTool(vaultRoot, 'add_concepts', { concepts });
      assertConceptBatchResult(r, 'add_concepts', { expectedCount: concepts.length });
      conceptsRows = r.concepts ?? [];
    } catch (err) {
      restorePrunedStarterNodes(vaultRoot, prunedStarters);
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
  let importEndpointRows = [];
  let importContainmentRows = [];
  let importsRows = [];
  if (!parsed.skipImports) {
    try {
      importsResult = await callMcpTool(vaultRoot, 'infer_imports', {
        rootPath: target,
        maxFiles: parsed.maxFiles,
      });
      assertInferImportsResult(importsResult);
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
    const importEndpointConcepts = collectImportEndpointConcepts(
      edges,
      concepts,
      analyzeResult,
    );
    if (importEndpointConcepts.length > 0) {
      try {
        const r = await callMcpTool(vaultRoot, 'add_concepts', {
          concepts: importEndpointConcepts,
        });
        assertConceptBatchResult(r, 'add_concepts(import endpoints)', {
          expectedCount: importEndpointConcepts.length,
        });
        importEndpointRows = r.concepts ?? [];
      } catch (err) {
        process.stderr.write(
          `${COLORS.red}error${COLORS.reset}  add_concepts(import endpoints): ${err instanceof Error ? err.message : String(err)}\n`,
        );
        return 2;
      }
    }
    const importContainmentRelations = collectImportContainmentRelations(
      analyzeResult,
      importEndpointConcepts,
    );
    importContainmentRows = await applyRelations(
      vaultRoot,
      importContainmentRelations,
    );
    if (importContainmentRows === null) return 2;
    const rows = await applyRelations(vaultRoot, importRelations);
    if (rows === null) return 2;
    importsRows = rows;
  }

  const summary = combineSummary(
    conceptsRows,
    importEndpointRows,
    importContainmentRows,
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
                endpointConcepts: importEndpointRows,
                containmentRelations: importContainmentRows,
                relations: importsRows,
              },
          prunedStarters: summarizePrunedStarterNodes(prunedStarters),
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
  printPrunedStarters(prunedStarters);
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
      `  ${COLORS.bold}2) imports${COLORS.reset}    endpoints: ` +
        `${COLORS.green}${summary.importEndpointConceptsLanded}${COLORS.reset} landed · ` +
        `${COLORS.dim}${summary.importEndpointConceptsExisting}${COLORS.reset} already existed · ` +
        `${summary.importEndpointConceptsErrors > 0 ? COLORS.red : COLORS.dim}${summary.importEndpointConceptsErrors}${COLORS.reset} errors\n`,
    );
    process.stdout.write(
      `                containment: ` +
        `${COLORS.green}${summary.importContainmentLanded}${COLORS.reset} landed · ` +
        `${COLORS.dim}${summary.importContainmentExisting}${COLORS.reset} already existed · ` +
        `${summary.importContainmentErrors > 0 ? COLORS.red : COLORS.dim}${summary.importContainmentErrors}${COLORS.reset} errors\n`,
    );
    process.stdout.write(
      `                depends_on:  ` +
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
  conceptsRows.forEach((row, index) => {
    if (row.ok === false) {
      if (errCount < 12) {
        process.stdout.write(
          `  ${COLORS.red}✗${COLORS.reset} ${formatConceptBatchFailureLabel(row, index, 'concept')} ${COLORS.dim}— ${row.error}${COLORS.reset}\n`,
        );
      }
      errCount += 1;
    }
  });
  analyzeRelationsRows.forEach((row, index) => {
    if (row.ok === false) {
      if (errCount < 12) {
        process.stdout.write(
          `  ${COLORS.red}✗${COLORS.reset} ${formatRelationBatchFailureLabel(row, index, 'suggested')} ${COLORS.dim}— ${row.error}${COLORS.reset}\n`,
        );
      }
      errCount += 1;
    }
  });
  importEndpointRows.forEach((row, index) => {
    if (row.ok === false) {
      if (errCount < 12) {
        process.stdout.write(
          `  ${COLORS.red}✗${COLORS.reset} ${formatConceptBatchFailureLabel(row, index, 'import endpoint')} ${COLORS.dim}— ${row.error}${COLORS.reset}\n`,
        );
      }
      errCount += 1;
    }
  });
  importContainmentRows.forEach((row, index) => {
    if (row.ok === false) {
      if (errCount < 12) {
        process.stdout.write(
          `  ${COLORS.red}✗${COLORS.reset} ${formatRelationBatchFailureLabel(row, index, 'import containment')} ${COLORS.dim}— ${row.error}${COLORS.reset}\n`,
        );
      }
      errCount += 1;
    }
  });
  importsRows.forEach((row, index) => {
    if (row.ok === false) {
      if (errCount < 12) {
        process.stdout.write(
          `  ${COLORS.red}✗${COLORS.reset} ${formatRelationBatchFailureLabel(row, index, 'import')} ${COLORS.dim}— ${row.error}${COLORS.reset}\n`,
        );
      }
      errCount += 1;
    }
  });
  if (errCount > 12) {
    process.stdout.write(
      `  ${COLORS.dim}… ${errCount - 12} more errors${COLORS.reset}\n`,
    );
  }

  // R+ — \"vault now has N nodes (...)\" 한 줄 (shared helper).
  writeVaultCensus(vaultCensus);

  return summary.errors === 0 ? 0 : 1;
}

function printPrunedStarters(prunedStarters) {
  if (
    !prunedStarters ||
    (prunedStarters.removed.length === 0 &&
      prunedStarters.preserved.length === 0)
  ) {
    return;
  }
  process.stdout.write(
    `  ${COLORS.bold}starters${COLORS.reset}   ` +
      `${COLORS.green}${prunedStarters.removed.length}${COLORS.reset} removed · ` +
      `${COLORS.dim}${prunedStarters.preserved.length}${COLORS.reset} preserved (edited)\n`,
  );
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

function collectImportEndpointConcepts(edges, analyzeConcepts, analyzeResult) {
  if (!Array.isArray(edges) || edges.length === 0) return [];
  const known = new Set(analyzeConcepts.map((c) => c.slug));
  const out = [];
  const seen = new Set();
  const missing = [];
  for (const edge of edges) {
    for (const slug of [edge.from, edge.to]) {
      if (!slug || known.has(slug) || seen.has(slug)) continue;
      const kind = kindFromOntologySlug(slug);
      if (!kind) continue;
      missing.push({ slug, kind });
      seen.add(slug);
    }
  }
  if (missing.length === 0) return [];

  const needsDomain = missing.some(
    (m) => m.kind === 'capability' || m.kind === 'element',
  );
  const fallbackDomain = needsDomain
    ? firstDomainSlug(analyzeConcepts, analyzeResult) ?? 'domains/codebase-structure'
    : null;

  if (fallbackDomain && !known.has(fallbackDomain)) {
    out.push({
      slug: fallbackDomain,
      kind: 'domain',
      title: titleFromSlug(fallbackDomain),
    });
    known.add(fallbackDomain);
  }

  for (const { slug, kind } of missing) {
    out.push({
      slug,
      kind,
      title: titleFromSlug(slug),
      ...(fallbackDomain && (kind === 'capability' || kind === 'element')
        ? { domain: fallbackDomain }
        : {}),
    });
  }
  return out;
}

function collectImportContainmentRelations(analyzeResult, importEndpointConcepts) {
  const projectSlug = analyzeResult.project?.slug;
  if (!projectSlug || !Array.isArray(importEndpointConcepts)) return [];
  const relations = [];
  const seen = new Set();
  for (const concept of importEndpointConcepts) {
    if (concept.kind !== 'capability' && concept.kind !== 'element') continue;
    if (concept.domain) {
      const projectDomainKey = `${projectSlug}→${concept.domain}`;
      if (!seen.has(projectDomainKey)) {
        relations.push({
          from: projectSlug,
          to: concept.domain,
          type: 'contains',
        });
        seen.add(projectDomainKey);
      }
      const domainConceptKey = `${concept.domain}→${concept.slug}`;
      if (!seen.has(domainConceptKey)) {
        relations.push({
          from: concept.domain,
          to: concept.slug,
          type: 'contains',
        });
        seen.add(domainConceptKey);
      }
      continue;
    }
    const projectConceptKey = `${projectSlug}→${concept.slug}`;
    if (!seen.has(projectConceptKey)) {
      relations.push({
        from: projectSlug,
        to: concept.slug,
        type: 'contains',
      });
      seen.add(projectConceptKey);
    }
  }
  return relations;
}

function firstDomainSlug(analyzeConcepts, analyzeResult) {
  const fromConcepts = analyzeConcepts.find((c) => c.kind === 'domain')?.slug;
  if (fromConcepts) return fromConcepts;
  return analyzeResult.domains?.[0]?.slug ?? null;
}

function kindFromOntologySlug(slug) {
  if (slug.startsWith('projects/')) return 'project';
  if (slug.startsWith('domains/')) return 'domain';
  if (slug.startsWith('capabilities/')) return 'capability';
  if (slug.startsWith('elements/')) return 'element';
  return null;
}

function titleFromSlug(slug) {
  const tail = String(slug).split('/').filter(Boolean).at(-1) ?? slug;
  return tail
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
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
      assertRelationBatchResult(res, `add_relations chunk @${i}`, { expectedCount: chunk.length });
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

function combineSummary(
  conceptsRows,
  importEndpointRows,
  importContainmentRows,
  analyzeRelRows,
  importsRows,
) {
  const conceptStats = countConcepts(conceptsRows);
  const importEndpointStats = countConcepts(importEndpointRows);
  const importContainmentStats = countRelations(importContainmentRows);
  const analyzeRelStats = countRelations(analyzeRelRows);
  const importStats = countRelations(importsRows);
  return {
    conceptsLanded: conceptStats.landed,
    conceptsExisting: conceptStats.existing,
    conceptsErrors: conceptStats.errors,
    importEndpointConceptsLanded: importEndpointStats.landed,
    importEndpointConceptsExisting: importEndpointStats.existing,
    importEndpointConceptsErrors: importEndpointStats.errors,
    importContainmentLanded: importContainmentStats.landed,
    importContainmentExisting: importContainmentStats.existing,
    importContainmentErrors: importContainmentStats.errors,
    analyzeRelationsLanded: analyzeRelStats.landed,
    analyzeRelationsExisting: analyzeRelStats.existing,
    analyzeRelationsErrors: analyzeRelStats.errors,
    importsLanded: importStats.landed,
    importsExisting: importStats.existing,
    importsErrors: importStats.errors,
    errors:
      conceptStats.errors +
      importEndpointStats.errors +
      importContainmentStats.errors +
      analyzeRelStats.errors +
      importStats.errors,
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
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = {
    vault: null,
    json: false,
    skipImports: false,
  };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--json') flags.json = true;
    else if (a === '--skip-imports') flags.skipImports = true;
    else if (a === '--max-depth')
      flags.maxDepth = parseBoundedNonNegativeIntegerFlag('--max-depth', args[++i], { max: MAX_DEPTH_CAP });
    else if (a.startsWith('--max-depth='))
      flags.maxDepth = parseBoundedNonNegativeIntegerFlag('--max-depth', a.slice('--max-depth='.length), { max: MAX_DEPTH_CAP });
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
    } else if (a.startsWith('-')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
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
    skipImports: flags.skipImports,
    maxDepth: flags.maxDepth,
    maxFiles: flags.maxFiles,
    threshold: flags.threshold,
  };
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  oh-my-ontology bootstrap [rootPath] [--vault path] [--threshold N]\n` +
      `                           [--skip-imports] [--json]\n` +
      `                           [--max-depth N] [--max-files N]\n\n` +
      `${COLORS.bold}What it does:${COLORS.reset}\n` +
      `  1줄 full bootstrap. analyze --apply (노드 + suggested relations) +\n` +
      `  infer-imports --apply (depends_on edges) 를 합친 적용 명령.\n` +
      `  agent-less 환경 (CI · plain shell) 또는 새 repo 진입 직후 흐름.\n\n` +
      `  --max-depth N: analyze folder walk default 2, range 0-${MAX_DEPTH_CAP}.\n` +
      `  --max-files N: import walk default 5000, max ${MAX_FILES_CAP} hard stop.\n\n` +
      `${COLORS.bold}Examples:${COLORS.reset}\n` +
      `  oh-my-ontology bootstrap                       # cwd → cwd vault\n` +
      `  oh-my-ontology bootstrap ~/my-app --vault .    # 다른 repo 분석\n` +
      `  oh-my-ontology bootstrap --threshold 3         # 약한 import 차단\n` +
      `  oh-my-ontology bootstrap --skip-imports        # 노드만 (1단계)\n` +
      `  oh-my-ontology bootstrap --json                # 머신 가독\n`,
  );
}
