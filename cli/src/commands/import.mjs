import { COLORS } from '../lib/colors.mjs';
import { resolve, relative, basename, join, sep } from 'node:path';
import { readFileSync, statSync, readdirSync, existsSync } from 'node:fs';
import { preflightWriteDoc, writeDoc, slugToPath } from '../lib/write-vault.mjs';
import { parseFrontmatter } from '../lib/parse-frontmatter.mjs';
import {
  VAULT_KINDS,
  buildFrontmatter,
  defaultBody,
  folderForKind,
} from '../lib/schema.mjs';
import { formatAllowedValueError } from '../lib/suggestions.mjs';
import { formatUnknownFlagError, parseRequiredFlagValue, parseVaultFlag } from '../lib/cli-args.mjs';
import { recordCliWrite } from '../lib/activity-log.mjs';

const ALLOWED_FLAGS = ['--vault', '--kind', '--auto-prefix', '--raw-slug', '--no-auto-prefix', '--rename', '--dry-run'];


/**
 * `ontology-atlas import <path...> [--vault X] [--kind K] [--raw-slug]
 * [--rename] [--dry-run]`
 *
 * Lands external markdown inside the vault. This is the last piece of the promise
 * that an agent (`add_concept`) and a user (`add`) leave only `.md` built from the
 * same schema on disk: a document received from elsewhere is normalised to that
 * same schema before it is fixed in the vault.
 *
 * Flow, per file:
 *   1. read raw → parseFrontmatter
 *   2. kind: input.kind → --kind → skip (no kind means it cannot be imported)
 *   3. slug: input.slug → file basename (extension dropped)
 *      with --auto-prefix, folderForKind(kind) is prepended (never twice)
 *   4. title: input.title → the body's first H1 → slug
 *   5. frontmatter normalisation: buildFrontmatter applies the schema's
 *      arrayDefaults and preserves the input's other keys (depends_on, relates,
 *      status, user-defined, …)
 *   6. conflict: an existing slug in the vault skips with a warning, or with
 *      --rename becomes -2/-3/…
 *   7. body: the input body, or the schema's starter when it is empty
 *   8. writeDoc — a dry run changes nothing on disk
 */
export async function runImport(args) {
  const opts = parseArgs(args);
  if (opts.help) {
    printImportUsage(process.stdout);
    return 0;
  }
  if (opts.error) {
    process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${opts.error}\n`);
    printImportUsage();
    return 1;
  }
  const vaultPath = resolve(opts.vault);
  if (!existsSync(vaultPath)) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  vault path does not exist: ${vaultPath}\n`,
    );
    return 1;
  }

  const sources = collectMarkdownFiles(opts.paths);
  if (sources.length === 0) {
    process.stderr.write(
      `${COLORS.yellow}warn${COLORS.reset}  no markdown files found from given paths\n`,
    );
    return 1;
  }

  // Tracked cumulatively so two inputs in one batch cannot collide on a slug: both
  // the existing slugs on disk and the ones already imported in this batch count.
  const claimedSlugs = new Set();
  const claimedUids = new Map();
  const summary = { imported: 0, skipped: 0, conflicts: 0, kindless: 0 };
  let firstError = null;

  for (const src of sources) {
    const result = importOne(src, vaultPath, opts, claimedSlugs, claimedUids);
    switch (result.status) {
      case 'imported':
      case 'would-import':
        summary.imported += 1;
        claimedSlugs.add(result.slug);
        for (const uid of result.uidClaims) claimedUids.set(uid, src);
        process.stdout.write(
          `${COLORS.green}${result.status === 'would-import' ? 'plan' : 'ok  '}${COLORS.reset}  ${relative(process.cwd(), src)}\n` +
            `${COLORS.dim}      → ${result.kind} · ${result.slug}${COLORS.reset}\n`,
        );
        // Only what actually landed on disk is logged (a dry run's would-import is not).
        if (result.status === 'imported') {
          await recordCliWrite(vaultPath, {
            tool: 'cli:import',
            target: result.slug,
            summary: `import ${result.kind}:${result.slug}`,
          });
        }
        break;
      case 'kindless':
        summary.kindless += 1;
        process.stderr.write(
          `${COLORS.yellow}skip${COLORS.reset}  ${relative(process.cwd(), src)}: no kind in frontmatter and no --kind fallback\n`,
        );
        break;
      case 'conflict':
        summary.conflicts += 1;
        process.stderr.write(
          `${COLORS.yellow}skip${COLORS.reset}  ${relative(process.cwd(), src)}: slug already exists in vault: ${result.slug} (use --rename to write under a fresh slug)\n`,
        );
        break;
      case 'error':
        summary.skipped += 1;
        firstError = firstError ?? result.error;
        process.stderr.write(
          `${COLORS.red}error${COLORS.reset}  ${relative(process.cwd(), src)} · ${result.error}\n`,
        );
        break;
    }
  }

  const verb = opts.dryRun ? 'would import' : 'imported';
  process.stdout.write(
    `\n${COLORS.bold}${verb} ${summary.imported}${COLORS.reset}` +
      ` · skipped ${summary.skipped + summary.conflicts + summary.kindless}` +
      ` (${summary.kindless} kindless · ${summary.conflicts} conflicts · ${summary.skipped} errors)\n`,
  );

  // Exit code: 1 when zero files were imported (or planned, in a dry run) —
  // intending an import and having nothing happen is an explicit failure. Partial
  // success (some imported, some conflicting or kindless) exits 0, so a CI gate of
  // the "at least one" shape is easy to write.
  void firstError; // kept for a future --strict mode that surfaces the first error message
  if (summary.imported === 0) return 1;
  return 0;
}

