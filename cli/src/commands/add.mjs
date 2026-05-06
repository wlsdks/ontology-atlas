import { resolve, relative } from 'node:path';
import { writeDoc } from '../lib/write-vault.mjs';
import {
  VAULT_KINDS,
  buildFrontmatter,
  defaultBody,
  folderForKind,
  missingExpectedFields,
} from '../lib/schema.mjs';

const COLORS = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

/**
 * R12 #34 — \`oh-my-ontology add <kind> <slug> --title=... [--domain X] [--body "..."] [--vault path]\`
 *
 * 새 ontology 노드 .md 작성. 기존 slug 면 throw (덮어쓰기 절대 안 함 —
 * 사용자 작업 보호). mcp 의 add_concept 과 같은 contract.
 */
export function runAdd(args) {
  const opts = parseArgs(args);
  if (opts.error) {
    process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${opts.error}\n`);
    printAddUsage();
    return 1;
  }

  const { kind, slug: rawSlug, title, domain, body, vault, autoPrefix } = opts;
  const vaultPath = resolve(vault);

  // R12 #37 — opt-in folder prefix (capability → capabilities/foo).
  // 사용자가 이미 prefix 명시 (`capabilities/foo`) 한 경우 두 번 적용 회피.
  // R14 — folder mapping 은 schema.mjs 의 single source 사용 (mcp 와 일치).
  const folder = folderForKind(kind);
  const slug =
    autoPrefix && folder && !rawSlug.startsWith(folder)
      ? `${folder}${rawSlug}`
      : rawSlug;

  // R14 — schema 가 kind 별 양식 (project: domains/capabilities/elements 빈
  // 배열, capability: elements 빈 배열) 자동 채움. AI agent 의 add_concept
  // 과 동일 결과 → 두 진입점이 항상 같은 frontmatter 모양 만든다.
  const fm = buildFrontmatter({ slug, kind, title, domain });

  try {
    const filePath = writeDoc(vaultPath, slug, {
      frontmatter: fm,
      body: body || defaultBody(kind, title),
    });
    const rel = relative(process.cwd(), filePath);
    console.log(
      `${COLORS.green}ok${COLORS.reset}    ${rel}\n` +
        `${COLORS.dim}      ${kind} · ${slug}${domain ? ` · domain=${domain}` : ''}${COLORS.reset}`,
    );
    // schema 의 requiredExtras 누락 (capability/element 의 domain 등) 은
    // advisory warning 으로 출력 — 사용자가 후속에 채울 수 있게.
    const missing = missingExpectedFields(kind, fm);
    for (const key of missing) {
      process.stderr.write(
        `${COLORS.yellow}warn${COLORS.reset}  expected field "${key}" missing for kind "${kind}" — add it later with --domain or by editing the file.\n`,
      );
    }
    // R15 (post-Paravel dogfood) — element + path-style slug + auto-prefix
    // 시 4단계 nested. 의도일 수도 있어 error 아닌 advisory hint.
    // 두 패턴 (flat / path-style) 모두 valid — mcp/README "Element slug —
    // two valid patterns" 참조.
    if (kind === 'element' && autoPrefix && rawSlug.includes('/')) {
      process.stderr.write(
        `${COLORS.cyan}hint${COLORS.reset}  element slug "${rawSlug}" is path-style → nested at "${slug}.md" (4 levels). ` +
          `If the path is intended (concrete code module), keep it. ` +
          `For a flat element (library / abstract concept), use --raw-slug or a non-path slug.\n`,
      );
    }
    return 0;
  } catch (err) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 1;
  }
}

function parseArgs(args) {
  const positional = [];
  // R15 — autoPrefix default on. starter 와 일관된 layout (kind→folder).
  // 명시 opt-out: --raw-slug (or --no-auto-prefix).
  const flags = { vault: '.', autoPrefix: true };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = args[++i] || '.';
    else if (a.startsWith('--vault=')) flags.vault = a.slice('--vault='.length);
    else if (a === '--title') flags.title = args[++i] || '';
    else if (a.startsWith('--title=')) flags.title = a.slice('--title='.length);
    else if (a === '--domain') flags.domain = args[++i] || '';
    else if (a.startsWith('--domain=')) flags.domain = a.slice('--domain='.length);
    else if (a === '--body') flags.body = args[++i] || '';
    else if (a.startsWith('--body=')) flags.body = a.slice('--body='.length);
    else if (a === '--auto-prefix') flags.autoPrefix = true;
    else if (a === '--raw-slug' || a === '--no-auto-prefix') flags.autoPrefix = false;
    else if (a.startsWith('--')) {
      return { error: `unknown flag: ${a}` };
    } else {
      positional.push(a);
    }
  }
  if (positional.length < 2) {
    return { error: 'kind and slug are required' };
  }
  const [kind, slug] = positional;
  if (!VAULT_KINDS.includes(kind)) {
    return {
      error: `unknown kind: ${kind}. one of ${VAULT_KINDS.join(' / ')}`,
    };
  }
  if (!flags.title || flags.title.trim() === '') {
    return { error: '--title is required (non-empty)' };
  }
  return {
    kind,
    slug,
    title: flags.title,
    domain: flags.domain,
    body: flags.body,
    vault: flags.vault,
    autoPrefix: flags.autoPrefix,
  };
}

function printAddUsage() {
  process.stderr.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  oh-my-ontology add <kind> <slug> --title="..." [--domain X] [--body "..."] [--vault path]\n` +
      `\n${COLORS.bold}kind:${COLORS.reset} ${VAULT_KINDS.join(' / ')}\n` +
      `\nExample:\n` +
      `  oh-my-ontology add capability auth/token-issue --title="Token issue" --domain=auth\n`,
  );
}
