import { describe, expect, it } from 'vitest';

import { analyzeAgentFiles } from '@/entities/agent-files';
import { buildSkillParityModel } from './skill-parity';

/**
 * Real files through the real `analyzeAgentFiles`, so the fold breaks when the analysis shape
 * changes; a hand-built fixture would hide that.
 */
function analyze(files: Array<{ path: string; content: string }>) {
  return analyzeAgentFiles({
    files,
    existingPaths: files.map((f) => f.path),
    unverifiablePrefixes: ['.'],
    verifiableExtensions: ['.md'],
  });
}

describe('buildSkillParityModel', () => {
  it('calls a skill agreed when both copies match byte for byte', () => {
    const model = buildSkillParityModel(
      analyze([
        { path: '.claude/skills/po-pass/SKILL.md', content: '# po-pass\n' },
        { path: '.agents/skills/po-pass/SKILL.md', content: '# po-pass\n' },
      ]),
    );
    expect(model.rows).toEqual([
      {
        name: 'po-pass',
        verdict: 'agreed',
        presentIn: ['.agents/skills', '.claude/skills'],
        files: [],
      },
    ]);
    expect(model.disagreeing).toBe(0);
  });

  it('names the diverged file, not just the skill', () => {
    const model = buildSkillParityModel(
      analyze([
        {
          path: '.claude/skills/motion-verify/SKILL.md',
          content: '# motion-verify\n`?guides=off` 로 첫 방문 안내를 끄고 잰다.\n',
        },
        { path: '.agents/skills/motion-verify/SKILL.md', content: '# motion-verify\n' },
      ]),
    );
    expect(model.rows[0].verdict).toBe('diverged');
    expect(model.rows[0].files).toEqual(['SKILL.md']);
    expect(model.disagreeing).toBe(1);
  });

  /** One tree present is setup, not drift, matching the CLI's `not-applicable`. */
  it('says nothing when only one tree exists — that is setup, not drift', () => {
    const model = buildSkillParityModel(
      analyze([
        { path: '.claude/skills/chief-only/SKILL.md', content: 'x' },
        { path: '.claude/skills/another/SKILL.md', content: 'y' },
      ]),
    );
    expect(model).toEqual({ rows: [], disagreeing: 0 });
  });

  it('flags a skill missing from one tree once both trees are in play', () => {
    const model = buildSkillParityModel(
      analyze([
        { path: '.claude/skills/shared/SKILL.md', content: 'same' },
        { path: '.agents/skills/shared/SKILL.md', content: 'same' },
        { path: '.claude/skills/claude-only/SKILL.md', content: 'x' },
      ]),
    );
    expect(model.rows.find((r) => r.name === 'claude-only')).toMatchObject({
      verdict: 'one-sided',
      presentIn: ['.claude/skills'],
    });
    expect(model.rows.find((r) => r.name === 'shared')?.verdict).toBe('agreed');
  });

  /** Judging by folder alone would call this `agreed`. */
  it('flags a per-file gap inside a skill that exists on both sides', () => {
    const model = buildSkillParityModel(
      analyze([
        { path: '.claude/skills/ontology-bootstrap/SKILL.md', content: 'same' },
        { path: '.agents/skills/ontology-bootstrap/SKILL.md', content: 'same' },
        { path: '.claude/skills/ontology-bootstrap/guides/meaning.md', content: 'only here' },
      ]),
    );
    expect(model.rows[0].verdict).toBe('one-sided');
    expect(model.rows[0].files).toEqual(['guides/meaning.md']);
  });

  it('sorts rows by name so the list does not reshuffle between reads', () => {
    const model = buildSkillParityModel(
      analyze([
        { path: '.claude/skills/zeta/SKILL.md', content: 'a' },
        { path: '.agents/skills/zeta/SKILL.md', content: 'a' },
        { path: '.claude/skills/alpha/SKILL.md', content: 'b' },
        { path: '.agents/skills/alpha/SKILL.md', content: 'b' },
      ]),
    );
    expect(model.rows.map((r) => r.name)).toEqual(['alpha', 'zeta']);
  });

  it('is empty — not broken — when the vault has no skill trees at all', () => {
    const model = buildSkillParityModel(analyze([{ path: 'AGENTS.md', content: '# agents' }]));
    expect(model).toEqual({ rows: [], disagreeing: 0 });
  });
});
