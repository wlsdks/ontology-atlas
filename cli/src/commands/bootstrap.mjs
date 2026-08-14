// R+ — `ontology-atlas bootstrap [rootPath]`
//
// 1줄 review plan. analyzer가 제안한 노드/containment를 검토 후보로 반환한다.
// 의미 노드 write는 constructionQualification:v1 + human acceptance 로 해제되는
// MCP 경로만 사용한다. CLI cold-start가 승인 없이 semantic graph를 만들면 안 된다.
//
// 흐름:
//   1. analyze_repo_structure → review-only candidates
//   2. infer_imports → exact evidence + rationale review required (write 0)
//   3. 통합 review summary 출력 (landed 0, explicit approval required)
//
// 옵션:
//   --vault path             vault 위치 (default cwd)
//   --max-depth N            analyze folder depth
//   --max-files N            infer-imports file cap
//   --threshold N            infer-imports 약한 edge 차단 (cycle 33, default 없음)
//   --skip-imports           1단계 (analyze) 만 — import graph 안 건드림
//   --json                   머신 가독 출력 (모든 단계 결과 합쳐 한 JSON)
//
// exit: 3 if semantic approval is required, 1 if input errors, 2 if mcp 실패.

import { COLORS } from '../lib/colors.mjs';
import { resolve } from 'node:path';
import { callMcpTool } from '../lib/mcp-call.mjs';
import {
  formatConceptBatchFailureLabel,
  formatRelationBatchFailureLabel,
} from '../lib/batch-results.mjs';
import {
  callConceptBatches,
  callRelationBatches,
} from '../lib/mcp-batches.mjs';
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
const ALLOWED_FLAGS = ['--vault', '--json', '--skip-imports', '--reapply', '--apply-readme-domains', '--max-depth', '--max-files', '--threshold'];

