import { describe, expect, it } from 'vitest';

import { analyzeAgentFiles } from './agent-files';
import { buildSkillParityModel } from './skill-parity';

/**
 * These tests **do not build a fake analysis object.** They feed real files through the real
 * `analyzeAgentFiles` and run all the way through the fold — so the folding function breaks the
 * moment it diverges from the analysis's actual output shape. A hand-built fixture would hide that
 * divergence forever.
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

  /**
   * The exact shape of the measured defect — a discipline learned yesterday exists only in the
   * `.claude` copy, and Codex judges without it.
   */
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

  /**
   * **With only one tree present, the parity question does not arise.** `.agents/skills` being
   * absent means "Codex was never set up", not that copies diverged. Drawing a row per skill turns
   * **one fact into eleven rows**, making a vault where nothing is wrong look full of problems. The
   * CLI answers this case `not-applicable` too, and a contract test caught the mismatch.
   */
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

  /**
   * The skill folder exists on both sides but **one file inside it** is one-sided. Judging by
   * folder alone would miss this as `agreed`.
   */
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
