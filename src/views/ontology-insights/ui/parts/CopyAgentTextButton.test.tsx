import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import koMessages from "../../../../../messages/ko.json";
import { CopyAgentTextButton } from "./CopyAgentTextButton";
import { copyText } from "@/shared/lib/copy-text";

vi.mock("@/shared/lib/copy-text", () => ({
  copyText: vi.fn(async () => true),
}));

const copyTextMock = vi.mocked(copyText);

function renderButton() {
  return render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <CopyAgentTextButton label="복사" copiedLabel="복사됨" text="payload" />
    </NextIntlClientProvider>,
  );
}

function renderCompactButton() {
  return render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <CopyAgentTextButton label="복사" copiedLabel="복사됨" text="payload" compact />
    </NextIntlClientProvider>,
  );
}

/** Token usage guard: the button uses indigo tokens only, never a raw literal. */
describe("CopyAgentTextButton text color tokens", () => {
  beforeEach(() => {
    copyTextMock.mockClear();
    copyTextMock.mockResolvedValue(true);
  });

  /** The tint ink (`indigo-text-soft`), since accent ink fails AA on the hovered tint (`.claude/rules/design.md`). */
  it("uses the tint ink token for idle text instead of a hard-coded rgba", () => {
    renderButton();
    const button = screen.getByRole("button");
    expect(button.className).toContain("text-[color:var(--color-indigo-text-soft)]");
    // Not the accent ink, which fails AA on a tint.
    expect(button.className).not.toContain("text-[color:var(--color-indigo-accent)]");
    // The raw literal behind the earlier regression must not return.
    expect(button.className).not.toContain("rgba(211,215,255");
    expect(button.className).not.toContain("rgba(211, 215, 255");
  });

  it("keeps the compact button at a 32px hit target or larger on mobile", () => {
    renderCompactButton();
    const button = screen.getByRole("button");
    const classTokens = button.className.split(/\s+/);
    expect(classTokens).toContain("min-h-8");
    expect(classTokens).not.toContain("py-1");
  });

  it("confirms a copy with an icon and live region without widening the label", async () => {
    renderButton();
    const button = screen.getByRole("button", { name: "복사" });

    fireEvent.click(button);

    await waitFor(() => expect(copyTextMock).toHaveBeenCalledWith("payload"));
    await screen.findByText("복사됨");
    expect(button).toHaveTextContent("복사");
    expect(button).not.toHaveTextContent("복사 · 복사됨");
    expect(button.className).toContain("active:translate-y-[1px]");
    expect(button.className).toContain("motion-reduce:transition-none");
  });
});
