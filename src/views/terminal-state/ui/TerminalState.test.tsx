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
import { StandaloneMessagesProvider } from "./standalone-locale";
import {
  NOT_FOUND_PICK,
  ROUTE_ERROR_PICK,
  pickStandaloneMessages,
} from "@/i18n/standalone-messages";

const notFoundMessages = pickStandaloneMessages(NOT_FOUND_PICK);

/** The root layout hands the error boundary its copy; the test stands in for it. */
function renderRouteError(digest?: string) {
  return render(
    <StandaloneMessagesProvider messages={pickStandaloneMessages(ROUTE_ERROR_PICK)}>
      <RouteErrorScreen digest={digest} onRetry={() => {}} />
    </StandaloneMessagesProvider>,
  );
}

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
    render(<NotFoundScreen standaloneMessages={notFoundMessages} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(ko.notFound.title);
    expect(document.documentElement.lang).toBe("ko");
  });

  it("on the web the one primary is home, and project search is not offered", () => {
    window.history.pushState({}, "", "/ko/nope-xyz/");
    render(<NotFoundScreen standaloneMessages={notFoundMessages} />);
    const home = screen.getByRole("link", { name: ko.notFound.home });
    expect(home.className).toMatch(/color-indigo-brand/u);
    expect(screen.queryByText(ko.notFound.findByProject)).toBeNull();
  });

  it("the error screen is Korean on a Korean path and home keeps the locale", () => {
    window.history.pushState({}, "", "/ko/library/");
    renderRouteError("abc123");
    expect(screen.getByRole("button", { name: ko.routeError.retry })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: ko.routeError.home }).getAttribute("href")).toMatch(/\/ko\/$/u);
    expect(screen.getByText("abc123")).toBeInTheDocument();
    expect(screen.getByText(ko.routeError.bodyWithId)).toBeInTheDocument();
  });

  it("without a digest the copy does not point at an error ID that is not there", () => {
    window.history.pushState({}, "", "/ko/library/");
    renderRouteError(undefined);
    expect(screen.getByText(ko.routeError.body)).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(ko.routeError.errorId, "u"))).toBeNull();
  });

  it("the picked sets cover every message the screens and the gateway chrome read", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      window.history.pushState({}, "", "/ko/nope-xyz/");
      render(<NotFoundScreen standaloneMessages={notFoundMessages} />);
      expect(screen.getByTestId("download-gnb")).toBeInTheDocument();
      renderRouteError("abc123");
      const missing = errors.mock.calls.filter((call) => /MISSING_MESSAGE/u.test(String(call[0])));
      expect(missing.map((call) => String(call[0]).slice(0, 160))).toEqual([]);
    } finally {
      errors.mockRestore();
    }
  });

  it("the picked message set carries only what the screens read", () => {
    // The whole message files are ~836 KB; the 404 set must stay a few KB.
    const size = JSON.stringify(notFoundMessages).length;
    expect(size).toBeLessThan(8_000);
    expect(Object.keys(notFoundMessages.ko.download as object)).toEqual(["downloadSectionLabel"]);
  });
});
