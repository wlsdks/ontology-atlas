import { act, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useRowDisclosure } from "./use-row-disclosure";

/**
 * 행 펼침의 **마운트 대 전이** 계약 (2026-07-28 성능 트레이스로 추가).
 *
 * ## 왜 생겼나
 *
 * 노드 클릭 1회의 강제 리플로우가 **62ms 였고 그중 61ms 가 이 훅**이었다
 * (Chrome ForcedReflow 인사이트, 최상위 원인). 원인은 마운트 경로에서도
 * `content.offsetHeight` 를 읽은 것 — 그건 스타일 쓰기 직후의 레이아웃 읽기라
 * 강제 리플로우이고, 이런 행이 여럿이면 그대로 레이아웃 스래싱이 된다.
 *
 * 그런데 이 훅의 원래 주석이 이미 답을 갖고 있었다: *"이미 열린 행이 화면에
 * 나타나며 스스로 펼쳐지는 연출은 사용자가 시킨 적 없는 움직임이다."*
 * 마운트에 애니메이션이 없으면 **잴 이유도 없다.**
 *
 * ## 이 파일이 지키는 것
 *
 * 마운트는 재지 않고(`auto`), 전이는 재고 보간한다. 둘 중 하나라도 반대로
 * 가면 즉시 실패한다 — `auto` 로 열어 두면 토글 애니메이션이 죽고, 마운트에서
 * 재면 리플로우가 돌아온다.
 *
 * jsdom 에는 레이아웃이 없어 `offsetHeight` 가 늘 0 이므로 프로토타입에 스텁을
 * 심는다. 이 테스트가 보는 것은 **어떤 값을 쓰느냐**이지 픽셀이 아니다.
 */

const CONTENT_HEIGHT = 120;

function Harness({ open }: { open: boolean }) {
  const { mounted, boxRef, contentRef } = useRowDisclosure(open);
  return (
    <div>
      {mounted ? (
        <div ref={boxRef} data-testid="box">
          <div ref={contentRef} data-testid="content">
            body
          </div>
        </div>
      ) : null}
    </div>
  );
}

function box(container: HTMLElement): HTMLElement {
  const el = container.querySelector('[data-testid="box"]');
  if (!el) throw new Error("disclosure box not mounted");
  return el as HTMLElement;
}

describe("useRowDisclosure — 마운트는 재지 않는다", () => {
  const withStubbedHeight = (fn: () => void) => {
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get() {
        return CONTENT_HEIGHT;
      },
    });
    try {
      fn();
    } finally {
      if (original) Object.defineProperty(HTMLElement.prototype, "offsetHeight", original);
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetHeight;
    }
  };

  /**
   * 이것이 리플로우 수리의 본체다 — 마운트에서 `auto` 면 `offsetHeight` 를
   * 읽을 일이 없다. px 이 찍혀 있으면 그 순간 레이아웃을 읽었다는 뜻이다.
   */
  it("이미 열린 채 마운트하면 높이를 재지 않고 auto 로 둔다", () => {
    withStubbedHeight(() => {
      const { container } = render(<Harness open />);
      expect(box(container).style.height).toBe("auto");
    });
  });

  it("닫힌 채 마운트하면 아무것도 그리지 않는다", () => {
    withStubbedHeight(() => {
      const { container } = render(<Harness open={false} />);
      expect(container.querySelector('[data-testid="box"]')).toBeNull();
    });
  });

  // 마운트를 안 재는 대신 **전이는 반드시 재야** 한다 — 안 재면 `auto`↔`0`
  // 사이에 보간할 값이 없어 토글이 툭 사라진다(이 훅이 존재하는 이유).
  it("열림 → 닫힘 전이는 실측 px 에서 출발해 0 으로 간다", () => {
    withStubbedHeight(() => {
      const { container, rerender } = render(<Harness open />);
      expect(box(container).style.height).toBe("auto");

      act(() => rerender(<Harness open={false} />));

      // 퇴장 전이 중에는 아직 마운트돼 있고, 목표 높이는 0.
      expect(box(container).style.height).toBe("0px");
    });
  });

  it("닫힘 → 열림 전이는 실측 px 로 보간한다", () => {
    withStubbedHeight(() => {
      const { container, rerender } = render(<Harness open={false} />);
      act(() => rerender(<Harness open />));
      expect(box(container).style.height).toBe(`${CONTENT_HEIGHT}px`);
    });
  });
});
