import { describe, expect, it } from 'vitest';

import { buildFromCodePrompt } from './build-from-code-prompt';

/**
 * What the door sends is the person's first turn, so its order is the order the build takes.
 *
 * Reproduced against an unfamiliar repository: step 3 used to say only «only then create the nodes
 * and relations», and the agent — reading it beside a handoff that routed every build into the bulk
 * qualification lifecycle — spent a whole turn authoring a proposal, stopped at `canWrite:false`,
 * and left the vault empty after the person had already approved the build. So the step that writes
 * now names the path that finishes in one session, and these tests hold that order and those calls.
 */
describe('코드로 첫 온톨로지 — 보낸 순서가 곧 만드는 순서다', () => {
  const prompt = buildFromCodePrompt('/Users/dana/my-product', null);
  // The prompt is wrapped for the transcript, so a sentence can straddle a line break. What is
  // asserted is the sentence, not where it happens to wrap.
  const flat = prompt.replace(/\s+/g, ' ');

  it('세 단계가 살피기 → 문장으로 제안 → 승인 뒤 쓰기 순서로 온다', () => {
    const survey = prompt.indexOf('1. Survey the code');
    const propose = prompt.indexOf('2. Tell me, in plain sentences');
    const write = prompt.indexOf('3. After I say yes');
    expect(survey).toBeGreaterThan(-1);
    expect(propose).toBeGreaterThan(survey);
    expect(write).toBeGreaterThan(propose);
  });

  it('제안 단계가 후보마다 정의·경계·근거 파일을 요구한다', () => {
    expect(flat).toContain('a single sentence defining it');
    expect(flat).toContain('what it includes and what it excludes');
    expect(flat).toContain('the file that proves it');
  });

  it('쓰기 단계가 작은 검토 묶음과 그 뒤 세 호출을 이름으로 부른다', () => {
    expect(flat).toContain('small reviewed batches');
    // Each write still carries what makes it judgeable later.
    expect(flat).toContain('each node carrying its definition and its boundary in the body');
    expect(flat).toContain('each relation carrying a `why`');
    for (const tool of ['`validate_vault`', '`connect_project_source`', '`finalize_project_meaning`']) {
      expect(flat).toContain(tool);
    }
  });

  it('불러야 할 조사 도구만 부르고, 대량 승인 경로를 기다리게 하지 않는다', () => {
    expect(flat).toContain('`analyze_repo_structure`');
    expect(flat).toContain('`infer_imports`');
    // The bulk qualification lifecycle cannot complete in an app session; this turn must not
    // send the agent after it.
    expect(prompt).not.toContain('canWrite');
    expect(prompt).not.toContain('writePlan');
    expect(prompt).not.toContain('qualification');
  });

  it('세는 것이 아니라 근거를 고르라고 말하고, 겹치면 묻게 한다', () => {
    expect(flat).toContain('Prefer few, well-evidenced concepts over many thin ones.');
    expect(flat).toContain('ask me instead of making both');
  });

  it('살필 대상은 볼트가 아니라 그것을 품은 프로젝트다', () => {
    expect(prompt).toContain('/Users/dana/my-product (the vault sits inside it, at /Users/dana/my-product/atlas)');
  });
});
