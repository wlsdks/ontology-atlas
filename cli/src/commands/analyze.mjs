// R16 (b3) — `ontology-atlas analyze [rootPath]`
// Wraps MCP analyze_repo_structure. side effect 0 — vault 변경 안 함, 후보만.
// 후보는 연결된 agent의 review → qualification → human acceptance → exact
// writePlan lifecycle을 거친 뒤에만 MCP writer로 진입한다.

import { COLORS } from '../lib/colors.mjs';
import { resolve } from 'node:path';
import { callMcpTool } from '../lib/mcp-call.mjs';
import { assertAnalyzeRepoStructureResult } from '../lib/repo-analysis-results.mjs';
import {
  formatUnknownFlagError,
  parseBoundedNonNegativeIntegerFlag,
  parseVaultFlag,
  resolveSingleRootPathArg,
} from '../lib/cli-args.mjs';

const MAX_DEPTH_CAP = 10;
const ALLOWED_FLAGS = ['--vault', '--json', '--apply', '--max-depth'];


const KIND_COLOR = {
  project: COLORS.magenta,
  domain: COLORS.blue,
  capability: COLORS.cyan,
  element: COLORS.green,
};

export async function runAnalyze(args) {
  const { rootPath, vault, json, maxDepth, apply, error, help } = parseArgs(args);
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
  // analyze 는 *vault 와 무관* 한 도구지만 MCP 통과 시 OATLAS_VAULT 가 필요해서
  // 그냥 cwd 또는 사용자 지정한다. MCP analyze 자체와 이 CLI의 모든 경로는
  // 후보만 반환하며 vault를 쓰지 않는다.
  const vaultRoot = resolve(process.cwd(), vault);
  let result;
  try {
    result = await callMcpTool(
      vaultRoot,
      'analyze_repo_structure',
      { rootPath: target, maxDepth },
      { repoRoot: target },
    );
    assertAnalyzeRepoStructureResult(result);
  } catch (err) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  analyze_repo_structure: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }

  if (apply) {
    return printApprovalRequiredPlan({ result, target, vaultRoot, json });
  }

  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return 0;
  }

  const proj = result.project;
  const fw = result.framework ?? 'generic';
  process.stdout.write(
    `${COLORS.bold}analyze${COLORS.reset} ${COLORS.dim}${target}${COLORS.reset} ` +
      `${COLORS.dim}(framework=${fw})${COLORS.reset}\n\n`,
  );

  if (proj) {
    process.stdout.write(
      `  ${KIND_COLOR.project}project${COLORS.reset}     ${proj.slug} ${COLORS.dim}· ${proj.title}${COLORS.reset}\n\n`,
    );
  }

  printSection('domains', result.domains ?? [], COLORS, KIND_COLOR.domain);
  printSection(
    'capabilities',
    result.capabilities ?? [],
    COLORS,
    KIND_COLOR.capability,
  );
  printSection('elements', result.elements ?? [], COLORS, KIND_COLOR.element);

  const rels = result.suggestedRelations ?? [];
  if (rels.length > 0) {
    process.stdout.write(
      `  ${COLORS.bold}suggested relations${COLORS.reset} ${COLORS.dim}(${rels.length})${COLORS.reset}\n`,
    );
    for (const r of rels.slice(0, 8)) {
      process.stdout.write(
        `    ${COLORS.dim}${r.from} —${r.type}→ ${r.to}${COLORS.reset}\n`,
      );
    }
    if (rels.length > 8)
      process.stdout.write(
        `    ${COLORS.dim}… ${rels.length - 8} more${COLORS.reset}\n`,
      );
    process.stdout.write('\n');
  }

  process.stdout.write(
    `${COLORS.dim}side effect 0: vault 변경 안 함. 후보는 연결된 agent에서${COLORS.reset} ` +
      `${COLORS.bold}review → qualification → human acceptance → exact writePlan${COLORS.reset} ` +
      `${COLORS.dim}lifecycle을 거친 뒤에만 작성.${COLORS.reset}\n`,
  );
  return 0;
}

