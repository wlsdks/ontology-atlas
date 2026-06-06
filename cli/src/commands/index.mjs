// R+ — `ontology-atlas index [rootPath]`
//
// Long-running ontology indexing entrypoint. Default is read-only: analyze the
// repo, infer import edges, validate the target vault, and return an indexing
// plan. `--apply` delegates to the existing bootstrap writer pipeline.

import { COLORS } from '../lib/colors.mjs';
import { resolve } from 'node:path';
import { callMcpTool } from '../lib/mcp-call.mjs';
import { assertAnalyzeRepoStructureResult } from '../lib/repo-analysis-results.mjs';
import { assertInferImportsResult } from '../lib/import-analysis-results.mjs';
import {
  formatUnknownFlagError,
  parseBoundedNonNegativeIntegerFlag,
  parseBoundedPositiveIntegerFlag,
  parsePositiveIntegerFlag,
  parseVaultFlag,
  resolveSingleRootPathArg,
} from '../lib/cli-args.mjs';
import { runBootstrap } from './bootstrap.mjs';

const MAX_DEPTH_CAP = 10;
const MAX_FILES_CAP = 50000;
const ALLOWED_FLAGS = ['--vault', '--json', '--apply', '--skip-imports', '--max-depth', '--max-files', '--threshold'];