const FRESH_VAULT_SLUGS = new Set([
  'README',
  'project',
  'domains/example-domain',
  'capabilities/example-capability',
  'elements/example-element',
]);


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

  const domainSplit = partitionReadmeOnlyDomains(analyzeResult);
  const heldReadmeDomains = parsed.applyReadmeDomains ? [] : domainSplit.readmeOnly;
  const domainsToLand = parsed.applyReadmeDomains
    ? [...domainSplit.corroborated, ...domainSplit.readmeOnly]
    : domainSplit.corroborated;
  const heldSlugs = new Set(heldReadmeDomains.map((d) => d.slug));
  const concepts = collectConcepts(analyzeResult, domainsToLand);

  // Construction lifecycle boundary: this CLI has no way to authenticate or
  // verify an independent constructionQualification:v1 packet. Never turn a
  // shell command into semantic approval. The old writer remains available to
  // the accepted MCP writePlan path, but cold-start bootstrap is review-only.
  if (!parsed.acceptedQualification) {
    return printApprovalRequiredPlan({
      parsed,
      target,
      vaultRoot,
      analyzeResult,
      concepts,
      heldReadmeDomains,
    });
  }

  // The writer branch remains for a future packet-bound CLI adapter. No
  // current parser can set acceptedQualification, so cold-start commands never
  // cross this boundary.
  const vaultState = await inspectBootstrapVault(vaultRoot);
  if (vaultState?.grown && !parsed.reapply) {
    return printGrownVaultPlan({
      parsed,
      target,
      vaultRoot,
      analyzeResult,
      concepts,
      vaultState,
    });
  }
  const prunedStarters =
    concepts.length > 0 ? pruneUntouchedStarterNodes(vaultRoot) : null;
  let conceptsRows = [];
  if (concepts.length > 0) {
    try {
      conceptsRows = await callConceptBatches(vaultRoot, concepts);
    } catch (err) {
      restorePrunedStarterNodes(vaultRoot, prunedStarters);
      process.stderr.write(
        `${COLORS.red}error${COLORS.reset}  add_concepts: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      return 2;
    }
  }

  const suggested = (analyzeResult.suggestedRelations ?? []).filter(
    (r) => !heldSlugs.has(r.from) && !heldSlugs.has(r.to),
  );
  const analyzeRelationsRows = await applyRelations(vaultRoot, suggested);
  if (analyzeRelationsRows === null) return 2;

  // Stage 2 — infer-imports review only (--skip-imports 면 생략). Source imports
  // are evidence, not self-approving semantic dependencies or ontology nodes.
  let importsResult = null;
  let importEndpointRows = [];
  let importContainmentRows = [];
  let importsRows = [];
  let importReviewCandidates = [];
  if (!parsed.skipImports) {
    try {
      importsResult = await callMcpTool(vaultRoot, 'infer_imports', {
        rootPath: target,
        maxFiles: parsed.maxFiles,
      });
      assertInferImportsResult(importsResult);
      applyImportThreshold(importsResult, parsed.threshold);
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
    importReviewCandidates = buildImportReviewCandidates(edges, concepts);
  }

  const summary = combineSummary(
    conceptsRows,
    importEndpointRows,
    importContainmentRows,
    analyzeRelationsRows,
    importsRows,
  );

  // R+ — 마지막 census. 사용자가 \"방금 뭐 land 됐나?\" 를 1줄로 인지.
  // analyzer apply 흐름의 마무리 census (cycle 38 shared helper).
  const vaultCensus = await getVaultCensus(vaultRoot);

  if (parsed.json) {
    process.stdout.write(
      JSON.stringify(
        {
          mode: 'apply',
          apply: true,
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
                reviewCandidates: importReviewCandidates,
                writeBlocked: 'rationale_review_required',
              },
          prunedStarters: summarizePrunedStarterNodes(prunedStarters),
          readmeDomainReview: heldReadmeDomains.map((d) => ({
            slug: d.slug,
            title: d.title,
            evidence: d.evidence ?? null,
          })),
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
  if (heldReadmeDomains.length > 0) {
    const onlyReadme = domainSplit.corroborated.length === 0;
    process.stdout.write(
      `                ${COLORS.yellow}README 제목 ${heldReadmeDomains.length}개는 심지 않고 검토 후보로 남김${COLORS.reset}` +
        `${COLORS.dim} · 문서 절이지 도메인이 아닐 수 있어요. 그대로 심으려면 --apply-readme-domains${COLORS.reset}\n`,
    );
    if (onlyReadme) {
      process.stdout.write(
        `                ${COLORS.dim}코드에서 구조를 못 찾았어요(하위 폴더 없는 src 등): 도메인 확정은 에이전트/공방에서 하는 편이 맞아요.${COLORS.reset}\n`,
      );
    }
    for (const d of heldReadmeDomains.slice(0, 12)) {
      process.stdout.write(
        `                  ${COLORS.dim}· ${d.slug}${COLORS.reset} ${COLORS.dim}← ${d.evidence?.source ?? 'README'}${COLORS.reset}\n`,
      );
    }
  }
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
      `  ${COLORS.bold}2) imports${COLORS.reset}    ` +
        `${COLORS.yellow}${importReviewCandidates.length}${COLORS.reset} review candidates · ` +
        `${COLORS.dim}0 automatic semantic writes: rationale review required${COLORS.reset}` +
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
          `  ${COLORS.red}✗${COLORS.reset} ${formatConceptBatchFailureLabel(row, index, 'concept')} ${COLORS.dim}· ${row.error}${COLORS.reset}\n`,
        );
      }
      errCount += 1;
    }
  });
  analyzeRelationsRows.forEach((row, index) => {
    if (row.ok === false) {
      if (errCount < 12) {
        process.stdout.write(
          `  ${COLORS.red}✗${COLORS.reset} ${formatRelationBatchFailureLabel(row, index, 'suggested')} ${COLORS.dim}· ${row.error}${COLORS.reset}\n`,
        );
      }
      errCount += 1;
    }
  });
  importEndpointRows.forEach((row, index) => {
    if (row.ok === false) {
      if (errCount < 12) {
        process.stdout.write(
          `  ${COLORS.red}✗${COLORS.reset} ${formatConceptBatchFailureLabel(row, index, 'import endpoint')} ${COLORS.dim}· ${row.error}${COLORS.reset}\n`,
        );
      }
      errCount += 1;
    }
  });
  importContainmentRows.forEach((row, index) => {
    if (row.ok === false) {
      if (errCount < 12) {
        process.stdout.write(
          `  ${COLORS.red}✗${COLORS.reset} ${formatRelationBatchFailureLabel(row, index, 'import containment')} ${COLORS.dim}· ${row.error}${COLORS.reset}\n`,
        );
      }
      errCount += 1;
    }
  });
  importsRows.forEach((row, index) => {
    if (row.ok === false) {
      if (errCount < 12) {
        process.stdout.write(
          `  ${COLORS.red}✗${COLORS.reset} ${formatRelationBatchFailureLabel(row, index, 'import')} ${COLORS.dim}· ${row.error}${COLORS.reset}\n`,
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

function applyImportThreshold(result, threshold) {
  if (!threshold || threshold <= 1 || !Array.isArray(result?.moduleEdges)) return;
  const before = result.moduleEdges.length;
  result.moduleEdges = result.moduleEdges.filter((edge) => Number(edge.count) >= threshold);
  result.thresholdApplied = {
    threshold,
    filteredOut: before - result.moduleEdges.length,
  };
}

async function printApprovalRequiredPlan({
  parsed,
  target,
  vaultRoot,
  analyzeResult,
  concepts,
  heldReadmeDomains,
}) {
  let importsResult = null;
  if (!parsed.skipImports) {
    try {
      importsResult = await callMcpTool(vaultRoot, 'infer_imports', {
        rootPath: target,
        maxFiles: parsed.maxFiles,
      });
      assertInferImportsResult(importsResult);
      applyImportThreshold(importsResult, parsed.threshold);
    } catch (err) {
      process.stderr.write(
        `${COLORS.red}error${COLORS.reset}  infer_imports: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      return 2;
    }
  }

  const payload = {
    mode: 'review',
    apply: false,
    writeEligible: false,
    reason: 'approval_required',
    rootPath: analyzeResult.rootPath,
    vaultRoot,
    guard: {
      reason: 'construction-qualification-required',
      qualification: 'constructionQualification:v1',
      recovery:
        'Use the MCP ontology-bootstrap review → independent qualification → human acceptance flow. No semantic node was written.',
    },
    plan: {
      concepts: concepts.length,
      suggestedRelations: analyzeResult.suggestedRelations?.length ?? 0,
      importRelations: importsResult?.moduleEdges?.length ?? 0,
      unresolvedImports: importsResult?.unresolved?.length ?? 0,
      readmeOnlyDomains: heldReadmeDomains.map((domain) => domain.slug),
    },
    analyze: analyzeResult,
    imports: importsResult,
    next: {
      review:
        'Connect an agent with ontology-bootstrap, inspect the exact reviewPlan, obtain an independent constructionQualification:v1 packet and human acceptance, then write only the returned writePlan.',
      writes: 0,
    },
  };

  if (parsed.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    process.stdout.write(
      `${COLORS.bold}bootstrap review${COLORS.reset} ${COLORS.dim}repo=${target}\n` +
        `                 vault=${vaultRoot}${COLORS.reset}\n\n` +
        `  ${COLORS.yellow}approval required${COLORS.reset} — ${concepts.length} semantic candidates remain review-only.\n` +
        `  writes: 0 · suggested relations: ${payload.plan.suggestedRelations} · import candidates: ${payload.plan.importRelations}\n` +
        `  ${COLORS.dim}${payload.next.review}${COLORS.reset}\n`,
    );
  }
  return 3;
}

