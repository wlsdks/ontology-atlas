import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';

// ⚠️ **This table was red from 2026-07-31 to 2026-08-17.** The hooks grew from two
// to four that day (`block-unsafe-git` · `block-generated-edit`) while this table
// stayed at two, and nobody ran this check so nobody knew. In the meantime even
// the **shape** of the command strings recorded here changed (a
// `${CLAUDE_PROJECT_DIR:-.}` prefix plus quoting).
//
// > A check nobody runs equals no check, and **a check left red is worse** — the
// > next person cannot tell whether the red is a real defect or a stale
// > expectation.
//
// So this table is filled **from measurement**. Adding or removing a hook breaks
// here first, and that is this check's job.
const HOOK_CONFIGS = [
  {
    name: 'Claude Code',
    publishHook: '.claude/hooks/block-npm-publish.sh',
    settingsFile: '.claude/settings.json',
    expectedCommands: [
      '"${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/block-generated-edit.sh"',
      '"${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/block-npm-publish.sh"',
      '"${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/block-unsafe-git.sh"',
      '"${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/inject-ontology-summary.sh"',
    ],
    expectedPreToolMatchers: ['Bash', 'Edit|Write|MultiEdit|NotebookEdit'],
  },
  {
    name: 'Codex',
    publishHook: '.codex/hooks/block-npm-publish.sh',
    settingsFile: '.codex/hooks.json',
    expectedCommands: [
      'bash .codex/hooks/block-generated-edit.sh',
      'bash .codex/hooks/block-npm-publish.sh',
      'bash .codex/hooks/block-npm-publish.sh',
      'bash .codex/hooks/block-npm-publish.sh',
      'bash .codex/hooks/block-unsafe-git.sh',
      'bash .codex/hooks/block-unsafe-git.sh',
      'bash .codex/hooks/block-unsafe-git.sh',
      'bash .codex/hooks/inject-ontology-summary.sh',
    ],
    expectedPreToolMatchers: [
      'Bash',
      'Edit|Write|MultiEdit|NotebookEdit|apply_patch|functions.apply_patch',
      'exec_command',
      'functions.exec_command',
    ],
  },
];

