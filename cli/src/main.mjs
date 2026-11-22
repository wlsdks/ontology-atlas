#!/usr/bin/env node
// `init` scaffolds a vault and wires the checkout's MCP server into it. Not on npm; it runs from a
// source checkout as `node <checkout>/cli init [folder]`. Everything else an agent does goes
// through the MCP server.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { argv, stderr, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

import { CLI_COMMANDS } from './commands.mjs';
import { closestAllowedValue } from './lib/cli-args.mjs';
import { parseInitArgs, printInitUsage } from './lib/init/parse-args.mjs';
import { runInit } from './lib/init/run-init.mjs';
import { fail } from './lib/status-lines.mjs';

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf-8'));

async function main(args) {
  const [command, ...rest] = args;
  if (command === '--version' || command === '-v') {
    stdout.write(`${PKG.version}\n`);
    return 0;
  }
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    printInitUsage(stdout);
    return 0;
  }
  if (command === 'init') {
    const parsed = parseInitArgs(rest);
    if (parsed.help) {
      printInitUsage(stdout);
      return 0;
    }
    if (parsed.error) {
      fail(parsed.error);
      printInitUsage(stderr);
      return 1;
    }
    return runInit(parsed.target, { locale: parsed.locale, documents: parsed.documents });
  }
  const suggestion = closestAllowedValue(command, CLI_COMMANDS);
  fail(
    `unknown command: ${command}.` +
      (suggestion ? ` Did you mean ${suggestion}?` : ' The only command is init; an agent reads and writes the vault through the MCP server.'),
  );
  return 1;
}

process.exitCode = await main(argv.slice(2));
