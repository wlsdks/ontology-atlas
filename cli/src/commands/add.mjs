import { COLORS } from '../lib/colors.mjs';
import { resolve, relative } from 'node:path';
import { writeDoc } from '../lib/write-vault.mjs';
import {
  VAULT_KINDS,
  buildFrontmatter,
  defaultBody,
  folderForKind,
  missingExpectedFields,
  agentCreatedBy,
  CREATED_BY_KEY,
  CREATED_BY_HUMAN,
  CREATED_BY_AGENT_PREFIX,
} from '../lib/schema.mjs';
import { formatAllowedValueError } from '../lib/suggestions.mjs';
import { formatUnknownFlagError, parseRawRequiredFlagValue, parseVaultFlag } from '../lib/cli-args.mjs';
import { readHeartbeatAgentName, recordCliWrite } from '../lib/activity-log.mjs';

const ALLOWED_FLAGS = ['--vault', '--title', '--domain', '--path', '--body', '--auto-prefix', '--raw-slug', '--no-auto-prefix', '--created-by'];


/**
 * R12 #34 — \`ontology-atlas add <kind> <slug> --title=... [--domain X] [--path repo/path] [--body "..."] [--vault path]\`
 *
 * 새 ontology 노드 .md 작성. 기존 slug 면 throw (덮어쓰기 절대 안 함 —
 * 사용자 작업 보호). mcp 의 add_concept 과 같은 contract.
 */
