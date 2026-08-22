import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { CreateNodeForm, type CreateNodeFormLabels } from "./CreateNodeForm";
import koMessages from "../../../../messages/ko.json";

const labels: CreateNodeFormLabels = {
  heading: "노드 추가",
  titlePlaceholder: "노드 이름",
  kind: "종류",
  domain: "도메인",
  domainQuestion: "어느 묶음(도메인)에 넣을까요? (선택)",
  domainNone: "도메인 없음",
  domainHelper: "도메인 = 관련 기능을 묶는 큰 영역이에요.",
  create: "만들기",
  cancel: "취소",
  reviewHeading: "변경안 확인",
  reviewBack: "다시 고치기",
  reviewConfirm: "확인하고 쓰기",
  reviewConfirming: "쓰는 중",
  kindLabels: { project: "프로젝트", domain: "도메인", capability: "역량", element: "요소" },
  primaryNamePlaceholder: "개념 이름 (한국어)",
  secondaryNamePlaceholder: "English name (선택)",
  localeNamesHint: "위 칸은 지금 화면 언어 이름이에요.",
  primaryLocaleRequired: "한국어 이름도 적어야 저장돼요",
};

const domainOptions = [
  { value: "auth", label: "인증" },
  { value: "billing", label: "결제" },
];

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

  it("title 입력 + 도메인 선택 → onCreate 가 title·kind·domain(slug) 으로 호출", async () => {
    const onCreate = vi.fn();
    render(
      <CreateNodeForm
        onCreate={onCreate}
        labels={labels}
        defaultKind="capability"
        domainOptions={domainOptions}
      />,
    );
    fireEvent.change(screen.getByTestId("create-node-title"), { target: { value: "  Token Issue  " } });
    // Not a free-text field: the user picks an existing domain by name and the
    // slug is what gets passed on.
    fireEvent.click(screen.getByTestId("create-node-domain"));
    fireEvent.click(screen.getByRole("option", { name: "인증" }));
    expect(screen.getByTestId("create-node-submit")).not.toBeDisabled();
    fireEvent.click(screen.getByTestId("create-node-submit"));
    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({ title: "Token Issue", kind: "capability", domain: "auth" }),
    );
  });

  it("도메인 없음(기본) 이면 undefined 로 전달", async () => {
    const onCreate = vi.fn();
    render(<CreateNodeForm onCreate={onCreate} labels={labels} domainOptions={domainOptions} />);
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
    // The canonical Select needs the trigger opened and an option clicked, not a
    // native change event.
    fireEvent.click(screen.getByTestId("create-node-kind"));
    fireEvent.click(screen.getByRole("option", { name: "도메인" }));
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

  it("검토 단계로 넘어가면 입력을 지우지 않는다", async () => {
    const onCreate = vi.fn().mockResolvedValue(false);
    render(<CreateNodeForm onCreate={onCreate} labels={labels} />);
    const titleInput = screen.getByTestId("create-node-title");
    fireEvent.change(titleInput, { target: { value: "Contextual Editing" } });
    fireEvent.click(screen.getByTestId("create-node-submit"));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(titleInput).toHaveValue("Contextual Editing");
  });

  it("변경안에서는 확인 전까지 쓰기 콜백만 제공한다", () => {
    const onConfirm = vi.fn();
    const onBack = vi.fn();
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <CreateNodeForm
          onCreate={() => false}
          labels={labels}
          review={{
            changeSet: {
              toolName: "add_concept",
              operation: "create",
              target: "capabilities/contextual-editing",
              exact: true,
              destructive: false,
              relation: null,
              fields: [{ key: "title", after: "Contextual Editing" }],
              itemCount: 1,
              items: [{
                key: "add_concept:0:capabilities/contextual-editing",
                target: "capabilities/contextual-editing",
                exact: true,
                relation: null,
                fields: [{ key: "title", after: "Contextual Editing" }],
              }],
            },
            confirming: false,
            onBack,
            onConfirm,
          }}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByTestId("create-node-change-review")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("create-node-confirm"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("다시 고치기"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("onCancel 제공 시 취소 버튼 노출 + 호출", () => {
    const onCancel = vi.fn();
    render(<CreateNodeForm onCreate={() => {}} onCancel={onCancel} labels={labels} />);
    fireEvent.click(screen.getByTestId("create-node-cancel"));
    expect(onCancel).toHaveBeenCalled();
  });
});

// Per-locale names (owner instruction, 2026-07-24): passing localeNames adds a
// second field, and filling only the other language blocks the save and says why
// in place.
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
