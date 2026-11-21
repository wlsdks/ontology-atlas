import { stderr } from 'node:process';
import { COLORS } from '../colors.mjs';
import { formatUnknownFlagError } from '../cli-args.mjs';

const INIT_ALLOWED_FLAGS = ['--help', '--quick-start', '--locale', '--documents'];

export function parseInitArgs(args) {
  if (args.includes('--help') || args.includes('-h')) {
    return { help: true };
  }
  const positional = [];
  let quickStart = false;
  let documents = false;
  let locale = 'en';
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--quick-start') {
      quickStart = true;
      continue;
    }
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
  if (documents && quickStart) return { error: '--documents and --quick-start do not combine: a documents folder has no code to bootstrap from' };
  return { target: positional[0], quickStart, locale, documents };
}

export function printInitUsage(stream = stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  ontology-atlas init [folder]\n` +
      `  ontology-atlas init [folder] --quick-start\n` +
      `  ontology-atlas init [folder] --locale=ko\n\n` +
      `Scaffold a local ontology vault. Default folder: ./atlas\n\n` +
      `${COLORS.bold}--quick-start${COLORS.reset}  no-prompt one-liner: scaffold + bootstrap from\n` +
      `  this repo + .mcp.json (already unconditional) + an absorb suggestion when\n` +
      `  CLAUDE.md/AGENTS.md exists (never auto-absorbed) + a compact next-steps block.\n`,
  );
}
