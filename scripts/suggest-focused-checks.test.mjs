import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  changedPathsFromGit,
  runFocusedChecks,
  runSuggestFocusedChecks,
  stripLeadingSeparator,
  suggestFocusedChecksUsage,
  untrackedPathsForAdvisor,
} from './suggest-focused-checks.mjs';

describe('focused check suggestion CLI', () => {
  it('normalizes the pnpm separator and prints help without git', () => {
    assert.deepEqual(stripLeadingSeparator(['--', '--help']), ['--help']);

    const output = [];
    const exitCode = runSuggestFocusedChecks({
      argv: ['--', '--help'],
      stdout: { write: (text) => output.push(text) },
      spawn() {
        throw new Error('git should not run for help');
      },
    });

    assert.equal(exitCode, 0);
    assert.match(output.join(''), /pnpm checks:changed/);
    assert.match(output.join(''), /tracked changes from git diff plus untracked files from git ls-files/);
    assert.match(output.join(''), /excluding local \.agents\/ and \.codex\/ agent state except shared repo skills/);
    assert.equal(output.join(''), `${suggestFocusedChecksUsage()}\n`);
  });

  it('uses explicit paths when provided', () => {
    const output = [];
    const exitCode = runSuggestFocusedChecks({
      argv: ['--', '.mcp.json'],
      stdout: { write: (text) => output.push(text) },
      spawn() {
        throw new Error('git should not run with explicit paths');
      },
    });

    assert.equal(exitCode, 0);
    assert.match(output.join(''), /pnpm test:mcp:registration/);
  });

  it('reads tracked and untracked changed paths from git by default', () => {
    const output = [];
    const calls = [];
    const exitCode = runSuggestFocusedChecks({
      argv: [],
      stdout: { write: (text) => output.push(text) },
      spawn(command, args, options) {
        calls.push({ command, args, options });
        if (args[0] === 'diff') return { status: 0, stdout: 'docs/ontology/project.md\n' };
        return { status: 0, stdout: '.codex/config.toml\n.codex/cache/session.json\nscripts/suggest-focused-checks.mjs\n' };
      },
    });

    assert.equal(exitCode, 0);
    assert.deepEqual(calls[0].args, ['diff', '--name-only', 'HEAD', '--']);
    assert.deepEqual(calls[1].args, ['ls-files', '--others', '--exclude-standard']);
    assert.match(output.join(''), /pnpm docs-vault:check/);
    assert.match(output.join(''), /pnpm test:mcp:registration/);
    assert.match(output.join(''), /pnpm test:checks:changed/);
  });

  it('surfaces git failures as focused-check diagnostics', () => {
    const diagnostics = [];
    const exitCode = runSuggestFocusedChecks({
      argv: [],
      stderr: { write: (text) => diagnostics.push(text) },
      stdout: { write() {} },
      spawn() {
        return { status: 128, stderr: 'not a git repo' };
      },
    });

    assert.equal(exitCode, 2);
    assert.deepEqual(diagnostics, ['[focused-checks] not a git repo\n']);
  });

  it('returns changed tracked and untracked paths from git without duplicates', () => {
    const calls = [];
    assert.deepEqual(
      changedPathsFromGit({
        spawn(command, args) {
          calls.push(args);
          assert.equal(command, 'git');
          if (args[0] === 'diff') return { status: 0, stdout: 'a.js\n\nb.js\n' };
          return { status: 0, stdout: '.agents/skills/local/SKILL.md\nb.js\nc.js\n' };
        },
      }),
      ['a.js', 'b.js', '.agents/skills/local/SKILL.md', 'c.js'],
    );
    assert.deepEqual(calls, [
      ['diff', '--name-only', 'HEAD', '--'],
      ['ls-files', '--others', '--exclude-standard'],
    ]);
  });

  it('keeps untracked source files but ignores local agent state directories', () => {
    assert.deepEqual(
      untrackedPathsForAdvisor([
        '.agents/skills/ontology-sync/SKILL.md',
        '.codex/hooks.json',
        '.codex/hooks/block-npm-publish.sh',
        '.codex/cache/session.json',
        '.mcp.json',
        'scripts/new-helper.mjs',
      ].join('\n')),
      [
        '.agents/skills/ontology-sync/SKILL.md',
        '.codex/hooks.json',
        '.codex/hooks/block-npm-publish.sh',
        '.mcp.json',
        'scripts/new-helper.mjs',
      ],
    );
  });
});

