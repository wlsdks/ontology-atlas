// R17 — `ontology-atlas infer-imports [rootPath]`
// MCP infer_imports wrapper. moduleEdges (capability A → B) are source-backed
// review candidates, never self-approving semantic depends_on relations.

import { COLORS } from '../lib/colors.mjs';
import { resolve } from 'node:path';
import { callMcpTool } from '../lib/mcp-call.mjs';
import { assertInferImportsResult } from '../lib/import-analysis-results.mjs';
import {
  formatUnknownFlagError,
  parseBoundedPositiveIntegerFlag,
  parsePositiveIntegerFlag,
  parseVaultFlag,
  resolveSingleRootPathArg,
} from '../lib/cli-args.mjs';

const MAX_FILES_CAP = 50000;
const ALLOWED_FLAGS = ['--vault', '--json', '--apply', '--full', '--max-files', '--threshold'];


export async function runInferImports(args) {
  const { rootPath, vault, json, apply, full, maxFiles, threshold, error, help } =
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
  if (apply) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  --apply is disabled for inferred imports: ` +
        'an import is source evidence, not a self-approving semantic depends_on. ' +
        'Preview the exact evidence, inspect both ontology concepts, write a semantic rationale, ' +
        'obtain human approval, then add one explicit relation with why.\n',
    );
    return 1;
  }

  const target = resolve(process.cwd(), rootPath);
  const vaultRoot = resolve(process.cwd(), vault);

  let result;
  try {
    const importArgs = {
      rootPath: target,
      maxFiles,
    };
    // Thresholding is defined over the complete module-edge list. The normal
    // preview may be a bounded compact packet, which is a valid read result
    // but intentionally has no full arrays.
    if (full || threshold !== undefined) {
      importArgs.reviewMode = 'full';
      importArgs.allowLargeResponse = true;
    }
    result = await callMcpTool(vaultRoot, 'infer_imports', importArgs);
    assertInferImportsResult(result);
  } catch (err) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  infer_imports: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }

  if ((full || threshold !== undefined) && !Array.isArray(result.moduleEdges)) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  infer_imports: --full/--threshold requires a complete module-edge response; retry with reviewMode:"full" and allowLargeResponse:true was not honored.\n`,
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

  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return 0;
  }

  const fileEdges = result.edges?.length ?? result.scanSummary?.fileEdges ?? 0;
  const ext = result.externalImports?.length ?? result.scanSummary?.externalImports ?? 0;
  const unres = result.unresolved?.length ?? result.scanSummary?.unresolvedImports ?? 0;
  const modEdges = result.moduleEdges ?? [];
  const edgeKindSummary = formatEdgeKindSummary(result.edges ?? []);

  process.stdout.write(
    `${COLORS.bold}infer-imports${COLORS.reset} ${COLORS.dim}${target}${COLORS.reset} ` +
      `${COLORS.dim}· ${result.filesScanned} files / ${fileEdges} edges / ${ext} external / ${unres} unresolved${COLORS.reset}\n\n`,
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

  if (result.delivery?.selection === 'automatic_compact') {
    const queue = result.reviewQueue;
    process.stdout.write(
      `  ${COLORS.bold}delivery${COLORS.reset} ${COLORS.dim}compact review packet (${queue?.returned ?? 0} of ${queue?.total ?? 0} candidates; full response is an explicit opt-in)${COLORS.reset}\n`,
    );
    process.stdout.write(
      `  ${COLORS.dim}next review: ${result.nextReview?.reviewId ?? 'none'} · write allowed: no · side effect 0${COLORS.reset}\n\n`,
    );
  }

  if (modEdges.length > 0) {
    process.stdout.write(
      `  ${COLORS.bold}module edges${COLORS.reset} ${COLORS.dim}(${modEdges.length}): rationale review required${COLORS.reset}\n`,
    );
    for (const m of modEdges.slice(0, 16)) {
      const kindSummary = formatKindCounts(m.kindCounts);
      const kindSuffix = kindSummary ? ` ${COLORS.dim}(${kindSummary})${COLORS.reset}` : '';
      process.stdout.write(
        `    ${COLORS.cyan}${m.from}${COLORS.reset} ${COLORS.dim}—imports→${COLORS.reset} ${COLORS.cyan}${m.to}${COLORS.reset} ${COLORS.dim}× ${m.count}${COLORS.reset}${kindSuffix}\n`,
      );
      const receipt = m.evidence?.[0];
      if (receipt) {
        process.stdout.write(
          `      ${COLORS.dim}evidence: ${receipt.from} —${receipt.kind}→ ${receipt.to}${COLORS.reset}\n`,
        );
      }
    }
    if (modEdges.length > 16)
      process.stdout.write(
        `    ${COLORS.dim}… ${modEdges.length - 16} more${COLORS.reset}\n`,
      );
    process.stdout.write('\n');
  }

  process.stdout.write(
    `${COLORS.dim}side effect 0: vault 변경 안 함. import는 코드 근거일 뿐 의미 관계를 자동 승인하지 않습니다. ` +
      `양쪽 개념과 근거를 검토하고 이유를 설명한 뒤 사용자 승인을 받아 한 건씩 기록하세요.${COLORS.reset}\n`,
  );
  return 0;
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = { vault: null, json: false, apply: false, full: false };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--json') flags.json = true;
    else if (a === '--apply') flags.apply = true;
    else if (a === '--full') flags.full = true;
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
    apply: flags.apply,
    full: flags.full,
    maxFiles: flags.maxFiles,
    threshold: flags.threshold,
  };
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
      `  ontology-atlas infer-imports [rootPath] [--vault path] [--apply] [--full] [--json]\n` +
      `                              [--max-files N] [--threshold N]\n\n` +
      `${COLORS.bold}What it does:${COLORS.reset}\n` +
      `  Walk TS/JS files and bounded root Python packages (default: src,lib,app,packages → fallback rootPath),\n` +
      `  parse imports (static / dynamic / require / re-export / side-effect),\n` +
      `  resolve relative imports, tsconfig paths, and fallback @/* aliases,\n` +
      `  classify external (npm) separately and unresolved aliases explicitly,\n` +
      `  collapse to module edges (capability A → B with import count).\n\n` +
      `  Default: ${COLORS.bold}side effect 0${COLORS.reset}: vault 변경 안 함, moduleEdges 만 출력.\n` +
      `  ${COLORS.bold}--apply${COLORS.reset}: disabled: import evidence cannot self-approve a semantic relation.\n` +
      `  ${COLORS.bold}--threshold N${COLORS.reset}: count < N 인 약한 module edge 를 필터.\n` +
      `  큰 codebase 의 accidental cross-feature import 가 ontology 에\n` +
      `  들어가는 걸 차단. preview / --apply / --json 모두 적용.\n` +
      `  ${COLORS.bold}--max-files N${COLORS.reset}: default 5000, max ${MAX_FILES_CAP} hard stop.\n\n` +
      `  ${COLORS.bold}--full${COLORS.reset}: explicitly request the complete module-edge arrays when the MCP response would otherwise be compacted.\n\n` +
      `${COLORS.bold}Examples:${COLORS.reset}\n` +
      `  ontology-atlas infer-imports                       # preview only\n` +
      `  ontology-atlas infer-imports ~/my-app --json       # machine output\n` +
      `  ontology-atlas infer-imports --threshold 3         # review count ≥ 3 evidence\n`,
  );
}
