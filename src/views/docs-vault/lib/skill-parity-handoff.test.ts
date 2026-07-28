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
   * **죽은 채널을 부르지 않는다.** `npx ontology-atlas` / `ontology-atlas <cmd>`
   * 는 레지스트리에 없어 404 다(`surfaces.md`). 그리고 우리는 이 컴퓨터의 CLI
   * 체크아웃 경로를 모르므로, 아는 척 적으면 그 자체가 죽은 안내가 된다.
   */
  it('never emits a shell command it cannot guarantee', () => {
    const text = buildSkillParityHandoff([diverged, oneSided], ROOT);
    expect(text).not.toMatch(/npx\s+ontology-atlas/);
    expect(text).not.toMatch(/(^|\s)ontology-atlas\s+agent-files/);
    expect(text).not.toMatch(/node\s+.*cli\/src\/index\.mjs/);
  });

  /**
   * 자동 병합을 시키지 않는다 — 어느 사본이 최신인지는 **내용을 읽어야** 알고,
   * 임의로 한쪽을 정본으로 삼으면 어제 배운 규율이 조용히 지워진다.
   */
  it('asks the agent to judge, and to stop and ask when unsure', () => {
    const text = buildSkillParityHandoff([diverged], ROOT);
    expect(text).toContain('판단');
    expect(text).toContain('물어봐');
  });

  /**
   * 붙여넣는 쪽은 대개 **다른 창의 에이전트 세션**이고 그 세션의 작업
   * 디렉터리가 이 볼트라는 보장이 없다. 상대 경로만 주면 그 세션은 엉뚱한
   * 곳을 열거나, 더 나쁘게 같은 이름의 다른 파일을 고친다. 절대 경로는
   * 이미 알고 있으니(브리지가 그것으로 읽었다) 반드시 싣는다.
   */
  it('anchors every path to the absolute vault root', () => {
    const text = buildSkillParityHandoff([diverged], ROOT);
    expect(text).toContain(`${ROOT}/.claude/skills/`);
    expect(text).toContain(`${ROOT}/.agents/skills/`);
    // 앵커 없는 맨몸 상대 경로가 남아 있으면 안 된다.
    expect(text).not.toMatch(/(^|\s)\.claude\/skills\//m);
  });

  it('is empty when there is nothing to hand off', () => {
    expect(buildSkillParityHandoff([], ROOT)).toBe('');
  });
});
