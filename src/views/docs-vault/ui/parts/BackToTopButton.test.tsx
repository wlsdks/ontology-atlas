import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import koMessages from "../../../../../messages/ko.json";
import { BackToTopButton } from "./BackToTopButton";

function renderButton(visible: boolean, onClick = vi.fn()) {
  return {
    onClick,
    ...render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <BackToTopButton visible={visible} onClick={onClick} />
      </NextIntlClientProvider>,
    ),
  };
}

describe("BackToTopButton", () => {
  it("renders the plain-language label and calls onClick", () => {
    const { onClick } = renderButton(true);

    const button = screen.getByRole("button", { name: "문서 맨 위로 이동" });
    expect(button).toHaveTextContent("맨 위로");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("fades out and becomes non-interactive when not visible", () => {
    renderButton(false);
    const button = screen.getByTestId("back-to-top-button");
    expect(button.className).toContain("opacity-0");
    expect(button.className).toContain("pointer-events-none");
    expect(button).toHaveAttribute("tabIndex", "-1");
  });

  it("is fully opaque and focusable when visible", () => {
    renderButton(true);
    const button = screen.getByTestId("back-to-top-button");
    expect(button.className).toContain("opacity-100");
    expect(button).toHaveAttribute("tabIndex", "0");
  });
});
