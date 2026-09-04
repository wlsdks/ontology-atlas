import { describe, expect, it, vi } from "vitest";
import { render as rtlRender, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../../messages/en.json";
import { PublicQuickActions } from "./PublicQuickActions";

/**
 * elements/public-quick-actions builds hrefs and nothing else. Its two stated rules
 * are exactly what a wrong href would break silently: every action carries the route
 * the visitor is standing on (query included) as `returnTo`, and the edit action is
 * absent rather than broken when no project is in context.
 */

let pathname = "/topology";
let search = "";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
  usePathname: () => pathname,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
}));

function renderActions(props: { projectSlug?: string | null } = {}) {
  return rtlRender(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <PublicQuickActions {...props} />
    </NextIntlClientProvider>,
  );
}

describe("PublicQuickActions", () => {
  it("carries the current route and its query back as returnTo", () => {
    pathname = "/topology";
    search = "focus=domains%2Fonboarding-and-shell";
    renderActions();

    const link = screen.getByRole("link", { name: enMessages.publicQuickActions.buttonNew });
    expect(link).toHaveAttribute(
      "href",
      "/project/new/?returnTo=%2Ftopology%3Ffocus%3Ddomains%252Fonboarding-and-shell",
    );
  });

  it("omits the edit action entirely when no project is in context", () => {
    pathname = "/topology";
    search = "";
    renderActions();

    expect(screen.queryByRole("link", { name: enMessages.publicQuickActions.buttonEdit })).toBeNull();
    expect(screen.getByRole("link", { name: enMessages.publicQuickActions.buttonNew })).toBeInTheDocument();
  });

  it("offers the edit action for the project in context and drops the create action", () => {
    pathname = "/topology";
    search = "";
    renderActions({ projectSlug: "ontology atlas/v2" });

    expect(screen.queryByRole("link", { name: enMessages.publicQuickActions.buttonNew })).toBeNull();
    expect(
      screen.getByRole("link", { name: enMessages.publicQuickActions.buttonEdit }),
    ).toHaveAttribute("href", "/project/ontology%20atlas%2Fv2/edit/?returnTo=%2Ftopology");
  });
});