export async function runIndex(args) {
  const parsed = parseArgs(args);
  if (parsed.help) {
    printUsage(process.stdout);
    return 0;
  }
  if (parsed.error) {
    process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${parsed.error}\n`);
    printUsage();
    return 1;
  }

  if (parsed.apply) {
    return runApply(parsed);
  }

  const target = resolve(process.cwd(), parsed.rootPath);
  const vaultRoot = resolve(process.cwd(), parsed.vault);

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
    applyThreshold(importsResult, parsed.threshold);
  }

  let validation;
  try {
    validation = await callMcpTool(vaultRoot, 'validate_vault', {
      repoRoot: target,
    });
  } catch (err) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  validate_vault: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }

  const plan = buildPlan(analyzeResult, importsResult);
  const payload = {
    mode: 'plan',
    apply: false,
    rootPath: analyzeResult.rootPath,
    vaultRoot,
    analyze: {
      framework: analyzeResult.framework,
      project: analyzeResult.project,
      domains: analyzeResult.domains.length,
      capabilities: analyzeResult.capabilities.length,
      elements: analyzeResult.elements.length,
      suggestedRelations: analyzeResult.suggestedRelations.length,
    },
    imports: importsResult
      ? {
          filesScanned: importsResult.filesScanned,
          moduleEdges: importsResult.moduleEdges.length,
          thresholdApplied: importsResult.thresholdApplied,
          reconciliationSummary: importsResult.reconciliationSummary,
        }
      : null,
    plan,
    validation: {
      scanned: validation.scanned,
      problemFiles: validation.summary?.problemFiles ?? 0,
      errorFiles: validation.summary?.errorFiles ?? 0,
      warningFiles: validation.summary?.warningFiles ?? 0,
      pathDrift: validation.pathDrift?.drifts?.length ?? 0,
    },
    meaningGate: summarizeMeaningGate(analyzeResult.meaningGate),
    next: {
      apply: 'ontology-atlas index [rootPath] --apply --vault [vault]',
      review: 'Review candidates before applying on large or noisy repos.',
    },
  };

  if (parsed.json) {
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  } else {
    printPlan(payload);
  }
  return 0;
}

async function runApply(parsed) {
  const bootstrapArgs = [parsed.rootPath, '--vault', parsed.vault];
  if (parsed.skipImports) bootstrapArgs.push('--skip-imports');
  if (parsed.json) bootstrapArgs.push('--json');
  if (parsed.maxDepth !== undefined) bootstrapArgs.push('--max-depth', String(parsed.maxDepth));
  if (parsed.maxFiles !== undefined) bootstrapArgs.push('--max-files', String(parsed.maxFiles));
  if (parsed.threshold !== undefined) bootstrapArgs.push('--threshold', String(parsed.threshold));

  if (!parsed.json) {
    process.stdout.write(`${COLORS.bold}index --apply${COLORS.reset} ${COLORS.dim}delegating to bootstrap pipeline${COLORS.reset}\n\n`);
    return runBootstrap(bootstrapArgs);
  }

  let captured = '';
  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk, ...rest) => {
    captured += String(chunk);
    if (typeof rest.at(-1) === 'function') rest.at(-1)();
    return true;
  };
  let code;
  try {
    code = await runBootstrap(bootstrapArgs);
  } finally {
    process.stdout.write = originalWrite;
  }
  let applyPayload;
  try {
    applyPayload = JSON.parse(captured);
  } catch {
    process.stdout.write(captured);
    return code;
  }
  process.stdout.write(
    JSON.stringify(
      {
        mode: 'apply',
        rootPath: applyPayload.rootPath,
        vaultRoot: resolve(process.cwd(), parsed.vault),
        apply: applyPayload,
      },
      null,
      2,
    ) + '\n',
  );
  return code;
}

function summarizeMeaningGate(meaningGate) {
  return {
    policy: meaningGate.policy,
    sourceStructureRole: meaningGate.sourceStructureRole,
    businessOntology: {
      domains: meaningGate.businessOntology.domains.length,
      capabilities: meaningGate.businessOntology.capabilities.length,
    },
    implementationEvidence: {
      elements: meaningGate.implementationEvidence.elements.length,
    },
    reviewQuestions: meaningGate.reviewQuestions,
  };
}

function buildPlan(analyzeResult, importsResult) {
  return {
    concepts:
      (analyzeResult.project ? 1 : 0) +
      analyzeResult.domains.length +
      analyzeResult.capabilities.length +
      analyzeResult.elements.length,
    suggestedRelations: analyzeResult.suggestedRelations.length,
    importRelations: importsResult?.moduleEdges?.length ?? 0,
    phases: [
      'analyze_repo_structure',
      importsResult ? 'infer_imports' : 'infer_imports skipped',
      'validate_vault',
      'apply with add_concepts/add_relations only when --apply is explicit',
    ],
  };
}

function applyThreshold(result, threshold) {
  if (!threshold || threshold <= 1 || !Array.isArray(result.moduleEdges)) return;
  const before = result.moduleEdges.length;
  result.moduleEdges = result.moduleEdges.filter((edge) => Number(edge.count) >= threshold);
  result.thresholdApplied = {
    threshold,
    filteredOut: before - result.moduleEdges.length,
  };
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  let vault = '.';
  let json = false;
  let apply = false;
  let skipImports = false;
  let maxDepth;
  let maxFiles;
  let threshold;
  const positional = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--json') {
      json = true;
    } else if (arg === '--apply') {
      apply = true;
    } else if (arg === '--skip-imports') {
      skipImports = true;
    } else if (arg === '--vault') {
      vault = parseVaultFlag(args[++i]);
      if (vault === false) return { error: '--vault requires a path' };
    } else if (arg.startsWith('--vault=')) {
      vault = parseVaultFlag(arg.slice('--vault='.length));
      if (vault === false) return { error: '--vault requires a path' };
    } else if (arg === '--max-depth') {
      const parsed = parseBoundedNonNegativeIntegerFlag(arg, args[++i], { max: MAX_DEPTH_CAP });
      if (parsed instanceof Error) return { error: parsed.message };
      maxDepth = parsed;
    } else if (arg.startsWith('--max-depth=')) {
      const parsed = parseBoundedNonNegativeIntegerFlag('--max-depth', arg.slice('--max-depth='.length), { max: MAX_DEPTH_CAP });
      if (parsed instanceof Error) return { error: parsed.message };
      maxDepth = parsed;
    } else if (arg === '--max-files') {
      const parsed = parseBoundedPositiveIntegerFlag(arg, args[++i], { max: MAX_FILES_CAP });
      if (parsed instanceof Error) return { error: parsed.message };
      maxFiles = parsed;
    } else if (arg.startsWith('--max-files=')) {
      const parsed = parseBoundedPositiveIntegerFlag('--max-files', arg.slice('--max-files='.length), { max: MAX_FILES_CAP });
      if (parsed instanceof Error) return { error: parsed.message };
      maxFiles = parsed;
    } else if (arg === '--threshold') {
      const parsed = parsePositiveIntegerFlag(arg, args[++i]);
      if (parsed instanceof Error) return { error: parsed.message };
      threshold = parsed;
    } else if (arg.startsWith('--threshold=')) {
      const parsed = parsePositiveIntegerFlag('--threshold', arg.slice('--threshold='.length));
      if (parsed instanceof Error) return { error: parsed.message };
      threshold = parsed;
    } else if (arg.startsWith('-')) {
      return { error: formatUnknownFlagError(arg, ALLOWED_FLAGS) };
    } else {
      positional.push(arg);
    }
  }

  const root = resolveSingleRootPathArg({ positional });
  if (root.error) return { error: root.error };
  return {
    rootPath: root.rootPath,
    vault,
    json,
    apply,
    skipImports,
    maxDepth,
    maxFiles,
    threshold,
  };
}

function printPlan(payload) {
  process.stdout.write(
    `${COLORS.bold}index${COLORS.reset} ${COLORS.dim}repo=${payload.rootPath}\n      vault=${payload.vaultRoot}${COLORS.reset}\n\n` +
      `  ${COLORS.bold}plan${COLORS.reset}      ${payload.plan.concepts} concepts · ${payload.plan.suggestedRelations} suggested relations · ${payload.plan.importRelations} import relations\n` +
      `  ${COLORS.bold}validate${COLORS.reset}  ${payload.validation.scanned} files · ${payload.validation.problemFiles} problem files · ${payload.validation.pathDrift} path drift\n\n` +
      `  ${COLORS.bold}meaning${COLORS.reset}   ${payload.meaningGate.businessOntology.domains} domains · ${payload.meaningGate.businessOntology.capabilities} capabilities · ${payload.meaningGate.implementationEvidence.elements} evidence elements\n` +
      `            report business/product domain + capability first; use code rows as implementation evidence\n\n` +
      `${COLORS.dim}side effect 0 — run ${COLORS.reset}${COLORS.bold}ontology-atlas index ${payload.rootPath} --vault ${payload.vaultRoot} --apply${COLORS.reset}${COLORS.dim} to land candidates.${COLORS.reset}\n`,
  );
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  ontology-atlas index [rootPath] [--vault path] [--apply]\n` +
      `                         [--threshold N] [--skip-imports] [--json]\n` +
      `                         [--max-depth N] [--max-files N]\n\n` +
      `${COLORS.bold}What it does:${COLORS.reset}\n` +
      `  Long-running project ontology indexing entrypoint. Default mode is\n` +
      `  side-effect 0: analyze repo structure, infer import edges, validate\n` +
      `  the vault, and print a plan. --apply uses the bootstrap writer pipeline.\n`,
  );
}
