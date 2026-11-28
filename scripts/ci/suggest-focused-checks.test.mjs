import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  branchRangePathsFromGit,
  changedPathsFromGit,
  collapsePlaywrightCommands,
  collapseCoveredContractCommands,
  runFocusedChecks,
  runSuggestFocusedChecks,
  stripLeadingSeparator,
  suggestFocusedChecksUsage,
  untrackedPathsForAdvisor,
  commentOnlyPathsFromGit,
  hooksPathWarning,
} from './suggest-focused-checks.mjs';

describe('branch-range fallback', () => {
  /** A `spawnSync` stand-in: one canned answer per git subcommand. */
  function gitStub({ head = '', untracked = '', range = '', baseExists = true }) {
    return (_command, args) => {
      if (args[0] === 'rev-parse') return { status: baseExists ? 0 : 1, stdout: '' };
      if (args[0] === 'ls-files') return { status: 0, stdout: untracked };
      if (args[0] === 'diff' && args.includes('origin/main...HEAD')) {
        return { status: 0, stdout: range };
      }
      return { status: 0, stdout: head };
    };
  }

  it('reads the merge-base range and splits surviving paths from deleted ones', () => {
    const result = branchRangePathsFromGit({
      spawn: gitStub({ range: 'src/kept.ts\nsrc/gone.ts\n' }),
      exists: (path) => !path.endsWith('gone.ts'),
    });

    assert.equal(result.base, 'origin/main...HEAD');
    assert.deepEqual(result.paths, ['src/kept.ts']);
    assert.deepEqual(result.deletedPaths, ['src/gone.ts']);
  });

  it('returns nothing when origin/main cannot be resolved, rather than guessing a base', () => {
    const result = branchRangePathsFromGit({
      spawn: gitStub({ range: 'src/kept.ts\n', baseExists: false }),
      exists: () => true,
    });

    assert.equal(result.base, '');
    assert.deepEqual(result.paths, []);
  });

  it('plans the branch range when the working tree is clean, and says which scope it used', () => {
    const output = [];
    const exitCode = runSuggestFocusedChecks({
      argv: [],
      stdout: { write: (text) => output.push(text) },
      stderr: { write: () => {} },
      spawn: gitStub({ head: '', untracked: '', range: 'src/shared/lib/cn.ts\n' }),
    });

    assert.equal(exitCode, 0);
    const text = output.join('');
    assert.match(text, /scope: origin\/main\.\.\.HEAD/);
    assert.match(text, /1 changed path/);
    assert.doesNotMatch(text, /no changed paths/);
  });

  it('keeps the working tree ahead of the branch range when both have something to say', () => {
    const output = [];
    runSuggestFocusedChecks({
      argv: [],
      stdout: { write: (text) => output.push(text) },
      stderr: { write: () => {} },
      spawn: gitStub({ head: 'src/shared/lib/cn.ts\n', range: 'messages/en.json\n' }),
    });

    const text = output.join('');
    assert.match(text, /scope: the working tree/);
    assert.doesNotMatch(text, /origin\/main\.\.\.HEAD/);
  });
});

describe('focused check suggestion CLI', () => {
  it('rejects unsupported options before planning or executing checks', () => {
    for (const argv of [['--', '--json'], ['--', '--rnu', 'src/shared/lib/cn.ts'], ['--', '--run', '--json', 'src/shared/lib/cn.ts']]) {
      const output = [], errors = [];
      let spawned = 0;
      const status = runSuggestFocusedChecks({
        argv,
        stdout: { write: text => output.push(text) },
        stderr: { write: text => errors.push(text) },
        spawn() { spawned += 1; return { status: 0, stdout: '' }; },
      });
      assert.equal(status, 2);
      assert.match(errors.join(''), /unsupported option/);
      assert.equal(spawned, 0);
      assert.equal(output.join(''), '');
    }
  });

  it('preserves a dash-prefixed filename through planning and execution', () => {
    const output = [], commands = [];
    const status = runSuggestFocusedChecks({
      argv: ['--run', './--fixture.ts'],
      stdout: { write: text => output.push(text) },
      spawn(command) { commands.push(command); return { status: 0 }; },
    });
    assert.equal(status, 0);
    assert.ok(commands.includes('pnpm exec eslint --max-warnings 0 --no-warn-ignored ./--fixture.ts'));
    assert.match(output.join(''), /\.\/--fixture\.ts/);
  });

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
        return { status: 0, stdout: '.codex/config.toml\n.codex/cache/session.json\nscripts/ci/suggest-focused-checks.mjs\n' };
      },
    });

    assert.equal(exitCode, 0);
    assert.deepEqual(calls[0].args, ['diff', '--name-only', 'HEAD', '--']);
    assert.deepEqual(calls[1].args, ['ls-files', '--others', '--exclude-standard']);
    assert.match(output.join(''), /pnpm docs-vault:build/);
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

