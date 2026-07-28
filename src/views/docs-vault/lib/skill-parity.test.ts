import { describe, expect, it } from 'vitest';

import { analyzeAgentFiles } from './agent-files';
import { buildSkillParityModel } from './skill-parity';

/**
 * 이 테스트는 **가짜 분석 객체를 짓지 않는다.** 진짜 `analyzeAgentFiles` 에
 * 파일을 먹여 접기까지 통째로 돈다 — 접는 함수가 분석의 실제 출력 모양과
 * 어긋나면 그 순간 터져야 하기 때문이다. 손으로 만든 픽스처는 그 어긋남을
 * 영원히 숨긴다.
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
   * 실측된 결함의 모양 그대로 — `.claude` 사본에만 어제 배운 규율이 있고
   * Codex 는 그것 없이 판정한다.
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
   * **한쪽 트리만 있으면 일치 질문이 성립하지 않는다.** `.agents/skills` 가
   * 아예 없다는 것은 "Codex 를 설정하지 않았다" 는 뜻이지 사본이 갈렸다는 뜻이
   * 아니다. 스킬마다 한 줄씩 그리면 **사실 하나가 열한 줄**이 되어, 아무 일도
   * 없는 볼트가 문제투성이로 보인다. CLI 도 이 경우를 `not-applicable` 로
   * 답하고, 계약 테스트가 그 어긋남을 잡았다.
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
   * 스킬 폴더는 양쪽에 있는데 **안의 파일 하나가** 한쪽에만 있는 경우.
   * 폴더만 보고 판정하면 이걸 `agreed` 로 놓친다.
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
