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
  kindLabels: { project: "프로젝트", domain: "도메인", capability: "역량", element: "요소" },
  primaryNamePlaceholder: "개념 이름 (한국어)",
  secondaryNamePlaceholder: "English name (선택)",
  localeNamesHint: "위 칸은 지금 화면 언어 이름이에요.",
  primaryLocaleRequired: "한국어 이름도 적어야 저장돼요",
};

describe("CreateNodeForm", () => {
  it("title 비면 만들기 버튼 disabled", () => {
    render(<CreateNodeForm onCreate={() => {}} labels={labels} />);
    expect(screen.getByTestId("create-node-submit")).toBeDisabled();
  });

  it("blocking edit surface contract 를 노출한다", () => {
    render(
      <CreateNodeForm
        onCreate={() => {}}
        labels={{ ...labels, headingId: "create-node-heading" }}
      />,
    );
    const form = screen.getByTestId("create-node-form");
    expect(form).toHaveAttribute("data-surface-role", "blocking-edit-surface");
    expect(form).toHaveAttribute("data-elevation-contract", "solid-panel-over-dimmed-map");
    expect(form).toHaveAttribute("data-surface-token", "--topology-blocking-composer-surface");
    expect(form).toHaveAttribute("data-border-token", "--topology-blocking-composer-border");
    expect(form).toHaveAttribute("data-shadow-token", "--topology-blocking-composer-shadow");
    expect(screen.getByText("노드 추가")).toHaveAttribute("id", "create-node-heading");
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

// 어권별 이름 (소유자 지시 2026-07-24) — localeNames 를 주면 두 번째 칸이
// 생기고, 다른 언어만 채운 채로는 저장이 막히며 이유가 그 자리에 뜬다.
describe("CreateNodeForm — 어권별 이름", () => {
  const localeNames = { primaryLocale: "ko", secondaryLocale: "en" };

  it("localeNames 미전달 시 두 번째 이름 칸을 렌더하지 않는다(하위호환)", () => {
    render(<CreateNodeForm onCreate={() => {}} labels={labels} />);
    expect(screen.queryByTestId("create-node-title-secondary")).not.toBeInTheDocument();
  });

  it("다른 언어만 채우면 저장이 막히고 이유가 인라인으로 뜬다", () => {
    const onCreate = vi.fn();
    render(<CreateNodeForm onCreate={onCreate} labels={labels} localeNames={localeNames} />);

    fireEvent.change(screen.getByTestId("create-node-title-secondary"), {
      target: { value: "Payments" },
    });

    expect(screen.getByTestId("create-node-primary-required")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("create-node-submit"));
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("두 언어를 모두 채우면 localeLabels 로 전달한다", async () => {
    const onCreate = vi.fn();
    render(<CreateNodeForm onCreate={onCreate} labels={labels} localeNames={localeNames} />);

    fireEvent.change(screen.getByTestId("create-node-title"), { target: { value: "결제" } });
    fireEvent.change(screen.getByTestId("create-node-title-secondary"), {
      target: { value: "Payments" },
    });
    fireEvent.click(screen.getByTestId("create-node-submit"));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "결제",
          localeLabels: { ko: "결제", en: "Payments" },
        }),
      );
    });
  });
});
