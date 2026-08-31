import { describe, expect, it } from 'vitest';

import { NEXT_STEP_MAX_CHARS, splitNextStep } from '@/features/vault-agent/model/next-step';
import { PRODUCT_DISCIPLINE } from '@/features/vault-agent/model/system-prompt';

/**
 * **The `NEXT:` line is a sentence a person could send, not a work order.**
 *
 * ## Why this file exists (2026-08-31)
 *
 * `next-step.ts` lifts the model's last `NEXT:` line onto a chip **verbatim** and
 * prefills the input box with it. Nothing downstream rewrites that text, so
 * whatever the model wrote is what the person is invited to send back. The only
 * place that can decide how the line reads is the instruction in
 * `PRODUCT_DISCIPLINE`, and the first version of it asked only for "the single
 * next gap worth looking at, phrased the way the person could ask you for it" —
 * which left a model free to answer with a slug, an internal noun, or an order.
 *
 * ## What is asserted, and what is deliberately not
 *
 * Nothing here pins a sentence (`.claude/rules/documentation.md`). Each check is
 * a mechanical property of the instruction: the cap it quotes is **read out of
 * the code that enforces it** rather than typed twice, and the example it teaches
 * is run through the real splitter and measured against the real cap. Prose may
 * be rewritten freely; it may not lose a constraint or drift from the cap.
 */

/** The paragraph that governs the chip. Isolated so a failure names the right thing. */
const INSTRUCTION = PRODUCT_DISCIPLINE.split('\n').find((line) =>
  line.includes('starts with `NEXT:`'),
);

/**
 * The words this repository uses to talk to itself. The instruction has to name
 * them, because a model cannot avoid a vocabulary nobody listed.
 */
const INTERNAL_WORDS = ['canonical', 'evidence gap', 'containment', 'handoff', 'receipt'] as const;

describe('NEXT: 지시문 — 사람이 그대로 보낼 수 있는 한 문장을 요구한다', () => {
  it('검사가 헛돌지 않는다 — 프롬프트에서 그 문단을 실제로 찾았다', () => {
    expect(PRODUCT_DISCIPLINE.length).toBeGreaterThan(2_000);
    expect(INSTRUCTION, 'PRODUCT_DISCIPLINE 에 NEXT: 문단이 없다').toBeDefined();
  });

  it('길이 상한을 코드에서 읽어 온다 — 두 군데에 적어 두고 어긋나지 않게', () => {
    expect(INSTRUCTION).toContain(`${NEXT_STEP_MAX_CHARS} characters or fewer`);
  });

  it('한 문장 · 사람의 언어 · 관찰한 사실 먼저를 요구한다', () => {
    const text = INSTRUCTION ?? '';
    expect(text).toContain('one plain sentence');
    expect(text).toContain('send back to you unchanged');
    expect(text).toContain('in the language they are writing to you in');
    expect(text).toContain('Name the concrete thing you observed first');
  });

  it('slug 과 [[...]] 표기를 제목으로 대신하라고 말한다', () => {
    const text = INSTRUCTION ?? '';
    expect(text).toContain('never by a slug');
    expect(text).toContain('[[...]]');
  });

  it('내부에서만 쓰는 말을 하나도 빠짐없이 이름으로 금지한다', () => {
    const text = INSTRUCTION ?? '';
    for (const word of INTERNAL_WORDS) {
      expect(text, `내부 용어 「${word}」를 지시문이 이름으로 막지 않는다`).toContain(word);
    }
  });

  /**
   * The example is the only part a model copies literally, so it must survive the
   * real pipeline: the splitter has to recognise it, and the result has to obey
   * every rule the same paragraph states.
   */
  it('지시문이 든 예시가 자기 규칙을 스스로 통과한다', () => {
    const example = /`(NEXT: [^`]+)`/.exec(INSTRUCTION ?? '')?.[1];
    expect(example, '지시문에 NEXT: 예시가 없다').toBeDefined();

    const { nextStep } = splitNextStep(`Some answer.\n\n${example}`);
    expect(nextStep, '예시가 splitNextStep 에 잡히지 않는다').toBeTruthy();
    expect(nextStep!.length).toBeLessThanOrEqual(NEXT_STEP_MAX_CHARS);
    expect(nextStep, '예시가 잘려서 말줄임표가 붙었다').not.toContain('…');
    expect(nextStep).not.toContain('[[');
    for (const word of INTERNAL_WORDS) {
      expect(nextStep!.toLowerCase(), `예시가 내부 용어 「${word}」를 쓴다`).not.toContain(word);
    }
    // One sentence: exactly one terminator, and it ends the line.
    expect(nextStep!.replace(/[.?!]$/, '')).not.toMatch(/[.?!]/);
  });
});
