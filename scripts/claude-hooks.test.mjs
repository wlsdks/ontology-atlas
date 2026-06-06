import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
      '.claude/hooks/write-agent-activity.sh',
      '.claude/hooks/write-agent-activity.sh',
    ],
    activityHook: '.claude/hooks/write-agent-activity.sh',
    expectedAgent: 'claude-code',
  },
  {
    name: 'Codex',
    publishHook: '.codex/hooks/block-npm-publish.sh',
    settingsFile: '.codex/hooks.json',
    expectedCommands: [
      'bash .codex/hooks/block-npm-publish.sh',
      'bash .codex/hooks/inject-ontology-summary.sh',
      'bash .codex/hooks/write-agent-activity.sh',
      'bash .codex/hooks/write-agent-activity.sh',
    ],
    activityHook: '.codex/hooks/write-agent-activity.sh',
    expectedAgent: 'codex',
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
        { tool_name: 'Bash', tool_input: { command: 'npm whoami && npm view ontology-atlas-mcp' } },
        { tool_name: 'Bash', tool_input: { command: 'cat <<EOF\nnpm publish\nEOF' } },
        { tool_name: 'Read', tool_input: { command: 'npm publish' } },
      ]) {
        const result = runPublishHook(config.publishHook, payload);
        assert.equal(result.status, 0, `${config.name}: ${result.stderr}`);
        assert.equal(result.stdout, '', config.name);
      }
    }
  });

  it('writes Atlas live activity on session start without stdout noise', async () => {
    const dir = await writeVault(CLEAN_VAULT);
    try {
      for (const config of HOOK_CONFIGS) {
        const result = runActivityHook(config.activityHook, dir);
        assert.equal(result.status, 0, `${config.name}: ${result.stderr}`);
        assert.equal(result.stdout, '', `${config.name}: hook must stay silent`);

        const activity = JSON.parse(
          await readFile(join(dir, '.ontology-atlas', 'agent-activity.json'), 'utf8'),
        );
        assert.equal(activity.agent, config.expectedAgent, config.name);
        assert.equal(activity.state, 'planning', config.name);
        assert.match(activity.focus.summary, /Agent session connected/, config.name);
        assert.deepEqual(activity.plan, ['Read the ontology before code changes'], config.name);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('updates Atlas live activity for shell verification commands', async () => {
    const dir = await writeVault(CLEAN_VAULT);
    try {
      const payload = {
        tool_name: 'Bash',
        tool_input: { command: 'pnpm exec vitest run src/features/docs-vault-local/model/agent-activity-status.test.ts' },
      };
      for (const config of HOOK_CONFIGS) {
        const result = runActivityHook(config.activityHook, dir, payload);
        assert.equal(result.status, 0, `${config.name}: ${result.stderr}`);
        assert.equal(result.stdout, '', `${config.name}: hook must stay silent`);

        const activity = JSON.parse(
          await readFile(join(dir, '.ontology-atlas', 'agent-activity.json'), 'utf8'),
        );
        assert.equal(activity.agent, config.expectedAgent, config.name);
        assert.equal(activity.state, 'verifying', config.name);
        assert.match(activity.focus.summary, /Running shell command: pnpm exec vitest/, config.name);
        assert.match(activity.evidence.verification[0], /agent-activity-status\.test\.ts/, config.name);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// SessionStart inject hook 은 vault 요약을 agent context 에 주입한다. 두
// agent runtime (Claude Code · Codex) 의 mirror 가 같은 출력 규약을 지키는지,
// 그리고 "건강하면 조용·문제 있으면 첫 순간에 알린다" 계약을 양쪽에서 검증.
const INJECT_HOOKS = [
  '.claude/hooks/inject-ontology-summary.sh',
  '.codex/hooks/inject-ontology-summary.sh',
];

// 깨끗한 vault — alpha 가 beta 에 의존하고 beta 가 존재 → unresolved 0.
const CLEAN_VAULT = {
  'alpha.md':
    '---\nkind: capability\nslug: alpha\ntitle: Alpha\ndependencies:\n  - beta\n---\n# Alpha\n',
  'beta.md': '---\nkind: capability\nslug: beta\ntitle: Beta\n---\n# Beta\n',
};

// drift 있는 vault — alpha 가 존재하지 않는 ghost 슬러그를 참조 → unresolved
// edge 1 + compile issue 1. agent 가 session 시작 시 이를 인지해야 한다.
const DRIFT_VAULT = {
  'alpha.md':
    '---\nkind: capability\nslug: alpha\ntitle: Alpha\ndependencies:\n  - beta\n  - ghost-nonexistent\n---\n# Alpha\n',
  'beta.md': '---\nkind: capability\nslug: beta\ntitle: Beta\n---\n# Beta\n',
};

// 훅이 python3 로 요약을 만든다 — 없는 환경에선 silent 가 정상이므로 skip.
const hasPython = spawnSync('python3', ['--version']).status === 0;

async function writeVault(files) {
  const dir = await mkdtemp(join(tmpdir(), 'ontology-atlas-hook-'));
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(dir, name), content);
  }
  return dir;
}

function runInjectHook(hookPath, vaultDir) {
  return spawnSync('bash', [hookPath], {
    env: { ...process.env, OATLAS_VAULT: vaultDir },
    encoding: 'utf8',
  });
}

describe('inject-ontology-summary health awareness', () => {
  it('injects census but stays silent on health when the vault is clean', async (t) => {
    if (!hasPython) {
      t.skip('python3 unavailable — hook is silent by design');
      return;
    }
    const dir = await writeVault(CLEAN_VAULT);
    try {
      for (const hook of INJECT_HOOKS) {
        const result = runInjectHook(hook, dir);
        assert.equal(result.status, 0, `${hook}: ${result.stderr}`);
        assert.match(result.stdout, /Vault has 2 ontology nodes/, `${hook}: census present`);
        assert.doesNotMatch(
          result.stdout,
          /Needs attention/,
          `${hook}: clean vault must not emit a health warning (no noise)`,
        );
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('surfaces actionable drift (unresolved edges / compile issues) at session start', async (t) => {
    if (!hasPython) {
      t.skip('python3 unavailable — hook is silent by design');
      return;
    }
    const dir = await writeVault(DRIFT_VAULT);
    try {
      for (const hook of INJECT_HOOKS) {
        const result = runInjectHook(hook, dir);
        assert.equal(result.status, 0, `${hook}: ${result.stderr}`);
        assert.match(result.stdout, /Needs attention/, `${hook}: drift surfaced`);
        assert.match(result.stdout, /unresolved edge/, `${hook}: names the unresolved edge`);
        assert.match(
          result.stdout,
          /ontology-atlas health|validate_vault/,
          `${hook}: points to a fix command`,
        );
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
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

function runActivityHook(hookPath, vaultDir, payload = null) {
  return spawnSync('bash', [hookPath], {
    input: payload ? JSON.stringify(payload) : '',
    env: { ...process.env, OATLAS_VAULT: vaultDir },
    encoding: 'utf8',
  });
}
