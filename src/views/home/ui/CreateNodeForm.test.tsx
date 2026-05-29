import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CreateNodeForm, type CreateNodeFormLabels } from "./CreateNodeForm";

const labels: CreateNodeFormLabels = {
  heading: "노드 추가",
  titlePlaceholder: "노드 이름",
  kind: "종류",
  domain: "도메인",
  domainPlaceholder: "도메인 slug (선택)",
  create: "만들기",
  cancel: "취소",
  kindLabels: { domain: "도메인", capability: "역량", element: "요소" },
};

describe("CreateNodeForm", () => {
  it("title 비면 만들기 버튼 disabled", () => {
    render(<CreateNodeForm onCreate={() => {}} labels={labels} />);
    expect(screen.getByTestId("create-node-submit")).toBeDisabled();
  });

  it("title 입력 시 활성화 → onCreate 가 title·kind·domain 으로 호출", async () => {
    const onCreate = vi.fn();
    render(<CreateNodeForm onCreate={onCreate} labels={labels} defaultKind="capability" />);
    fireEvent.change(screen.getByTestId("create-node-title"), { target: { value: "  Token Issue  " } });
    fireEvent.change(screen.getByTestId("create-node-domain"), { target: { value: " auth " } });
    expect(screen.getByTestId("create-node-submit")).not.toBeDisabled();
    fireEvent.click(screen.getByTestId("create-node-submit"));
    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({ title: "Token Issue", kind: "capability", domain: "auth" }),
    );
  });

  it("domain 비면 undefined 로 전달", async () => {
    const onCreate = vi.fn();
    render(<CreateNodeForm onCreate={onCreate} labels={labels} />);
    fireEvent.change(screen.getByTestId("create-node-title"), { target: { value: "Auth" } });
    fireEvent.click(screen.getByTestId("create-node-submit"));
    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({ title: "Auth", kind: "capability", domain: undefined }),
    );
  });

  it("kind 변경 반영", async () => {
    const onCreate = vi.fn();
    render(<CreateNodeForm onCreate={onCreate} labels={labels} />);
    fireEvent.change(screen.getByTestId("create-node-title"), { target: { value: "Auth" } });
    fireEvent.change(screen.getByTestId("create-node-kind"), { target: { value: "domain" } });
    fireEvent.click(screen.getByTestId("create-node-submit"));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ kind: "domain" })));
  });

  it("Enter 로 제출", async () => {
    const onCreate = vi.fn();
    render(<CreateNodeForm onCreate={onCreate} labels={labels} />);
    const titleInput = screen.getByTestId("create-node-title");
    fireEvent.change(titleInput, { target: { value: "Auth" } });
    fireEvent.keyDown(titleInput, { key: "Enter" });
    await waitFor(() => expect(onCreate).toHaveBeenCalled());
  });

  it("onCancel 제공 시 취소 버튼 노출 + 호출", () => {
    const onCancel = vi.fn();
    render(<CreateNodeForm onCreate={() => {}} onCancel={onCancel} labels={labels} />);
    fireEvent.click(screen.getByTestId("create-node-cancel"));
    expect(onCancel).toHaveBeenCalled();
  });
});
