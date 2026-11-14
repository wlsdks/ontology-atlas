import { describe, expect, it } from 'vitest';

import { ruleGlobs, scriptPathScopes, workflowPathFilters } from './scope-declarations';

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

  it.each([
    ['paths: src/**', ['src/**']],
    ['paths: "src/**"', ['src/**']],
    ['paths: [src/**, "app/**"]', ['src/**', 'app/**']],
    ['paths: "src/**, app/**"', ['src/**', 'app/**']],
  ])('reads the inline form %s', (line, globs) => {
    expect(ruleGlobs(`---\n${line}\n---\n\n# Scoped\n`)).toEqual(globs);
  });

  it('returns nothing for an always-loaded rule', () => {
    /* No `paths:` means loaded every session. */
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

  it('over-collects a regex that is not a path, quoting it rather than guessing', () => {
    /* `/^eslint/` is extracted too; the screen shows the declaration for a reader to judge. */
    expect(scriptPathScopes('if (/^eslint/.test(finding)) return;')).toContain('eslint');
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

  it('does not read paths-ignore as a path scope', () => {
    const yaml = ['on:', '  push:', '    paths-ignore:', '      - "docs/**"', '', 'jobs:', '  a:'].join('\n');
    expect(workflowPathFilters(yaml)).toEqual([]);
  });

  it('does not read a job step as a path filter', () => {
    /* An unfiltered workflow runs for every change; its steps are not mined for paths. */
    const yaml = ['on:', '  pull_request:', '', 'jobs:', '  a:', '    steps:', '      - run: vitest run src/views'].join('\n');
    expect(workflowPathFilters(yaml)).toEqual([]);
  });
});
