import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps } from "react";
import { CreateNodeForm } from "./CreateNodeForm";
import koMessages from "../../../../messages/ko.json";

const COPY = koMessages.topology.createNode;

function renderCard(overrides: Partial<ComponentProps<typeof CreateNodeForm>> = {}) {
  const props: ComponentProps<typeof CreateNodeForm> = {
    defaultKind: "capability",
    defaultParent: "",
    parentOptions: [
      { value: "domains/auth", label: "인증" },
      { value: "domains/billing", label: "결제" },
    ],
    existingConcepts: [{ slug: "capability:refund", title: "환불 처리", kind: "capability" }],
    primaryLocale: "ko",
    secondaryLocale: "en",
    onCreate: vi.fn(async () => true),
    onOpenExisting: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <CreateNodeForm {...props} />
    </NextIntlClientProvider>,
  );
  return props;
}

describe("CreateNodeForm", () => {
  it("disables create while the name is empty", () => {
    renderCard();
    expect(screen.getByTestId("create-node-submit")).toBeDisabled();
  });

  it("says what the chosen kind is and asks for a place only for kinds that have one", () => {
    renderCard();
    expect(screen.getByTestId("create-node-kind-meaning")).toHaveTextContent(COPY.kindMeaningCapability);
    expect(screen.getByTestId("create-node-parent")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("create-node-kind-domain"));
    expect(screen.getByTestId("create-node-kind-meaning")).toHaveTextContent(COPY.kindMeaningDomain);
    expect(screen.queryByTestId("create-node-parent")).not.toBeInTheDocument();
  });

  it("creates with Enter, carrying the prefilled place, both names and the description", async () => {
    const props = renderCard({ defaultParent: "domains/billing" });
    expect(screen.getByTestId("create-node-parent")).toHaveValue("결제");
    fireEvent.change(screen.getByTestId("create-node-title"), { target: { value: "청구서 발행" } });
    fireEvent.change(screen.getByTestId("create-node-description"), { target: { value: "청구서를 만들어 보낸다." } });
    fireEvent.change(screen.getByTestId("create-node-title-secondary"), { target: { value: "Invoicing" } });
    fireEvent.keyDown(screen.getByTestId("create-node-title"), { key: "Enter" });
    await waitFor(() => expect(props.onCreate).toHaveBeenCalledTimes(1));
    expect(props.onCreate).toHaveBeenCalledWith(
      {
        title: "청구서 발행",
        kind: "capability",
        domain: "domains/billing",
        localeLabels: { ko: "청구서 발행", en: "Invoicing" },
        description: "청구서를 만들어 보낸다.",
      },
      { keepOpen: false },
    );
  });

  it("keeps the kind and place and clears the name after Cmd+Enter", async () => {
    const props = renderCard({ defaultParent: "domains/auth" });
    const title = screen.getByTestId("create-node-title");
    fireEvent.change(title, { target: { value: "로그인" } });
    fireEvent.keyDown(title, { key: "Enter", metaKey: true });
    await waitFor(() => expect(title).toHaveValue(""));
    expect(props.onCreate).toHaveBeenCalledWith(expect.objectContaining({ domain: "domains/auth" }), { keepOpen: true });
    expect(screen.getByTestId("create-node-parent")).toHaveValue("인증");
  });

  it("finds a parent by name and picks it", () => {
    renderCard();
    const parent = screen.getByTestId("create-node-parent");
    fireEvent.change(parent, { target: { value: "결" } });
    const options = screen.getAllByTestId("create-node-parent-option");
    expect(options).toHaveLength(1);
    fireEvent.click(options[0]);
    expect(parent).toHaveValue("결제");
  });

  it("keeps the field focused while an option is pressed, so WebKit's blur cannot close the list before the click", () => {
    renderCard();
    const parent = screen.getByTestId("create-node-parent");
    fireEvent.change(parent, { target: { value: "결" } });
    const option = screen.getAllByTestId("create-node-parent-option")[0];
    expect(fireEvent.mouseDown(option)).toBe(false);
    fireEvent.click(option);
    expect(parent).toHaveValue("결제");
  });

  it("names an existing concept of the same kind and opens it instead", () => {
    const props = renderCard();
    fireEvent.change(screen.getByTestId("create-node-title"), { target: { value: "환불 처리" } });
    fireEvent.click(screen.getByText(COPY.openSimilar));
    expect(props.onOpenExisting).toHaveBeenCalledWith("capability:refund");
  });

  it("refuses a name only in the other language", () => {
    renderCard();
    fireEvent.change(screen.getByTestId("create-node-title-secondary"), { target: { value: "Invoicing" } });
    expect(screen.getByRole("alert")).toHaveTextContent(COPY.primaryLocaleRequired);
    expect(screen.getByTestId("create-node-submit")).toBeDisabled();
  });

  it("closes on Escape", () => {
    const props = renderCard();
    fireEvent.keyDown(screen.getByTestId("create-node-title"), { key: "Escape" });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