/**
 * `--run` — **추천을 그대로 실행한다.**
 *
 * 2026-08-21 에 생겼다. 이 도구는 무엇을 돌릴지 정확히 지목해 왔는데, 사람과
 * 에이전트가 그 목록을 받아 **일부만 골라 돌렸다.** 08-20 하루에 CI 두 라운드가
 * 그렇게 탔다. 그래서 고르는 여지를 없앤다.
 */
describe('focused checks --run', () => {
  it('추천을 순서대로 다 돌린다', () => {
    const ran = [];
    const code = runFocusedChecks({
      commands: [{ command: 'a' }, { command: 'b' }],
      stdout: { write() {} },
      spawn(command) {
        ran.push(command);
        return { status: 0 };
      },
    });
    assert.equal(code, 0);
    assert.deepEqual(ran, ['a', 'b']);
  });

  it('첫 실패에서 멈추고 그 종료 코드를 그대로 올린다', () => {
    const ran = [];
    const code = runFocusedChecks({
      commands: [{ command: 'ok' }, { command: 'bad' }, { command: 'never' }],
      stdout: { write() {} },
      spawn(command) {
        ran.push(command);
        return { status: command === 'bad' ? 3 : 0 };
      },
    });
    // 뒤의 검사는 대개 같은 원인으로 무너진다 — 고칠 것 하나를 정확히 준다.
    assert.equal(code, 3);
    assert.deepEqual(ran, ['ok', 'bad']);
  });

  it('spawn 이 상태를 안 주면 실패로 친다 — 모르는 것을 통과로 바꾸지 않는다', () => {
    const code = runFocusedChecks({
      commands: [{ command: 'x' }],
      stdout: { write() {} },
      spawn: () => ({}),
    });
    assert.equal(code, 1);
  });

  it('돌릴 것이 없으면 0 이다 — 없는 것을 실패로 만들지 않는다', () => {
    assert.equal(runFocusedChecks({ commands: [], stdout: { write() {} } }), 0);
  });

  it('`--run` 은 경로로 새지 않는다', () => {
    // 안 걸러내면 그 문자열이 「바뀐 파일」로 취급돼 추천이 통째로 달라진다.
    const ran = [];
    runSuggestFocusedChecks({
      argv: ['--', '--run', 'src/shared/lib/cn.ts'],
      stdout: { write() {} },
      spawn(command, options) {
        // git 호출은 여기 오지 않는다(경로를 인자로 줬으므로).
        ran.push({ command, shell: options?.shell === true });
        return { status: 0 };
      },
    });
    assert.ok(ran.length > 0, '추천이 하나도 안 돌았다');
    assert.ok(
      ran.every((entry) => entry.shell),
      '검사는 셸로 돌아야 한다(파이프·인용이 든 명령이 있다)',
    );
    assert.ok(
      !ran.some((entry) => String(entry.command).includes('--run')),
      '`--run` 이 경로로 새어 명령에 들어갔다',
    );
  });

  it('`--run` 없이는 아무것도 실행하지 않는다 — 추천만 한다', () => {
    let spawned = 0;
    runSuggestFocusedChecks({
      argv: ['--', 'src/shared/lib/cn.ts'],
      stdout: { write() {} },
      spawn() {
        spawned += 1;
        return { status: 0 };
      },
    });
    assert.equal(spawned, 0);
  });
});
