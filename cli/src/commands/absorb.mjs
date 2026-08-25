// Slice 0 — `ontology-atlas absorb <file...> [--vault X] [--write]`
//
// The "absorption tool" — the single spine (docs/plans/PRODUCT-PLAN-2026-07.md §4/§9).
// Converts a CLAUDE.md/AGENTS.md-style markdown file into typed vault nodes
// so a tech lead's existing agent-instruction file stops needing dual
// maintenance: the original stays authoritative for what the tool could not
// confidently absorb, and the vault becomes the source of truth for the
// sections it could.
//
// Default = dry-run: prints the conversion plan only, touches no files.
// `--write` actually lands the plan:
//   1. rule/policy/decision sections → `kind: document` nodes (`role: policy`)
//      via the same schema + write-vault path `add`/`import` use.
//   2. architecture/component sections are reported as SUGGESTIONS only —
//      never auto-written (they need a human decision on capability vs
//      element vs domain placement).
//   3. injection-suspect sections (Tier 1, see absorb.mjs) are excluded from
//      absorption regardless of category.
//   4. the source file is backed up to `<file>.pre-absorb.bak`, then
//      rewritten into a slim pointer that preserves every unabsorbed section
//      verbatim — content is never destroyed.
//
// Core logic (splitting/classification/injection/plan) lives in
// `../lib/absorb.mjs` — mirrored at `mcp/src/absorb.mjs` for the
// `absorb_document` MCP tool, kept in lock-step by
// `tests/contract/absorb.contract.test.ts`.

import { COLORS } from '../lib/colors.mjs';
import { resolve, basename, relative } from 'node:path';
import {
  existsSync,
  lstatSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { writeDoc, slugToPath } from '../lib/write-vault.mjs';
import { buildFrontmatter } from '../lib/schema.mjs';
import { buildAbsorptionPlan, buildSlimPointer } from '../lib/absorb.mjs';
import { formatUnknownFlagError, parseVaultFlag } from '../lib/cli-args.mjs';
import { stampAbsorbWriteCompleted } from '../lib/telemetry.mjs';

const ALLOWED_FLAGS = ['--vault', '--write'];
const BACKUP_SUFFIX = '.pre-absorb.bak';

export function runAbsorb(args) {
  const opts = parseArgs(args);
  if (opts.help) {
    printUsage(process.stdout);
    return 0;
  }
  if (opts.error) {
    process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${opts.error}\n`);
    printUsage();
    return 1;
  }
  const vaultPath = resolve(opts.vault);
  if (!existsSync(vaultPath)) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  vault path does not exist: ${vaultPath}\n`,
    );
    return 1;
  }

  let exitCode = 0;
  const totals = { files: 0, absorbed: 0, suggested: 0, injectionSuspect: 0, unclassified: 0 };

  for (const rawPath of opts.paths) {
    const filePath = resolve(rawPath);
    if (!existsSync(filePath)) {
      process.stderr.write(
        `${COLORS.red}error${COLORS.reset}  file does not exist: ${relative(process.cwd(), filePath)}\n`,
      );
      exitCode = 1;
      continue;
    }
    let sourceMode;
    if (opts.write) {
      const sourceStat = lstatSync(filePath);
      if (sourceStat.isSymbolicLink()) {
        process.stderr.write(
          `${COLORS.red}error${COLORS.reset}  refusing to rewrite a symbolic link source: ` +
            `${relative(process.cwd(), filePath)}\n`,
        );
        exitCode = 1;
        continue;
      }
      sourceMode = sourceStat.mode & 0o777;
      if (!sourceStat.isFile()) {
        process.stderr.write(
          `${COLORS.red}error${COLORS.reset}  source is not a regular file: ` +
            `${relative(process.cwd(), filePath)}\n`,
        );
        exitCode = 1;
        continue;
      }
    }

    const raw = readFileSync(filePath, 'utf-8');
    const sourceLabel = basename(filePath).replace(/\.md$/i, '');
    const plan = buildAbsorptionPlan(raw, {
      sourceLabel,
      isSlugTaken: (slug) => existsSync(slugToPath(vaultPath, slug)),
    });

    printPlanReport(filePath, plan);
    totals.files += 1;
    totals.absorbed += plan.summary.absorbed;
    totals.suggested += plan.summary.suggested;
    totals.injectionSuspect += plan.summary.injectionSuspect;
    totals.unclassified += plan.summary.unclassified;

    if (!opts.write) continue;

    const backupPath = `${filePath}${BACKUP_SUFFIX}`;
    if (existsSync(backupPath)) {
      process.stderr.write(
        `${COLORS.red}error${COLORS.reset}  backup already exists, refusing to overwrite: ` +
          `${relative(process.cwd(), backupPath)}: remove or rename it first\n`,
      );
      exitCode = 1;
      continue;
    }

    for (const section of plan.sections) {
      if (section.action !== 'absorb') continue;
      const fm = buildFrontmatter({
        slug: section.targetSlug,
        kind: 'document',
        title: section.targetTitle,
        role: 'policy',
        source: relative(vaultPath, filePath),
      });
      const body = `# ${section.targetTitle}\n\n${section.body}\n`;
      writeDoc(vaultPath, section.targetSlug, { frontmatter: fm, body });
    }

    // Backup *after* the vault writes succeed — if a write throws above, the
    // original file is left untouched and the user can re-run safely.
    const pointer = buildSlimPointer(plan);
    writeFileSync(backupPath, raw, { encoding: 'utf-8', flag: 'wx', mode: sourceMode });
    const pointerTempPath = `${filePath}.ontology-atlas-${process.pid}-${randomUUID()}.tmp`;
    try {
      writeFileSync(pointerTempPath, pointer, {
        encoding: 'utf-8',
        flag: 'wx',
        mode: sourceMode,
      });
      // rename replaces the path entry itself. If an attacker swaps the source
      // to a symlink after the lstat gate, this cannot follow and overwrite the
      // link target the way writeFileSync(filePath) would.
      renameSync(pointerTempPath, filePath);
    } catch (error) {
      try {
        unlinkSync(pointerTempPath);
      } catch {
        // The temp may not have been created, or rename may already have consumed it.
      }
      throw error;
    }

    // Slice 0 magic-moment instrumentation (PRODUCT-PLAN-2026-07.md §4/§9) —
    // local-only baseline for "vault worth asking" (see lib/telemetry.mjs).
    stampAbsorbWriteCompleted(vaultPath);

    process.stdout.write(
      `${COLORS.green}written${COLORS.reset}  ${plan.summary.absorbed} node(s) · ` +
        `backup ${relative(process.cwd(), backupPath)} · ` +
        `source rewritten as slim pointer\n\n`,
    );
  }

  process.stdout.write(
    `${COLORS.bold}${totals.files} file(s)${COLORS.reset} · ` +
      `${totals.absorbed} absorbed · ${totals.suggested} suggested · ` +
      `${totals.injectionSuspect} injection-suspect · ${totals.unclassified} unclassified\n`,
  );
  if (!opts.write && totals.files > 0) {
    process.stdout.write(`${COLORS.dim}(dry-run: pass --write to actually land the plan)${COLORS.reset}\n`);
  }

  return exitCode;
}

