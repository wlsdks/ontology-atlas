import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RelationCreateForm, type RelationCreateFormLabels } from "./RelationCreateForm";
import type { VaultRelationKey } from "@/entities/docs-vault/lib/relation-proposal";

const relationKeys: VaultRelationKey[] = ["relates", "dependencies", "contains"];

const labels: RelationCreateFormLabels = {
  heading: "관계 추가",
  target: "대상",
  targetPlaceholder: "대상 선택",
  relation: "관계",
  create: "연결",
  cancel: "취소",
  relationKeyLabels: { relates: "관련", dependencies: "의존", contains: "포함" },
};

const targets = [
  { slug: "capabilities/auth", title: "Auth" },
  { slug: "elements/jwt", title: "JWT" },
];

describe("RelationCreateForm", () => {
  it("target 미선택이면 연결 버튼 disabled", () => {
    render(<RelationCreateForm targets={targets} relationKeys={relationKeys} onCreate={() => {}} labels={labels} />);
    expect(screen.getByTestId("relation-create-submit")).toBeDisabled();
  });

  it("기본 관계 키는 defaultRelationKey", () => {
    render(
      <RelationCreateForm
        targets={targets}
        relationKeys={relationKeys}
        defaultRelationKey="dependencies"
        onCreate={() => {}}
        labels={labels}
      />,
    );
    expect(screen.getByTestId("relation-create-key")).toHaveValue("dependencies");
  });

  it("target 선택 → 연결 활성 → onCreate 가 targetSlug·relationKey 로 호출", async () => {
    const onCreate = vi.fn();
    render(
      <RelationCreateForm
        targets={targets}
        relationKeys={relationKeys}
        defaultRelationKey="relates"
        onCreate={onCreate}
        labels={labels}
      />,
    );
    fireEvent.change(screen.getByTestId("relation-create-target"), { target: { value: "elements/jwt" } });
    fireEvent.change(screen.getByTestId("relation-create-key"), { target: { value: "dependencies" } });
    fireEvent.click(screen.getByTestId("relation-create-submit"));
    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({ targetSlug: "elements/jwt", relationKey: "dependencies" }),
    );
  });

  it("취소 버튼 → onCancel", () => {
    const onCancel = vi.fn();
    render(
      <RelationCreateForm
        targets={targets}
        relationKeys={relationKeys}
        onCreate={() => {}}
        onCancel={onCancel}
        labels={labels}
      />,
    );
    fireEvent.click(screen.getByTestId("relation-create-cancel"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("target 옵션은 후보 노드 title 로 렌더", () => {
    render(<RelationCreateForm targets={targets} relationKeys={relationKeys} onCreate={() => {}} labels={labels} />);
    const select = screen.getByTestId("relation-create-target");
    expect(select).toHaveTextContent("Auth");
    expect(select).toHaveTextContent("JWT");
  });
});
