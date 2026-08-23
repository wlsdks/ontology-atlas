import { render, screen, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { AgentSetupStep } from './AgentSetupStep';

/**
 * The motion-grammar contract for in-flow collapsing (2026-08-04, owner's
 * installed-app measurement).
 *
 * ## What it pins
 *
 * The first version wrapped this body in `Surface` (chrome grammar — scale plus
 * fade, holding layout through the exit window), and the owner caught the defect in
 * the installed app: *"It stutters and opens strangely?"* Frame measurement: on the step 1 → 3 transition, the siblings below
 * moved **+254px in one frame, then −352px in one frame 140ms later**, with zero
 * transition frames. This is a layer value lint cannot catch in principle (duration
 * and easing were all tokens). So the choice of grammar itself is pinned as a
 * contract: **in-flow collapsing is the list-row disclosure grammar
 * (`.ai-row-disclosure`), and wearing a floating surface's grammar (the scale
 * keyframe family) is a defect.**
 *
 * ## Probe discipline (`/gate-probe`)
 *
 * - Reverting turns it red: re-wrapping the body in the `topology-chrome-in`
 *   (Surface chrome entry class) family is caught by ③. Stripping the grammar
 *   entirely is caught by ①.
 * - It does not idle on an empty set: ① first asserts the box and content **exist**,
 *   and ② confirms the content really mounts and unmounts, over time.
 */
describe('AgentSetupStep — 흐름 안 접기 문법 계약', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const renderStep = (open: boolean) =>
    render(
      <ol>
        <AgentSetupStep
          n={1}
          title="연결 버튼 누르기"
          desc="쓰는 도구의 버튼을 누르면 준비가 돼요."
          state="now"
          open={open}
          onToggle={() => {}}
          testId="probe-step"
        >
          <button type="button">내용 컨트롤</button>
        </AgentSetupStep>
      </ol>,
    );

  it('① 열림 — 본문이 목록 행 펼침 문법 안에 마운트된다 (상자는 늘 실재)', () => {
    const { container } = renderStep(true);
    const box = container.querySelector('.ai-row-disclosure');
    expect(box, '높이 전이 상자가 없다 — 접기 문법이 벗겨졌다').not.toBeNull();
    expect(box!.id).toBe('probe-step-body');
    const body = container.querySelector('.ai-row-disclosure-body');
    expect(body, '내용이 전이 본문 밖에 있다 — 높이 실측이 못 따라간다').not.toBeNull();
    expect(body!.textContent).toContain('쓰는 도구의 버튼을 누르면');
    // The aria-controls target must exist even mid-collapse — the box carries the id.
    expect(
      screen.getByTestId('probe-step-toggle').getAttribute('aria-controls'),
    ).toBe('probe-step-body');
  });

  it('② 닫힘 — 내용은 퇴장 전이가 끝난 뒤 언마운트되고, 접힌 상자는 inert 다', () => {
    const { container, rerender } = renderStep(true);
    rerender(
      <ol>
        <AgentSetupStep
          n={1}
          title="연결 버튼 누르기"
          desc="쓰는 도구의 버튼을 누르면 준비가 돼요."
          state="now"
          open={false}
          onToggle={() => {}}
          testId="probe-step"
        >
          <button type="button">내용 컨트롤</button>
        </AgentSetupStep>
      </ol>,
    );
    const box = container.querySelector('.ai-row-disclosure')!;
    expect(box.getAttribute('data-state')).toBe('closed');
    // The exit window — content vanishing instantly means there is no way out.
    expect(container.querySelector('.ai-row-disclosure-body')).not.toBeNull();
    expect(box.hasAttribute('inert'), '접힌 본문이 탭 순서에 남는다').toBe(true);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(
      container.querySelector('.ai-row-disclosure-body'),
      '퇴장 전이가 끝났는데 내용이 남아 있다',
    ).toBeNull();
  });

  it('③ 떠 있는 표면의 문법(스케일 등장 계열)을 입지 않는다 — 되돌리면 여기가 빨개진다', () => {
    const { container } = renderStep(true);
    for (const cls of ['topology-chrome-in', 'topology-chrome-out', 'map-overlay-in']) {
      expect(
        container.querySelector(`.${cls}`),
        `흐름 안 접기에 떠 있는 표면의 모션(${cls})이 붙었다 — 주변 형제가 두 번 튄다`,
      ).toBeNull();
    }
    expect(
      container.querySelector('[data-surface-state]'),
      '흐름 안 접기가 Surface 수명주기를 다시 입었다 — 퇴장 창 동안 자리를 점유한다',
    ).toBeNull();
  });

  it('④ 펼침 채널 — 행 머리 셰브론이 열림 상태를 진다 (사실 배지와 채널 분리)', () => {
    const { container: openC } = renderStep(true);
    const openChevron = openC.querySelector('button svg.transition-transform');
    expect(openChevron, '펼침 채널(셰브론)이 행 머리에서 사라졌다').not.toBeNull();
    expect((openChevron as SVGElement).style.transform).toBe('rotate(0deg)');

    const { container: closedC } = renderStep(false);
    const closedChevron = closedC.querySelector('button svg.transition-transform');
    expect((closedChevron as SVGElement).style.transform).toBe('rotate(-90deg)');
  });

  /**
   * ⑤ Hierarchy — **an expanded row does not get dim ink.**
   *
   * Reverting turns this red: going back to
   * `tone={state === 'todo' ? 'muted' : 'strong'}` drops the title to `quaternary`
   * whenever an unreached step is expanded. Installed-app measurement (2026-08-04,
   * 1512×900): with step 3 expanded, the expanded row's title was
   * rgb(130,130,137) against the collapsed step 1 title at rgb(247,248,248) — the
   * line being read was the dimmest on screen.
   */
  const renderTodoStep = (open: boolean) =>
    render(
      <ol>
        <AgentSetupStep
          n={3}
          title="연결 확인"
          state="todo"
          open={open}
          onToggle={() => {}}
          testId="probe-todo"
        >
          <button type="button">내용 컨트롤</button>
        </AgentSetupStep>
      </ol>,
    );

  it('⑤ 위계 — 안 온 단계라도 펼쳐 두면 흐린 잉크(quaternary)를 안 받는다', () => {
    const closed = renderTodoStep(false);
    expect(
      closed.getByTestId('probe-todo-toggle').className,
      '접힌 미래 단계가 물러나지 않는다 — 흐름의 사실이 지워졌다',
    ).toContain('--color-text-quaternary');
    closed.unmount();

    const opened = renderTodoStep(true);
    expect(
      opened.getByTestId('probe-todo-toggle').className,
      '펼친 행이 흐린 잉크를 받았다 — 읽고 있는 줄이 화면에서 가장 흐려진다',
    ).not.toContain('--color-text-quaternary');
    expect(opened.getByTestId('probe-todo-toggle').className).toContain(
      '--color-text-primary',
    );
  });
});