function printPlanReport(filePath, plan) {
  process.stdout.write(
    `\n${COLORS.bold}${relative(process.cwd(), filePath)}${COLORS.reset} ` +
      `${COLORS.dim}(${plan.summary.total} sections)${COLORS.reset}\n`,
  );
  for (const section of plan.sections) {
    process.stdout.write(`  ${formatSectionLine(section)}\n`);
  }
}

function formatSectionLine(section) {
  if (section.injection.suspect) {
    const patterns = section.injection.matches.map((m) => m.pattern).join(', ');
    return (
      `${COLORS.red}⚠ injection-suspect${COLORS.reset}  ${section.heading} ` +
      `${COLORS.dim}· matched: ${patterns} (excluded from absorption)${COLORS.reset}`
    );
  }
  if (section.action === 'absorb') {
    return (
      `${COLORS.green}absorb${COLORS.reset}   [${section.confidence.toFixed(2)}]  ${section.heading} ` +
      `${COLORS.dim}→ document · role: policy · ${section.targetSlug}${COLORS.reset}`
    );
  }
  if (section.action === 'suggest') {
    return (
      `${COLORS.cyan}suggest${COLORS.reset}  [${section.confidence.toFixed(2)}]  ${section.heading} ` +
      `${COLORS.dim}→ candidate ${section.kind} · ${section.targetSlug} (not written)${COLORS.reset}`
    );
  }
  return `${COLORS.dim}skip     ${section.heading} · ${section.reason}${COLORS.reset}`;
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const positional = [];
  const flags = { vault: null, write: false };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--write') flags.write = true;
    else if (a.startsWith('-')) {
      return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    } else {
      positional.push(a);
    }
  }
  if (positional.length === 0) {
    return { error: 'required argument: at least one .md file to absorb' };
  }
  if (flags.vault === false) return { error: '--vault requires a path' };
  for (const value of Object.values(flags)) {
    if (value instanceof Error) return { error: value.message };
  }
  return {
    paths: positional,
    vault: flags.vault || '.',
    write: flags.write,
  };
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  ontology-atlas absorb <file...> [--vault path] [--write]\n` +
      `\n` +
      `  Turn CLAUDE.md / AGENTS.md style markdown into typed vault nodes. The default\n` +
      `  is a dry run: it prints the conversion plan and leaves the disk alone. With\n` +
      `  --write, policy and rule sections are written as document nodes, and the\n` +
      `  original is rewritten as a slim pointer holding an absorption summary plus the\n` +
      `  verbatim text of whatever was not absorbed (the original is backed up to\n` +
      `  .pre-absorb.bak).\n` +
      `  Architecture and component sections are proposed as candidates only; they are\n` +
      `  never written automatically.\n` +
      `  A section suspected of injection (Tier 1) is excluded from absorption and stays\n` +
      `  verbatim in the pointer.\n` +
      `\n${COLORS.bold}options:${COLORS.reset}\n` +
      `  --vault path    target vault (default: cwd)\n` +
      `  --write         write to the vault and rewrite the original as a slim pointer\n` +
      `\n${COLORS.bold}examples:${COLORS.reset}\n` +
      `  ontology-atlas absorb AGENTS.md --vault .\n` +
      `  ontology-atlas absorb CLAUDE.md --vault . --write\n`,
  );
}
