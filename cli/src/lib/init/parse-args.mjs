import { dirname, resolve } from 'node:path';
import { stderr } from 'node:process';
import { fileURLToPath } from 'node:url';
import { COLORS } from '../colors.mjs';
import { formatUnknownFlagError } from '../cli-args.mjs';
import { shellQuote } from './shell-quote.mjs';

/** The runnable form: there is no global binary, so usage names this checkout's `cli/` folder. */
const INIT = `node ${shellQuote(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..'))} init`;

const INIT_ALLOWED_FLAGS = ['--help', '--locale', '--documents'];

export function parseInitArgs(args) {
  if (args.includes('--help') || args.includes('-h')) {
    return { help: true };
  }
  const positional = [];
  let documents = false;
  let locale = 'en';
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--documents') {
      documents = true;
      continue;
    }
    if (arg === '--locale') {
      const value = args[i + 1];
      if (value === undefined || value.startsWith('-')) {
        return { error: '--locale requires a value (for example --locale ko)' };
      }
      locale = value;
      i += 1;
      continue;
    }
    if (arg.startsWith('--locale=')) {
      locale = arg.slice('--locale='.length);
      continue;
    }
    if (arg.startsWith('-')) return { error: formatUnknownFlagError(arg, INIT_ALLOWED_FLAGS) };
    positional.push(arg);
  }
  if (positional.length > 1) {
    return { error: `too many arguments: ${positional.slice(1).join(' ')}` };
  }
  return { target: positional[0], locale, documents };
}

export function printInitUsage(stream = stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  ${INIT} [folder]\n` +
      `  ${INIT} [folder] --locale=ko\n` +
      `  ${INIT} [folder] --documents\n\n` +
      `Scaffold a local ontology vault and wire this checkout's MCP server into\n` +
      `.mcp.json and .codex/config.toml. Default folder: ./atlas\n\n` +
      `${COLORS.bold}--documents${COLORS.reset}  a documents folder (sources/ and wiki/) without the map's nodes.\n`,
  );
}
