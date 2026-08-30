import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DocsQuickDrawer } from "./DocsQuickDrawer";

/**
 * #61 — this drawer is quick access to **the active vault**. It used to read the
 * build-time bundled `vaultManifest` directly, so selecting a 5-document local
 * vault still produced Atlas bundle documents (review 2026-07-25 · codex audit P1).
 * Pinned and recent were fixed at `:server` too, mixing in another vault's lists.
 */

const mocks = vi.hoisted(() => ({
  mode: "server" as "server" | "local",
  vaultStatus: "idle" as string,
  handleName: null as string | null,
  localManifest: null as unknown,
}));

vi.mock("@/entities/vault-session/model/use-data-source-mode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/entities/vault-session/model/use-data-source-mode")>()),
  useDataSourceMode: () => mocks.mode,
}));
vi.mock("@/entities/vault-session/model/LocalVaultProvider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/entities/vault-session/model/LocalVaultProvider")>()),
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

    // A document that really is in the bundled manifest. Local vault documents must not appear.
    expect(screen.queryByText("정산 규칙")).not.toBeInTheDocument();
  });

  it("로컬 볼트가 로드되면 그 볼트의 문서만 보여준다 — 번들 문서가 새지 않는다", () => {
    mocks.mode = "local";
    mocks.vaultStatus = "loaded";
    mocks.handleName = "my-vault";
    mocks.localManifest = LOCAL_MANIFEST;

    renderDrawer();

    // It appears in both the tree and the list, so only existence is checked, not the count.
    expect(screen.getAllByText("정산 규칙").length).toBeGreaterThan(0);
    expect(screen.getAllByText("환불").length).toBeGreaterThan(0);
    // The bundled dogfood documents (ARCHITECTURE and so on) are not in this vault.
    expect(screen.queryByText("ARCHITECTURE")).not.toBeInTheDocument();
  });

  it("고정/최근은 볼트 범위로 나뉜다 — 샘플에서 고정한 게 로컬 볼트에 섞이지 않는다", () => {
    // Plant a pin in the bundle scope.
    window.localStorage.setItem(
      "demo:docs-vault:pinned:v1:server",
      JSON.stringify(["ARCHITECTURE"]),
    );

    mocks.mode = "local";
    mocks.vaultStatus = "loaded";
    mocks.handleName = "my-vault";
    mocks.localManifest = LOCAL_MANIFEST;

    renderDrawer();

    // A document pinned in the bundle scope must not appear in the local vault's drawer.
    expect(screen.queryByText("ARCHITECTURE")).not.toBeInTheDocument();
  });
});
