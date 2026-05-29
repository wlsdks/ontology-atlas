import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NodeExplanationEdit, type NodeExplanationEditLabels } from "./NodeExplanationEdit";

const labels: NodeExplanationEditLabels = {
  heading: "설명",
  edit: "설명 편집",
  save: "저장",
  cancel: "취소",
  placeholder: "이 노드가 무엇인지 설명…",
  empty: "설명 없음",
  saving: "저장 중",
};

describe("NodeExplanationEdit", () => {
  it("읽기 모드 — 본문 + 편집 버튼, textarea 없음", () => {
    render(<NodeExplanationEdit value="auth flow" onSave={() => {}} labels={labels} />);
    expect(screen.getByTestId("node-explanation-read")).toHaveTextContent("auth flow");
    expect(screen.getByTestId("node-explanation-edit-button")).toBeInTheDocument();
    expect(screen.queryByTestId("node-explanation-input")).not.toBeInTheDocument();
  });

  it("빈 본문 → empty 라벨", () => {
    render(<NodeExplanationEdit value="" onSave={() => {}} labels={labels} />);
    expect(screen.getByTestId("node-explanation-read")).toHaveTextContent("설명 없음");
  });

  it("편집 진입 → 현재 본문 든 textarea + 저장/취소", () => {
    render(<NodeExplanationEdit value="auth flow" onSave={() => {}} labels={labels} />);
    fireEvent.click(screen.getByTestId("node-explanation-edit-button"));
    expect(screen.getByTestId("node-explanation-input")).toHaveValue("auth flow");
    expect(screen.getByTestId("node-explanation-save")).toBeInTheDocument();
  });

  it("수정 + 저장 → onSave 가 새 본문으로 호출, 읽기 복귀", async () => {
    const onSave = vi.fn();
    render(<NodeExplanationEdit value="old" onSave={onSave} labels={labels} />);
    fireEvent.click(screen.getByTestId("node-explanation-edit-button"));
    fireEvent.change(screen.getByTestId("node-explanation-input"), { target: { value: "new explanation\nwith lines" } });
    fireEvent.click(screen.getByTestId("node-explanation-save"));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("new explanation\nwith lines"));
    await waitFor(() => expect(screen.queryByTestId("node-explanation-input")).not.toBeInTheDocument());
  });

  it("취소 → onSave 미호출, 원래 본문 복귀", () => {
    const onSave = vi.fn();
    render(<NodeExplanationEdit value="old" onSave={onSave} labels={labels} />);
    fireEvent.click(screen.getByTestId("node-explanation-edit-button"));
    fireEvent.change(screen.getByTestId("node-explanation-input"), { target: { value: "changed" } });
    fireEvent.click(screen.getByTestId("node-explanation-cancel"));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId("node-explanation-read")).toHaveTextContent("old");
  });

  it("Cmd/Ctrl+Enter 로 저장, 일반 Enter 는 줄바꿈(저장 안 함)", async () => {
    const onSave = vi.fn();
    render(<NodeExplanationEdit value="old" onSave={onSave} labels={labels} />);
    fireEvent.click(screen.getByTestId("node-explanation-edit-button"));
    const ta = screen.getByTestId("node-explanation-input");
    fireEvent.keyDown(ta, { key: "Enter" });
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.keyDown(ta, { key: "Enter", metaKey: true });
    await waitFor(() => expect(onSave).toHaveBeenCalled());
  });
});
