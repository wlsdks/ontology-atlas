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
  it("read mode shows the value and an edit button without an input", () => {
    render(<InlineFieldEdit value="auth" onSave={() => {}} labels={labels} />);
    expect(screen.getByTestId("inline-field-read")).toHaveTextContent("auth");
    expect(screen.getByTestId("inline-field-edit-button")).toBeInTheDocument();
    expect(screen.queryByTestId("inline-field-input")).not.toBeInTheDocument();
  });

  it("an empty value shows the empty label", () => {
    render(<InlineFieldEdit value="" onSave={() => {}} labels={labels} />);
    expect(screen.getByTestId("inline-field-read")).toHaveTextContent("없음");
  });

  it("entering edit shows an input with the current value plus save and cancel", () => {
    render(<InlineFieldEdit value="auth" onSave={() => {}} labels={labels} />);
    fireEvent.click(screen.getByTestId("inline-field-edit-button"));
    expect(screen.getByTestId("inline-field-input")).toHaveValue("auth");
    expect(screen.getByTestId("inline-field-save")).toBeInTheDocument();
    expect(screen.getByTestId("inline-field-cancel")).toBeInTheDocument();
  });

  it("editing and saving calls onSave with the trimmed value and returns to read mode", async () => {
    const onSave = vi.fn();
    render(<InlineFieldEdit value="auth" onSave={onSave} labels={labels} />);
    fireEvent.click(screen.getByTestId("inline-field-edit-button"));
    fireEvent.change(screen.getByTestId("inline-field-input"), { target: { value: "  billing  " } });
    fireEvent.click(screen.getByTestId("inline-field-save"));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("billing"));
    await waitFor(() => expect(screen.queryByTestId("inline-field-input")).not.toBeInTheDocument());
  });

  it("cancel skips onSave and returns to read mode with the original value", () => {
    const onSave = vi.fn();
    render(<InlineFieldEdit value="auth" onSave={onSave} labels={labels} />);
    fireEvent.click(screen.getByTestId("inline-field-edit-button"));
    fireEvent.change(screen.getByTestId("inline-field-input"), { target: { value: "billing" } });
    fireEvent.click(screen.getByTestId("inline-field-cancel"));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId("inline-field-read")).toHaveTextContent("auth");
  });

  it("Enter saves and Escape cancels", async () => {
    const onSave = vi.fn();
    render(<InlineFieldEdit value="auth" onSave={onSave} labels={labels} />);
    fireEvent.click(screen.getByTestId("inline-field-edit-button"));
    fireEvent.change(screen.getByTestId("inline-field-input"), { target: { value: "billing" } });
    fireEvent.keyDown(screen.getByTestId("inline-field-input"), { key: "Enter" });
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("billing"));
  });
});
