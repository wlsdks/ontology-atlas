import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ko from "../../../../messages/ko.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
  usePathname: () => "/nope",
  useRouter: () => ({ push: () => {}, back: () => {}, replace: () => {} }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/ko/nope",
  useRouter: () => ({ replace: () => {}, push: () => {} }),
}));

import { NotFoundScreen } from "./NotFoundScreen";
import { RouteErrorScreen } from "./RouteErrorScreen";

/**
 * The two dead ends render outside the locale layout, so they read the locale from the
 * URL. A Korean path must produce Korean copy and a Korean `<html lang>`; both were
 * English before 2026-09-25.
 */
afterEach(() => {
  window.history.pushState({}, "", "/");
});

describe("terminal state screens", () => {
  it("the root 404 speaks the URL's locale and sets <html lang>", () => {
    window.history.pushState({}, "", "/ko/nope-xyz/");
    render(<NotFoundScreen standalone />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(ko.notFound.title);
    expect(document.documentElement.lang).toBe("ko");
  });

  it("on the web the one primary is home, and project search is not offered", () => {
    window.history.pushState({}, "", "/ko/nope-xyz/");
    render(<NotFoundScreen standalone />);
    const home = screen.getByRole("link", { name: ko.notFound.home });
    expect(home.className).toMatch(/color-indigo-brand/u);
    expect(screen.queryByText(ko.notFound.findByProject)).toBeNull();
  });

  it("the error screen is Korean on a Korean path and home keeps the locale", () => {
    window.history.pushState({}, "", "/ko/library/");
    render(<RouteErrorScreen digest="abc123" onRetry={() => {}} />);
    expect(screen.getByRole("button", { name: ko.routeError.retry })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: ko.routeError.home }).getAttribute("href")).toMatch(/\/ko\/$/u);
    expect(screen.getByText("abc123")).toBeInTheDocument();
  });
});
