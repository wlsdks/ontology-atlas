#!/usr/bin/env node
// Not on npm; runs from a checkout as `node cli/src/index.mjs <command>`. Help writes
// `ontology-atlas <command>` for brevity and states the real invocation first.

import { cliInvocation } from './lib/self-invocation.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stdout, stderr, argv } from 'node:process';
import { COLORS } from './lib/colors.mjs';
import { CLI_COMMAND_RUNNERS, CLI_COMMANDS } from './lib/cli-commands.mjs';
import { closestAllowedValue } from './lib/cli-args.mjs';
import { fail } from './lib/status-lines.mjs';
import { printHelp } from './lib/help/top-level-help.mjs';
import { printStartHere } from './lib/help/start-here-screen.mjs';
import { parseInitArgs, printInitUsage } from './lib/init/parse-args.mjs';
import { runInit } from './lib/init/run-init.mjs';
import { runBootstrap } from './commands/repo-analysis/bootstrap.mjs';

// Prefix for the **runnable** commands printed on screen. Anything this file shows
// must actually run when pasted — the full discipline is in `lib/self-invocation.mjs`.
const CLI = cliInvocation();

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf-8'));

const TOP_LEVEL_COMMAND_VALUES = ['--help', '-h', 'help', '--version', '-v', ...CLI_COMMANDS];

const ARGS = argv.slice(2);
const SUBCOMMAND = ARGS[0];

async function runCommandHelp(command) {
  if (command === 'init') {
    printInitUsage(stdout);
    return 0;
  }
  const runner = CLI_COMMAND_RUNNERS[command];
  if (!runner) return null;
  const mod = await import(runner.modulePath);
  const run = mod[runner.exportName];
  if (typeof run !== 'function') {
    fail(`command ${command} is misconfigured: missing ${runner.exportName}`);
    return 1;
  }
  return run(['--help']);
}

async function main() {
  if (!SUBCOMMAND) {
    printStartHere({ version: PKG.version });
    return 0;
  }
  if (SUBCOMMAND === '--help' || SUBCOMMAND === '-h') {
    printHelp({ version: PKG.version });
    return 0;
  }

  if (SUBCOMMAND === 'help') {
    const helpArgs = ARGS.slice(1);
    if (helpArgs.length === 0) {
      printHelp({ version: PKG.version });
      return 0;
    }
    if (helpArgs.length > 1) {
      fail(`too many arguments: ${helpArgs.slice(1).join(' ')}`);
      printHelp({ version: PKG.version, stream: stderr });
      return 1;
    }
    if (helpArgs[0] === '--help' || helpArgs[0] === '-h') {
      printHelp({ version: PKG.version });
      return 0;
    }
    const helpCommand = helpArgs[0];
    const helpExitCode = await runCommandHelp(helpCommand);
    if (helpExitCode !== null) {
      return helpExitCode;
    }
    const helpSuggestion = closestAllowedValue(helpCommand, CLI_COMMANDS);
    fail(
      `unknown help topic: ${helpCommand}.` +
        (helpSuggestion ? ` Did you mean ${helpSuggestion}?` : ''),
    );
    printHelp({ version: PKG.version, stream: stderr });
    return 1;
  }

  if (SUBCOMMAND === '--version' || SUBCOMMAND === '-v') {
    stdout.write(`${PKG.version}\n`);
    return 0;
  }

  if (SUBCOMMAND === 'init') {
    const parsed = parseInitArgs(ARGS.slice(1));
    if (parsed.help) {
      printInitUsage(stdout);
      return 0;
    }
    if (parsed.error) {
      fail(parsed.error);
      printInitUsage();
      return 1;
    }
    return runInit(parsed.target, {
      quickStart: parsed.quickStart,
      locale: parsed.locale,
      documents: parsed.documents,
      runBootstrap,
    });
  }

  const runner = CLI_COMMAND_RUNNERS[SUBCOMMAND];
  if (runner) {
    const mod = await import(runner.modulePath);
    const run = mod[runner.exportName];
    if (typeof run !== 'function') {
      fail(`command ${SUBCOMMAND} is misconfigured: missing ${runner.exportName}`);
      return 1;
    }
    try {
      return await run(ARGS.slice(1));
    } catch (err) {
      if (err?.name === 'VaultRootError') {
        fail(err.message);
        return 2;
      }
      throw err;
    }
  }

  const commandSuggestion = closestAllowedValue(SUBCOMMAND, TOP_LEVEL_COMMAND_VALUES);
  fail(
    `unknown command: ${SUBCOMMAND}.` +
      (commandSuggestion ? ` Did you mean ${commandSuggestion}?` : ''),
  );
  // One pointer, not the whole command list; an unknown flag on a real command already prints its usage.
  stderr.write(`Run ${COLORS.bold}${CLI} --help${COLORS.reset} for the command list.\n`);
  return 1;
}

process.exitCode = await main();