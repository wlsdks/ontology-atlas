import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  expectedFromClaudeSettings,
  expectedFromCodexHooks,
  judge,
  parseClaudeStream,
  parseCodexOutput,
} from './harness-smoke.mjs';

/**
 * The fixtures are trimmed from real runs on 2026-09-02 (Claude Code CLI with
 * `--include-hook-events`, codex-cli 0.151.0), because the whole point of the
 * smoke is the shape the runtime actually emits. A parser that passes on an
 * invented shape is the failure mode this file exists to prevent.
 */

const claudeRow = (subtype, extra) =>
  JSON.stringify({ type: 'system', subtype, session_id: 'sess-claude', ...extra });

const CLAUDE_OK = [
  claudeRow('hook_started', { hook_name: 'SessionStart:startup', hook_event: 'SessionStart' }),
  claudeRow('hook_response', {
    hook_name: 'SessionStart:startup',
    hook_event: 'SessionStart',
    stdout: 'ontology vault @ /repo/docs/ontology\nOntology vault: 97 nodes (element:58). Load details only when needed.\n',
    stderr: '',
    exit_code: 0,
    outcome: 'success',
  }),
  claudeRow('hook_response', { hook_name: 'PreToolUse:Bash', hook_event: 'PreToolUse', stdout: '', stderr: '', exit_code: 0, outcome: 'success' }),
  claudeRow('hook_response', { hook_name: 'PreToolUse:Bash', hook_event: 'PreToolUse', stdout: '', stderr: '', exit_code: 0, outcome: 'success' }),
  claudeRow('hook_response', { hook_name: 'PostToolUse:Bash', hook_event: 'PostToolUse', stdout: '', stderr: '', exit_code: 0, outcome: 'success' }),
  claudeRow('hook_response', { hook_name: 'Stop', hook_event: 'Stop', stdout: '', stderr: '', exit_code: 0, outcome: 'success' }),
  JSON.stringify({ type: 'result', subtype: 'success', result: '97', session_id: 'sess-claude' }),
].join('\n');

const CODEX_OK = `OpenAI Codex v0.151.0
--------
workdir: /repo
session id: 01a05f75-14cc-7742-97bc-6db95d700a57
--------
user
${'Run the shell command'}
hook: SessionStart
hook: SessionStart Completed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
/bin/zsh -lc 'pnpm lint --version' in /repo
 succeeded in 51ms:
v9.39.4

hook: PostToolUse
hook: PostToolUse Completed
codex
97
hook: Stop
hook: Stop Completed
tokens used
9,693
97
`;

const CLAUDE_SETTINGS = {
  hooks: {
    PreToolUse: [
      { matcher: 'Bash', hooks: [{ type: 'command', command: 'a' }, { type: 'command', command: 'b' }] },
      { matcher: 'Edit|Write', hooks: [{ type: 'command', command: 'c' }] },
    ],
    PostToolUse: [
      { matcher: 'Edit|Write', hooks: [{ type: 'command', command: 'd' }, { type: 'command', command: 'e' }] },
      { matcher: 'Bash', hooks: [{ type: 'command', command: 'f' }] },
    ],
    Stop: [{ hooks: [{ type: 'command', command: 'g' }] }],
    SessionStart: [{ hooks: [{ type: 'command', command: 'h' }] }],
  },
};

const CODEX_HOOKS = {
  hooks: {
    PreToolUse: [
      { matcher: 'Bash', hooks: [{ command: 'a' }, { command: 'b' }, { command: 'c' }] },
      { matcher: 'exec_command', hooks: [{ command: 'a' }, { command: 'b' }, { command: 'c' }] },
      { matcher: 'Edit|apply_patch', hooks: [{ command: 'd' }] },
    ],
    PostToolUse: [
      { matcher: 'Edit|apply_patch', hooks: [{ command: 'e' }] },
      { matcher: 'exec_command', hooks: [{ command: 'f' }] },
    ],
    Stop: [{ hooks: [{ command: 'g' }] }],
    SessionStart: [{ hooks: [{ command: 'h' }] }],
  },
};

describe('harness smoke: expected counts come from the wiring, not from memory', () => {
  it('reads the Claude shell-tool groups and the matcher-less events', () => {
    assert.deepEqual(expectedFromClaudeSettings(CLAUDE_SETTINGS), {
      SessionStart: 1,
      PreToolUse: 2,
      PostToolUse: 1,
      Stop: 1,
    });
  });

  it('reads the Codex exec_command groups', () => {
    assert.deepEqual(expectedFromCodexHooks(CODEX_HOOKS), {
      SessionStart: 1,
      PreToolUse: 3,
      PostToolUse: 1,
      Stop: 1,
    });
  });

  it('expects nothing from an event that is not wired', () => {
    assert.equal(expectedFromClaudeSettings({ hooks: {} }).Stop, 0);
  });
});

