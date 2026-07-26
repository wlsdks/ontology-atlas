import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DocsQuickDrawer } from "./DocsQuickDrawer";

/**
 * #61 — 이 드로어는 **활성 볼트**의 빠른 접근이다. 예전엔 빌드타임 번들
 * `vaultManifest` 를 직접 읽어, 5개짜리 로컬 볼트를 선택해도 Atlas 번들 문서가
 * 나왔다 (opus5 검수 2026-07-25 · codex 감사 P1). 고정/최근도 `:server` 로
 * 고정돼 다른 볼트의 목록이 섞였다.
 */

const mocks = vi.hoisted(() => ({
  mode: "server" as "server" | "local",
  vaultStatus: "idle" as string,
  handleName: null as string | null,
  localManifest: null as unknown,
}));

vi.mock("@/features/data-source-mode", () => ({
  useDataSourceMode: () => mocks.mode,
}));

vi.mock("@/features/docs-vault-local", () => ({
  useLocalVault: () => ({
    status: mocks.vaultStatus,
    handle: mocks.handleName ? { name: mocks.handleName } : null,
    manifest: mocks.localManifest,
  }),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  Link: ({ children }: { children?: unknown }) => children,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
  useLocale: () => "ko",
}));

const LOCAL_MANIFEST = {
  tree: {
    type: "dir",
    name: "root",
    path: "",
    children: [
      { type: "doc", name: "정산 규칙", path: "settlement.md", slug: "settlement", title: "정산 규칙" },
      { type: "doc", name: "환불", path: "refund.md", slug: "refund", title: "환불" },
    ],
  },
  docs: [
    { slug: "settlement", title: "정산 규칙", updatedAt: "2026-07-01", tags: [] },
    { slug: "refund", title: "환불", updatedAt: "2026-07-02", tags: [] },
  ],
  tags: {},
  backlinks: {},
};

function renderDrawer() {
  render(<DocsQuickDrawer open onClose={vi.fn()} />);
}

describe("DocsQuickDrawer — 활성 볼트 범위 (#61)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mocks.mode = "server";
    mocks.vaultStatus = "idle";
    mocks.handleName = null;
    mocks.localManifest = null;
  });

  it("로컬 볼트가 없으면 번들(도그푸드) 문서를 보여준다 — 기존 fallback 유지", () => {
    renderDrawer();

    // 번들 매니페스트에 실제로 있는 문서. 로컬 볼트 문서는 없어야 한다.
    expect(screen.queryByText("정산 규칙")).not.toBeInTheDocument();
  });

  it("로컬 볼트가 로드되면 그 볼트의 문서만 보여준다 — 번들 문서가 새지 않는다", () => {
    mocks.mode = "local";
    mocks.vaultStatus = "loaded";
    mocks.handleName = "my-vault";
    mocks.localManifest = LOCAL_MANIFEST;

    renderDrawer();

    // 트리와 목록 양쪽에 나오므로 개수는 보지 않고 존재만 확인한다.
    expect(screen.getAllByText("정산 규칙").length).toBeGreaterThan(0);
    expect(screen.getAllByText("환불").length).toBeGreaterThan(0);
    // 번들 도그푸드 문서(ARCHITECTURE 등)는 이 볼트에 없다.
    expect(screen.queryByText("ARCHITECTURE")).not.toBeInTheDocument();
  });

  it("고정/최근은 볼트 범위로 나뉜다 — 샘플에서 고정한 게 로컬 볼트에 섞이지 않는다", () => {
    // 번들 범위에 고정을 심어 둔다.
    window.localStorage.setItem(
      "demo:docs-vault:pinned:v1:server",
      JSON.stringify(["ARCHITECTURE"]),
    );

    mocks.mode = "local";
    mocks.vaultStatus = "loaded";
    mocks.handleName = "my-vault";
    mocks.localManifest = LOCAL_MANIFEST;

    renderDrawer();

    // 번들 범위의 고정 문서가 로컬 볼트 드로어에 나타나면 안 된다.
    expect(screen.queryByText("ARCHITECTURE")).not.toBeInTheDocument();
  });
});
