import { render, screen, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { AgentSetupStep } from './AgentSetupStep';

/**
 * 흐름 안 접기의 모션 문법 계약 (2026-08-04, 소유자 설치 앱 실측).
 *
 * ## 무엇을 고정하나
 *
 * 첫 판은 이 본문을 `Surface`(chrome 문법 — 스케일+페이드, 퇴장 창 동안
 * 레이아웃 점유)로 감쌌고, 소유자가 설치 앱에서 결함을 잡았다: *"버벅이면서
 * 이상하게 열리는데?"*. 프레임 실측 — 1→3단계 전환에서 아래 형제가 **+254px
 * 1프레임 → 140ms 뒤 −352px 1프레임**, 전환 프레임 0장. 값 lint 는 원리적으로
 * 못 잡는 층이다(duration·easing 전부 토큰이었다). 그래서 문법 선택 자체를
 * 계약으로 고정한다: **흐름 안 접기는 목록 행 펼침 문법(`.ai-row-disclosure`)
 * 이고, 떠 있는 표면의 문법(스케일 키프레임 계열)을 입으면 결함이다.**
 *
 * ## 프로브 규율 (`/gate-probe`)
 *
 * - 되돌리면 빨개진다: 본문을 다시 `topology-chrome-in`(Surface chrome 등장
 *   클래스) 계열로 감싸면 ③ 이 잡는다. 문법을 아예 벗기면 ① 이 잡는다.
 * - 빈 집합 위에서 안 논다: ① 이 상자·내용의 **실재**를 먼저 단언하고
 *   ② 가 내용이 실제로 마운트/언마운트되는 것을 시간축까지 확인한다.
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
    // aria-controls 대상은 접힘 중에도 실재해야 한다 — 상자가 id 를 진다.
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
    // 퇴장 창 — 내용이 즉시 사라지면 나가는 길이 없는 것이다.
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
});
