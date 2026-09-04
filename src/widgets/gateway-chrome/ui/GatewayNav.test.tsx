import { describe, expect, it, vi } from "vitest";
import { render as rtlRender, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../../messages/en.json";
import { GatewayNav } from "./GatewayNav";

/**
 * The gateway chrome (elements/gateway-chrome) is the persistent nav an uninstalled
 * web visitor meets at four addresses — `/`, `/download`, `/guide`, `/changelog`.
 * Two of its rules are stated in the source and nowhere else, so they are what this
 * file holds: the brand identity travels with the chrome (it is the piece the
 * installed workbench rail deliberately omits), and a reading link is offered by the
 * chrome only where the page itself does not already carry it.
 */

let pathname = "/";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
  usePathname: () => pathname,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ replace: () => {}, push: () => {} }),
}));

function renderAt(path: string) {
  pathname = path;
  return rtlRender(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <GatewayNav />
    </NextIntlClientProvider>,
  );
}

describe("GatewayNav", () => {
  it("carries the gateway brand identity at every gateway address", () => {
    for (const path of ["/", "/download", "/guide", "/changelog"]) {
      const view = renderAt(path);
      expect(screen.getByTestId("gateway-brand-mark")).toBeInTheDocument();
      expect(screen.getByText("Ontology Atlas")).toBeInTheDocument();
      view.unmount();
    }
  });

  it("names the current page in the breadcrumb everywhere except the gateway root", () => {
    const atRoot = renderAt("/");
    expect(screen.queryByText("Guide", { selector: '[aria-current="page"]' })).toBeNull();
    atRoot.unmount();

    renderAt("/guide");
    expect(screen.getByText("Guide", { selector: 'span[aria-current="page"]' })).toBeInTheDocument();
  });

  it("offers the changelog chip only where the page does not already carry the changelog", () => {
    const atRoot = renderAt("/");
    expect(screen.queryByTestId("gateway-nav-changelog")).toBeNull();
    atRoot.unmount();

    const atDownload = renderAt("/download");
    expect(screen.queryByTestId("gateway-nav-changelog")).toBeNull();
    atDownload.unmount();

    renderAt("/guide");
    expect(screen.getByTestId("gateway-nav-changelog")).toBeInTheDocument();
  });
});