function buildImportReviewCandidates(edges, analyzeConcepts) {
  const known = new Set((analyzeConcepts ?? []).map((concept) => concept.slug));
  return (edges ?? []).map((edge) => {
    const absentEndpoints = [edge.from, edge.to].filter((slug) => !known.has(slug));
    const required = [];
    if (absentEndpoints.length > 0) required.push('vault_endpoints');
    if ((edge.evidence?.length ?? 0) === 0) required.push('source_evidence');
    required.push('semantic_rationale', 'human_approval');
    return {
      from: edge.from,
      to: edge.to,
      count: edge.count,
      kindCounts: edge.kindCounts,
      sourceEvidence: edge.evidence ?? [],
      sourceEvidenceLimited: Boolean(edge.evidenceLimited),
      ...(absentEndpoints.length > 0 ? { absentEndpoints } : {}),
      review: {
        status: 'rationale_review_required',
        writeAllowed: false,
        required,
        next:
          'Review the exact import evidence and both ontology concepts, explain why the semantic dependency holds, ask the user, then write one explicit depends_on relation with why.',
      },
    };
  });
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

/**
 * README 제목에서만 나온 도메인과, 코드 구조가 뒷받침하는 도메인을 가른다.
 *
 * ## 왜 (2026-08-08 실사용 검수 — attunegraph, TS 113파일 · src 평평)
 *
 * analyze 의 README H2 휴리스틱에는 손으로 기운 금지어 체가 있는데, 체는
 * 구조적으로 진다 — 새 README 마다 목록이 모르는 제목을 만든다. 실측:
 * 「Quick start **from source**」(정확 일치 회피) · 「Current measured
 * baseline」 · 「Benchmarks and verification」이 전부 통과해 **11개 문서 절이
 * 도메인으로 착지**했고, 결과는 관계 1종짜리 별 그래프였다. 그 별에서 허브
 * 앰버가 테스트 픽스처에 갔고 공방 첫 추천까지 오염됐다 — 쓰레기가 확신을
 * 갖고 하류 전체로 흐른다.
 *
 * 그래서 체를 더 기우지 않고 **확증(corroboration)으로 가른다**: 코드에서
 * 나온 후보(디렉터리 evidence)거나, 코드에서 나온 다른 후보가 그 도메인을
 * 부모로 지목하면 확증이다. README 로만 존재하는 도메인은 — bootstrap 이
 * 임포트 단계에 이미 쓰는 원칙 그대로 — **자동으로 심지 않고 검토 후보로
 * 남긴다**. 옛 동작은 `--apply-readme-domains` 로 남겨 되돌릴 수 있다.
 */
export function partitionReadmeOnlyDomains(analyzeResult) {
  const domains = analyzeResult.domains ?? [];
  const isReadmeSource = (src) => typeof src === 'string' && /^readme(\.(md|rst))?$/i.test(src);
  // 코드에서 나온 후보가 부모로 지목한 도메인 = 확증
  const referenced = new Set();
  for (const list of [analyzeResult.capabilities ?? [], analyzeResult.elements ?? []]) {
    for (const c of list) {
      if (c.domain && !isReadmeSource(c.evidence?.source)) referenced.add(c.domain);
    }
  }
  const corroborated = [];
  const readmeOnly = [];
  for (const d of domains) {
    if (isReadmeSource(d.evidence?.source) && !referenced.has(d.slug)) readmeOnly.push(d);
    else corroborated.push(d);
  }
  return { corroborated, readmeOnly };
}

function collectConcepts(analyzeResult, domainsToLand) {
  const out = [];
  if (analyzeResult.project) {
    out.push({
      slug: analyzeResult.project.slug,
      kind: 'project',
      title: analyzeResult.project.title,
    });
  }
  for (const d of domainsToLand) {
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
      ...(e.evidence?.source ? { path: e.evidence.source } : {}),
    });
  }
  return out;
}

