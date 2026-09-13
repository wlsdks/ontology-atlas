import { describe, expect, it } from 'vitest';

import { collectHookFacts, hookScriptPath, parseHookConfig, wiredHookCount } from './hook-wiring';

describe('hookScriptPath', () => {
  it('strips the documented project-directory prefix so the path can be tested on disk', () => {
    expect(hookScriptPath('"${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/block-unsafe-git.sh"')).toBe(
      '.claude/hooks/block-unsafe-git.sh',
    );
    expect(hookScriptPath('$CLAUDE_PROJECT_DIR/.claude/hooks/fast-sensor.sh')).toBe(
      '.claude/hooks/fast-sensor.sh',
    );
    expect(hookScriptPath('bash .codex/hooks/block-npm-publish.sh')).toBe(
      '.codex/hooks/block-npm-publish.sh',
    );
  });

  it('refuses a path that still carries a variable rather than guessing where it points', () => {
    // The whole value of `wired` is that the filesystem answered. A path with an unexpanded
    // variable cannot be asked, so the honest answer is "we could not resolve this".
    expect(hookScriptPath('bash $HOOKS_DIR/guard.sh')).toBeNull();
  });

  it('returns null for a command that runs no script', () => {
    expect(hookScriptPath('echo hello')).toBeNull();
  });
});

describe('parseHookConfig', () => {
  it('reads every command out of the shared event → matcher → hooks shape', () => {
    const text = JSON.stringify({
      hooks: {
        PreToolUse: [
          { matcher: 'Bash', hooks: [{ type: 'command', command: 'bash a.sh' }] },
          { matcher: 'exec_command', hooks: [{ type: 'command', command: 'bash a.sh' }] },
        ],
        Stop: [{ hooks: [{ type: 'command', command: 'bash b.sh' }] }],
      },
    });
    expect(parseHookConfig(text)).toEqual([
      { event: 'PreToolUse', command: 'bash a.sh' },
      { event: 'PreToolUse', command: 'bash a.sh' },
      { event: 'Stop', command: 'bash b.sh' },
    ]);
  });

  it('returns nothing rather than throwing on a config it cannot parse', () => {
    expect(parseHookConfig('{ not json')).toEqual([]);
    expect(parseHookConfig('{}')).toEqual([]);
  });
});

describe('collectHookFacts', () => {
  const codexShape = JSON.stringify({
    hooks: {
      PreToolUse: [
        { matcher: 'Bash', hooks: [{ type: 'command', command: 'bash .codex/hooks/guard.sh' }] },
        { matcher: 'exec_command', hooks: [{ type: 'command', command: 'bash .codex/hooks/guard.sh' }] },
        { matcher: 'functions.exec_command', hooks: [{ type: 'command', command: 'bash .codex/hooks/guard.sh' }] },
      ],
      Stop: [{ hooks: [{ type: 'command', command: 'bash .codex/hooks/missing.sh' }] }],
    },
  });

  it('counts one script once however many matchers repeat it, and joins the events', async () => {
    // Codex fans a single Bash call out across three matchers. Counting config entries would
    // report three guards where one script exists — a number that flatters the repository.
    const facts = await collectHookFacts(
      '.codex/hooks.json',
      codexShape,
      async (path) => path === '.codex/hooks/guard.sh',
      { approvalGate: true },
    );
    expect(facts.hooks).toHaveLength(2);
    const guard = facts.hooks.find((hook) => hook.ref.path === '.codex/hooks/guard.sh');
    expect(guard?.events).toBe('PreToolUse');
    expect(guard?.status).toBe('wired');
  });

  it('marks a named-but-absent script missing, because an unresolved guard fails silently', async () => {
    const facts = await collectHookFacts(
      '.codex/hooks.json',
      codexShape,
      async (path) => path === '.codex/hooks/guard.sh',
      { approvalGate: true },
    );
    expect(facts.hooks.find((hook) => hook.ref.path === '.codex/hooks/missing.sh')?.status).toBe(
      'missing',
    );
  });

  it('keeps a command it cannot resolve visible as unresolved instead of dropping the row', async () => {
    const facts = await collectHookFacts(
      '.claude/settings.json',
      JSON.stringify({ hooks: { Stop: [{ hooks: [{ command: 'pnpm lint' }] }] } }),
      async () => true,
      { approvalGate: false },
    );
    expect(facts.hooks).toHaveLength(1);
    expect(facts.hooks[0]?.status).toBe('unresolved');
    expect(facts.hooks[0]?.ref.command).toBe('pnpm lint');
  });

  it('carries the approval gate as a fact of the group, never resolved to a pass', async () => {
    const claude = await collectHookFacts('.claude/settings.json', '{}', async () => true, {
      approvalGate: false,
    });
    const codex = await collectHookFacts('.codex/hooks.json', '{}', async () => true, {
      approvalGate: true,
    });
    expect(claude.approvalGate).toBe(false);
    expect(codex.approvalGate).toBe(true);
  });

  it('counts only scripts the filesystem confirmed', async () => {
    const facts = await collectHookFacts(
      '.codex/hooks.json',
      codexShape,
      async (path) => path === '.codex/hooks/guard.sh',
      { approvalGate: true },
    );
    expect(wiredHookCount([facts])).toBe(1);
  });
});
