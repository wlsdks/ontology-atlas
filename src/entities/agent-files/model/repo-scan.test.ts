import { describe, expect, it } from 'vitest';

import { guideCitation, UNCITED_TOOLS } from './guide-citations';
import { scanHarness, type HarnessScanPort } from './repo-scan';

/**
 * A fixture repository, written as the paths it contains. It deliberately includes the shapes that
 * have caused wrong numbers before: a dot directory (invisible to the browser's file API), a nested
 * `AGENTS.md` one level down and another three levels down, a Codex config that repeats one script
 * across matchers, and a hook whose script is named but absent.
 */
function fixturePort(files: Record<string, string>): HarnessScanPort {
  const paths = Object.keys(files);
  return {
    async listDir(relativePath) {
      const prefix = relativePath ? `${relativePath}/` : '';
      const names = new Map<string, 'file' | 'directory'>();
      let seen = false;
      for (const path of paths) {
        if (!path.startsWith(prefix)) continue;
        const rest = path.slice(prefix.length);
        if (!rest) continue;
        seen = true;
        const slash = rest.indexOf('/');
        if (slash === -1) names.set(rest, 'file');
        else names.set(rest.slice(0, slash), 'directory');
      }
      if (!seen) return null;
      return [...names].map(([name, kind]) => ({ name, kind }));
    },
    async readText(relativePath) {
      const text = files[relativePath];
      return text === undefined ? null : { text, lastModified: 1_757_000_000_000 };
    },
  };
}

const REPO = {
  'package.json': JSON.stringify({
    scripts: {
      dev: 'next dev',
      lint: 'eslint',
      'test:run': 'vitest run',
      'test:contracts': 'vitest run tests/contract',
      typecheck: 'tsc --noEmit',
      'agents:check': 'node cli/src/index.mjs agent-files',
      build: 'next build',
    },
  }),
  'AGENTS.md': '# root guide\n',
  'CLAUDE.md': '# claude wrapper\n',
  'src/AGENTS.md': '# nested one level\n',
  'cli/templates/vault/AGENTS.md': '# starter vault data, three levels deep\n',
  '.claude/rules/forbidden.md': '# forbidden\n',
  '.claude/rules/git.md': '# git\n',
  '.claude/skills/po-pass/SKILL.md': 'same bytes\n',
  '.agents/skills/po-pass/SKILL.md': 'same bytes\n',
  '.claude/agents/chief.md': 'claude copy\n',
  '.agents/agents/chief.md': 'DIFFERENT copy\n',
  '.claude/hooks/guard.sh': '#!/bin/sh\n',
  '.codex/hooks/guard.sh': '#!/bin/sh\n',
  '.githooks/pre-commit': '#!/bin/sh\n',
  '.githooks/commit-msg': '#!/bin/sh\n',
  '.claude/settings.json': JSON.stringify({
    hooks: {
      PreToolUse: [
        {
          matcher: 'Bash',
          hooks: [{ type: 'command', command: '"${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/guard.sh"' }],
        },
      ],
      Stop: [
        {
          hooks: [{ type: 'command', command: '"${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/gone.sh"' }],
        },
      ],
    },
  }),
  '.codex/hooks.json': JSON.stringify({
    hooks: {
      PreToolUse: [
        { matcher: 'Bash', hooks: [{ type: 'command', command: 'bash .codex/hooks/guard.sh' }] },
        { matcher: 'exec_command', hooks: [{ type: 'command', command: 'bash .codex/hooks/guard.sh' }] },
      ],
    },
  }),
};

describe('scanHarness — which tool reads which file', () => {
  it('resolves the tools for each guide through the repository’s one classifier', async () => {
    const report = await scanHarness(fixturePort(REPO));
    const tools = (path: string) =>
      report.analysis.records.find((record) => record.path === path)?.tools ?? [];
    expect(tools('CLAUDE.md')).toEqual(['claude-code']);
    expect(tools('AGENTS.md')).toContain('codex');
    expect(tools('AGENTS.md')).not.toContain('claude-code');
    expect(tools('.claude/rules/git.md')).toEqual(['claude-code']);
    expect(tools('.agents/skills/po-pass/SKILL.md')).toEqual(['codex']);
  });

  it('reads dot directories, which the browser file API cannot see at all', async () => {
    const report = await scanHarness(fixturePort(REPO));
    const paths = report.analysis.records.map((record) => record.path);
    expect(paths).toContain('.claude/rules/forbidden.md');
    expect(paths).toContain('.agents/agents/chief.md');
    expect(paths).toContain('.codex/hooks.json');
  });

  it('counts a nested AGENTS.md one level down and not the starter vault three levels down', async () => {
    const report = await scanHarness(fixturePort(REPO));
    const paths = report.analysis.records.map((record) => record.path);
    expect(paths).toContain('src/AGENTS.md');
    expect(paths).not.toContain('cli/templates/vault/AGENTS.md');
  });
});

