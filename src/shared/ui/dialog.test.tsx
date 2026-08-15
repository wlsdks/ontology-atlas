import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { Dialog } from "./dialog";

/**
 * Dialog — 모달성 계약 테스트.
 *
 * 「체계」석 비준(2026-08-15, docs/DECISIONS.md)의 강제 장치다: 이 프리미티브가
 * 존재하는 이유는 `role="dialog"` 26곳이 스크림 토큰 5갈래 · 폭 8종 · 트랩 실재
 * 8/20 으로 각자 조립하고 있었기 때문이고, 여기서 단언하는 것이 그 계약의
 * 전부다 — 모달성(트랩·Esc·복귀·스크롤락·aria-modal)과 캐노니컬 토큰(z ·
 * 스크림 · 폭 공식). 클래스 문자열 단언은 「사람이 쓴 문장」이 아니라 **토큰
 * 참조**라 계약의 대상이다(documentation.md 의 금지와 다른 층).
 */

function Harness({ size, onCloseSpy }: { size?: "sm" | "md"; onCloseSpy?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" data-testid="opener" onClick={() => setOpen(true)}>
        open
      </button>
      <Dialog
        open={open}
        onClose={() => {
          onCloseSpy?.();
          setOpen(false);
        }}
        size={size}
        aria-label="시험 대화상자"
        testId="probe-dialog"
      >
        <button type="button" data-testid="inner-first">
          first
        </button>
        <button type="button" data-testid="inner-last">
          last
        </button>
      </Dialog>
    </div>
  );
}

function openDialog() {
  act(() => {
    fireEvent.click(screen.getByTestId("opener"));
  });
  return screen.getByRole("dialog");
}

describe("Dialog — 모달성 계약", () => {
  it("닫혀 있으면 아무것도 그리지 않는다", () => {
    render(<Harness />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("열리면 body 포털에 role=dialog + aria-modal 로 선다", () => {
    render(<Harness />);
    const dialog = openDialog();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe("시험 대화상자");
    // 포털 — 하니스 트리가 아니라 body 직속 계보에 산다.
    expect(dialog.closest("[data-testid='opener']")).toBeNull();
    expect(document.body.contains(dialog)).toBe(true);
  });

  it("잠깐 뜨는 표면 자기선언(sheet)과 오버레이 스프링 마커를 단다", () => {
    render(<Harness />);
    const dialog = openDialog();
    expect(dialog.getAttribute("data-transient-surface")).toBe("sheet");
    expect(dialog.getAttribute("data-overlay-spring")).toBe("true");
  });

  it("캐노니컬 토큰 — z 사다리 · 스크림 · 폭 공식 · 고도 그림자", () => {
    render(<Harness />);
    const dialog = openDialog();
    const scrim = dialog.parentElement as HTMLElement;
    expect(scrim.className).toContain("z-[var(--z-dialog)]");
    expect(scrim.className).toContain("bg-[color:var(--overlay-scrim)]");
    expect(scrim.className).toContain("fixed inset-0");
    expect(dialog.className).toContain("w-[min(var(--dialog-w-sm),calc(100vw-2rem))]");
    expect(dialog.className).toContain("shadow-[var(--shadow-elevation-3)]");
    expect(dialog.className).toContain("rounded-panel");
    expect(dialog.className).toContain("bg-[color:var(--color-panel)]");
    expect(dialog.className).toContain("border-[color:var(--color-divider)]");
  });

  it("size=md 는 md 폭 토큰을 쓴다", () => {
    render(<Harness size="md" />);
    const dialog = openDialog();
    expect(dialog.className).toContain("w-[min(var(--dialog-w-md),calc(100vw-2rem))]");
  });

  it("여는 순간 초점이 첫 focusable 로 들어가고, 닫으면 연 컨트롤로 돌아간다", async () => {
    render(<Harness />);
    const opener = screen.getByTestId("opener");
    opener.focus();
    openDialog();
    await waitFor(() => {
      expect(document.activeElement?.getAttribute("data-testid")).toBe("inner-first");
    });
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(opener);
    });
  });

  it("Escape 가 닫는다", () => {
    let closed = 0;
    render(<Harness onCloseSpy={() => (closed += 1)} />);
    openDialog();
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(closed).toBe(1);
  });

  it("스크림 클릭은 닫고, 패널 안 클릭은 닫지 않는다", () => {
    let closed = 0;
    render(<Harness onCloseSpy={() => (closed += 1)} />);
    const dialog = openDialog();
    fireEvent.click(dialog);
    fireEvent.click(screen.getByTestId("inner-first"));
    expect(closed).toBe(0);
    fireEvent.click(dialog.parentElement as HTMLElement);
    expect(closed).toBe(1);
  });

  it("열려 있는 동안 body 스크롤이 잠기고, 닫히면 풀린다", async () => {
    render(<Harness />);
    openDialog();
    expect(document.body.style.overflow).toBe("hidden");
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    await waitFor(() => {
      expect(document.body.style.overflow).not.toBe("hidden");
    });
  });
});
