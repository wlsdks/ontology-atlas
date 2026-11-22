import { COLORS } from '../../../lib/colors.mjs';
import {
  formatUnknownFlagError,
  parseCsvListFlag,
  parseVaultFlag,
  resolveExclusiveVaultArg,
} from '../../../lib/cli-args.mjs';

const ALLOWED_FLAGS = ['--vault', '--json', '--strict', '--list-codes', '--fail-on'];

export function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = { vault: null, json: false, strict: false, listCodes: false, failOn: null };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--json') flags.json = true;
    else if (a === '--strict') flags.strict = true;
    else if (a === '--list-codes') flags.listCodes = true;
    else if (a === '--fail-on') flags.failOn = parseCsvListFlag('--fail-on', args[++i], { itemName: 'issue code' });
    else if (a.startsWith('--fail-on=')) flags.failOn = parseCsvListFlag('--fail-on', a.slice('--fail-on='.length), { itemName: 'issue code' });
    else if (a.startsWith('-')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    else positional.push(a);
  }
  if (flags.vault === false) return { error: '--vault requires a path' };
  for (const value of Object.values(flags)) {
    if (value instanceof Error) return { error: value.message };
  }
  const vaultResult = resolveExclusiveVaultArg({ vault: flags.vault, positional });
  if (vaultResult.error) return vaultResult;
  return {
    vault: vaultResult.vault,
    json: flags.json,
    strict: flags.strict,
    listCodes: flags.listCodes,
    failOn: flags.failOn,
  };
}

export function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  ontology-atlas validate [vault] [--json] [--strict]\n` +
      `  ontology-atlas validate [vault] [--fail-on code,...]\n` +
      `  ontology-atlas validate --list-codes [--json]\n\n` +
      `Validate ontology vault frontmatter integrity: frontmatter shape and graph\n` +
      `references only. It does NOT check whether elements:/path: point at files that\n` +
      `exist; \`ontology-atlas health\` runs that source-path check.\n`,
  );
}
