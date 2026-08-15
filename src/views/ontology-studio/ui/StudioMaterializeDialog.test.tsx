import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StudioMaterializeDialog, type StudioMaterializeLabels } from "./StudioMaterializeDialog";
import type { StudioWriteTarget } from "../lib/resolve-write-target";

const LABELS: StudioMaterializeLabels = {
  title: "이 개념은 아직 문서가 없어요",
  reason: "reason",
  action: "action",
  fileLabel: "만들 파일",
  kindLabel: "종류",
  kindPrompt: "이 개념은 어떤 종류인가요?",
  scopeNote: "내 폴더 안에만 만들어져요.",
  confirm: "문서 만들고 저장",
  cancel: "취소",
  closeAria: "닫기",
  kindOptionLabel: (kind) => kind,
};

const TARGET: Extract<StudioWriteTarget, { status: "missing" }> = {
  status: "missing",
  slug: "elements/payment-gateway",
  title: "payment-gateway",
  kind: "element",
  domainValue: null,
};

describe("StudioMaterializeDialog", () => {
  /** 동의를 구하려면 무엇이 만들어지는지 먼저 보여야 한다 — 경로까지. */
  it("만들 파일의 경로를 그대로 보여준다", () => {
    render(
      <StudioMaterializeDialog target={TARGET} labels={LABELS} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByTestId("studio-materialize-path")).toHaveTextContent(
      "elements/payment-gateway.md",
    );
  });

  it("확인하면 그 개념의 종류를 그대로 넘긴다", () => {
    const onConfirm = vi.fn();
    render(
      <StudioMaterializeDialog target={TARGET} labels={LABELS} onConfirm={onConfirm} onCancel={vi.fn()} />,
    );
    fireEvent.click(screen.getByTestId("studio-materialize-confirm"));
    expect(onConfirm).toHaveBeenCalledWith("element");
  });

  it("종류를 모르는 개념은 지어내지 않고 사용자에게 묻는다", () => {
    const onConfirm = vi.fn();
    render(
      <StudioMaterializeDialog
        target={{ ...TARGET, kind: null }}
        labels={LABELS}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(LABELS.kindPrompt)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("studio-materialize-kind-capability"));
    fireEvent.click(screen.getByTestId("studio-materialize-confirm"));
    expect(onConfirm).toHaveBeenCalledWith("capability");
  });

  /**
   * 모달이 modality 를 주장하려면 뒤가 실제로 가려져야 한다. `--color-overlay-*`
   * 는 패널 위 옅은 백색 wash 용이라 스크림에 쓰면 뒤가 그대로 비친다
   * (app/globals.css `--overlay-scrim` 주석의 회귀).
   */
  it("스크림은 뒤를 가리는 --overlay-scrim 을 쓴다", () => {
    render(
      <StudioMaterializeDialog target={TARGET} labels={LABELS} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    // Dialog 이식 후 testid 는 패널에 있고, 스크림은 그 부모(컨테이너-겸-스크림)다.
    const scrim = screen.getByTestId("studio-materialize-dialog").parentElement as HTMLElement;
    expect(scrim.className).toContain("var(--overlay-scrim)");
    expect(scrim.className).not.toContain("var(--color-overlay-");
  });

  /** aria-modal 을 선언했으면 Tab 도 실제로 갇혀야 한다. */
  it("Tab 은 다이얼로그 밖으로 새지 않고, 닫히면 트리거로 돌아간다", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = render(
      <StudioMaterializeDialog target={TARGET} labels={LABELS} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    const confirm = screen.getByTestId("studio-materialize-confirm");
    expect(document.activeElement).toBe(confirm);

    // 마지막 focusable 에서 Tab → 첫 focusable 로 순환 (밖으로 나가지 않는다).
    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByTestId("studio-materialize-close"));

    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  /** 취소는 진짜 취소여야 한다 — 파일 생성 동의가 흘러나가면 안 된다. */
  it("취소와 Esc 는 어떤 종류도 넘기지 않는다", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { unmount } = render(
      <StudioMaterializeDialog target={TARGET} labels={LABELS} onConfirm={onConfirm} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByTestId("studio-materialize-cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    unmount();

    render(
      <StudioMaterializeDialog target={TARGET} labels={LABELS} onConfirm={onConfirm} onCancel={onCancel} />,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
