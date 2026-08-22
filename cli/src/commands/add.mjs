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
 * `ontology-atlas add <kind> <slug> --title=... [--domain X] [--path repo/path] [--body "..."] [--vault path]`
 *
 * Writes a new ontology node `.md`. An existing slug throws — it never overwrites,
 * to protect the user's work. Same contract as MCP's add_concept.
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

  // Default folder prefix (capability → capabilities/foo), skipped when the user
  // already wrote the prefix (`capabilities/foo`) so it is not applied twice. The
  // folder mapping comes from the single source in schema.mjs, matching MCP.
  const folder = folderForKind(kind);
  const slug =
    autoPrefix && folder && !rawSlug.startsWith(folder)
      ? `${folder}${rawSlug}`
      : rawSlug;

  // Authorship (decision ledger 2026-08-01 — «the CLI is the same door as MCP»).
  // MCP add_concept stamps `agent:<heartbeat|unknown>` because the call path proves
  // an agent made it, while CLI add stamped nothing — a hole where an agent
  // choosing the convenient door produced nodes with no provenance. The two doors
  // are now the same: the default is the heartbeat-based `agent:*` exactly as in
  // MCP, and a person typing it themselves passes `--created-by human`.
  const createdBy =
    opts.createdBy ?? agentCreatedBy(await readHeartbeatAgentName(vaultPath));

  // The schema fills the per-kind shape automatically (project: empty
  // domains/capabilities/elements arrays, capability: empty elements array), giving
  // the same result as an agent's add_concept — so both entry points always produce
  // the same frontmatter shape.
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
    // Only a successful write reaches the local audit log (no dry run here, and failures leave via catch).
    await recordCliWrite(vaultPath, {
      tool: 'cli:add',
      target: slug,
      summary: `add ${kind}:${slug}`,
    });
    // A missing `requiredExtras` from the schema (a capability or element's domain)
    // prints as an advisory warning, so the user can fill it in afterwards.
    const missing = missingExpectedFields(kind, fm);
    for (const key of missing) {
      process.stderr.write(
        `${COLORS.yellow}warn${COLORS.reset}  expected field "${key}" missing for kind "${kind}": add it later with --domain or by editing the file.\n`,
      );
    }
    // A path-shaped slug is rejected as a hard error by writeDoc's flatSlugIssue
    // gate (docs/DECISIONS.md 「슬러그는 평평한 식별자다」 — slugs are flat identifiers).
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
  // autoPrefix defaults on, for a layout consistent with the starter (kind→folder).
  // Explicit opt-out: --raw-slug (or --no-auto-prefix).
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
 * `--created-by` value contract — the schema allows only `human` | `agent:<name>`.
 * A bare `agent` is normalised to the honest "name unknown" form, `agent:unknown`.
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
