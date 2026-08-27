import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

import { COLORS } from '../lib/colors.mjs';
import { callMcpTool } from '../lib/mcp-call.mjs';
import { assertArchitectureBriefResult } from '../lib/architecture-results.mjs';
import { buildArchitectureRecord, writeArchitectureRecord } from '../lib/architecture-record.mjs';
import { parseFrontmatter } from '../lib/parse-frontmatter.mjs';
import { walkMd } from '../lib/walk-vault.mjs';
import {
  formatUnknownFlagError,
  parseBoundedPositiveIntegerFlag,
  parseVaultFlag,
  resolveSingleRootPathArg,
} from '../lib/cli-args.mjs';

const MAX_FILES_CAP = 50000;
const ALLOWED_FLAGS = ['--vault', '--profile', '--max-files', '--json', '--record'];

export async function runArchitecture(args) {
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

  const rootPath = resolve(process.cwd(), parsed.rootPath);
  const vaultRoot = resolve(process.cwd(), parsed.vault);
  let result;
  try {
    result = await callMcpTool(
      vaultRoot,
      'inspect_architecture',
      {
        rootPath,
        ...(parsed.profile ? { profileSlug: parsed.profile } : {}),
        ...(parsed.maxFiles ? { maxFiles: parsed.maxFiles } : {}),
      },
      { repoRoot: rootPath },
    );
    assertArchitectureBriefResult(result);
  } catch (err) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  inspect_architecture: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }

  if (parsed.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return parsed.record ? recordArchitectureBrief(result, vaultRoot, { json: true }) : 0;
  }

  const statusColor = result.conformance.status === 'violated'
    ? COLORS.red
    : result.conformance.status === 'conforms'
      ? COLORS.green
      : COLORS.yellow;
  const patterns = result.profile.patterns
    .map(({ axis, name }) => `${axis}:${name}`)
    .join(' · ');
  process.stdout.write(
    `${COLORS.bold}architecture${COLORS.reset} ${COLORS.cyan}${result.profile.title}${COLORS.reset} ` +
      `${COLORS.dim}(${result.profile.slug})${COLORS.reset}\n` +
      `  ${COLORS.bold}patterns${COLORS.reset}  ${patterns}\n` +
      `  ${COLORS.bold}status${COLORS.reset}    ${statusColor}${result.conformance.status}${COLORS.reset}\n` +
      `  ${COLORS.bold}source${COLORS.reset}    ${result.conformance.source.filesScanned} files · ` +
      `${result.conformance.source.supportedLanguages.join(', ') || 'coverage unknown'}\n` +
      `  ${COLORS.bold}type-only${COLORS.reset} ${result.conformance.typeOnlyEdgeCount} edge(s) · ` +
      `${result.profile.typeOnlyDependencies === 'ruled' ? 'ruled like value imports' : 'free (not violations)'}\n` +
      `  ${COLORS.bold}measured${COLORS.reset}  ${result.measured.at} · ` +
      `${result.measured.source.kind === 'git'
        ? `commit ${result.measured.source.revision}${result.measured.source.dirty ? ' (uncommitted edits)' : ''}`
        : `folder ${result.measured.source.fingerprint.slice(0, 19)}…`}\n\n`,
  );

  for (const role of result.conformance.roles) {
    process.stdout.write(
      `  ${COLORS.bold}${role.id}${COLORS.reset} ${COLORS.dim}${role.matchedFiles.length} observed file(s)${COLORS.reset}\n`,
    );
  }
  if (result.conformance.violations.length > 0) {
    process.stdout.write(`\n  ${COLORS.red}${COLORS.bold}violations${COLORS.reset}\n`);
    for (const violation of result.conformance.violations.slice(0, 20)) {
      process.stdout.write(
        `    ${violation.fromRole} → ${violation.toRole} ${COLORS.dim}${violation.from} → ${violation.to}${COLORS.reset}\n`,
      );
    }
  }
  const unknown = result.conformance.unknown;
  if (
    unknown.coverageIncomplete || unknown.unmappedEdges > 0 ||
    unknown.unruledEdges > 0 || unknown.emptyRoles.length > 0
  ) {
    process.stdout.write(
      `\n  ${COLORS.yellow}${COLORS.bold}unknown${COLORS.reset} ` +
      `${COLORS.dim}unmapped=${unknown.unmappedEdges} · unruled=${unknown.unruledEdges} · ` +
      `empty roles=${unknown.emptyRoles.length} · coverage incomplete=${unknown.coverageIncomplete}${COLORS.reset}\n`,
    );
  }
  process.stdout.write(
    `\n${COLORS.dim}side effect 0: intended architecture came from the reviewed profile; observed dependencies were derived from current source.${COLORS.reset}\n`,
  );
  return parsed.record ? recordArchitectureBrief(result, vaultRoot, { json: false }) : 0;
}

/**
 * Opt-in `--record` writer (2026-08-27 decision, point 4). The normal report
 * has already been printed by the time this runs; the record is a dated machine
 * receipt persisted at `.ontology-atlas/architecture/<profile-slug>.json`.
 *
 * Mechanical hard gate: a scan whose observed edges carry no usage
 * discrimination (edges exist, and none is classified `value` or `type_only`)
 * must not mint a receipt, because the 2026-08-27 measured fact was exactly
 * such a scan stamping a false red. The refusal is a clear stderr message with
 * no file written; the exit code stays 0 because the report itself is honest.
 */
