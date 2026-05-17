import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import {
  CLI_COMMAND_COUNT,
  CLI_COMMAND_MODULES,
  CLI_COMMAND_RUNNERS,
  CLI_COMMANDS,
  parseCliCommandMetadataFromDescription,
} from './cli-commands.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PACKAGE = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'));

describe('cli command registry metadata', () => {
  it('keeps package command count aligned with the executable registry', () => {
    assert.equal(CLI_COMMAND_COUNT, CLI_COMMANDS.length);
    assert.equal(CLI_COMMANDS[0], 'init');
    assert.equal(new Set(CLI_COMMANDS).size, CLI_COMMANDS.length);

    const metadata = parseCliCommandMetadataFromDescription(CLI_PACKAGE.description);
    assert.equal(metadata?.commandCount, CLI_COMMAND_COUNT);
  });

  it('keeps command modules derived from the runner registry', () => {
    assert.deepEqual(
      CLI_COMMAND_MODULES,
      Object.fromEntries(
        Object.entries(CLI_COMMAND_RUNNERS).map(([command, runner]) => [
          command,
          runner.moduleFile,
        ]),
      ),
    );

    for (const [command, runner] of Object.entries(CLI_COMMAND_RUNNERS)) {
      assert.match(runner.modulePath, new RegExp(`^\\.\\/commands\\/${runner.moduleFile}$`), command);
      assert.match(runner.moduleFile, /\.mjs$/, command);
      assert.match(runner.exportName, /^run[A-Z]/, command);
    }
  });

  it('parses command-count descriptions without accepting unrelated text', () => {
    assert.deepEqual(
      parseCliCommandMetadataFromDescription('Workbench — 26-command CLI'),
      { commandCount: 26 },
    );
    assert.deepEqual(
      parseCliCommandMetadataFromDescription('Workbench — 26 commands plus MCP'),
      { commandCount: 26 },
    );
    assert.equal(parseCliCommandMetadataFromDescription('Workbench with many commands'), null);
  });
});
