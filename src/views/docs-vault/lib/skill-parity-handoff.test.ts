import { describe, expect, it } from 'vitest';

import { buildSkillParityHandoff } from './skill-parity-handoff';
import type { SkillParityRow } from './skill-parity';

const ROOT = '/Users/someone/dev/my-repo';

const diverged: SkillParityRow = {
  name: 'motion-verify',
  verdict: 'diverged',
  presentIn: ['.agents/skills', '.claude/skills'],
  files: ['SKILL.md'],
};
const oneSided: SkillParityRow = {
  name: 'chief-only',
  verdict: 'one-sided',
  presentIn: ['.claude/skills'],
  files: [],
};

describe('buildSkillParityHandoff', () => {
  it('names every row the screen counted — not just the total', () => {
    const text = buildSkillParityHandoff([diverged, oneSided], ROOT);
    expect(text).toContain('motion-verify');
    expect(text).toContain('chief-only');
  });

  it('says which file diverged so the agent knows what to open', () => {
    expect(buildSkillParityHandoff([diverged], ROOT)).toContain('SKILL.md');
  });

  it('says which side a one-sided skill lives on', () => {
    expect(buildSkillParityHandoff([oneSided], ROOT)).toContain('.claude/skills');
  });

  /**
   * `ontology-atlas <cmd>` is not in the registry (`.claude/rules/surfaces.md`), and the CLI
   * checkout path is unknown.
   */
  it('never emits a shell command it cannot guarantee', () => {
    const text = buildSkillParityHandoff([diverged, oneSided], ROOT);
    expect(text).not.toMatch(/npx\s+ontology-atlas/);
    expect(text).not.toMatch(/(^|\s)ontology-atlas\s+agent-files/);
    expect(text).not.toMatch(/node\s+.*cli\/src\/index\.mjs/);
  });

  /** Which copy is newer takes reading; a forced side would erase a newer discipline. */
  it('asks the agent to judge, and to stop and ask when unsure', () => {
    const text = buildSkillParityHandoff([diverged], ROOT);
    expect(text).toContain('판단');
    expect(text).toContain('물어봐');
  });

  /** The pasting session's cwd may be another folder; a relative path could edit a different file. */
  it('anchors every path to the absolute vault root', () => {
    const text = buildSkillParityHandoff([diverged], ROOT);
    expect(text).toContain(`${ROOT}/.claude/skills/`);
    expect(text).toContain(`${ROOT}/.agents/skills/`);
    expect(text).not.toMatch(/(^|\s)\.claude\/skills\//m);
  });

  it('is empty when there is nothing to hand off', () => {
    expect(buildSkillParityHandoff([], ROOT)).toBe('');
  });
});
