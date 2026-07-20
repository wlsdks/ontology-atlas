import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import koMessages from "../../../../messages/ko.json";
import { BuilderWriteConfirmBar } from "./BuilderWriteConfirmBar";

function renderBar(props?: Partial<Parameters<typeof BuilderWriteConfirmBar>[0]>) {
  render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <BuilderWriteConfirmBar
        status="clean"
        draftNodes={0}
        draftEdges={0}
        writeAriaLabel="지금 vault 에 쓸 변경 없음"
        writeDisabled={false}
        onDryRun={vi.fn()}
        onWrite={vi.fn()}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe("BuilderWriteConfirmBar", () => {
  it("쓰기(주 액션)는 인디고 solid 배경으로 미리보기(보조)와 시각 위계가 분리된다", () => {
    renderBar();

    const writeButton = screen.getByRole("button", {
      name: "지금 vault 에 쓸 변경 없음",
    });
    expect(writeButton.className).toContain(
      "bg-[color:var(--color-indigo-brand)]",
    );
  });

  it("미리보기(보조 액션)는 outline 톤이라 쓰기 버튼과 배경이 겹치지 않는다", () => {
    renderBar();

    const previewButton = screen.getByRole("button", {
      name: "저장 상태 패널 열기 — 변경 예정 파일과 dry-run 명령 확인",
    });
    expect(previewButton.className).not.toContain(
      "bg-[color:var(--color-indigo-brand)]",
    );
    expect(previewButton.className).toContain("bg-[color:var(--color-overlay-1)]");
  });

  it("onDryRun / onWrite 콜백은 그대로 연결된다 (기존 동작 무변경)", () => {
    const onDryRun = vi.fn();
    const onWrite = vi.fn();
    renderBar({ onDryRun, onWrite });

    screen.getByRole("button", { name: "저장 상태 패널 열기 — 변경 예정 파일과 dry-run 명령 확인" }).click();
    expect(onDryRun).toHaveBeenCalledTimes(1);

    screen.getByRole("button", { name: "지금 vault 에 쓸 변경 없음" }).click();
    expect(onWrite).toHaveBeenCalledTimes(1);
  });

  it("writeDisabled 는 쓰기 버튼만 비활성화한다", () => {
    renderBar({ writeDisabled: true });

    expect(
      screen.getByRole("button", { name: "지금 vault 에 쓸 변경 없음" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "저장 상태 패널 열기 — 변경 예정 파일과 dry-run 명령 확인" }),
    ).not.toBeDisabled();
  });
});
