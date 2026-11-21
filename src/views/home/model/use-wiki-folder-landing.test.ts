import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  cancel: vi.fn(),
  vault: { status: "loaded", manifest: null } as { status: string; manifest: { docs: unknown[] } | null },
}));

vi.mock("@/entities/vault-session", () => ({ useLocalVault: () => mocks.vault }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("@/shared/lib/navigation/map-navigation-pending", () => ({ cancelMapNavigation: mocks.cancel }));

import { DESTINATION_HREF } from "@/shared/config/destinations";
import { useWikiFolderLanding } from "./use-wiki-folder-landing";

const wikiPage = { slug: "wiki/plan", frontmatter: { title: "Plan" } };
const concept = { slug: "domains/reading", frontmatter: { kind: "domain" } };

describe("useWikiFolderLanding", () => {
  beforeEach(() => {
    mocks.replace.mockClear();
    mocks.cancel.mockClear();
  });

  it("sends a loaded folder of pages with no map to the Library and drops the map's pending entry", () => {
    mocks.vault = { status: "loaded", manifest: { docs: [wikiPage] } };
    const { result } = renderHook(() => useWikiFolderLanding(7));
    expect(result.current).toBe(true);
    expect(mocks.replace).toHaveBeenCalledWith(DESTINATION_HREF.library);
    expect(mocks.cancel).toHaveBeenCalledWith(7);
  });

  it.each([
    ["holds a map beside its wiki", { status: "loaded", manifest: { docs: [wikiPage, concept] } }],
    ["is still loading", { status: "loading", manifest: { docs: [wikiPage] } }],
    ["is empty", { status: "loaded", manifest: { docs: [] } }],
  ])("keeps the map when the folder %s", (_condition, vault) => {
    mocks.vault = vault;
    const { result } = renderHook(() => useWikiFolderLanding(null));
    expect(result.current).toBe(false);
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
