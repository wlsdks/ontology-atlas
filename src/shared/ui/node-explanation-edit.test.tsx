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
  it("읽기 모드 — 본문 + 편집 버튼, textarea 없음", () => {
    render(<NodeExplanationEdit value="auth flow" onSave={() => {}} labels={labels} />);
    expect(screen.getByTestId("node-explanation-read")).toHaveTextContent("auth flow");
    expect(screen.getByTestId("node-explanation-edit-button")).toBeInTheDocument();
    expect(screen.queryByTestId("node-explanation-input")).not.toBeInTheDocument();
  });

  it("읽기 모드는 markdown 을 그려서 보여준다 — 작대기·별표가 글자로 새지 않는다", () => {
    /*
     * ⚠️ This read state printed the raw source. A node body is Markdown written by the
     * construction rules, so `## Definition`, `- Included:` and backticks reached the
     * reader as literal characters (owner, 2026-09-14, on the installed app).
     *
     * So what is measured is **which elements came out**, not whether a substring is
     * present: a test that only checks the text passes while the source is transcribed.
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
    // The source markers do not survive onto the screen.
    expect(read.textContent).not.toContain("##");
    expect(read.textContent).not.toContain("`");
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

  // Map-edit QA D3 (2026-09-26): a save the vault refused closed the editor and dropped the text.
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
