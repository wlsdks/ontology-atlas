import { describe, expect, it } from 'vitest';

import {
  commandPathScopes,
  literalPrefix,
  ruleGlobs,
  scopeReaches,
  scriptPathScopes,
  workflowPathFilters,
} from './coverage-scopes';

describe('literalPrefix — a glob reduced to the folder it certainly touches', () => {
  it('stops at the first wildcard segment', () => {
    expect(literalPrefix('src/**')).toBe('src');
    expect(literalPrefix('src/**/*.tsx')).toBe('src');
    expect(literalPrefix('scripts/check-*.mjs')).toBe('scripts');
    expect(literalPrefix('tests/contract/**')).toBe('tests/contract');
  });

  it('keeps a plain file path whole', () => {
    expect(literalPrefix('next.config.ts')).toBe('next.config.ts');
    expect(literalPrefix('.claude/rules/design.md')).toBe('.claude/rules/design.md');
  });

  it('returns nothing for a glob that starts with a wildcard', () => {
    /* `**` + `/*.test.ts` reaches every folder in the repository. Treating its prefix as a folder
       name would attach it to one area and hide it from the rest. */
    expect(literalPrefix('**/*.test.ts')).toBe('');
    expect(literalPrefix('*.md')).toBe('');
  });
});

describe('scopeReaches — containment runs both ways', () => {
  it('reaches a path inside the scope', () => {
    expect(scopeReaches('src', 'src/features/vault-agent')).toBe(true);
  });

  it('reaches a scope inside the path', () => {
    /* A check naming one file inside `cli/src` is a check that names that capability. */
    expect(scopeReaches('cli/src/lib/architecture-results.test.mjs', 'cli/src')).toBe(true);
  });

  it('does not treat a shared name prefix as containment', () => {
    expect(scopeReaches('src', 'src-tauri/src/acp.rs')).toBe(false);
    expect(scopeReaches('eslint', 'eslint.config.mjs')).toBe(false);
  });
});

describe('ruleGlobs — the paths a .claude rule declares', () => {
  const rule = [
    '---',
    'paths:',
    '  - "src/**"',
    '  - "app/**"',
    '  - next.config.ts',
    'description: whatever',
    '---',
    '',
    '# Architecture',
  ].join('\n');

  it('reads the list in the order written', () => {
    expect(ruleGlobs(rule)).toEqual(['src/**', 'app/**', 'next.config.ts']);
  });

  it('returns nothing for an always-loaded rule', () => {
    /* Empty here means "declares no path", which the caller turns into "reaches every area" —
       never into "reaches nothing". */
    expect(ruleGlobs('# Forbidden patterns\n\nNo frontmatter at all.\n')).toEqual([]);
    expect(ruleGlobs('---\ndescription: always\n---\n\n# Git\n')).toEqual([]);
  });
});

describe('scriptPathScopes — what a guard script says about itself', () => {
  it('reads an anchored lane filter, including its alternation', () => {
    const hook = [
      '#!/bin/sh',
      "touched '^(src|app)/.*\\.(ts|tsx)$' && lane typecheck 'pnpm exec tsc --noEmit'",
      "touched '^mcp/|^cli/' && lane mcp 'pnpm docs:surface:check'",
    ].join('\n');
    expect(scriptPathScopes(hook).sort()).toEqual(['app', 'cli', 'mcp', 'src']);
  });

  it('reads a quoted list of guarded prefixes', () => {
    const guard = 'const blocked = [\n  "src/entities/docs-vault/data/",\n  "public/docs-vault/",\n];';
    expect(scriptPathScopes(guard).sort()).toEqual([
      'public/docs-vault',
      'src/entities/docs-vault/data',
    ]);
  });

  it('over-collects a regex that is not a path, which the disk probe then drops', () => {
    /*
     * `/^eslint/` tests a finding name. The extractor cannot tell it from a folder and is not
     * asked to: `resolveScopeDeclarations` keeps only what resolves, and the declaration text is
     * printed beside the claim so a reader can check. Asserted rather than fixed, because a
     * cleverer extractor here would be guessing.
     */
    expect(scriptPathScopes('if (/^eslint/.test(finding)) return;')).toContain('eslint');
  });
});

describe('commandPathScopes — the files a check command names', () => {
  it('names the paths it runs over', () => {
    expect(commandPathScopes('node --test cli/src/lib/*.test.mjs').sort()).toEqual(['cli/src/lib']);
  });

  it('names nothing for a repository-wide lane', () => {
    /* The difference the Watched column exists to draw: `vitest` runs over this area and every
       other one, which is a different fact from a check written for this area. */
    expect(commandPathScopes('vitest run')).toEqual([]);
    expect(commandPathScopes('eslint --max-warnings 0')).toEqual([]);
    expect(commandPathScopes('tsc --noEmit')).toEqual([]);
  });
});

describe('workflowPathFilters — only the trigger block is a path filter', () => {
  it('reads a declared paths filter', () => {
    const yaml = [
      'on:',
      '  pull_request:',
      '    paths:',
      '      - "src-tauri/**"',
      '      - .github/workflows/release-macos.yml',
      '',
      'jobs:',
      '  build:',
      '    steps:',
      '      - run: pnpm exec vitest run src/views/download',
    ].join('\n');
    expect(workflowPathFilters(yaml)).toEqual([
      'src-tauri/**',
      '.github/workflows/release-macos.yml',
    ]);
  });

  it('does not read a job step as a path filter', () => {
    /* A workflow with no filter runs for every change. Mining its steps for paths would credit one
       area with a lane that is not scoped to it. */
    const yaml = ['on:', '  pull_request:', '', 'jobs:', '  a:', '    steps:', '      - run: vitest run src/views'].join('\n');
    expect(workflowPathFilters(yaml)).toEqual([]);
  });
});
