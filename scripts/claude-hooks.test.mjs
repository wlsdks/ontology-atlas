import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';

const HOOK_CONFIGS = [
  {
    name: 'Claude Code',
    publishHook: '.claude/hooks/block-npm-publish.sh',
    settingsFile: '.claude/settings.json',
    expectedCommands: [
      '.claude/hooks/block-npm-publish.sh',
      '.claude/hooks/inject-ontology-summary.sh',
    ],
  },
  {
    name: 'Codex',
    publishHook: '.codex/hooks/block-npm-publish.sh',
    settingsFile: '.codex/hooks.json',
    expectedCommands: [
      'bash .codex/hooks/block-npm-publish.sh',
      'bash .codex/hooks/inject-ontology-summary.sh',
    ],
  },
];

describe('agent hooks', () => {
  it('keeps configured hook commands present and executable', async () => {
    for (const config of HOOK_CONFIGS) {
      const settings = JSON.parse(await readFile(config.settingsFile, 'utf8'));
      const commands = configuredHookCommands(settings);

      assert.deepEqual(commands.sort(), config.expectedCommands, config.name);

      for (const command of commands) {
        await access(executablePathFromHookCommand(command), constants.X_OK);
      }
    }
  });

  it('blocks publish commands at shell command boundaries', () => {
    for (const config of HOOK_CONFIGS) {
      for (const command of [
        'npm publish',
        'cd mcp && npm publish',
        'echo ok\nnpm publish',
        'pnpm publish --access public',
        'echo ok; yarn publish',
        'npm pack',
      ]) {
        const result = runPublishHook(config.publishHook, { tool_name: 'Bash', tool_input: { command } });
        assert.equal(result.status, 0, `${config.name}: ${result.stderr}`);
        assert.match(result.stdout, /"permissionDecision": "deny"/, `${config.name}: ${command}`);
        assert.match(result.stdout, /npm publish 가드/, `${config.name}: ${command}`);
      }
    }
  });

  it('allows read-only package commands and non-Bash tools', () => {
    for (const config of HOOK_CONFIGS) {
      for (const payload of [
        { tool_name: 'Bash', tool_input: { command: 'npm pack --dry-run' } },
        { tool_name: 'Bash', tool_input: { command: 'npm whoami && npm view oh-my-ontology-mcp' } },
        { tool_name: 'Bash', tool_input: { command: 'cat <<EOF\nnpm publish\nEOF' } },
        { tool_name: 'Read', tool_input: { command: 'npm publish' } },
      ]) {
        const result = runPublishHook(config.publishHook, payload);
        assert.equal(result.status, 0, `${config.name}: ${result.stderr}`);
        assert.equal(result.stdout, '', config.name);
      }
    }
  });
});

function configuredHookCommands(settings) {
  const commands = [];
  for (const event of Object.values(settings.hooks ?? {})) {
    for (const group of event) {
      for (const hook of group.hooks ?? []) {
        if (hook.type === 'command') commands.push(hook.command);
      }
    }
  }
  return commands;
}

function executablePathFromHookCommand(command) {
  const match = command.match(/^bash\s+(.+)$/);
  return match ? match[1] : command;
}

function runPublishHook(hookPath, payload) {
  return spawnSync('bash', [hookPath], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
}