function printSection(label, items, colors, kindColor) {
  if (items.length === 0) return;
  process.stdout.write(
    `  ${colors.bold}${label}${colors.reset} ${colors.dim}(${items.length})${colors.reset}\n`,
  );
  for (const it of items.slice(0, 12)) {
    const ev = it.evidence?.source ? `${colors.dim} ← ${it.evidence.source}${colors.reset}` : '';
    process.stdout.write(
      `    ${kindColor}${(it.slug || '').padEnd(36)}${colors.reset} ${it.title || ''}${ev}\n`,
    );
  }
  if (items.length > 12)
    process.stdout.write(
      `    ${colors.dim}… ${items.length - 12} more${colors.reset}\n`,
    );
  process.stdout.write('\n');
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
    else if (a === '--max-depth')
      flags.maxDepth = parseBoundedNonNegativeIntegerFlag('--max-depth', args[++i], { max: MAX_DEPTH_CAP });
    else if (a.startsWith('--max-depth='))
      flags.maxDepth = parseBoundedNonNegativeIntegerFlag('--max-depth', a.slice('--max-depth='.length), { max: MAX_DEPTH_CAP });
    else if (a.startsWith('-')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
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
    maxDepth: flags.maxDepth,
  };
}

function printApprovalRequiredPlan({ result, target, vaultRoot, json }) {
  const concepts = Number(Boolean(result.project))
    + (result.domains?.length ?? 0)
    + (result.capabilities?.length ?? 0)
    + (result.elements?.length ?? 0);
  const suggestedRelations = result.suggestedRelations?.length ?? 0;
  const lifecycle = result.proposalValidation?.constructionLifecycle ?? null;
  const payload = {
    mode: 'review',
    apply: false,
    writeEligible: false,
    reason: 'approval_required',
    rootPath: result.rootPath,
    vaultRoot,
    plan: { concepts, suggestedRelations },
    constructionLifecycle: lifecycle,
    guard: {
      reason: 'construction-qualification-required',
      qualification: 'constructionQualification:v1',
      recovery:
        'Use the MCP ontology-bootstrap review → independent qualification → human acceptance → exact writePlan flow. No semantic node or relation was written.',
    },
    next: {
      writes: 0,
      review:
        'Review the candidates with a connected agent, then write only an unchanged exact writePlan after qualification, human acceptance, validate_vault, compile_ontology, and finalization.',
    },
  };

  if (json) {
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
    return 3;
  }

  process.stdout.write(
    `${COLORS.bold}analyze --apply${COLORS.reset} ${COLORS.dim}${target}${COLORS.reset}\n\n` +
      `  ${COLORS.bold}review only${COLORS.reset}  approval required · writes 0\n` +
      `  ${COLORS.bold}candidates${COLORS.reset}   ${concepts} concepts · ${suggestedRelations} suggested relations\n` +
      `  ${COLORS.bold}guard${COLORS.reset}        constructionQualification:v1 + human acceptance + exact writePlan\n\n` +
      `${COLORS.dim}Use a connected agent to continue the review → qualification → acceptance → exact writePlan lifecycle. No semantic node or relation was written.${COLORS.reset}\n`,
  );
  return 3;
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  ontology-atlas analyze [rootPath] [--vault path] [--apply] [--json] [--max-depth N]\n\n` +
      `${COLORS.bold}What it does:${COLORS.reset}\n` +
      `  Walk a code repository (default: cwd), detect package.json / README\n` +
      `  H2 sections / src/ folders, propose ontology node candidates.\n` +
      `  Default: ${COLORS.bold}side effect 0${COLORS.reset}: vault 변경 안 함, 후보만 출력.\n` +
      `  ${COLORS.bold}--apply${COLORS.reset}: compatibility wrapper; approval_required 로 종료하며 쓰지 않음.\n` +
      `  exact constructionQualification:v1 + human acceptance + writePlan 은 MCP lifecycle 에서만 해제.\n` +
      `  ${COLORS.bold}--max-depth N${COLORS.reset}: default 2, range 0-${MAX_DEPTH_CAP}.\n\n` +
      `${COLORS.bold}Examples:${COLORS.reset}\n` +
      `  ontology-atlas analyze                 # preview only (no writes)\n` +
      `  ontology-atlas analyze ~/my-app --json # machine output\n` +
      `  ontology-atlas analyze --apply         # review-only compatibility check (writes 0)\n`,
  );
}