export async function runAdd(args) {
  const opts = parseArgs(args);
  if (opts.help) {
    printAddUsage(process.stdout);
    return 0;
  }
  if (opts.error) {
    process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${opts.error}\n`);
    printAddUsage();
    return 1;
  }

  const { kind, slug: rawSlug, title, domain, path, body, vault, autoPrefix } = opts;
  const vaultPath = resolve(vault);

  // R15 — default folder prefix (capability → capabilities/foo).
  // 사용자가 이미 prefix 명시 (`capabilities/foo`) 한 경우 두 번 적용 회피.
  // R14 — folder mapping 은 schema.mjs 의 single source 사용 (mcp 와 일치).
  const folder = folderForKind(kind);
  const slug =
    autoPrefix && folder && !rawSlug.startsWith(folder)
      ? `${folder}${rawSlug}`
      : rawSlug;

  // 저작 출처 (2026-08-01 원장 — 「CLI 도 MCP 와 같은 문」). MCP add_concept
  // 은 호출 경로가 에이전트임을 증명해 `agent:<heartbeat|unknown>` 을 찍는데
  // CLI add 는 아무것도 안 찍었다 — 에이전트가 편한 문(CLI)을 고르면 출처
  // 없는 노드가 나오는 구멍. 두 문을 같게 만든다: 기본값은 MCP 와 동일하게
  // heartbeat 신원 기반 `agent:*`, 사람이 직접 칠 때는 `--created-by human`.
  const createdBy =
    opts.createdBy ?? agentCreatedBy(await readHeartbeatAgentName(vaultPath));

  // R14 — schema 가 kind 별 양식 (project: domains/capabilities/elements 빈
  // 배열, capability: elements 빈 배열) 자동 채움. AI agent 의 add_concept
  // 과 동일 결과 → 두 진입점이 항상 같은 frontmatter 모양 만든다.
  const fm = buildFrontmatter({ slug, kind, title, domain, path, [CREATED_BY_KEY]: createdBy });

  try {
    const filePath = writeDoc(vaultPath, slug, {
      frontmatter: fm,
      body: body === undefined ? defaultBody(kind, title) : body,
    });
    const rel = relative(process.cwd(), filePath);
    console.log(
      `${COLORS.green}ok${COLORS.reset}    ${rel}\n` +
        `${COLORS.dim}      ${kind} · ${slug}${domain ? ` · domain=${domain}` : ''}${COLORS.reset}`,
    );
    // P2-① — 성공한 쓰기만 로컬 감사 로그에 (dry-run 없음, 실패는 catch 로 빠짐).
    await recordCliWrite(vaultPath, {
      tool: 'cli:add',
      target: slug,
      summary: `add ${kind}:${slug}`,
    });
    // schema 의 requiredExtras 누락 (capability/element 의 domain 등) 은
    // advisory warning 으로 출력 — 사용자가 후속에 채울 수 있게.
    const missing = missingExpectedFields(kind, fm);
    for (const key of missing) {
      process.stderr.write(
        `${COLORS.yellow}warn${COLORS.reset}  expected field "${key}" missing for kind "${kind}": add it later with --domain or by editing the file.\n`,
      );
    }
    // [폐기 2026-08-01] 구 R15 「element slug 두 패턴(flat / path-style)」
    // 안내는 여기 있었다 — 경로형 슬러그는 이제 writeDoc 의 flatSlugIssue
    // 게이트가 hard error 로 거부한다 (docs/DECISIONS.md 「슬러그는 평평한
    // 식별자다」).
    return 0;
  } catch (err) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 1;
  }
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const positional = [];
  // R15 — autoPrefix default on. starter 와 일관된 layout (kind→folder).
  // 명시 opt-out: --raw-slug (or --no-auto-prefix).
  const flags = { vault: null, autoPrefix: true };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--title') flags.title = parseRawRequiredFlagValue('--title', args[++i], { rejectSingleDash: true });
    else if (a.startsWith('--title=')) flags.title = parseRawRequiredFlagValue('--title', a.slice('--title='.length), { rejectSingleDash: true });
    else if (a === '--domain') flags.domain = parseRawRequiredFlagValue('--domain', args[++i], { rejectSingleDash: true });
    else if (a.startsWith('--domain=')) flags.domain = parseRawRequiredFlagValue('--domain', a.slice('--domain='.length), { rejectSingleDash: true });
    else if (a === '--path') flags.path = parseRawRequiredFlagValue('--path', args[++i], { rejectSingleDash: true });
    else if (a.startsWith('--path=')) flags.path = parseRawRequiredFlagValue('--path', a.slice('--path='.length), { rejectSingleDash: true });
    else if (a === '--body') flags.body = parseRawRequiredFlagValue('--body', args[++i]);
    else if (a.startsWith('--body=')) flags.body = parseRawRequiredFlagValue('--body', a.slice('--body='.length));
    else if (a === '--created-by') flags.createdBy = parseRawRequiredFlagValue('--created-by', args[++i], { rejectSingleDash: true });
    else if (a.startsWith('--created-by=')) flags.createdBy = parseRawRequiredFlagValue('--created-by', a.slice('--created-by='.length), { rejectSingleDash: true });
    else if (a === '--auto-prefix') flags.autoPrefix = true;
    else if (a === '--raw-slug' || a === '--no-auto-prefix') flags.autoPrefix = false;
    else if (a.startsWith('-')) {
      return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    } else {
      positional.push(a);
    }
  }
  if (positional.length < 2) {
    return { error: 'kind and slug are required' };
  }
  if (positional.length > 2) {
    return { error: `too many arguments: ${positional.slice(2).join(' ')}` };
  }
  if (flags.vault === false) return { error: '--vault requires a path' };
  for (const value of Object.values(flags)) {
    if (value instanceof Error) return { error: value.message };
  }
  const [kind, slug] = positional;
  if (!VAULT_KINDS.includes(kind)) {
    return {
      error: formatAllowedValueError('kind', kind, VAULT_KINDS),
    };
  }
  const titleError = validateCleanString(flags.title, '--title');
  if (titleError) return { error: titleError };
  const slugError = validateCleanString(slug, 'slug');
  if (slugError) return { error: slugError };
  if (flags.domain !== undefined) {
    const domainError = validateCleanString(flags.domain, '--domain');
    if (domainError) return { error: domainError };
  }
  if (flags.path !== undefined) {
    const pathError = validateCleanString(flags.path, '--path');
    if (pathError) return { error: pathError };
  }
  let createdBy;
  if (flags.createdBy !== undefined) {
    const normalized = normalizeCreatedByFlag(flags.createdBy);
    if (normalized instanceof Error) return { error: normalized.message };
    createdBy = normalized;
  }
  return {
    kind,
    slug,
    title: flags.title,
    domain: flags.domain,
    path: flags.path,
    body: flags.body,
    vault: flags.vault || '.',
    autoPrefix: flags.autoPrefix,
    createdBy,
  };
}

/**
 * `--created-by` 값 규약 — schema 의 `human` | `agent:<name>` 둘뿐이다.
 * `agent` 단독은 이름 모름의 정직한 표기(`agent:unknown`)로 정규화.
 */
function normalizeCreatedByFlag(raw) {
  const value = raw.trim();
  if (value === CREATED_BY_HUMAN) return CREATED_BY_HUMAN;
  if (value === 'agent') return agentCreatedBy('');
  if (value.startsWith(CREATED_BY_AGENT_PREFIX)) {
    const name = value.slice(CREATED_BY_AGENT_PREFIX.length).trim();
    if (name) return `${CREATED_BY_AGENT_PREFIX}${name}`;
    return agentCreatedBy('');
  }
  return new Error(
    `--created-by must be "${CREATED_BY_HUMAN}" or "${CREATED_BY_AGENT_PREFIX}<name>" (got "${raw}")`,
  );
}

function validateCleanString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    return `${name} must be a non-empty string`;
  }
  if (value !== value.trim()) {
    return `${name} must not have leading or trailing whitespace`;
  }
  if (value.includes('\0')) {
    return `${name} must not contain a null byte`;
  }
  return null;
}

function printAddUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  ontology-atlas add <kind> <slug> --title="..." [--domain X] [--path repo/path] [--body "..."] [--vault path] [--raw-slug] [--created-by human|agent:<name>]\n` +
      `\n${COLORS.bold}kind:${COLORS.reset} ${VAULT_KINDS.join(' / ')}\n` +
      `\n${COLORS.bold}slug layout:${COLORS.reset} kind→folder prefix is default (capability foo → capabilities/foo). Use --raw-slug to opt out.\n` +
      `${COLORS.bold}slug shape:${COLORS.reset} flat under the kind folder: a slug names a role, never a file path (put the path in path:).\n` +
      `${COLORS.bold}implementation path:${COLORS.reset} capability/element may carry one repo-relative canonical entrypoint via --path.\n` +
      `${COLORS.bold}created_by:${COLORS.reset} defaults to agent:<heartbeat|unknown> (same stamp as MCP add_concept). A person adding by hand passes --created-by human.\n` +
      `\nExample:\n` +
      `  ontology-atlas add capability token-issue --title="Token issue" --domain=domains/auth --path=src/auth/token-issue.ts\n`,
  );
}