describe('harness smoke: parsers read the shapes the runtimes emit', () => {
  it('Claude: counts hook_response rows, sees the census, and reads the answer', () => {
    const observed = parseClaudeStream(CLAUDE_OK);
    assert.equal(observed.events.SessionStart.count, 1);
    assert.equal(observed.events.PreToolUse.count, 2);
    assert.equal(observed.events.PostToolUse.count, 1);
    assert.equal(observed.events.Stop.count, 1);
    assert.equal(observed.censusSeen, true);
    assert.equal(observed.answer, '97');
    assert.equal(observed.sessionId, 'sess-claude');
  });

  it('Claude: a non-zero exit or a non-success outcome is a failure with its name', () => {
    const text =
      CLAUDE_OK +
      '\n' +
      claudeRow('hook_response', { hook_name: 'Stop', hook_event: 'Stop', stdout: '', stderr: 'boom', exit_code: 1, outcome: 'success' });
    const observed = parseClaudeStream(text);
    assert.deepEqual(observed.events.Stop.failed, ['Stop exit=1 boom']);
  });

  it('Codex: counts Completed lines, ignores the bare announcement, reads the session id and answer', () => {
    const observed = parseCodexOutput(CODEX_OK);
    assert.equal(observed.events.SessionStart.count, 1);
    assert.equal(observed.events.PreToolUse.count, 3);
    assert.equal(observed.events.PostToolUse.count, 1);
    assert.equal(observed.events.Stop.count, 1);
    assert.equal(observed.answer, '97');
    assert.equal(observed.sessionId, '01a05f75-14cc-7742-97bc-6db95d700a57');
    assert.equal(observed.censusSeen, null, 'Codex prints no per-hook stdout; the answer is the proof');
  });

  it('Codex: a Failed line is a failure and not a completion', () => {
    const observed = parseCodexOutput(CODEX_OK.replace('hook: SessionStart Completed', 'hook: SessionStart Failed'));
    assert.equal(observed.events.SessionStart.count, 0);
    assert.deepEqual(observed.events.SessionStart.failed, ['SessionStart Failed']);
  });

  it('Codex: ANSI colour does not hide a hook line', () => {
    const observed = parseCodexOutput(CODEX_OK.replace('hook: Stop Completed', '\x1b[2mhook: Stop Completed\x1b[0m'));
    assert.equal(observed.events.Stop.count, 1);
  });
});

describe('harness smoke: the verdict names every way a hook can be dead', () => {
  const expected = { SessionStart: 1, PreToolUse: 2, PostToolUse: 1, Stop: 1 };

  it('passes a run where every event completed and the census reached the model', () => {
    const verdict = judge({ runtime: 'claude', observed: parseClaudeStream(CLAUDE_OK), expected, nodeCount: 97 });
    assert.equal(verdict.ok, true, verdict.problems.join('\n'));
  });

  it('fails when a wired event fired fewer times than the wiring promises', () => {
    const observed = parseCodexOutput(CODEX_OK.replace('hook: PostToolUse Completed\n', ''));
    const verdict = judge({ runtime: 'codex', observed, expected: { ...expected, PreToolUse: 3 }, nodeCount: 97 });
    assert.equal(verdict.ok, false);
    assert.match(verdict.problems.join('\n'), /PostToolUse: 0 completed, project wiring expects at least 1 \(untrusted in \/hooks\?\)/);
  });

  it('fails when the model answers a different count than the vault holds', () => {
    const verdict = judge({ runtime: 'claude', observed: parseClaudeStream(CLAUDE_OK), expected, nodeCount: 98 });
    assert.equal(verdict.ok, false);
    assert.match(verdict.problems[0], /model said 97, the vault has 98/);
  });

  it('fails on NONE: a hook that ran but whose context never arrived', () => {
    const observed = parseClaudeStream(CLAUDE_OK.replace('"result":"97"', '"result":"NONE"'));
    const verdict = judge({ runtime: 'claude', observed, expected, nodeCount: 97 });
    assert.equal(verdict.ok, false);
    assert.match(verdict.problems[0], /model said NONE/);
  });

  it('fails when the vault count itself cannot be read, instead of passing by default', () => {
    const verdict = judge({ runtime: 'claude', observed: parseClaudeStream(CLAUDE_OK), expected, nodeCount: null });
    assert.equal(verdict.ok, false);
    assert.match(verdict.problems[0], /could not read the node count/);
  });
});
