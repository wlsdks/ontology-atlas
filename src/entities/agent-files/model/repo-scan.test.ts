import { describe, expect, it } from 'vitest';

import { guideCitation, UNCITED_TOOLS } from './guide-citations';
import { codedFailure } from '@/shared/lib/failures/failure-code';

import { harnessReadClass, isReadableHarnessPath } from './harness-read-scope';
import { scanHarness, type HarnessScanPort } from './repo-scan';

/** A fixture repository with the shapes that have miscounted before: dot dirs, nested and deep AGENTS.md, repeated hook scripts, a missing hook. */
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
      'agents:check': 'node .agents/check-instructions.mjs',
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

describe('scanHarness — a source root that is not there', () => {
  it('fails instead of reporting a harness with nothing in it', async () => {
    await expect(scanHarness(fixturePort({}))).rejects.toMatchObject({ code: 'harness-source-missing' });
  });
});

describe('scanHarness — the size cap', () => {
  it('measures the merged root + worst nested document, which is what Codex truncates', async () => {
    const big = 'x'.repeat(20_000);
    const report = await scanHarness(
      fixturePort({ ...REPO, 'AGENTS.md': big, 'src/AGENTS.md': 'y'.repeat(15_000) }),
    );
    const cap = report.analysis.checks.codexSizeCap;
    // Each file alone is under 32 KiB; merged they are not.
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
    // Hook scripts are adapted per tool, not copied, so they are not a byte-identical pair.
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

describe('scanHarness — check scripts and top-level folders', () => {
  it('lists only the package scripts that lint, type-check or test', async () => {
    const report = await scanHarness(fixturePort(REPO));
    expect(report.checkScripts).toEqual(['lint', 'test:contracts', 'test:run', 'typecheck']);
  });

  it('names the top-level folders, leaving out dot, build, ignored and excluded folders', async () => {
    const report = await scanHarness(
      fixturePort({
        'AGENTS.md': '# guide\n',
        '.gitignore': 'output/\n',
        'src/index.ts': '',
        'app/page.tsx': '',
        'node_modules/react/index.js': '',
        'output/run.log': '',
        'ontology/projects/shop.md': '',
        '.claude/rules/a.md': '# a\n',
      }),
      { excludedFolders: ['ontology'] },
    );
    expect(report.topLevelFolders).toEqual(['app', 'src']);
  });

  it('leaves out folders a plain ignore line names, with or without a slash', async () => {
    const report = await scanHarness(
      fixturePort({
        'AGENTS.md': '# guide\n',
        '.gitignore': 'secrets\n/private\ncache/\n*.log\n!keep\nnested/inner\n',
        'src/index.ts': '',
        'secrets/key.txt': '',
        'private/notes.md': '',
        'cache/blob': '',
        'keep/file.ts': '',
        'nested/inner/file.ts': '',
      }),
    );
    expect(report.topLevelFolders).toEqual(['keep', 'nested', 'src']);
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

describe('scanHarness — what it may read', () => {
  it('reads no document outside the harness allowlist', async () => {
    const port = fixturePort({
      'AGENTS.md': '# Guide\nSee docs/a.md.\n',
      'docs/a.md': 'Details live in docs/b.md.\n',
      'docs/b.md': 'Only another document names this one.\n',
    });
    const read = port.readText.bind(port);
    const reads: string[] = [];
    port.readText = async (path) => {
      reads.push(path);
      return read(path);
    };
    await scanHarness(port);
    expect(reads.filter((path) => !isReadableHarnessPath(path))).toEqual([]);
    expect(reads).not.toContain('docs/a.md');
  });

  it('lists only the root and the harness directories, never an authored folder', async () => {
    const port = fixturePort({
      ...REPO,
      'docs/guide/a.md': 'A document.\n',
      'src/features/x/index.ts': '',
    });
    const list = port.listDir.bind(port);
    const listed: string[] = [];
    port.listDir = async (path) => {
      listed.push(path);
      return list(path);
    };
    await scanHarness(port);
    expect(listed.filter((path) => /^(docs|src)(\/|$)/.test(path))).toEqual([]);
  });

  it('probes a hook script by existence, never by reading it', async () => {
    const files = {
      ...REPO,
      'scripts/check.sh': '#!/bin/sh\n',
      '.claude/settings.json': JSON.stringify({
        hooks: {
          Stop: [{ hooks: [{ type: 'command', command: '"${CLAUDE_PROJECT_DIR:-.}/scripts/check.sh"' }] }],
        },
      }),
    };
    const port = fixturePort(files);
    const read = port.readText.bind(port);
    const reads: string[] = [];
    const probes: string[] = [];
    port.readText = async (path) => {
      reads.push(path);
      return read(path);
    };
    port.pathExists = async (path) => {
      probes.push(path);
      return path in files;
    };
    const report = await scanHarness(port);
    expect(reads).not.toContain('scripts/check.sh');
    expect(probes).toContain('scripts/check.sh');
    const claude = report.hookGroups.find((group) => group.configPath === '.claude/settings.json');
    expect(claude?.hooks[0]?.status).toBe('wired');
  });

  it.each(['/usr/local/bin/x.sh', '~/hooks/x.sh', '../shared/hooks/x.sh'])(
    'reads a hook script outside the repository (%s) as unresolved, never as a failed reading',
    async (script) => {
      const files = {
        ...REPO,
        '.claude/settings.json': JSON.stringify({
          hooks: { Stop: [{ hooks: [{ type: 'command', command: `bash ${script}` }] }] },
        }),
      };
      const port = fixturePort(files);
      port.pathExists = async (path) => {
        if (harnessReadClass(path) === 'invalid') throw codedFailure('harness-path-invalid', path);
        return path in files;
      };
      const report = await scanHarness(port);
      const claude = report.hookGroups.find((group) => group.configPath === '.claude/settings.json');
      expect(claude?.hooks.map((hook) => hook.status)).toEqual(['unresolved']);
    },
  );

  it('never asks the app whether a path a rule declares outside the repository exists', async () => {
    const files = {
      ...REPO,
      '.claude/rules/outside.md': ['---', 'paths:', '  - "../elsewhere/**"', '---', '', '# Outside', ''].join('\n'),
    };
    const port = fixturePort(files);
    const probes: string[] = [];
    port.pathExists = async (path) => {
      probes.push(path);
      if (harnessReadClass(path) === 'invalid') throw codedFailure('harness-path-invalid', path);
      return path in files;
    };
    await scanHarness(port);
    expect(probes.filter((path) => harnessReadClass(path) === 'invalid')).toEqual([]);
  });

  it('carries the on-disk size so a projected file does not shrink the size cap', async () => {
    const port = fixturePort({ ...REPO, 'AGENTS.md': 'short' });
    const read = port.readText.bind(port);
    port.readText = async (path) => {
      const file = await read(path);
      return file && path === 'AGENTS.md' ? { ...file, bytes: 40_000 } : file;
    };
    const report = await scanHarness(port);
    expect(report.analysis.checks.codexSizeCap.agentsMdBytes).toBe(40_000);
  });
});
