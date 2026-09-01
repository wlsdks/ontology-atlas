// `ontology-atlas bootstrap [rootPath]`
//
// A one-line review plan. Returns the analyzer's proposed nodes and containment as
// review candidates. Writing a meaning node uses only the MCP path, which unlocks
// on constructionQualification:v1 plus human acceptance — a CLI cold start must
// not build a semantic graph without approval.
//
// Flow:
//   1. analyze_repo_structure → review-only candidates
//   2. infer_imports → exact evidence + rationale review required (zero writes)
//   3. combined review summary (landed 0, explicit approval required)
//
// Options:
//   --vault path             vault location (default cwd)
//   --max-depth N            analyze folder depth
//   --max-files N            infer-imports file cap
//   --threshold N            blocks weak infer-imports edges (no default)
//   --skip-imports           stage 1 (analyze) only — the import graph is untouched
//   --json                   machine-readable output (every stage in one JSON)
//
// exit: 3 if semantic approval is required, 1 on input errors, 2 on MCP failure.

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
    analyzeResult = await callMcpTool(
      vaultRoot,
      'analyze_repo_structure',
      { rootPath: target, maxDepth: parsed.maxDepth },
      { repoRoot: target },
    );
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
      importsResult = await callMcpTool(
        vaultRoot,
        'infer_imports',
        { rootPath: target, maxFiles: parsed.maxFiles },
        { repoRoot: target },
      );
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
 * Separates domains that appeared only in a README heading from domains the code
 * structure corroborates.
 *
 * **Why** (field review 2026-08-08 — attunegraph, 113 TS files, a flat `src`):
 * analyze's README H2 heuristic carried a hand-sewn stopword sieve, and a sieve
 * loses structurally — every new README invents a heading the list does not know.
 * Measured: 「Quick start **from source**」 (evading the exact match), 「Current
 * measured baseline」, and 「Benchmarks and verification」 all passed, so **11
 * document sections landed as domains**, and the result was a star graph with a
 * single relation type. In that star the hub amber reached a test fixture and
 * contaminated the workbench's first recommendation — garbage flows downstream
 * with confidence.
 *
 * So instead of sewing the sieve wider, **corroboration decides**: a candidate is
 * corroborated when it came from the code (directory evidence), or when another
 * code-derived candidate names it as a parent. A domain that exists only in the
 * README is **left as a review candidate rather than planted automatically** —
 * the same principle bootstrap already applies at the import stage. The old
 * behaviour remains available via `--apply-readme-domains`.
 */
export function partitionReadmeOnlyDomains(analyzeResult) {
  const domains = analyzeResult.domains ?? [];
  const isReadmeSource = (src) => typeof src === 'string' && /^readme(\.(md|rst))?$/i.test(src);
  // A domain named as a parent by a code-derived candidate is corroborated
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
      `  A one-line review plan. It writes no semantic node; it returns analyzer\n` +
      `  candidates and exact-evidence import candidates only. constructionQualification:v1\n` +
      `  plus human acceptance plus an unchanged writePlan are released solely by the\n` +
      `  connected MCP lifecycle. Every cold-start run is approval_required (exit 3).\n\n` +
      `  A domain seen only in a README heading is left as a review candidate rather\n` +
      `  than planted -- it lands only when the code structure backs it, or under\n` +
      `  --apply-readme-domains.\n` +
      `  --max-depth N: analyze folder walk default 2, range 0-${MAX_DEPTH_CAP}.\n` +
      `  --max-files N: import walk default 5000, max ${MAX_FILES_CAP} hard stop.\n\n` +
      `${COLORS.bold}Examples:${COLORS.reset}\n` +
      `  ontology-atlas bootstrap                       # cwd → cwd vault\n` +
      `  ontology-atlas bootstrap ~/my-app --vault .    # analyze another repo\n` +
      `  ontology-atlas bootstrap --threshold 3         # block weak imports\n` +
      `  ontology-atlas bootstrap --skip-imports        # nodes only (stage 1)\n` +
      `  ontology-atlas bootstrap --reapply             # accepted for compatibility; still review-only\n` +
      `  ontology-atlas bootstrap --json                # machine readable\n`,
  );
}