describe('scanHarness — the size cap', () => {
  it('measures the merged root + worst nested document, which is what Codex truncates', async () => {
    const big = 'x'.repeat(20_000);
    const report = await scanHarness(
      fixturePort({ ...REPO, 'AGENTS.md': big, 'src/AGENTS.md': 'y'.repeat(15_000) }),
    );
    const cap = report.analysis.checks.codexSizeCap;
    // Each file alone clears 32 KiB; merged they do not. Measuring one file would print a pass.
    expect(cap.agentsMdBytes).toBe(20_000);
    expect(cap.worstCaseBytes).toBe(35_000);
    expect(cap.capBytes).toBe(32 * 1024);
    expect(cap.status).toBe('drift');
  });
});

describe('scanHarness — declared mirror pairs', () => {
  it('reports a byte difference only inside a pair the repository itself declares', async () => {
    const report = await scanHarness(fixturePort(REPO));
    expect(report.analysis.checks.skillCopy.divergedFiles).toBe(0);
    expect(report.analysis.checks.agentCopy.divergedFiles).toBe(1);
  });

  it('does not call the adapted Claude/Codex hook scripts a mirror pair', async () => {
    // `.claude/hooks/*.sh` and `.codex/hooks/*.sh` are adapted, not copied — Codex delivers an
    // edit as an apply_patch envelope. Treating them as a byte-identical pair would print drift
    // on a repository that is behaving exactly as its own contract requires.
    const report = await scanHarness(
      fixturePort({ ...REPO, '.codex/hooks/guard.sh': '#!/bin/sh\n# adapted for apply_patch\n' }),
    );
    expect(report.analysis.checks.agentCopy.divergedFiles).toBe(1);
    expect(report.analysis.checks.skillCopy.divergedFiles).toBe(0);
  });
});

describe('scanHarness — hooks', () => {
  it('says wired only when the named script is on disk, and missing when it is not', async () => {
    const report = await scanHarness(fixturePort(REPO));
    const claude = report.hookGroups.find((group) => group.configPath === '.claude/settings.json');
    expect(claude?.hooks.find((hook) => hook.ref.path?.endsWith('guard.sh'))?.status).toBe('wired');
    expect(claude?.hooks.find((hook) => hook.ref.path?.endsWith('gone.sh'))?.status).toBe('missing');
  });

  it('marks the Codex group as gated on an approval no file can answer', async () => {
    const report = await scanHarness(fixturePort(REPO));
    expect(report.hookGroups.find((g) => g.configPath === '.codex/hooks.json')?.approvalGate).toBe(true);
    expect(report.hookGroups.find((g) => g.configPath === '.claude/settings.json')?.approvalGate).toBe(false);
  });
});

describe('scanHarness — the two numbers in the sentence', () => {
  it('counts guide documents and leaves out the wiring layer', async () => {
    const report = await scanHarness(fixturePort(REPO));
    // AGENTS.md, CLAUDE.md, src/AGENTS.md, 2 rules, 2 skill copies, 2 agent copies = 9.
    // `.claude/settings.json`, `.codex/*` and the hook scripts are enforcement, not prose.
    expect(report.guideDocumentCount).toBe(9);
  });

  it('publishes the check number as three auditable parts, never as a bare total', async () => {
    const report = await scanHarness(fixturePort(REPO));
    expect(report.checks.wiredHooks).toBe(2);
    expect(report.checks.gitHooks).toBe(2);
    expect(report.checks.scripts).toEqual(['lint', 'test:contracts', 'test:run', 'typecheck']);
    expect(report.checks.total).toBe(8);
  });

  it('states that its change times are file modification times, not commit dates', async () => {
    const report = await scanHarness(fixturePort(REPO));
    expect(report.timesAreFileMtime).toBe(true);
    expect(report.times.find((time) => time.path === 'AGENTS.md')?.lastModified).toBe(1_757_000_000_000);
  });
});

describe('guide citations', () => {
  it('carries the document behind each claim the repository cannot verify itself', () => {
    expect(guideCitation('agents-md', 'codex')?.source).toMatch(/developers\.openai\.com/);
    expect(guideCitation('claude-md', 'claude-code')?.source).toMatch(/^https:\/\//);
  });

  it('states a condition the repository cannot see rather than a flat "reads it"', () => {
    expect(guideCitation('agents-md', 'copilot')?.condition).toBe('coding-agent');
    expect(guideCitation('agents-md', 'gemini-cli')?.condition).toBe('settings-context');
  });

  it('returns null for a claim with no source, so the screen can say so', () => {
    expect(guideCitation('agents-md', 'antigravity')).toBeNull();
    expect(UNCITED_TOOLS).toContain('antigravity');
  });
});
