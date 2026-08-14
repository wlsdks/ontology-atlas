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
import { assertInferImportsResult } from '../lib/import-analysis-results.mjs';
import { assertAnalyzeRepoStructureResult } from '../lib/repo-analysis-results.mjs';
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

  // Stage 1 — analyze + review. This command never applies semantic rows.
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
  const concepts = collectConcepts(analyzeResult, domainsToLand);

  // This command is deliberately a preview-only ingress. There is no CLI
  // switch, environment variable, or hidden parser state that can manufacture
  // the independent constructionQualification:v1 + human acceptance required
  // by the lifecycle. Keep the return unconditional so a future option cannot
  // accidentally resurrect the former batch-writer branch.
  return printApprovalRequiredPlan({
    parsed,
    target,
    vaultRoot,
    analyzeResult,
    concepts,
    heldReadmeDomains,
  });
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