describe('agent hooks', () => {
  it('keeps configured hook commands present and executable', async () => {
    for (const config of HOOK_CONFIGS) {
      const settings = JSON.parse(await readFile(config.settingsFile, 'utf8'));
      const commands = configuredHookCommands(settings);

      assert.deepEqual(commands.sort(), config.expectedCommands, config.name);
      assert.deepEqual(
        configuredPreToolMatchers(settings).sort(),
        config.expectedPreToolMatchers,
        `${config.name}: PreToolUse matcher coverage`,
      );

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
        { tool_name: 'functions.exec_command', tool_input: { cmd: 'pnpm publish --access public' } },
      ]) {
        const payload =
          typeof command === 'string'
            ? { tool_name: 'Bash', tool_input: { command } }
            : command;
        const result = runPublishHook(config.publishHook, payload);
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

});

// The SessionStart inject hook pushes a vault summary into the agent context.
// These verify that the mirrors for both agent runtimes (Claude Code, Codex) keep
// the same output convention, and that both honour the contract "silent when
// healthy, speak at the first moment when not".
const INJECT_HOOKS = [
  '.claude/hooks/inject-ontology-summary.sh',
  '.codex/hooks/inject-ontology-summary.sh',
];

// ⚠️ **Omit `uid:` and these fixtures measure nothing** (measured 2026-08-17).
// Since R14 every node has a `uid:`. Without it the whole graph fails to compile,
// and the old hook was **silent** on that failure — so these three checks were
// **comparing an empty string to an empty string** instead of measuring that an
// inventory is produced.
const ALPHA_UID = '9b0f5a2c-7d31-4e58-b0c6-2f1a4e7d3c88';
const BETA_UID = '4c7e1d90-6a2b-4f13-9d5e-8b0c3a6f2e41';

// Clean vault — alpha depends on beta and beta exists → 0 unresolved.
const CLEAN_VAULT = {
  'alpha.md': `---\nkind: capability\nuid: ${ALPHA_UID}\nslug: alpha\ntitle: Alpha\ndependencies:\n  - beta\n---\n# Alpha\n`,
  'beta.md': `---\nkind: capability\nuid: ${BETA_UID}\nslug: beta\ntitle: Beta\n---\n# Beta\n`,
};

// Vault with drift — alpha references a ghost slug that does not exist → 1
// unresolved edge + 1 compile issue. The agent must notice this at session start.
const DRIFT_VAULT = {
  'alpha.md': `---\nkind: capability\nuid: ${ALPHA_UID}\nslug: alpha\ntitle: Alpha\ndependencies:\n  - beta\n  - ghost-nonexistent\n---\n# Alpha\n`,
  'beta.md': `---\nkind: capability\nuid: ${BETA_UID}\nslug: beta\ntitle: Beta\n---\n# Beta\n`,
};

// **A vault that does not even compile** — the state anyone actually produces by
// adding a node by hand (no `uid:`). If the hook is silent here, that session
// starts with no ontology context at all and no idea why it is quiet.
const BROKEN_VAULT = {
  'alpha.md': '---\nkind: capability\nslug: alpha\ntitle: Alpha\n---\n# Alpha\n',
};

// python3 builds the summary body, so silence is correct where it is absent —
// skip.
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
        assert.match(result.stdout, /Ontology vault: 2 nodes/, `${hook}: census present`);
        assert.ok(result.stdout.length < 500, `${hook}: session context stays compact`);
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
          /ontology-atlas health/,
          `${hook}: points to a fix command`,
        );
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  // The hook's silence convention had a hole: the old code was
  // `2>/dev/null … || exit 0`, which flattened **could not invoke the tool** and
  // **found the vault but could not read it** into the same silence. The latter is
  // the moment a session most needs to hear about — and adding one node by hand puts
  // you in exactly that state.
  it('말한다 — 볼트를 찾았는데 컴파일이 안 되면 침묵하지 않는다', async (t) => {
    if (!hasPython) {
      t.skip('python3 unavailable — hook is silent by design');
      return;
    }
    const dir = await writeVault(BROKEN_VAULT);
    try {
      for (const hook of INJECT_HOOKS) {
        const result = runInjectHook(hook, dir);
        // It never blocks the session — a SessionStart hook always exits 0.
        assert.equal(result.status, 0, `${hook}: ${result.stderr}`);
        assert.match(result.stdout, /will not compile/, `${hook}: 침묵하지 않는다`);
        assert.match(result.stdout, /missing-uid/, `${hook}: 무엇이 문제인지 댄다`);
        assert.match(result.stdout, /ontology-atlas health/, `${hook}: 고칠 명령을 댄다`);
        assert.ok(result.stdout.length < 700, `${hook}: 세션 문맥은 여전히 짧다`);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  // The silence convention itself must hold — adding no noise to a repository with
  // no vault is this hook's original contract. This measures that the check above
  // did not widen it.
  it('볼트가 아예 없으면 종전대로 조용하다', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ontology-atlas-hook-empty-'));
    try {
      for (const hook of INJECT_HOOKS) {
        const result = runInjectHook(hook, dir);
        assert.equal(result.status, 0, `${hook}: ${result.stderr}`);
        assert.equal(result.stdout, '', `${hook}: 빈 폴더에는 아무 말도 안 한다`);
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

function configuredPreToolMatchers(settings) {
  return (settings.hooks?.PreToolUse ?? []).map((group) => group.matcher ?? '');
}

/**
 * Extracts the file that will run from **the command string exactly as
 * configured**.
 *
 * The old implementation resolved only `bash <path>` and returned everything else
 * verbatim. So once the Claude-side command became `"${CLAUDE_PROJECT_DIR:-.}/…"`
 * it was checking a path that did not exist. An unrecognised shape now **throws
 * rather than passing quietly** — going green without knowing what is being
 * measured is exactly what this file did for two weeks.
 */
function executablePathFromHookCommand(command) {
  let path = command.trim().replace(/^bash\s+/, '');
  if (path.startsWith('"') && path.endsWith('"')) path = path.slice(1, -1);
  // Hooks run from the project root, so the default `.` is the repository root.
  path = path.replace('${CLAUDE_PROJECT_DIR:-.}/', '');
  if (!/^\.(claude|codex)\/hooks\/[\w-]+\.sh$/.test(path)) {
    throw new Error(`hook command shape not recognised: ${command}`);
  }
  return path;
}

function runPublishHook(hookPath, payload) {
  return spawnSync('bash', [hookPath], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
}
