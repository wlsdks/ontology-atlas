import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OntologyEditRedirectPage } from "./OntologyEditRedirectPage";

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

describe("OntologyEditRedirectPage", () => {
  it("redirects the bare compatibility route to the map", () => {
    mocks.replace.mockClear();
    mocks.searchParams = new URLSearchParams();
    render(<OntologyEditRedirectPage />);
    expect(mocks.replace).toHaveBeenCalledWith("/topology/");
  });

  it("translates a canonical ?node= deep-link to the contextual editor", () => {
    mocks.replace.mockClear();
    mocks.searchParams = new URLSearchParams("node=capability:mcp-server");
    render(<OntologyEditRedirectPage />);
    expect(mocks.replace).toHaveBeenCalledWith(
      "/topology/?p=capability%3Amcp-server&workbench=edit",
    );
  });

  it("normalizes a legacy plural-slash ?node= into the canonical studio id", () => {
    mocks.replace.mockClear();
    mocks.searchParams = new URLSearchParams("node=capabilities/mcp-server");
    render(<OntologyEditRedirectPage />);
    expect(mocks.replace).toHaveBeenCalledWith(
      "/topology/?p=capability%3Amcp-server&workbench=edit",
    );
  });

  it("translates create mode and preserves edge/review context", () => {
    mocks.replace.mockClear();
    mocks.searchParams = new URLSearchParams("mode=create");
    const { unmount } = render(<OntologyEditRedirectPage />);
    expect(mocks.replace).toHaveBeenCalledWith("/topology/?workbench=create");
    unmount();

    mocks.replace.mockClear();
    mocks.searchParams = new URLSearchParams(
      "node=capability:a&edit=dependsOn:capability:b&via=insights:do-next&review=row-1",
    );
    render(<OntologyEditRedirectPage />);
    expect(mocks.replace).toHaveBeenCalledWith(
      "/topology/?p=capability%3Aa&workbench=edit&edit=dependsOn%3Acapability%3Ab&via=insights%3Ado-next&review=row-1",
    );
  });
});
