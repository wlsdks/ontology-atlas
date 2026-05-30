import { COLORS } from '../lib/colors.mjs';
import { resolve, relative, basename, join, sep } from 'node:path';
import { readFileSync, statSync, readdirSync, existsSync } from 'node:fs';
import { writeDoc, slugToPath } from '../lib/write-vault.mjs';
import { parseFrontmatter } from '../lib/parse-frontmatter.mjs';
import {
  VAULT_KINDS,
  buildFrontmatter,
  defaultBody,
  folderForKind,
} from '../lib/schema.mjs';
import { formatAllowedValueError } from '../lib/suggestions.mjs';
import { formatUnknownFlagError, parseRequiredFlagValue, parseVaultFlag } from '../lib/cli-args.mjs';

const ALLOWED_FLAGS = ['--vault', '--kind', '--auto-prefix', '--raw-slug', '--no-auto-prefix', '--rename', '--dry-run'];


/**
 * R14 — `oh-my-ontology import <path...> [--vault X] [--kind K] [--raw-slug]
 * [--rename] [--dry-run]`
 *
 * 외부 markdown 파일을 vault 안으로 정착. AI agent (`add_concept`) 와 사용자
 * (`add`) 가 같은 schema 로 만들어진 .md 만 디스크에 남기는 약속의 마지막
 * 조각 — 외부에서 받은 양식도 같은 schema 로 normalize 후 vault 안에 고정.
 *
 * 처리 흐름 (파일 1개 기준):
 *   1. raw 읽기 → parseFrontmatter
 *   2. kind 결정: input.kind → --kind → skip (kind 없으면 import 불가)
 *   3. slug 결정: input.slug → 파일 basename (확장자 제외)
 *      --auto-prefix 면 folderForKind(kind) prepend (이미 prefix 들면 두 번 X)
 *   4. title: input.title → body 의 첫 H1 → slug
 *   5. frontmatter 정규화: buildFrontmatter — schema 의 arrayDefaults 적용,
 *      input 의 다른 키 (depends_on / relates / status / 사용자 정의 …) 보존
 *   6. 충돌: vault 에 같은 slug 면 skip + warn, 또는 --rename 시 -2/-3/...
 *   7. body: input body 보존, 비어 있으면 schema 의 starter
 *   8. writeDoc — dry-run 시 디스크 변경 0
 */
export function runImport(args) {
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

  // 같은 batch 안에서 두 입력이 같은 slug 로 충돌하지 않도록 누적 추적.
  // disk 의 기존 slug + 이번 배치에서 이미 import 한 slug 둘 다 본다.
  const claimedSlugs = new Set();
  const summary = { imported: 0, skipped: 0, conflicts: 0, kindless: 0 };
  let firstError = null;

  for (const src of sources) {
    const result = importOne(src, vaultPath, opts, claimedSlugs);
    switch (result.status) {
      case 'imported':
      case 'would-import':
        summary.imported += 1;
        claimedSlugs.add(result.slug);
        process.stdout.write(
          `${COLORS.green}${result.status === 'would-import' ? 'plan' : 'ok  '}${COLORS.reset}  ${relative(process.cwd(), src)}\n` +
            `${COLORS.dim}      → ${result.kind} · ${result.slug}${COLORS.reset}\n`,
        );
        break;
      case 'kindless':
        summary.kindless += 1;
        process.stderr.write(
          `${COLORS.yellow}skip${COLORS.reset}  ${relative(process.cwd(), src)} — no kind in frontmatter and no --kind fallback\n`,
        );
        break;
      case 'conflict':
        summary.conflicts += 1;
        process.stderr.write(
          `${COLORS.yellow}skip${COLORS.reset}  ${relative(process.cwd(), src)} — slug already exists in vault: ${result.slug} (use --rename to write under a fresh slug)\n`,
        );
        break;
      case 'error':
        summary.skipped += 1;
        firstError = firstError ?? result.error;
        process.stderr.write(
          `${COLORS.red}error${COLORS.reset}  ${relative(process.cwd(), src)} — ${result.error}\n`,
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

  // exit code: 실제 import (또는 dry-run plan) 이 0 건이면 1 — 사용자가
  // import 의도였는데 아무것도 안 일어난 상황은 명시적 실패로 본다.
  // 부분 성공 (일부 imported + 일부 conflict/kindless) 은 0 으로 — 사용자가
  // CI 에서 "최소 하나라도" 같은 게이트를 만들기 쉽게.
  void firstError; // future-proof: 첫 에러 메시지를 후속 PR 의 --strict mode 에 활용
  if (summary.imported === 0) return 1;
  return 0;
}

function importOne(srcPath, vaultPath, opts, claimedSlugs) {
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

  // 충돌 (디스크 + 같은 배치 내) — --rename 이면 -2, -3 ... 으로 회피.
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

  // schema 정규화 — input 의 다른 키 (depends_on / relates / 사용자 정의)
  // 도 함께 보존. slug/kind/title 은 우리 결정값으로 덮어씌움.
  // buildFrontmatter 의 ...extras 가 이미 input 의 모든 키를 받으니
  // 명시적으로 새 값을 마지막에 spread.
  const fm = buildFrontmatter({
    ...inputFm,
    slug: candidateSlug,
    kind,
    title,
  });

  const body = inputBody.trim() === '' ? defaultBody(kind, title) : inputBody;

  if (opts.dryRun) {
    return { status: 'would-import', slug: candidateSlug, kind };
  }

  try {
    writeDoc(vaultPath, candidateSlug, { frontmatter: fm, body });
    return { status: 'imported', slug: candidateSlug, kind };
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
    // slug 가 vault 바깥을 가리키면 slugToPath 가 throw — 이건 conflict 가
    // 아니라 invalid slug. 호출자가 error 로 처리할 수 있게 true 로 막음.
    return true;
  }
}

function nextFreeSlug(vaultPath, baseSlug, claimedSlugs) {
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${baseSlug}-${n}`;
    if (!slugTaken(vaultPath, candidate, claimedSlugs)) return candidate;
  }
  // 999 collision 까지 가면 사용자 환경이 비정상 — base 그대로 return 해
  // 호출자가 final writeDoc 실패에서 명확한 에러 받게.
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
 * input 경로 (파일 또는 디렉토리) 들에서 .md 들을 모은다. 디렉토리면
 * 재귀 walk. dotfile 디렉토리 (.git, node_modules) 는 skip — 사용자가
 * 의도적으로 그 안의 .md 까지 import 하기엔 너무 위험.
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
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.') || entry === 'node_modules') continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walkMarkdown(full, out);
    } else if (stat.isFile() && full.endsWith('.md')) {
      out.add(full);
    }
  }
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const positional = [];
  // R15 — autoPrefix default on. starter 와 일관된 layout (kind→folder).
  // 명시 opt-out: --raw-slug (or --no-auto-prefix).
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
      `  oh-my-ontology import <path...> [--vault path] [--kind K] [--raw-slug] [--rename] [--dry-run]\n` +
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
      `  oh-my-ontology import ~/notes/auth.md --vault . --kind capability\n` +
      `  oh-my-ontology import ./incoming/ --vault . --rename --dry-run\n`,
  );
}

// ESLint dead-code 차단 (sep 은 future-proof — 로깅 path 정규화용). 명시적 use.
void sep;
