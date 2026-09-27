import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { rules } from '../../scripts/lib/check-rules/security.mjs';
import { changedPaths } from '../../scripts/quality/source-areas.mjs';
import { judgeRatchet, resolveRatchetBase } from './lib/ratchet-base';

const ROOT = process.cwd();
const patterns: RegExp[] = rules.flatMap((rule: { matches: RegExp[] }) => rule.matches);
const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
const covered = (path: string): boolean => patterns.some((pattern) => pattern.test(path));
const read = (root: string, path: string): string =>
  existsSync(join(root, path)) ? readFileSync(join(root, path), 'utf8') : '';
const contractFiles = (command: string): string[] =>
  command.split(/\s+/).filter((token) => token.startsWith('tests/contract/'));
const RAW_SINK = /dangerouslySetInnerHTML|window\.open\(/g;
const renderedSources = (paths: string[]): string[] =>
  paths.filter((path) => /^(?:src|app)\/.+\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path));

describe('security surfaces', () => {
  it('matches at least one tracked file with every surface pattern', () => {
    expect(patterns.length).toBeGreaterThan(20);
    expect(patterns.filter((pattern) => !tracked.some((path) => pattern.test(path))).map(String)).toEqual([]);
  });

  it('registers every raw-HTML, Markdown and window.open sink as a surface', () => {
    const sinks = renderedSources(tracked).filter((path) =>
      /dangerouslySetInnerHTML|from ['"]react-markdown['"]|window\.open\(/.test(read(ROOT, path)),
    );
    expect(sinks.length).toBeGreaterThanOrEqual(10);
    expect(sinks.filter((path) => !covered(path))).toEqual([]);
  });

  it('registers every Tauri command file as a surface', () => {
    const commands = tracked.filter(
      (path) => /^src-tauri\/src\/.+\.rs$/.test(path) && read(ROOT, path).includes('#[tauri::command]'),
    );
    expect(commands.length).toBeGreaterThan(0);
    expect(commands.filter((path) => !covered(path))).toEqual([]);
  });

  it('registers every source file that imports invoke from the Tauri core as a surface', () => {
    const callers = tracked.filter(
      (path) =>
        /^src\/.+\.tsx?$/.test(path) &&
        !/\.test\.tsx?$/.test(path) &&
        /import\s*\{[^}]*\binvoke\b[^}]*\}\s*from\s*['"]@tauri-apps\/api\/core['"]/.test(read(ROOT, path)),
    );
    expect(callers.length).toBeGreaterThan(0);
    expect(callers.filter((path) => !covered(path))).toEqual([]);
  });

  it('runs the same existing contracts from pnpm test:security and from both check rules', () => {
    const listed = contractFiles(JSON.parse(read(ROOT, 'package.json')).scripts['test:security'] as string);
    expect(listed.length).toBeGreaterThanOrEqual(19);
    expect(listed.filter((path) => !existsSync(join(ROOT, path)))).toEqual([]);
    for (const rule of rules) expect(contractFiles(rule.command)).toEqual(listed);
  });

  it('adds no raw-HTML or window.open sink without a raise record', () => {
    const base = resolveRatchetBase();
    const changed = renderedSources(changedPaths(base));
    const judgement = judgeRatchet({
      gate: 'security-raw-sinks',
      measure: (root) => changed.reduce((sum, path) => sum + (read(root, path).match(RAW_SINK) ?? []).length, 0),
      reads: changed,
      fallback: Number.POSITIVE_INFINITY,
      base,
    });
    expect(judgement.current, judgement.explain).toBeLessThanOrEqual(judgement.ceiling);
  });
});
