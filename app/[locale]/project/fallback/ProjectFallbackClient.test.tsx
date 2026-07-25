import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectFallbackClient } from "./ProjectFallbackClient";

const mocks = vi.hoisted(() => ({
  pathname: "/ko/project/fallback/",
  search: "slug=project",
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useSearchParams: () => new URLSearchParams(mocks.search),
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

describe("ProjectFallbackClient", () => {
  beforeEach(() => {
    mocks.pathname = "/ko/project/fallback/";
    mocks.search = "slug=project";
    mocks.replace.mockReset();
  });

  it("query slug를 프로젝트 상세 화면에 전달한다", () => {
    render(<ProjectFallbackClient />);

    expect(screen.getByTestId("detail-page")).toHaveTextContent("project");
    expect(screen.queryByTestId("editor-page")).not.toBeInTheDocument();
  });

  it("edit query를 프로젝트 편집 화면과 복귀 상태에 전달한다", () => {
    mocks.search =
      "slug=project&mode=edit&returnTo=%2Fproject%2Ffallback%2F%3Fslug%3Dproject&saved=1";

    render(<ProjectFallbackClient />);

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

  it("slug 없는 직접 fallback은 프로젝트 목록으로 복귀한다", () => {
    mocks.search = "";

    render(<ProjectFallbackClient />);

    expect(mocks.replace).toHaveBeenCalledWith("/projects");
    expect(screen.queryByTestId("detail-page")).not.toBeInTheDocument();
    expect(screen.queryByTestId("editor-page")).not.toBeInTheDocument();
  });
});
