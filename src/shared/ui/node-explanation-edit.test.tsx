import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NodeExplanationEdit, type NodeExplanationEditLabels } from "./node-explanation-edit";

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
  it("shows the body and an edit button without a textarea in read mode", () => {
    render(<NodeExplanationEdit value="auth flow" onSave={() => {}} labels={labels} />);
    expect(screen.getByTestId("node-explanation-read")).toHaveTextContent("auth flow");
    expect(screen.getByTestId("node-explanation-edit-button")).toBeInTheDocument();
    expect(screen.queryByTestId("node-explanation-input")).not.toBeInTheDocument();
  });

  it("renders Markdown in read mode instead of raw markers", () => {
    /*
     * Measures which elements came out, not whether text is present: a text-only check passes
     * while the Markdown source is transcribed.
     */
    render(
      <NodeExplanationEdit
        value={"## Definition\n\nsurfaces that let agents read\n\n- Included: `mcp/`\n- Excluded: the schema\n"}
        onSave={() => {}}
        labels={labels}
      />,
    );
    const read = screen.getByTestId("node-explanation-rendered");
    expect(read.querySelector("h2")).toHaveTextContent("Definition");
    expect(read.querySelectorAll("li")).toHaveLength(2);
    expect(read.querySelector("code")).toHaveTextContent("mcp/");
    expect(read.textContent).not.toContain("##");
    expect(read.textContent).not.toContain("`");
  });

  it("shows the empty label for an empty body", () => {
    render(<NodeExplanationEdit value="" onSave={() => {}} labels={labels} />);
    expect(screen.getByTestId("node-explanation-read")).toHaveTextContent("설명 없음");
  });

  it("opens a textarea holding the current body with save and cancel", () => {
    render(<NodeExplanationEdit value="auth flow" onSave={() => {}} labels={labels} />);
    fireEvent.click(screen.getByTestId("node-explanation-edit-button"));
    expect(screen.getByTestId("node-explanation-input")).toHaveValue("auth flow");
    expect(screen.getByTestId("node-explanation-save")).toBeInTheDocument();
  });

  it("calls onSave with the new body and returns to read mode", async () => {
    const onSave = vi.fn();
    render(<NodeExplanationEdit value="old" onSave={onSave} labels={labels} />);
    fireEvent.click(screen.getByTestId("node-explanation-edit-button"));
    fireEvent.change(screen.getByTestId("node-explanation-input"), { target: { value: "new explanation\nwith lines" } });
    fireEvent.click(screen.getByTestId("node-explanation-save"));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("new explanation\nwith lines"));
    await waitFor(() => expect(screen.queryByTestId("node-explanation-input")).not.toBeInTheDocument());
  });

  it("a refused save keeps the editor open with the person's draft", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("refused"));
    render(<NodeExplanationEdit value="old" onSave={onSave} labels={labels} />);
    fireEvent.click(screen.getByTestId("node-explanation-edit-button"));
    fireEvent.change(screen.getByTestId("node-explanation-input"), { target: { value: "my draft" } });
    fireEvent.click(screen.getByTestId("node-explanation-save"));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("my draft"));
    await waitFor(() => expect(screen.getByTestId("node-explanation-save")).toBeEnabled());
    expect(screen.getByTestId("node-explanation-input")).toHaveValue("my draft");
  });

  it("restores the original body on cancel without calling onSave", () => {
    const onSave = vi.fn();
    render(<NodeExplanationEdit value="old" onSave={onSave} labels={labels} />);
    fireEvent.click(screen.getByTestId("node-explanation-edit-button"));
    fireEvent.change(screen.getByTestId("node-explanation-input"), { target: { value: "changed" } });
    fireEvent.click(screen.getByTestId("node-explanation-cancel"));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId("node-explanation-read")).toHaveTextContent("old");
  });

  it("saves on Cmd/Ctrl+Enter and keeps plain Enter as a newline", async () => {
    const onSave = vi.fn();
    render(<NodeExplanationEdit value="old" onSave={onSave} labels={labels} />);
    fireEvent.click(screen.getByTestId("node-explanation-edit-button"));
    const ta = screen.getByTestId("node-explanation-input");
    fireEvent.keyDown(ta, { key: "Enter" });
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.keyDown(ta, { key: "Enter", metaKey: true });
    await waitFor(() => expect(onSave).toHaveBeenCalled());
  });

  it("consumes editor Escape and returns focus without closing its containing detail", () => {
    const close = vi.fn();
    const save = vi.fn();
    render(<div onKeyDown={close}><NodeExplanationEdit value="old" onSave={save} labels={labels}/></div>);
    fireEvent.click(screen.getByTestId("node-explanation-edit-button"));
    fireEvent.change(screen.getByTestId("node-explanation-input"), {target:{value:"unsaved"}});
    fireEvent.keyDown(screen.getByTestId("node-explanation-input"), {key:"Escape",isComposing:true});
    expect(screen.getByTestId("node-explanation-input")).toHaveValue("unsaved");
    fireEvent.keyDown(screen.getByTestId("node-explanation-input"), {key:"Escape"});
    expect(close).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByTestId("node-explanation-read")).toHaveTextContent("old");
    expect(screen.getByTestId("node-explanation-edit-button")).toHaveFocus();
  });
});
