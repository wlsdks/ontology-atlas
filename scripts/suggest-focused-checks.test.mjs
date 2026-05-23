import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  changedPathsFromGit,
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