function recordArchitectureBrief(result, vaultRoot, { json }) {
  const confirm = (line) => {
    if (json) process.stderr.write(`${line}\n`);
    else process.stdout.write(`${line}\n`);
  };
  const counts = result.conformance.source.importUsageCounts;
  const observedEdges = counts
    ? counts.value + counts.type_only + counts.unknown + counts.missing
    : 0;
  const discriminated = counts ? counts.value + counts.type_only : 0;
  if (!counts || (observedEdges > 0 && discriminated === 0)) {
    process.stderr.write(
      `${COLORS.yellow}record refused${COLORS.reset}  the scan carries no import-usage ` +
        'discrimination: every observed edge lacks importUsage or is unknown. A scanner ' +
        'that cannot tell a type-only import from a value import must not mint a durable ' +
        'receipt. No record was written.\n',
    );
    return 0;
  }

  let profileDocument;
  try {
    profileDocument = findProfileDocument(vaultRoot, result.profile.slug);
  } catch (err) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  --record: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }

  try {
    const record = buildArchitectureRecord(result, {
      profileUid: result.profile.uid,
      profileSlug: result.profile.slug,
      profileContentHash: profileDocument.contentHash,
    });
    const written = writeArchitectureRecord(vaultRoot, record);
    confirm(
      `${COLORS.bold}record${COLORS.reset}    ${written.path} ` +
        `${COLORS.dim}(profile ${relative(vaultRoot, profileDocument.path)} · ${profileDocument.contentHash.slice(0, 19)}…)${COLORS.reset}`,
    );
    return 0;
  } catch (err) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  --record: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }
}

/**
 * The record's profile content hash is the sha256 of the profile document's
 * file bytes. A generated mirror of the same document is tolerated only while
 * it is byte-identical; two differing documents wearing one slug fail closed,
 * naming both, the same discipline the MCP discovery applies to frontmatter.
 */
function findProfileDocument(vaultRoot, profileSlug) {
  const matches = [];
  for (const filePath of walkMd(vaultRoot).sort()) {
    let raw;
    try {
      raw = readFileSync(filePath);
    } catch {
      continue;
    }
    const { frontmatter } = parseFrontmatter(raw.toString('utf-8'));
    if (
      frontmatter?.architecture_schema !== 'architecture-profile/v1' ||
      frontmatter?.profile_slug !== profileSlug
    ) continue;
    matches.push({
      path: filePath,
      contentHash: `sha256:${createHash('sha256').update(raw).digest('hex')}`,
    });
  }
  if (matches.length === 0) {
    throw new Error(
      `architecture profile document not found in the vault for slug: ${profileSlug}.`,
    );
  }
  const [first] = matches;
  const divergent = matches.find((match) => match.contentHash !== first.contentHash);
  if (divergent) {
    throw new Error(
      `two architecture profile documents share slug ${profileSlug} with different bytes: ` +
        `${relative(vaultRoot, first.path)} and ${relative(vaultRoot, divergent.path)}. ` +
        'Resolve the divergence before recording.',
    );
  }
  return first;
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const positional = [];
  const flags = { vault: null, profile: null, maxFiles: undefined, json: false, record: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--vault') flags.vault = parseVaultFlag(args[++index]);
    else if (arg.startsWith('--vault=')) flags.vault = parseVaultFlag(arg.slice('--vault='.length));
    else if (arg === '--profile') flags.profile = args[++index];
    else if (arg.startsWith('--profile=')) flags.profile = arg.slice('--profile='.length);
    else if (arg === '--max-files') {
      flags.maxFiles = parseBoundedPositiveIntegerFlag('--max-files', args[++index], { max: MAX_FILES_CAP });
    } else if (arg.startsWith('--max-files=')) {
      flags.maxFiles = parseBoundedPositiveIntegerFlag('--max-files', arg.slice('--max-files='.length), { max: MAX_FILES_CAP });
    } else if (arg === '--json') flags.json = true;
    else if (arg === '--record') flags.record = true;
    else if (arg.startsWith('-')) return { error: formatUnknownFlagError(arg, ALLOWED_FLAGS) };
    else positional.push(arg);
  }
  for (const value of Object.values(flags)) {
    if (value instanceof Error) return { error: value.message };
  }
  if (flags.vault === false) return { error: '--vault requires a path' };
  if (flags.profile !== null && (typeof flags.profile !== 'string' || flags.profile.trim() === '')) {
    return { error: '--profile requires a non-empty profile slug' };
  }
  const root = resolveSingleRootPathArg({ positional });
  if (root.error) return root;
  return {
    rootPath: root.rootPath,
    vault: flags.vault || '.',
    profile: flags.profile?.trim() || null,
    maxFiles: flags.maxFiles,
    json: flags.json,
    record: flags.record,
  };
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  ontology-atlas architecture [rootPath] [--vault path] [--profile slug] [--max-files N] [--json] [--record]\n\n` +
      `${COLORS.bold}What it does:${COLORS.reset}\n` +
      `  Reads a reviewed architecture-profile/v1 from the vault, derives current static imports,\n` +
      `  and reports scoped roles, intended dependency rules, violations, and measurement gaps.\n` +
      `  It never infers a named pattern from folders and never writes the vault.\n` +
      `  --record additionally persists the dated brief as an architectureRecord:v1 receipt at\n` +
      `  .ontology-atlas/architecture/<profile-slug>.json. It refuses mechanically when the scan\n` +
      `  cannot tell a type-only import from a value import.\n`,
  );
}
