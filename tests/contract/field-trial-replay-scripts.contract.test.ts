import { execFileSync } from 'node:child_process';
import { accessSync, constants, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **The field trial's replay assets have to still run.**
 *
 * These four files are the only way the ontology trial gets repeated after a
 * construction-rule change instead of being skipped. They are shell and Node
 * scripts, so nothing else in this repository type-checks, lints, or imports
 * them — a broken quote or a lost executable bit would be found by the next
 * person who needed the measurement, at the moment they needed it.
 *
 * The sharpest check here is the last one. `acp-replay.sh` must read the app's
 * handoff **out of the app source at run time**. A copy pasted into the script
 * would keep the trial measuring a wording the app stopped sending, and every
 * number the trial produces would then be about a prompt that no longer exists —
 * silently, and in the direction that makes the results look stable.
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
    const skill = readFileSync(SKILL, 'utf8');
    const section = skill.slice(skill.indexOf('## Headless ACP replay'));
    expect(section.startsWith('## Headless ACP replay')).toBe(true);
    for (const name of ALL_ASSETS) expect(section).toContain(name);
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
    expect(script).toContain('src/features/acp-session/model/use-acp-session.ts');
    expect(script).toContain('src/features/first-run-starter/model/build-from-code-prompt.ts');
  });
});
