import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';

// ⚠️ **이 표는 2026-07-31 부터 2026-08-17 까지 빨간불이었다.** 그날 훅이 둘에서
// 넷으로 늘었는데(`block-unsafe-git` · `block-generated-edit`) 이 표는 둘인 채
// 남았고, 아무도 이 검사를 안 돌려서 아무도 몰랐다. 그 사이 여기 적힌 명령
// 문자열의 **모양까지** 바뀌었다(`${CLAUDE_PROJECT_DIR:-.}` 접두 + 따옴표).
//
// > 안 돌리는 검사는 없는 검사와 같고, **빨간 채로 방치된 검사는 그보다 나쁘다** —
// > 다음 사람이 돌렸을 때 나오는 빨간불이 진짜 결함인지 낡은 기대치인지 모른다.
//
// 그래서 이 표는 **실측해서** 채운다. 훅을 더하거나 빼면 여기가 먼저 터지고,
// 그게 이 검사의 일이다.
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

// SessionStart inject hook 은 vault 요약을 agent context 에 주입한다. 두
// agent runtime (Claude Code · Codex) 의 mirror 가 같은 출력 규약을 지키는지,
// 그리고 "건강하면 조용·문제 있으면 첫 순간에 알린다" 계약을 양쪽에서 검증.
const INJECT_HOOKS = [
  '.claude/hooks/inject-ontology-summary.sh',
  '.codex/hooks/inject-ontology-summary.sh',
];

// ⚠️ **`uid:` 를 빼먹으면 이 픽스처들은 아무것도 안 잰다** (2026-08-17 실측).
// R14 이후 모든 노드는 `uid:` 를 갖는다. 없으면 그래프가 통째로 컴파일 실패하고,
// 종전 훅은 그 실패에 **침묵**했다 — 그래서 이 검사 셋은 「센서스가 나온다」를
// 재는 대신 **빈 문자열을 빈 문자열과 비교하며** 빨간불이었다.
const ALPHA_UID = '9b0f5a2c-7d31-4e58-b0c6-2f1a4e7d3c88';
const BETA_UID = '4c7e1d90-6a2b-4f13-9d5e-8b0c3a6f2e41';

// 깨끗한 vault — alpha 가 beta 에 의존하고 beta 가 존재 → unresolved 0.
const CLEAN_VAULT = {
  'alpha.md': `---\nkind: capability\nuid: ${ALPHA_UID}\nslug: alpha\ntitle: Alpha\ndependencies:\n  - beta\n---\n# Alpha\n`,
  'beta.md': `---\nkind: capability\nuid: ${BETA_UID}\nslug: beta\ntitle: Beta\n---\n# Beta\n`,
};

// drift 있는 vault — alpha 가 존재하지 않는 ghost 슬러그를 참조 → unresolved
// edge 1 + compile issue 1. agent 가 session 시작 시 이를 인지해야 한다.
const DRIFT_VAULT = {
  'alpha.md': `---\nkind: capability\nuid: ${ALPHA_UID}\nslug: alpha\ntitle: Alpha\ndependencies:\n  - beta\n  - ghost-nonexistent\n---\n# Alpha\n`,
  'beta.md': `---\nkind: capability\nuid: ${BETA_UID}\nslug: beta\ntitle: Beta\n---\n# Beta\n`,
};

// **컴파일조차 안 되는 vault** — 손으로 노드를 하나 더한 사람이 실제로 만드는
// 상태다(`uid:` 없음). 여기서 훅이 침묵하면 그 세션은 온톨로지 맥락을 하나도
// 못 받은 채, 왜 조용한지도 모르는 채 시작한다.
const BROKEN_VAULT = {
  'alpha.md': '---\nkind: capability\nslug: alpha\ntitle: Alpha\n---\n# Alpha\n',
};

// 요약 본문은 python3 가 만든다 — 없는 환경에선 silent 가 정상이므로 skip.
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

  // 훅의 침묵 규약에는 구멍이 있었다: 종전 코드는 `2>/dev/null … || exit 0` 이라
  // **도구를 못 부른 것**과 **볼트를 찾았는데 못 읽은 것**을 똑같이 침묵으로
  // 뭉갰다. 후자는 세션이 가장 알아야 하는 순간이다 — 그리고 손으로 노드를
  // 하나 더하면 바로 그 상태가 된다.
  it('말한다 — 볼트를 찾았는데 컴파일이 안 되면 침묵하지 않는다', async (t) => {
    if (!hasPython) {
      t.skip('python3 unavailable — hook is silent by design');
      return;
    }
    const dir = await writeVault(BROKEN_VAULT);
    try {
      for (const hook of INJECT_HOOKS) {
        const result = runInjectHook(hook, dir);
        // 세션을 막지는 않는다 — SessionStart 훅은 언제나 exit 0 이다.
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

  // 침묵 규약 자체는 그대로여야 한다 — 볼트가 없는 저장소에 잡음을 넣지 않는
  // 것이 이 훅의 원래 계약이다. 위 검사가 그 계약을 넓혀 버리지 않았는지 잰다.
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
 * 설정에 적힌 **명령 문자열 그대로**에서 실행될 파일을 뽑는다.
 *
 * 종전 구현은 `bash <경로>` 만 풀고 나머지는 문자열을 그대로 돌려줬다. 그래서
 * Claude 쪽 명령이 `"${CLAUDE_PROJECT_DIR:-.}/…"` 로 바뀐 뒤로는 존재하지도
 * 않는 경로를 검사하고 있었다. 모르는 모양이 오면 **조용히 통과시키지 않고
 * 던진다** — 검사가 무엇을 재고 있는지 모르는 채 초록불이 되는 것이 이 파일이
 * 지난 2주 겪은 일이다.
 */
function executablePathFromHookCommand(command) {
  let path = command.trim().replace(/^bash\s+/, '');
  if (path.startsWith('"') && path.endsWith('"')) path = path.slice(1, -1);
  // 훅은 프로젝트 루트에서 돈다 — 기본값 `.` 이 곧 저장소 루트다.
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
