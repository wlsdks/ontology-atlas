import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { InlineFieldEdit, type InlineFieldEditLabels } from "./InlineFieldEdit";

const labels: InlineFieldEditLabels = {
  field: "도메인",
  edit: "도메인 편집",
  save: "저장",
  cancel: "취소",
  placeholder: "도메인 slug",
  empty: "없음",
  saving: "저장 중",
};

describe("InlineFieldEdit", () => {
  it("읽기 모드 — 값 + 편집 버튼, 입력은 없음", () => {
    render(<InlineFieldEdit value="auth" onSave={() => {}} labels={labels} />);
    expect(screen.getByTestId("inline-field-read")).toHaveTextContent("auth");
    expect(screen.getByTestId("inline-field-edit-button")).toBeInTheDocument();
    expect(screen.queryByTestId("inline-field-input")).not.toBeInTheDocument();
  });

  it("빈 값 — empty 라벨 표시", () => {
    render(<InlineFieldEdit value="" onSave={() => {}} labels={labels} />);
    expect(screen.getByTestId("inline-field-read")).toHaveTextContent("없음");
  });

  it("편집 진입 → 현재 값이 든 input + 저장/취소", () => {
    render(<InlineFieldEdit value="auth" onSave={() => {}} labels={labels} />);
    fireEvent.click(screen.getByTestId("inline-field-edit-button"));
    expect(screen.getByTestId("inline-field-input")).toHaveValue("auth");
    expect(screen.getByTestId("inline-field-save")).toBeInTheDocument();
    expect(screen.getByTestId("inline-field-cancel")).toBeInTheDocument();
  });

  it("수정 + 저장 → onSave 가 trim 된 값으로 호출, 읽기 모드 복귀", async () => {
    const onSave = vi.fn();
    render(<InlineFieldEdit value="auth" onSave={onSave} labels={labels} />);
    fireEvent.click(screen.getByTestId("inline-field-edit-button"));
    fireEvent.change(screen.getByTestId("inline-field-input"), { target: { value: "  billing  " } });
    fireEvent.click(screen.getByTestId("inline-field-save"));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("billing"));
    await waitFor(() => expect(screen.queryByTestId("inline-field-input")).not.toBeInTheDocument());
  });

  it("취소 → onSave 미호출, 읽기 모드 복귀(원래 값)", () => {
    const onSave = vi.fn();
    render(<InlineFieldEdit value="auth" onSave={onSave} labels={labels} />);
    fireEvent.click(screen.getByTestId("inline-field-edit-button"));
    fireEvent.change(screen.getByTestId("inline-field-input"), { target: { value: "billing" } });
    fireEvent.click(screen.getByTestId("inline-field-cancel"));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId("inline-field-read")).toHaveTextContent("auth");
  });

  it("Enter → 저장, Escape → 취소", async () => {
    const onSave = vi.fn();
    render(<InlineFieldEdit value="auth" onSave={onSave} labels={labels} />);
    fireEvent.click(screen.getByTestId("inline-field-edit-button"));
    fireEvent.change(screen.getByTestId("inline-field-input"), { target: { value: "billing" } });
    fireEvent.keyDown(screen.getByTestId("inline-field-input"), { key: "Enter" });
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("billing"));
  });
});