function importOne(srcPath, vaultPath, opts, claimedSlugs, claimedUids) {
  let raw;
  try {
    raw = readFileSync(srcPath, 'utf-8');
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : String(err) };
  }
  const parsed = parseFrontmatter(raw);
  const inputFm = parsed.frontmatter || {};
  const inputBody = parsed.body || '';

  const kind =
    typeof inputFm.kind === 'string' && inputFm.kind.trim()
      ? inputFm.kind.trim()
      : opts.kind || null;
  if (!kind) {
    return { status: 'kindless' };
  }
  if (!VAULT_KINDS.includes(kind)) {
    return {
      status: 'error',
      error: formatAllowedValueError('kind', kind, VAULT_KINDS),
    };
  }

  const baseSlug =
    typeof inputFm.slug === 'string' && inputFm.slug.trim()
      ? inputFm.slug.trim()
      : basename(srcPath, '.md');

  const folder = folderForKind(kind);
  let candidateSlug =
    opts.autoPrefix && folder && !baseSlug.startsWith(folder)
      ? `${folder}${baseSlug}`
      : baseSlug;

  // Conflict, on disk or within this batch — --rename sidesteps it as -2, -3, ….
  if (slugTaken(vaultPath, candidateSlug, claimedSlugs)) {
    if (opts.rename) {
      candidateSlug = nextFreeSlug(vaultPath, candidateSlug, claimedSlugs);
    } else {
      return { status: 'conflict', slug: candidateSlug };
    }
  }

  const title =
    typeof inputFm.title === 'string' && inputFm.title.trim()
      ? inputFm.title.trim()
      : extractFirstH1(inputBody) || baseSlug;

  // Schema normalisation, preserving the input's other keys (depends_on, relates,
  // user-defined). slug/kind/title are overwritten with our decided values:
  // buildFrontmatter's ...extras already takes every input key, so the new values
  // are spread last.
  let fm;
  try {
    fm = buildFrontmatter({
      ...inputFm,
      slug: candidateSlug,
      kind,
      title,
    });
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : String(err) };
  }

  const body = inputBody.trim() === '' ? defaultBody(kind, title) : inputBody;

  const uidClaims = [fm.uid, ...(Array.isArray(fm.merged_uids) ? fm.merged_uids : [])];
  for (const uid of uidClaims) {
    const owner = claimedUids.get(uid);
    if (owner) {
      return {
        status: 'error',
        error: `UID collision: ${uid} is already claimed by another input in this import batch (${owner}).`,
      };
    }
  }

  try {
    preflightWriteDoc(vaultPath, candidateSlug, fm);
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : String(err) };
  }

  if (opts.dryRun) {
    return { status: 'would-import', slug: candidateSlug, kind, uidClaims };
  }

  try {
    writeDoc(vaultPath, candidateSlug, { frontmatter: fm, body });
    return { status: 'imported', slug: candidateSlug, kind, uidClaims };
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : String(err) };
  }
}

function slugTaken(vaultPath, slug, claimedSlugs) {
  if (claimedSlugs.has(slug)) return true;
  try {
    const path = slugToPath(vaultPath, slug);
    return existsSync(path);
  } catch {
  // A slug pointing outside the vault makes slugToPath throw — that is an invalid
  // slug, not a conflict. Returning true blocks it so the caller raises an error.
    return true;
  }
}

