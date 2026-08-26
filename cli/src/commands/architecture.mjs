import { resolve } from 'node:path';

import { COLORS } from '../lib/colors.mjs';
import { callMcpTool } from '../lib/mcp-call.mjs';
import { assertArchitectureBriefResult } from '../lib/architecture-results.mjs';
import {
  formatUnknownFlagError,
  parseBoundedPositiveIntegerFlag,
  parseVaultFlag,
  resolveSingleRootPathArg,
} from '../lib/cli-args.mjs';

const MAX_FILES_CAP = 50000;
const ALLOWED_FLAGS = ['--vault', '--profile', '--max-files', '--json'];

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
    return 0;
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
      `${result.conformance.source.supportedLanguages.join(', ') || 'coverage unknown'}\n\n`,
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
  return 0;
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const positional = [];
  const flags = { vault: null, profile: null, maxFiles: undefined, json: false };
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
  };
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  ontology-atlas architecture [rootPath] [--vault path] [--profile slug] [--max-files N] [--json]\n\n` +
      `${COLORS.bold}What it does:${COLORS.reset}\n` +
      `  Reads a reviewed architecture-profile/v1 from the vault, derives current static imports,\n` +
      `  and reports scoped roles, intended dependency rules, violations, and measurement gaps.\n` +
      `  It never infers a named pattern from folders and never writes the vault.\n`,
  );
}
