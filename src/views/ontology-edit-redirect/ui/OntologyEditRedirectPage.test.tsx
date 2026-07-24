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
  it("redirects the bare builder route to the studio", () => {
    mocks.replace.mockClear();
    mocks.searchParams = new URLSearchParams();
    render(<OntologyEditRedirectPage />);
    expect(mocks.replace).toHaveBeenCalledWith("/ontology/studio/");
  });

  it("forwards a canonical ?node= deep-link to the studio unchanged", () => {
    mocks.replace.mockClear();
    mocks.searchParams = new URLSearchParams("node=capability:mcp-server");
    render(<OntologyEditRedirectPage />);
    expect(mocks.replace).toHaveBeenCalledWith(
      "/ontology/studio/?node=capability%3Amcp-server",
    );
  });

  it("normalizes a legacy plural-slash ?node= into the canonical studio id", () => {
    mocks.replace.mockClear();
    mocks.searchParams = new URLSearchParams("node=capabilities/mcp-server");
    render(<OntologyEditRedirectPage />);
    expect(mocks.replace).toHaveBeenCalledWith(
      "/ontology/studio/?node=capability%3Amcp-server",
    );
  });
});