// add_relations 의 50-row chunk 분할. 호출 실패 (mcp throw) 시 null 리턴.
async function applyRelations(vaultRoot, relations) {
  if (!Array.isArray(relations) || relations.length === 0) return [];
  try {
    return await callRelationBatches(vaultRoot, relations);
  } catch (err) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  add_relations: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return null;
  }
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
    reapply: false,
    applyReadmeDomains: false,
  };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--json') flags.json = true;
    else if (a === '--skip-imports') flags.skipImports = true;
    else if (a === '--reapply') flags.reapply = true;
    else if (a === '--apply-readme-domains') flags.applyReadmeDomains = true;
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
    reapply: flags.reapply,
    applyReadmeDomains: flags.applyReadmeDomains,
    maxDepth: flags.maxDepth,
    maxFiles: flags.maxFiles,
    threshold: flags.threshold,
    acceptedQualification: false,
  };
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  ontology-atlas bootstrap [rootPath] [--vault path] [--threshold N]\n` +
      `                           [--skip-imports] [--reapply] [--json]\n` +
      `                           [--apply-readme-domains]\n` +
      `                           [--max-depth N] [--max-files N]\n\n` +
      `${COLORS.bold}What it does:${COLORS.reset}\n` +
      `  1줄 review plan. semantic node write는 하지 않고 analyzer 후보와\n` +
      `  exact evidence import 후보만 반환합니다. constructionQualification:v1\n` +
      `  + human acceptance + unchanged writePlan은 연결된 MCP lifecycle에서만\n` +
      `  해제됩니다. 모든 cold-start 실행은 approval_required(종료 3)입니다.\n\n` +
      `  README 제목에서만 나온 도메인은 심지 않고 검토 후보로 남깁니다 —\n` +
      `  코드 구조가 뒷받침하거나 --apply-readme-domains 일 때만 적용.\n` +
      `  --max-depth N: analyze folder walk default 2, range 0-${MAX_DEPTH_CAP}.\n` +
      `  --max-files N: import walk default 5000, max ${MAX_FILES_CAP} hard stop.\n\n` +
      `${COLORS.bold}Examples:${COLORS.reset}\n` +
      `  ontology-atlas bootstrap                       # cwd → cwd vault\n` +
      `  ontology-atlas bootstrap ~/my-app --vault .    # 다른 repo 분석\n` +
      `  ontology-atlas bootstrap --threshold 3         # 약한 import 차단\n` +
      `  ontology-atlas bootstrap --skip-imports        # 노드만 (1단계)\n` +
      `  ontology-atlas bootstrap --reapply             # 성장한 vault에 명시 재적용\n` +
      `  ontology-atlas bootstrap --json                # 머신 가독\n`,
  );
}

