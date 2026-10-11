import { execFileSync } from 'node:child_process';
import { accessSync, constants, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { readSkillProcedure } from '../helpers/read-skill-procedure';

/**
 * Replay scripts are shell and Node that nothing type-checks, so a broken quote surfaces late.
 * `acp-replay.sh` must read the app's handoff from the app source at run time; a pasted copy would
 * measure a prompt that no longer exists.
 */

const ROOT = process.cwd();
const SCRIPTS = join(ROOT, '.claude', 'skills', 'ontology-field-trial', 'scripts');
const SKILL = join(ROOT, '.claude', 'skills', 'ontology-field-trial', 'SKILL.md');

const SHELL_SCRIPTS = ['acp-replay.sh', 'sealed-reader.sh'];
const ALL_ASSETS = [...SHELL_SCRIPTS, 'scan-findings.mjs', 'sealed-questions.template.md'];

const read = (name: string) => readFileSync(join(SCRIPTS, name), 'utf8');

describe('field trial replay scripts', () => {
  it.each(ALL_ASSETS)('%s exists and is not empty', (name) => {
    expect(statSync(join(SCRIPTS, name)).size).toBeGreaterThan(0);
  });

  it.each([...SHELL_SCRIPTS, 'scan-findings.mjs'])('%s is executable', (name) => {
    expect(() => accessSync(join(SCRIPTS, name), constants.X_OK)).not.toThrow();
  });

  it.each(SHELL_SCRIPTS)('%s parses', (name) => {
    expect(() => execFileSync('bash', ['-n', join(SCRIPTS, name)], { stdio: 'pipe' })).not.toThrow();
  });

  it('scan-findings.mjs reports this repository\'s own vault', () => {
    const stdout = execFileSync(
      process.execPath,
      [join(SCRIPTS, 'scan-findings.mjs'), join(ROOT, 'docs', 'ontology'), ROOT],
      { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
    );
    const report = JSON.parse(stdout);
    expect(typeof report).toBe('object');
    // The dogfood vault is the one corpus that is always present; below 50 nodes
    // means the scanner stopped reading, not that the vault shrank.
    expect(report.nodes).toBeGreaterThan(50);
    expect(report.tally).toBeTypeOf('object');
    expect(report.uncertaintyByKind).toBeTypeOf('object');
  });

  it('the skill section names every asset', () => {
    const skill = readSkillProcedure(SKILL);
    const section = skill.slice(skill.indexOf('## Headless ACP replay'));
    expect(section.startsWith('## Headless ACP replay')).toBe(true);
    const assets = readdirSync(SCRIPTS).filter((name) => !name.startsWith('.'));
    expect(assets.length, 'scripts/ folder read empty').toBeGreaterThanOrEqual(1);
    const unnamed = assets.filter((name) => !section.includes(name));
    expect(unnamed, 'assets in scripts/ that the skill section never names').toEqual([]);
  });

  it('acp-replay.sh drives the two turns the app drives', () => {
    const script = read('acp-replay.sh');
    for (const flag of ['--append-system-prompt', '--strict-mcp-config', '--resume']) {
      expect(script).toContain(flag);
    }
  });

  it('acp-replay.sh holds no copy of the handoff it is supposed to read', () => {
    // The sentence carries backticks in the source it comes from, so a paste of
    // the real thing would slip past a plain substring check — the assertion
    // would then have no subject and would pass forever. Compare without them.
    const withoutCode = read('acp-replay.sh').replaceAll('`', '');
    expect(withoutCode).not.toContain('atlas-vault MCP server is already connected');
  });

  it('acp-replay.sh reads the prompts from the two files the app sends them from', () => {
    const script = read('acp-replay.sh');
    expect(script).toContain('scripts/lib/construction-prompts.mjs');
    expect(script).toMatch(/constructionPrompts\(repoRoot,\s*targetRoot\)/);
    const helper = readFileSync(join(ROOT, 'scripts/lib/construction-prompts.mjs'), 'utf8');
    expect(helper).toContain('src/features/acp-session/model/use-acp-session.ts');
    expect(helper).toContain('src/features/first-run-starter/model/build-from-code-prompt.ts');
  });
});
