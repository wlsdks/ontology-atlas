import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseSearch } from "@/shared/lib/navigation/atlas-search";
import { ProjectFallbackScreen } from "./ProjectFallbackScreen";

const mocks = vi.hoisted(() => ({
  search: "slug=project",
  replace: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock("@/views/project-detail", () => ({
  ProjectDetailPage: ({ slug }: { slug: string }) => (
    <div data-testid="detail-page">{slug}</div>
  ),
}));

vi.mock("@/views/project-editor", () => ({
  ProjectEditorPage: ({
    slug,
    returnTo,
    savedNotice,
  }: {
    slug: string;
    returnTo?: string;
    savedNotice?: boolean;
  }) => (
    <div
      data-testid="editor-page"
      data-return-to={returnTo}
      data-saved={String(savedNotice)}
    >
      {slug}
    </div>
  ),
}));

describe("ProjectFallbackScreen", () => {
  beforeEach(() => {
    mocks.search = "slug=project";
    mocks.replace.mockReset();
  });

  it("passes the query slug to the project detail screen", () => {
    render(<ProjectFallbackScreen search={parseSearch(mocks.search)} />);

    expect(screen.getByTestId("detail-page")).toHaveTextContent("project");
    expect(screen.queryByTestId("editor-page")).not.toBeInTheDocument();
  });

  it("passes the edit query to the project editor and its return state", () => {
    mocks.search =
      "slug=project&mode=edit&returnTo=%2Fproject%2Ffallback%2F%3Fslug%3Dproject&saved=1";

    render(<ProjectFallbackScreen search={parseSearch(mocks.search)} />);

    expect(screen.getByTestId("editor-page")).toHaveTextContent("project");
    expect(screen.getByTestId("editor-page")).toHaveAttribute(
      "data-return-to",
      "/project/fallback/?slug=project",
    );
    expect(screen.getByTestId("editor-page")).toHaveAttribute(
      "data-saved",
      "true",
    );
    expect(screen.queryByTestId("detail-page")).not.toBeInTheDocument();
  });

  it("returns a direct fallback without a slug to the project list", () => {
    mocks.search = "";

    render(<ProjectFallbackScreen search={parseSearch(mocks.search)} />);

    expect(mocks.replace).toHaveBeenCalledWith("/projects");
    expect(screen.queryByTestId("detail-page")).not.toBeInTheDocument();
    expect(screen.queryByTestId("editor-page")).not.toBeInTheDocument();
  });
});
