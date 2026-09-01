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
      '"${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/fast-sensor.sh"',
      // Twice on purpose: the same census script runs at SessionStart and again
      // at PreCompact, which is where an injected census would otherwise be
      // dropped from a long session.
      '"${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/inject-ontology-summary.sh"',
      '"${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/inject-ontology-summary.sh"',
      '"${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/remind-verify-on-stop.sh"',
      '"${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/report-agent-file-drift.sh"',
      '"${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/stamp-verification.sh"',
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
      'bash .codex/hooks/block-secret-read.sh',
      'bash .codex/hooks/block-secret-read.sh',
      'bash .codex/hooks/block-secret-read.sh',
      'bash .codex/hooks/block-unsafe-git.sh',
      'bash .codex/hooks/block-unsafe-git.sh',
      'bash .codex/hooks/block-unsafe-git.sh',
      // The sensor lane, mirrored 2026-09-01 after measuring codex-cli 0.151.0
      // firing PostToolUse for edit tools and honouring a Stop-time block.
      'bash .codex/hooks/fast-sensor.sh',
      'bash .codex/hooks/inject-ontology-summary.sh',
      'bash .codex/hooks/remind-verify-on-stop.sh',
      'bash .codex/hooks/stamp-verification.sh',
      'bash .codex/hooks/stamp-verification.sh',
      'bash .codex/hooks/stamp-verification.sh',
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
        assert.match(result.stdout, /npm publish guard/, `${config.name}: ${command}`);
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
  it('speaks up: a vault that is found but will not compile is never silent', async (t) => {
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
        assert.match(result.stdout, /will not compile/, `${hook}: does not stay silent`);
        assert.match(result.stdout, /missing-uid/, `${hook}: names what is broken`);
        assert.match(result.stdout, /ontology-atlas health/, `${hook}: names the command that fixes it`);
        assert.ok(result.stdout.length < 700, `${hook}: session context stays short`);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  // The silence convention itself must hold — adding no noise to a repository with
  // no vault is this hook's original contract. This measures that the check above
  // did not widen it.
  /**
   * A fresh clone and a new worktree both start without `mcp/node_modules`, so
   * the MCP child dies on ERR_MODULE_NOT_FOUND before it reads anything. The
   * hook used to answer that with `ontology-atlas health`, which runs through
   * the same missing module and cannot repair it. Naming the wrong command
   * costs a round trip and teaches that the line is noise, so the two cases are
   * asserted apart.
   */
  it('names the install when the dependency is missing, not the vault doctor', async () => {
    const source = await readFile('.claude/hooks/inject-ontology-summary.sh', 'utf8');
    const mirror = await readFile('.codex/hooks/inject-ontology-summary.sh', 'utf8');
    for (const [name, text] of [['claude', source], ['codex', mirror]]) {
      assert.match(text, /ERR_MODULE_NOT_FOUND/, `${name}: does not recognise the missing-module failure`);
      assert.match(text, /pnpm --dir mcp install/, `${name}: never names the command that fixes it`);
      assert.match(
        text,
        /mcp\/node_modules/,
        `${name}: does not check whether this checkout actually lacks the dependency`,
      );
      assert.match(
        text,
        /ontology-atlas health/,
        `${name}: lost the vault doctor for the case that really is a broken vault`,
      );
    }
  });

  it('stays silent, as before, when there is no vault at all', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ontology-atlas-hook-empty-'));
    try {
      for (const hook of INJECT_HOOKS) {
        const result = runInjectHook(hook, dir);
        assert.equal(result.status, 0, `${hook}: ${result.stderr}`);
        assert.equal(result.stdout, '', `${hook}: says nothing in an empty folder`);
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

// The commit-message language gate. Its first draft used `grep -P`, which BSD
// grep does not have, so on macOS `sh` resolved `/usr/bin/grep`, the `|| true`
// swallowed the error and every Korean subject passed. It looked alive from an
// interactive shell with GNU grep on PATH. These cases therefore drive the real
// hook through `sh`, the way Git invokes it, rather than importing the module
// and trusting that the wiring around it works.
describe('commit-msg language gate', () => {
  const runHook = async (message) => {
    const dir = await mkdtemp(join(tmpdir(), 'commit-msg-'));
    try {
      const file = join(dir, 'COMMIT_EDITMSG');
      await writeFile(file, message, 'utf8');
      const result = spawnSync('sh', ['.githooks/commit-msg', file], {
        cwd: process.cwd(),
        encoding: 'utf8',
      });
      return { status: result.status, stderr: result.stderr ?? '' };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  };

  it('is wired as an executable hook where Git looks for it', async () => {
    await access('.githooks/commit-msg', constants.X_OK);
    await access('.githooks/commit-msg-language.mjs', constants.R_OK);
    // Comments are allowed to name the trap; executable lines are not.
    const code = (await readFile('.githooks/commit-msg', 'utf8'))
      .split('\n')
      .filter((line) => !/^\s*#/.test(line))
      .join('\n');
    assert.ok(
      !/grep\s+-[a-zA-Z]*P/.test(code),
      'commit-msg must not use grep -P: BSD grep has no PCRE and the gate fails open',
    );
  });

  it('accepts an English subject and body', async () => {
    const { status } = await runHook('fix: restore the alpha token\n\nThe ramp move dropped it.\n');
    assert.equal(status, 0);
  });

  it('rejects a non-English subject and names the offending line', async () => {
    const { status, stderr } = await runHook('feat: 관문 모션 셋\n');
    assert.equal(status, 1, 'a Korean subject must not commit');
    assert.match(stderr, /must be English/);
    assert.match(stderr, /rules\/git\.md/);
  });

  it('rejects a non-English body under an English subject', async () => {
    const { status } = await runHook('fix: restore tokens\n\n토큰이 빠졌다.\n');
    assert.equal(status, 1);
  });

  it('catches kana and Han, not only Hangul', async () => {
    assert.equal((await runHook('chore: テスト\n')).status, 1);
    assert.equal((await runHook('docs: 测试\n')).status, 1);
  });

  it('catches jamo-only Korean and halfwidth kana too (bug sweep 2026-09-01)', async () => {
    // Compatibility jamo (laughter shorthand, U+3131) and halfwidth forms sat
    // outside the class while the markdown HANGUL inventory counts them.
    assert.equal((await runHook(`fix: ${'\u3131\u3131'} cleanup\n`)).status, 1);
    assert.equal((await runHook(`chore: ${'\uFF76\uFF80\uFF76\uFF85'} pass\n`)).status, 1);
  });

  it('leaves generated subjects alone — merge, revert, fixup', async () => {
    assert.equal((await runHook("Merge branch 'x' into main\n")).status, 0);
    assert.equal((await runHook('Revert "feat: 관문 모션 셋"\n')).status, 0);
    assert.equal((await runHook('fixup! feat: 관문 모션 셋\n')).status, 0);
  });

  it('ignores Git comment lines, which never ship', async () => {
    const { status } = await runHook('# Please enter the commit message\n# 한국어 안내문\n');
    assert.equal(status, 0);
  });
});

// The PostToolUse drift reporter. Its whole value is being right about two
// things at once: loud when a mirrored tree has been half-edited, and silent
// otherwise. A hook that speaks on every edit spends context to say nothing and
// gets ignored exactly when it matters, so the quiet cases are asserted as hard
// as the loud one.
describe('report-agent-file-drift PostToolUse hook', () => {
  const HOOK = '.claude/hooks/report-agent-file-drift.sh';
  const root = process.cwd();

  const fire = (filePath) => {
    const payload = JSON.stringify({
      hook_event_name: 'PostToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: filePath },
    });
    const result = spawnSync('bash', [HOOK], {
      cwd: root,
      input: payload,
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    });
    return { status: result.status, stdout: (result.stdout ?? '').trim() };
  };

  it('is executable where settings.json points', async () => {
    await access(HOOK, constants.X_OK);
  });

  it('says nothing about a file outside the agent-file surface', () => {
    const { status, stdout } = fire(join(root, 'src/shared/ui/does-not-matter.tsx'));
    assert.equal(status, 0);
    assert.equal(stdout, '');
  });

  it('says nothing when the surface is clean, even on a watched path', () => {
    const { status, stdout } = fire(join(root, '.claude/skills/po-pass/SKILL.md'));
    assert.equal(status, 0, 'PostToolUse must never block: the edit already happened');
    assert.equal(stdout, '', 'a clean surface must cost no context');
  });

  it('reports through additionalContext when one side of a mirror is edited', async () => {
    const mirrored = '.claude/skills/po-pass/SKILL.md';
    const original = await readFile(mirrored, 'utf8');
    try {
      await writeFile(mirrored, `${original}\n<!-- half of a mirrored pair -->\n`, 'utf8');
      const { status, stdout } = fire(join(root, mirrored));
      assert.equal(status, 0);
      const parsed = JSON.parse(stdout);
      assert.equal(parsed.hookSpecificOutput.hookEventName, 'PostToolUse');
      const context = parsed.hookSpecificOutput.additionalContext;
      assert.match(context, /skill-copy/);
      assert.match(context, /po-pass\/SKILL\.md/);
      assert.match(context, /pnpm agents:check/);
    } finally {
      await writeFile(mirrored, original, 'utf8');
    }
  });

  it('survives a payload with no file path at all', () => {
    const result = spawnSync('bash', [HOOK], {
      cwd: root,
      input: JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: {} }),
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    });
    assert.equal(result.status, 0);
    assert.equal((result.stdout ?? '').trim(), '');
  });
});

// The Codex-side secret read guard. It exists because the Claude side has a
// committable mechanism and Codex does not: deny-read filesystem policies are
// documented only for the user-level `~/.codex/config.toml`, and `.codexignore`
// was asked for repeatedly and never shipped. A project can still refuse the
// command, which is what this does.
//
// Its two failure modes pull against each other. Too narrow and a secret walks
// out through `head` or a pipeline; too broad and it refuses `cat .env.example`,
// which is tracked precisely so people can read it. Both directions are asserted.
describe('Codex secret read guard', () => {
  const HOOK = '.codex/hooks/block-secret-read.sh';
  const root = process.cwd();

  const fire = (command) => {
    const result = spawnSync('bash', [HOOK], {
      cwd: root,
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
      encoding: 'utf8',
      env: { ...process.env, CODEX_PROJECT_DIR: root },
    });
    return (result.stdout ?? '').trim();
  };
  const blocks = (command) => fire(command) !== '';

  it('is executable where .codex/hooks.json points', async () => {
    await access(HOOK, constants.X_OK);
  });

  it('refuses a direct read of every name .gitignore treats as a secret', async () => {
    const names = (await readFile('.gitignore', 'utf8'))
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^\.env(\.[A-Za-z0-9._-]+)?$/.test(line));
    assert.ok(names.length >= 3, '.gitignore lists no .env names — this sweep would pass vacuously');
    for (const name of names) {
      assert.ok(blocks(`cat ${name}`), `cat ${name} must be refused`);
    }
  });

  it('follows the secret through pipelines, chains and command substitution', () => {
    for (const command of [
      'pnpm build && cat .env',
      'echo hi; sed -n 1p .env',
      'xxd .env | head',
      'echo $(cat .env)',
      'grep KEY .env.prod',
      'cat config/.env',
    ]) {
      assert.ok(blocks(command), `${command} must be refused`);
    }
  });

  it('leaves the tracked placeholder and ordinary work alone', () => {
    for (const command of [
      'cat .env.example',
      'cp .env.example .env.local',
      'cat README.md',
      'pnpm test',
      'git commit -m "document .env handling"',
      'rg SECRET .',
    ]) {
      assert.equal(blocks(command), false, `${command} must not be refused`);
    }
  });

  it('treats a heredoc body as data, not as a command', () => {
    assert.equal(blocks("cat <<'EOF'\ncat .env\nEOF"), false);
  });

  it('names the file, the rule, and the readable alternative when it refuses', () => {
    const parsed = JSON.parse(fire('cat .env'));
    assert.equal(parsed.hookSpecificOutput.permissionDecision, 'deny');
    const reason = parsed.hookSpecificOutput.permissionDecisionReason;
    assert.match(reason, /\.env/);
    assert.match(reason, /local-first\.md/);
    assert.match(reason, /\.env\.example/);
  });
});

// The fast-sensor lane and the Stop-time verification reminder.
//
// Why these tests use a fixture project directory: the hooks resolve every path
// against CLAUDE_PROJECT_DIR, so a temp dir with the same shape exercises the
// markdown branches and the ledger/stamp/stop protocol without touching this
// repository. The eslint branch is exercised against the real repository once
// (a clean file must stay silent); its RED case was proven live when the lane
// landed (planted unused-import, 2026-09-01) and the lint lane remains the
// authority for eslint's own verdicts.
describe('fast-sensor lane and stop-time verification reminder', () => {
  const SENSOR = '.claude/hooks/fast-sensor.sh';
  const STAMP = '.claude/hooks/stamp-verification.sh';
  const STOP = '.claude/hooks/remind-verify-on-stop.sh';

  const fireHook = (hook, payload, projectDir) =>
    spawnSync('bash', [hook], {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
    });

  const editPayload = (file, sessionId = 'sess-test') => ({
    session_id: sessionId,
    tool_name: 'Edit',
    tool_input: { file_path: file },
  });

  it('reports prose em-dash in a user-rendered doc and stays silent on a clean one', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fast-sensor-'));
    try {
      const guide = join(dir, 'docs', 'guide');
      await writeFile(join(dir, 'package.json'), '{}').catch(() => {});
      const { mkdir } = await import('node:fs/promises');
      await mkdir(guide, { recursive: true });
      const dirty = join(guide, 'dirty.md');
      await writeFile(dirty, 'A lead — the AI-shaped dash.\n\n```\ncode — exempt\n```\n');
      const red = fireHook(SENSOR, editPayload(dirty), dir);
      assert.equal(red.status, 0, red.stderr);
      assert.match(red.stdout, /additionalContext/);
      assert.match(red.stdout, /em-dash in user-rendered prose/);
      // The fenced line is exempt: only line 1 is named.
      assert.match(red.stdout, /line 1/);

      const clean = join(guide, 'clean.md');
      await writeFile(clean, 'A sentence with no dash.\n');
      const green = fireHook(SENSOR, editPayload(clean), dir);
      assert.equal(green.status, 0, green.stderr);
      assert.equal(green.stdout, '');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('stays silent for a clean real source file, and never blocks', () => {
    // No session id: this case runs against the real repository, and a ledger
    // write here would leave test state in the working tree it is measuring.
    const result = fireHook(
      SENSOR,
      editPayload(join(process.cwd(), 'src/shared/lib/cn.ts'), ''),
      process.cwd(),
    );
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /"decision"/);
  });

  it('ledger + stamp + stop: unverified edits get exactly one turn-back', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'stop-reminder-'));
    const sessionId = 'sess-stop';
    try {
      const { mkdir } = await import('node:fs/promises');
      await mkdir(join(dir, 'src'), { recursive: true });
      // The fixture has no pnpm/eslint; the sensor must still ledger the edit and stay quiet.
      const source = join(dir, 'src', 'a.ts');
      await writeFile(source, 'export const a = 1;\n');
      const sensed = fireHook(SENSOR, editPayload(source, sessionId), dir);
      assert.equal(sensed.status, 0, sensed.stderr);
      const ledger = await readFile(join(dir, '.tmp', 'harness', `session-${sessionId}.edits`), 'utf8');
      assert.match(ledger, /src\/a\.ts/);

      // Unverified stop: one block with the exact command to run.
      const blocked = fireHook(STOP, { session_id: sessionId }, dir);
      assert.equal(blocked.status, 0, blocked.stderr);
      assert.match(blocked.stdout, /"decision":\s*"block"/);
      assert.match(blocked.stdout, /checks:changed/);
      assert.match(blocked.stdout, /src\/a\.ts/);

      // The continuation stop passes — once means once.
      const second = fireHook(STOP, { session_id: sessionId, stop_hook_active: true }, dir);
      assert.equal(second.stdout, '');

      // A verification command newer than the edit clears the reminder entirely.
      const stamped = fireHook(
        STAMP,
        { session_id: sessionId, tool_name: 'Bash', tool_input: { command: 'pnpm checks:changed -- --run src/a.ts' } },
        dir,
      );
      assert.equal(stamped.status, 0, stamped.stderr);
      const cleared = fireHook(STOP, { session_id: sessionId }, dir);
      assert.equal(cleared.stdout, '');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('the stamp ignores non-verification commands and sessions without edits stop freely', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'stop-free-'));
    try {
      const stamped = fireHook(
        STAMP,
        { session_id: 'sess-free', tool_name: 'Bash', tool_input: { command: 'git status' } },
        dir,
      );
      assert.equal(stamped.stdout, '');
      const stop = fireHook(STOP, { session_id: 'sess-free' }, dir);
      assert.equal(stop.stdout, '', 'a session with no source edits must stop unremarked');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// The findings log is what `pnpm harness:report` reads, and the hook falsifiers
// are written against that report. A sensor that reports to the agent but keeps
// no count cannot be retired on evidence, only on opinion.
describe('fast sensor findings log', () => {
  it('records one row per finding and stays silent when the file is clean', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sensor-log-'));
    try {
      const { mkdir } = await import('node:fs/promises');
      await mkdir(join(dir, 'docs', 'guide'), { recursive: true });
      const dirty = join(dir, 'docs', 'guide', 'dirty.md');
      await writeFile(dirty, 'A lead — the dash.\nAnother — one.\n');
      const run = spawnSync('bash', ['.claude/hooks/fast-sensor.sh'], {
        input: JSON.stringify({
          session_id: 'log-test',
          tool_name: 'Edit',
          tool_input: { file_path: dirty },
        }),
        encoding: 'utf8',
        env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
      });
      assert.equal(run.status, 0, run.stderr);

      const log = await readFile(join(dir, '.tmp', 'harness', 'findings.jsonl'), 'utf8');
      const rows = log.trim().split('\n').map((line) => JSON.parse(line));
      assert.equal(rows.length, 1, 'one finding for the one offending file');
      assert.equal(rows[0].kind, 'em-dash');
      assert.equal(rows[0].session, 'log-test');
      assert.ok(Date.parse(rows[0].at) > 0, 'the row must carry a parseable timestamp');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// Codex sends an edit as `apply_patch` with a patch envelope in
// `tool_input.command` and no `file_path` key at all (measured 2026-09-01,
// codex-cli 0.151.0). Both edit-side guards read the Claude shape and therefore
// saw nothing on that runtime: the generated-output guard was live in main and
// denied nothing, while the mirror table said it was covered. These cases pin
// the payload the runtime actually sends.
describe('Codex apply_patch payload parity', () => {
  const codexEdit = (path) => ({
    hook_event_name: 'PreToolUse',
    tool_name: 'apply_patch',
    session_id: 'codex-parity',
    tool_input: {
      command: `*** Begin Patch\n*** Update File: ${path}\n@@\n-old\n+new\n*** End Patch`,
    },
  });

  const fire = (hook, payload, projectDir = process.cwd()) =>
    spawnSync('bash', [hook], {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      env: { ...process.env, CODEX_PROJECT_DIR: projectDir, CLAUDE_PROJECT_DIR: projectDir },
    });

  it('refuses a generated-output file named inside a patch envelope', () => {
    for (const path of [
      'public/docs-vault/manifest.json',
      `${process.cwd()}/src/entities/docs-vault/data/content.json`,
    ]) {
      const result = fire('.codex/hooks/block-generated-edit.sh', codexEdit(path));
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /"permissionDecision": "deny"/, path);
    }
  });

  it('leaves an ordinary file in a patch envelope alone', () => {
    const result = fire('.codex/hooks/block-generated-edit.sh', codexEdit('src/app/page.tsx'));
    assert.equal(result.stdout, '');
  });

  it('the Codex sensor reads a patch envelope, including a symlinked root', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'codex-sensor-'));
    try {
      const { mkdir, realpath } = await import('node:fs/promises');
      await mkdir(join(dir, 'docs', 'guide'), { recursive: true });
      const doc = join(dir, 'docs', 'guide', 'probe.md');
      await writeFile(doc, 'A lead — the dash.\n');
      // macOS reports /private/tmp for a /tmp root; the sensor must still judge
      // the file as repository-relative rather than silently finding nothing.
      const reported = join(await realpath(dir), 'docs', 'guide', 'probe.md');
      const result = fire(
        '.codex/hooks/fast-sensor.sh',
        { ...codexEdit(reported), hook_event_name: 'PostToolUse' },
        dir,
      );
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /em-dash in user-rendered prose/);
      assert.match(result.stdout, /docs\/guide\/probe\.md/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