function nextFreeSlug(vaultPath, baseSlug, claimedSlugs) {
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${baseSlug}-${n}`;
    if (!slugTaken(vaultPath, candidate, claimedSlugs)) return candidate;
  }
  // Reaching 999 collisions means the user's environment is abnormal; return the
  // base unchanged so the caller gets a clear error from the final writeDoc.
  return baseSlug;
}

function extractFirstH1(body) {
  const lines = body.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ')) {
      return trimmed.slice(2).trim();
    }
  }
  return null;
}

/**
 * Collects `.md` files from the input paths (files or directories), walking
 * directories recursively. Dotfile directories (.git, node_modules) are skipped —
 * importing the `.md` inside them is too dangerous to assume was intended.
 */
function collectMarkdownFiles(paths) {
  const out = new Set();
  for (const p of paths) {
    const abs = resolve(p);
    if (!existsSync(abs)) continue;
    const stat = statSync(abs);
    if (stat.isFile()) {
      if (abs.endsWith('.md')) out.add(abs);
      continue;
    }
    if (stat.isDirectory()) {
      walkMarkdown(abs, out);
    }
  }
  return [...out].sort();
}

function walkMarkdown(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    // Directory ingestion is a bounded walk of the tree the user selected.
    // Dirent reports symlinks as neither files nor directories, so nested links
    // cannot escape that tree or create recursive traversal loops.
    if (entry.isDirectory()) {
      walkMarkdown(full, out);
    } else if (entry.isFile() && full.endsWith('.md')) {
      out.add(full);
    }
  }
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const positional = [];
  // autoPrefix defaults on, for a layout consistent with the starter (kind→folder).
  // Explicit opt-out: --raw-slug (or --no-auto-prefix).
  const flags = {
    vault: null,
    kind: null,
    autoPrefix: true,
    rename: false,
    dryRun: false,
  };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--kind') flags.kind = parseRequiredFlagValue('--kind', args[++i]);
    else if (a.startsWith('--kind=')) flags.kind = parseRequiredFlagValue('--kind', a.slice('--kind='.length));
    else if (a === '--auto-prefix') flags.autoPrefix = true;
    else if (a === '--raw-slug' || a === '--no-auto-prefix') flags.autoPrefix = false;
    else if (a === '--rename') flags.rename = true;
    else if (a === '--dry-run') flags.dryRun = true;
    else if (a.startsWith('-')) {
      return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    } else {
      positional.push(a);
    }
  }
  if (positional.length === 0) {
    return { error: '필수 인자: import 할 .md 파일 또는 디렉토리 1 개 이상' };
  }
  if (flags.vault === false) return { error: '--vault requires a path' };
  for (const value of Object.values(flags)) {
    if (value instanceof Error) return { error: value.message };
  }
  if (flags.kind && !VAULT_KINDS.includes(flags.kind)) {
    return {
      error: formatAllowedValueError('--kind', flags.kind, VAULT_KINDS),
    };
  }
  return {
    paths: positional,
    vault: flags.vault || '.',
    kind: flags.kind,
    autoPrefix: flags.autoPrefix,
    rename: flags.rename,
    dryRun: flags.dryRun,
  };
}

function printImportUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  ontology-atlas import <path...> [--vault path] [--kind K] [--raw-slug] [--rename] [--dry-run]\n` +
      `\n` +
      `  외부 .md 파일을 vault 안으로 정착. frontmatter 의 kind/slug/title 을 우선 사용,\n` +
      `  없는 부분만 --kind 또는 파일명/첫 H1 으로 보완. schema 가 kind 별 양식 (project 의\n` +
      `  domains/capabilities/elements 빈 배열 등) 을 자동 채움.\n` +
      `\n${COLORS.bold}options:${COLORS.reset}\n` +
      `  --vault path    target vault (default: cwd)\n` +
      `  --kind K        fallback kind when input frontmatter has no kind\n` +
      `  --raw-slug      opt out of default kind folder prefix (capability → capabilities/)\n` +
      `  --rename        slug 가 vault 에 이미 있으면 -2 / -3 ... 으로 자동 회피\n` +
      `  --dry-run       디스크 변경 없이 import 계획만 출력\n` +
      `\n${COLORS.bold}examples:${COLORS.reset}\n` +
      `  ontology-atlas import ~/notes/auth.md --vault . --kind capability\n` +
      `  ontology-atlas import ./incoming/ --vault . --rename --dry-run\n`,
  );
}

// Explicit use so ESLint does not flag it as dead code (sep is future-proofing for log path normalisation).
void sep;
