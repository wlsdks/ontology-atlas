import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  changedPathsFromGit,
  collapsePlaywrightCommands,
  collapseCoveredContractCommands,
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
        if (args[0] === 'diff') return { status: 0, stdout: 'docs/ontology/README.md\n' };
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
        // This test measures **de-duplication and ordering**; the existence predicate is
        // measured by the test beside it.
        exists: () => true,
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
 * `--run` — **executes the recommendations as given.**
 *
 * Added 2026-08-21. This tool has always named exactly what to run, and people and
 * agents took that list and **ran only part of it.** Two CI rounds burned that way in
 * one day on 08-20. So the room to pick is removed.
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
    // Later checks usually collapse from the same cause — this gives exactly one thing to fix.
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
    // Without filtering, that string is treated as a changed file and the recommendations change entirely.
    const ran = [];
    runSuggestFocusedChecks({
      argv: ['--', '--run', 'src/shared/lib/cn.ts'],
      stdout: { write() {} },
      spawn(command, options) {
        // No git call reaches here, since the paths were given as arguments.
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

/**
 * **A deleted file is not a check subject.**
 *
 * Measured 2026-08-21: `git diff --name-only` also returns deleted paths. Passing them
 * through builds `eslint <deleted file>` and that command dies — which is exactly how
 * the push retiring the connect sheet was blocked.
 */
describe('deleted paths', () => {
  it('git 이 준 목록에서 실재하지 않는 경로를 뺀다', () => {
    const paths = changedPathsFromGit({
      cwd: process.cwd(),
      exists: (path) => !String(path).includes('gone'),
      spawn: (_git, args) => ({
        status: 0,
        stdout: args.includes('--others')
          ? ''
          : ['scripts/suggest-focused-checks.mjs', 'src/widgets/gone/Deleted.tsx'].join('\n'),
      }),
    });
    assert.ok(paths.includes('scripts/suggest-focused-checks.mjs'), '살아 있는 파일이 빠졌다');
    assert.ok(!paths.includes('src/widgets/gone/Deleted.tsx'), '지워진 파일이 남았다');
  });

  it('손으로 준 경로는 거르지 않는다 — 아직 없는 파일 세트를 미리 물어볼 수 있다', () => {
    // The docs describe `pnpm checks:changed -- <path...>` as a way to ask about files
    // you are **planning** to touch. Requiring existence there would kill that use.
    const output = [];
    runSuggestFocusedChecks({
      argv: ['--', 'src/views/not-yet/NewPage.tsx'],
      stdout: { write: (text) => output.push(text) },
      spawn: () => ({ status: 0, stdout: '' }),
    });
    assert.match(output.join(''), /1 changed path/);
  });
});

describe('collapsePlaywrightCommands', () => {
  it('collapsePlaywrightCommands merges every spec into one invocation, keeping order', () => {
  /*
   * Measured 2026-08-22: a 1,536-file branch produced 657 checks, most of them one
   * `playwright test <single spec>` each. Serially that ran past twelve hours while
   * CI finished the same specs in about eight minutes. The fix must not drop a spec —
   * this repository's whole reason for `--run` is that picking a subset burns CI.
   */
  const merged = collapsePlaywrightCommands([
    { command: 'pnpm exec tsc --noEmit' },
    { command: 'pnpm exec playwright test tests/e2e/a.spec.ts' },
    { command: 'pnpm exec playwright test tests/e2e/b.spec.ts tests/e2e/c.spec.ts' },
    { command: 'pnpm lint' },
    { command: 'pnpm exec playwright test tests/e2e/a.spec.ts' },
  ]);
  assert.deepEqual(
    merged.map((c) => c.command),
    [
      'pnpm exec tsc --noEmit',
      'pnpm exec playwright test tests/e2e/a.spec.ts tests/e2e/b.spec.ts tests/e2e/c.spec.ts',
      'pnpm lint',
    ],
  );
});

  it('collapsePlaywrightCommands leaves a single Playwright command alone', () => {
  const one = [
    { command: 'pnpm exec tsc --noEmit' },
    { command: 'pnpm exec playwright test tests/e2e/a.spec.ts tests/e2e/b.spec.ts' },
  ];
  assert.deepEqual(collapsePlaywrightCommands(one), one);
});

  it('collapsePlaywrightCommands loses no spec — the union is exactly preserved', () => {
  const specs = Array.from({ length: 40 }, (_, i) => `tests/e2e/s${i}.spec.ts`);
  const commands = specs.map((s) => ({ command: `pnpm exec playwright test ${s}` }));
  const merged = collapsePlaywrightCommands(commands);
  assert.equal(merged.length, 1);
  const kept = merged[0].command.replace('pnpm exec playwright test ', '').split(' ');
  assert.deepEqual(kept.sort(), specs.slice().sort());
});
});


describe('contract coverage within one focused run', () => {
  const scripts = {
    'test:contracts': 'vitest run tests/contract',
    'test:design': 'vitest run tests/contract/a.test.ts tests/contract/b.test.ts',
  };
  const rows = (...commands) => commands.map((command) => ({ command }));
  it('removes only later standard contract subsets and keeps their coverage visible', () => {
    const input = rows('pnpm test:contracts', 'pnpm test:design',
      'pnpm exec vitest run tests/contract/c.test.ts', 'pnpm lint');
    const result = collapseCoveredContractCommands(input, scripts);
    assert.deepEqual(result.commands, [input[0], input[3]]);
    assert.deepEqual(result.covered, [input[1].command, input[2].command]);
  });
  it('keeps early focused checks and nonstandard invocations', () => {
    const input = rows('pnpm test:design', 'pnpm test:contracts',
      'pnpm exec vitest run tests/contract/a.test.ts --coverage',
      'pnpm exec vitest run src/example.test.ts',
      'pnpm exec vitest run tests/contract/../other.test.ts',
      'CUSTOM=1 pnpm test:design', 'pnpm test:design -- --reporter=dot',
      'pnpm test:design && pnpm lint');
    assert.deepEqual(collapseCoveredContractCommands(input, scripts).commands, input);
  });
  it('executes the full suite before relying on coverage and stops on its failure', () => {
    for (const status of [0, 3]) {
      const ran = [];
      const code = runFocusedChecks({
        commands: rows('pnpm test:contracts', 'pnpm test:design', 'pnpm lint'), scripts,
        stdout: { write() {} },
        spawn(command) { ran.push(command); return { status: command === 'pnpm test:contracts' ? status : 0 }; },
      });
      assert.equal(code, status);
      assert.deepEqual(ran, status === 0 ? ['pnpm test:contracts', 'pnpm lint'] : ['pnpm test:contracts']);
    }
  });
  it('retains aliases with lifecycle hooks, flags, extra commands, or unverified full-suite definitions', () => {
    const input = rows('pnpm test:contracts', 'pnpm test:design');
    for (const overrides of [
      { 'pretest:design': 'echo prepare' }, { 'posttest:design': 'echo done' },
      { 'posttest:contracts': 'node mutate-input.mjs' },
      { 'test:design': 'vitest run tests/contract/a.test.ts --config special.ts' },
      { 'test:design': 'vitest run tests/contract/a.test.ts && node verify.mjs' },
      { 'test:contracts': 'vitest run tests/contract --testNamePattern=partial' },
    ]) assert.deepEqual(collapseCoveredContractCommands(input, { ...scripts, ...overrides }).commands, input);
    assert.deepEqual(collapseCoveredContractCommands(input, {}).commands, input);
  });
});
