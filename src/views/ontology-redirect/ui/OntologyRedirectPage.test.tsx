import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OntologyRedirectPage } from "./OntologyRedirectPage";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, push: vi.fn() }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mocks.searchParams,
}));

describe("OntologyRedirectPage", () => {
  it("redirects to /topology with INDEX expanded and no ?p= when there is no ?node=", () => {
    mocks.searchParams = new URLSearchParams();
    render(<OntologyRedirectPage />);
    expect(mocks.replace).toHaveBeenCalledWith("/topology/?index=expanded");
  });

  it("translates a canonical ?node= into ?p= unchanged", () => {
    mocks.searchParams = new URLSearchParams("node=capability:mcp-server");
    render(<OntologyRedirectPage />);
    expect(mocks.replace).toHaveBeenCalledWith(
      "/topology/?index=expanded&p=capability%3Amcp-server",
    );
  });

  it("translates a vault plural-prefix ?node= into canonical ?p=", () => {
    mocks.searchParams = new URLSearchParams("node=capabilities/mcp-server");
    render(<OntologyRedirectPage />);
    expect(mocks.replace).toHaveBeenCalledWith(
      "/topology/?index=expanded&p=capability%3Amcp-server",
    );
  });

  it("translates a bare ?node= through unchanged", () => {
    mocks.searchParams = new URLSearchParams("node=mcp-server");
    render(<OntologyRedirectPage />);
    expect(mocks.replace).toHaveBeenCalledWith(
      "/topology/?index=expanded&p=mcp-server",
    );
  });
});
