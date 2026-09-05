import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import koMessages from "../../../../messages/ko.json";
import { DocReadingOutlineRail } from "./DocReadingOutlineRail";
import type { OutlineHeading } from "./DocReadingOutlineRail";

const headings: OutlineHeading[] = [
  { slug: "intro", text: "Intro", depth: 2, occurrence: 1, duplicate: false },
  { slug: "local-commands", text: "Local commands", depth: 2, occurrence: 1, duplicate: false },
  { slug: "repo-analysis", text: "Repo analysis commands", depth: 2, occurrence: 1, duplicate: false },
  { slug: "graph-level", text: "Graph-level commands", depth: 2, occurrence: 1, duplicate: false },
];

function renderRail(activeSlug: string | null, onHeadingClick = vi.fn()) {
  return {
    onHeadingClick,
    ...render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <DocReadingOutlineRail
          headings={headings}
          activeHeadingSlug={activeSlug}
          onHeadingClick={onHeadingClick}
        />
      </NextIntlClientProvider>,
    ),
  };
}

describe("DocReadingOutlineRail", () => {
  it("renders every heading with the current section marked active", () => {
    renderRail("graph-level");

    for (const heading of headings) {
      expect(screen.getByText(heading.text)).toBeInTheDocument();
    }
    const activeLink = screen.getByText("Graph-level commands").closest("a");
    expect(activeLink).toHaveAttribute("aria-current", "true");
    expect(activeLink?.className).toContain("border-[color:var(--color-indigo-accent)]");

    const inactiveLink = screen.getByText("Intro").closest("a");
    expect(inactiveLink).not.toHaveAttribute("aria-current");
  });

  it("invokes onHeadingClick with the heading slug instead of navigating", () => {
    const { onHeadingClick } = renderRail(null);
    fireEvent.click(screen.getByText("Repo analysis commands"));
    expect(onHeadingClick).toHaveBeenCalledWith("repo-analysis");
  });

  it("labels the nav landmark for screen readers", () => {
    renderRail(null);
    expect(
      screen.getByRole("navigation", { name: "이 문서의 섹션 목록" }),
    ).toBeInTheDocument();
  });
});