describe('focused checks --run', () => {
  it('runs every recommendation in order', () => {
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

  it('stops at the first failure and passes its exit code through', () => {
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

  it('counts a spawn that reports no status as a failure, never turning unknown into a pass', () => {
    const code = runFocusedChecks({
      commands: [{ command: 'x' }],
      stdout: { write() {} },
      spawn: () => ({}),
    });
    assert.equal(code, 1);
  });

  it('exits 0 when there is nothing to run, so absence is not a failure', () => {
    assert.equal(runFocusedChecks({ commands: [], stdout: { write() {} } }), 0);
  });

  it('`--run` does not leak into paths', () => {
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
    assert.ok(ran.length > 0, 'no recommendation ran');
    assert.ok(
      ran.every((entry) => entry.shell),
      'checks must run through a shell (some commands contain pipes and quotes)',
    );
    assert.ok(
      // `vitest related --run` is the one command that carries the flag on purpose.
      !ran.some((entry) => String(entry.command).replace('vitest related --run', '').includes('--run')),
      '`--run` leaked into a path and ended up in a command',
    );
  });

  it('without `--run` nothing is executed and only recommendations are made', () => {
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

describe('deleted paths', () => {
  it('drops paths that do not exist from the list git returned', () => {
    const paths = changedPathsFromGit({
      cwd: process.cwd(),
      exists: (path) => !String(path).includes('gone'),
      spawn: (_git, args) => ({
        status: 0,
        stdout: args.includes('--others')
          ? ''
          : ['scripts/ci/suggest-focused-checks.mjs', 'src/widgets/gone/Deleted.tsx'].join('\n'),
      }),
    });
    assert.ok(paths.includes('scripts/ci/suggest-focused-checks.mjs'), 'an existing file was dropped');
    assert.ok(!paths.includes('src/widgets/gone/Deleted.tsx'), 'a deleted file remained');
  });

  it('does not filter hand-given paths, so a not-yet-existing file set can be asked about in advance', () => {
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
  const merged = collapsePlaywrightCommands([
    { command: 'pnpm typecheck' },
    { command: 'pnpm exec playwright test tests/e2e/a.spec.ts' },
    { command: 'pnpm exec playwright test tests/e2e/b.spec.ts tests/e2e/c.spec.ts' },
    { command: 'pnpm lint' },
    { command: 'pnpm exec playwright test tests/e2e/a.spec.ts' },
  ]);
  assert.deepEqual(
    merged.map((c) => c.command),
    [
      'pnpm typecheck',
      'pnpm build:unless-built && PLAYWRIGHT_STATIC=1 pnpm exec playwright test tests/e2e/a.spec.ts tests/e2e/b.spec.ts tests/e2e/c.spec.ts',
      'pnpm lint',
    ],
  );
});

  it('collapsePlaywrightCommands leaves a single Playwright command alone', () => {
  const one = [
    { command: 'pnpm typecheck' },
    { command: 'pnpm exec playwright test tests/e2e/a.spec.ts tests/e2e/b.spec.ts' },
  ];
  assert.deepEqual(collapsePlaywrightCommands(one), one);
});

  it('collapsePlaywrightCommands loses no spec — the union is exactly preserved', () => {
  const specs = Array.from({ length: 40 }, (_, i) => `tests/e2e/s${i}.spec.ts`);
  const commands = specs.map((s) => ({ command: `pnpm exec playwright test ${s}` }));
  const merged = collapsePlaywrightCommands(commands);
  assert.equal(merged.length, 1);
  const kept = merged[0].command.replace('pnpm build:unless-built && PLAYWRIGHT_STATIC=1 pnpm exec playwright test ', '').split(' ');
  assert.deepEqual(kept.sort(), specs.slice().sort());
});
});


describe('where the merged e2e run renders', () => {
  const CASES = [
    ['two specs stay on the dev server', ['a', 'b'], 'pnpm exec playwright test tests/e2e/a.spec.ts tests/e2e/b.spec.ts'],
    ['three specs pay for one static build', ['a', 'b', 'c'], 'pnpm build:unless-built && PLAYWRIGHT_STATIC=1 pnpm exec playwright test tests/e2e/a.spec.ts tests/e2e/b.spec.ts tests/e2e/c.spec.ts'],
  ];
  for (const [name, ids, expected] of CASES) {
    it(name, () => {
      const commands = ids.map((id) => ({ command: `pnpm exec playwright test tests/e2e/${id}.spec.ts` }));
      assert.equal(collapsePlaywrightCommands(commands)[0].command, expected);
    });
  }
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

it('exact Node test file coverage is reused within a run without dropping flags or hooks', () => {
  const scripts = { 'test:pair': 'node --test scripts/first.test.mjs scripts/second.test.mjs' };
  const pair = { command: 'pnpm test:pair' };
  const single = { command: 'pnpm exec node --test scripts/first.test.mjs' };
  const flagged = { command: 'node --test --test-name-pattern=one scripts/first.test.mjs' };
  const unknown = { command: 'node --test scripts/third.test.mjs' };
  assert.deepEqual(collapseCoveredContractCommands([pair, single, flagged, unknown], scripts), {
    commands: [pair, flagged, unknown], covered: [single.command],
  });
  assert.deepEqual(collapseCoveredContractCommands([pair, single], {
    ...scripts, 'pretest:pair': 'node setup.mjs',
  }).commands, [pair, single]);
  assert.deepEqual(collapseCoveredContractCommands([flagged, single], scripts).commands, [flagged, single]);
});

describe('commentOnlyPathsFromGit', () => {
  it('names a file whose code is unchanged at the base, and keeps new or unreadable ones', () => {
    const base = { 'a.ts': 'const a = 1; // old\n', 'b.ts': 'const b = 1;\n' };
    const now = { 'a.ts': 'const a = 1; // new\n', 'b.ts': 'const b = 2;\n', 'c.ts': 'const c = 1;\n' };
    const spawn = (_git, args) => {
      const path = args[1].split(':')[1];
      return path in base ? { status: 0, stdout: base[path] } : { status: 128, stdout: '' };
    };
    assert.deepEqual(commentOnlyPathsFromGit(['a.ts', 'b.ts', 'c.ts', 'd.css'], { spawn, read: (path) => now[path] }), ['a.ts']);
  });
});

describe('hooksPathWarning', () => {
  const CASES = [
    ['unset', '', ''],
    ['relative, so each checkout runs its own hooks', '.githooks', ''],
    ['absolute to this checkout', '/repo/wt/.githooks', ''],
    ['absolute to another checkout', '/repo/main/.githooks', 'another checkout'],
  ];
  for (const [name, value, expected] of CASES) {
    it(`warns only when hooks come from elsewhere: ${name}`, () => {
      const spawn = (_git, args) => ({ status: 0, stdout: args[0] === 'config' ? `${value}\n` : '/repo/wt\n' });
      const warning = hooksPathWarning({ spawn });
      if (expected) assert.match(warning, new RegExp(expected));
      else assert.equal(warning, '');
    });
  }
});

it('overlapping default Node invocations execute each file once without losing the remaining files', () => {
  const scripts = { pair: 'node --test scripts/a.test.mjs scripts/b.test.mjs' };
  const first = { command: 'pnpm exec node --test scripts/a.test.mjs' };
  const pair = { command: 'pnpm pair', reason: 'both behaviors' };
  const result = collapseCoveredContractCommands([first, pair], scripts);
  assert.deepEqual(result.commands, [first, { ...pair, command: 'node --test scripts/b.test.mjs' }]);
  assert.deepEqual(collapseCoveredContractCommands([first, pair], { ...scripts, prepair: 'node prepare.mjs' }).commands, [first, pair]);
});

describe('focused checks --slice', () => {
  it('keeps a slice\'s per-file gates and leaves only the costly repo-wide lanes to the integration tree', () => {
    const output = [], ran = [];
    const status = runSuggestFocusedChecks({
      argv: ['--', '--run', '--slice', 'src/shared/lib/cn.ts', 'src-tauri/src/lib.rs', 'src-tauri/Cargo.toml', 'messages/en/common.json'],
      stdout: { write: text => output.push(text) },
      spawn(command) { ran.push(command); return { status: 0, stdout: '' }; },
    });
    assert.equal(status, 0);
    assert.ok(ran.includes('pnpm exec eslint --max-warnings 0 src/shared/lib/cn.ts'), 'lint on the touched file');
    assert.ok(ran.some((c) => c.startsWith('pnpm exec vitest related --run')), 'unit suites reaching the touched file');
    assert.ok(ran.some((c) => c.includes('cargo clippy')), 'the Rust lane when src-tauri changed');
    assert.ok(ran.some((c) => c.includes('playwright test')), 'the e2e spec that reaches the touched file');
    for (const cheap of ['pnpm source:language', 'pnpm licenses:check']) {
      assert.ok(ran.some((c) => c.startsWith(cheap)), `${cheap} is a per-file gate and stays with the slice`);
    }
    assert.ok(ran.some((c) => c.includes('tests/contract/security/security-surfaces.contract.test.ts')), 'the security-surfaces contract stays for src-tauri');
    for (const repoWide of [/^pnpm typecheck\b/, /^pnpm knip\b/, /^pnpm test:contracts\b/, /^pnpm build\b/, /^pnpm test:mcp:/]) {
      assert.ok(!ran.some((c) => repoWide.test(c)), `${repoWide} runs once on the integration tree, not per slice`);
    }
    assert.match(output.join(''), /--slice: \d+ repo-wide check\(s\) left for the lead's run on the integration tree/);
  });

  it('plans no Rust lane for a slice that leaves src-tauri alone', () => {
    const output = [];
    runSuggestFocusedChecks({
      argv: ['--', '--slice', 'src/shared/lib/cn.ts'],
      stdout: { write: text => output.push(text) },
      spawn() { return { status: 0, stdout: '' }; },
    });
    assert.doesNotMatch(output.join(''), /cargo|test:desktop:bridge/);
  });
});
