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
   * **It never invokes a dead channel.** `npx ontology-atlas` and `ontology-atlas <cmd>` are not in
   * the registry and 404 (`.claude/rules/surfaces.md`). And we do not know this machine's CLI
   * checkout path, so writing one as if we did is itself dead guidance.
   */
  it('never emits a shell command it cannot guarantee', () => {
    const text = buildSkillParityHandoff([diverged, oneSided], ROOT);
    expect(text).not.toMatch(/npx\s+ontology-atlas/);
    expect(text).not.toMatch(/(^|\s)ontology-atlas\s+agent-files/);
    expect(text).not.toMatch(/node\s+.*cli\/src\/index\.mjs/);
  });

  /**
   * It does not order an automatic merge — which copy is newer requires **reading the contents**,
   * and arbitrarily treating one side as canonical silently erases a discipline learned yesterday.
   */
  it('asks the agent to judge, and to stop and ask when unsure', () => {
    const text = buildSkillParityHandoff([diverged], ROOT);
    expect(text).toContain('판단');
    expect(text).toContain('물어봐');
  });

  /**
   * Whoever pastes this is usually **an agent session in another window**, with no guarantee its
   * working directory is this vault. Given only relative paths, that session opens the wrong place
   * or, worse, edits a different file with the same name. The absolute path is already known (the
   * bridge read with it), so it is always included.
   */
  it('anchors every path to the absolute vault root', () => {
    const text = buildSkillParityHandoff([diverged], ROOT);
    expect(text).toContain(`${ROOT}/.claude/skills/`);
    expect(text).toContain(`${ROOT}/.agents/skills/`);
    // No bare relative path may be left without its anchor.
    expect(text).not.toMatch(/(^|\s)\.claude\/skills\//m);
  });

  it('is empty when there is nothing to hand off', () => {
    expect(buildSkillParityHandoff([], ROOT)).toBe('');
  });
});