async function inspectBootstrapVault(vaultRoot) {
  try {
    const result = await callMcpTool(vaultRoot, 'list_concepts', { limit: 500 });
    if (!result || !Array.isArray(result.nodes)) return null;
    const nonStarterSlugs = result.nodes
      .map((node) => node.slug)
      .filter((slug) => !FRESH_VAULT_SLUGS.has(slug));
    return {
      total: result.total,
      slugs: result.nodes.map((node) => node.slug),
      nonStarterSlugs,
      grown: nonStarterSlugs.length > 0,
    };
  } catch {
    // Older/fake MCP servers used by compatibility tests may not expose the
    // preflight read. Keep the existing bootstrap path instead of failing.
    return null;
  }
}

async function printGrownVaultPlan({ parsed, target, vaultRoot, analyzeResult, concepts, vaultState }) {
  let importsResult = null;
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
  }
  const payload = {
    mode: 'plan',
    apply: false,
    rootPath: analyzeResult.rootPath,
    vaultRoot,
    guard: {
      reason: 'vault-already-grown',
      currentNodes: vaultState.total,
      nonStarterSlugs: vaultState.nonStarterSlugs,
      recovery: 'Review this plan, then pass --reapply only if analyzer output should be merged again.',
    },
    plan: {
      concepts: concepts.length,
      suggestedRelations: analyzeResult.suggestedRelations?.length ?? 0,
      importRelations: importsResult?.moduleEdges?.length ?? 0,
      unresolvedImports: importsResult?.unresolved?.length ?? 0,
    },
    analyze: analyzeResult,
    imports: importsResult,
  };
  if (parsed.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    process.stdout.write(
      `${COLORS.bold}bootstrap plan${COLORS.reset} ${COLORS.dim}repo=${target}\n` +
        `               vault=${vaultRoot}${COLORS.reset}\n\n` +
        `  ${COLORS.yellow}protected${COLORS.reset} vault already has ${vaultState.total} nodes; no files were changed.\n` +
        `  candidates: ${concepts.length} concepts · ${payload.plan.suggestedRelations} suggested relations · ` +
        `${payload.plan.importRelations} import review candidates\n` +
        `  ${COLORS.dim}Review the plan and use --reapply only for an intentional merge.${COLORS.reset}\n`,
    );
  }
  return 0;
}
