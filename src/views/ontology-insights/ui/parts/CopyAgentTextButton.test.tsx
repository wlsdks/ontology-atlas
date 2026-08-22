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

/**
 * A regression guard on token usage.
 *
 * The idle text colour was once a hardcoded rgba (e.g. rgba(211,215,255,0.96)) — now that the app is
 * dark-only (`.claude/rules/design.md`, 2026-07-19) that hue is tokenized as
 * `--color-indigo-pale-*`. This button must use only indigo-accent tokens, with no raw literal.
 */
describe("CopyAgentTextButton — 텍스트 색 토큰 사용", () => {
  beforeEach(() => {
    copyTextMock.mockClear();
    copyTextMock.mockResolvedValue(true);
  });

  /**
   * 2026-08-05 — the pinned token changed from `indigo-accent` to `indigo-text-soft`.
   *
   * This button carries an indigo **tint**, and hover raises that tint one step (a06 → a13).
   * `accent` (#7170ff) ink barely passed at rest with 4.56 and then **broke AA at 4.41 on hover**
   * (measured). `.claude/rules/design.md`'s rule that "a control carrying a tint uses accentOnTint
   * ink" already prescribed this, and switching gives 8.92 / 8.66.
   *
   * This test's original intent was **forbidding raw rgba from returning**, and that is unchanged —
   * only «which token is correct» moved.
   */
  it("idle 텍스트는 하드코딩 rgba 가 아니라 틴트용 잉크 토큰을 쓴다", () => {
    renderButton();
    const button = screen.getByRole("button");
    expect(button.className).toContain("text-[color:var(--color-indigo-text-soft)]");
    // It must not revert to the accent ink that breaks AA on a tint.
    expect(button.className).not.toContain("text-[color:var(--color-indigo-accent)]");
    // The raw literal behind the earlier regression must not reappear.
    expect(button.className).not.toContain("rgba(211,215,255");
    expect(button.className).not.toContain("rgba(211, 215, 255");
  });

  it("compact copy 버튼도 모바일에서 32px hit target 아래로 내려가지 않는다", () => {
    renderCompactButton();
    const button = screen.getByRole("button");
    const classTokens = button.className.split(/\s+/);
    expect(classTokens).toContain("min-h-8");
    expect(classTokens).not.toContain("py-1");
  });

  it("복사 성공 후에도 보이는 라벨 폭을 늘리지 않고 아이콘과 live region 으로 피드백한다", async () => {
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
