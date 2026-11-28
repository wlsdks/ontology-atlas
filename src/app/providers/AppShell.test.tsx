import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { workRuns } from "@/features/work-run";

import { AppShell } from "./AppShell";

const shellMocks = vi.hoisted(() => ({
  pathname: "/ontology/studio",
  replace: vi.fn(),
  vault: {
    status: "idle",
    handle: null as { name: string; rootPath: string } | null,
    recentVaults: [] as { desktopRootPath: string; docCount?: number; conceptCount?: number }[],
    manifest: null as object | null,
    partialTotal: 0,
    restoreAttempted: true,
    isReloadingSameVault: false,
  },
  arriving: null as { docs: { slug: string; frontmatter?: Record<string, unknown> }[] } | null,
  folder: null as string | null,
}));

/** The shell owns the rail's utility tier, so it stands even when no page injects a slot. */

vi.mock("use-intl", () => ({
  useTranslations: () => Object.assign((key: string) => key, { rich: (key: string) => key }),
  useLocale: () => "ko",
}));

vi.mock("@/entities/vault-session/model/use-agent-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/entities/vault-session/model/use-agent-server")>()),
  useAgentServer: () => ({
    kind: "unavailable",
    launch: null,
    binaryPath: null,
    reason: "The bundled MCP server is only available in the installed app.",
  }),
}));
vi.mock("@/entities/vault-session/model/vault-provider/LocalVaultProvider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/entities/vault-session/model/vault-provider/LocalVaultProvider")>()),
  useLocalVault: () => shellMocks.vault,
}));
vi.mock("@/entities/vault-session/model/vault-opening/vault-arrival", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/entities/vault-session/model/vault-opening/vault-arrival")>()),
  useArrivingManifest: () => shellMocks.arriving,
}));
vi.mock("@/entities/vault-session/model/vault-source/use-data-source-mode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/entities/vault-session/model/vault-source/use-data-source-mode")>()),
  useDataSourceMode: () => "no-folder",
}));

vi.mock("@/entities/vault-session/model/vault-source/use-vault-identity-scope", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/entities/vault-session/model/vault-source/use-vault-identity-scope")>();
  return { ...actual, useVaultSessionIdentityScope: () => shellMocks.folder ?? actual.useVaultSessionIdentityScope() };
});

vi.mock("@/shared/lib/vault-folder/native-vault/tauri-vault-runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/vault-folder/native-vault/tauri-vault-runtime")>()),
  getTauriVaultRootPath: (handle: { rootPath?: string }) => handle.rootPath,
}));

vi.mock("@/features/vault-ontology", () => ({
  useOntologyInsight: () => ({ insight: null }),
}));


// No router mounts around the shell here; the screen on show is whatever the window's address names.
vi.mock("@/shared/lib/navigation/use-committed-address", async () => {
  const { parseSearch } = await import("@/shared/lib/navigation/atlas-search");
  return {
    useCommittedAddress: () => ({ pathname: window.location.pathname, searchString: window.location.search }),
    useCommittedSearch: () => parseSearch(window.location.search),
  };
});

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: shellMocks.replace }),
  usePathname: () => shellMocks.pathname,
  Link: ({ children }: { children?: unknown }) => children,
}));

beforeEach(() => {
  shellMocks.pathname = "/ontology/studio";
  shellMocks.replace.mockClear();
  shellMocks.vault.status = "idle";
  shellMocks.vault.handle = null;
  shellMocks.vault.recentVaults = [];
  shellMocks.vault.manifest = null;
  shellMocks.vault.partialTotal = 0;
  shellMocks.vault.restoreAttempted = true;
  shellMocks.vault.isReloadingSameVault = false;
  shellMocks.arriving = null;
  shellMocks.folder = null;
});

describe("a mapping run on the rail", () => {
  /** The driver keys a run by the open folder's root path; the rail must find it by the same. */
  const ROOT = "/Users/probe/Ontology Atlas/launch";
  const figures = (uncovered: number) => ({ abilitiesUncovered: uncovered, abilitiesTotal: 120 });

  afterEach(() => act(() => workRuns.reset()));

  it("rings the map tile with the share on the map, never the Library tile, and marks a wait there", () => {
    shellMocks.folder = "local:launch#1";
    shellMocks.vault.handle = { name: "launch", rootPath: ROOT };
    workRuns.enterFolderRoot(ROOT);
    workRuns.beginMapping({ folder: ROOT, folderName: "launch", project: "launch", agent: "Claude Agent", figures: figures(96), startedAt: 0 });
    workRuns.endMappingBatch(ROOT, { outcome: { kind: "completed" }, figures: figures(72), draft: false, at: 120_000 });
    render(<AppShell><div>page</div></AppShell>);
    expect(screen.getByTestId("app-nav-rail-ring-map")).toHaveAttribute("data-ring-fraction", "0.4000");
    expect(screen.queryByTestId("app-nav-rail-ring-library")).not.toBeInTheDocument();

    act(() => workRuns.observeMappingWork(ROOT, { kind: "writing", label: null, target: "wiki/a.md", asking: true }, 130_000));
    expect(screen.getByTestId("app-nav-rail-waiting-map")).toBeInTheDocument();
    expect(screen.queryByTestId("app-nav-rail-waiting-library")).not.toBeInTheDocument();
  });
});

describe("AppShell rail utility tier", () => {
  it("shows settings when no page injects a slot", () => {
    render(
      <AppShell>
        <div>page</div>
      </AppShell>,
    );

    const tier = screen.getByTestId("app-nav-rail-utility-tier");
    // Composition, not child count: web-only tiles may join the tier.
    expect(screen.queryByTestId("app-nav-rail-agent-status")).not.toBeInTheDocument();
    expect(tier.querySelector("details")).not.toBeNull();
  });

  it("renders no git utility tile because git is a destination", () => {
    render(
      <AppShell>
        <div>page</div>
      </AppShell>,
    );

    // The destination entry is checked in `AppNavRail.test.tsx`: this file's `Link` mock renders
    // children only, so its test id is absent here.
    expect(screen.queryByTestId("app-nav-rail-git-tile")).not.toBeInTheDocument();
  });
});

describe("a folder that is opening", () => {
  const opening = () => {
    shellMocks.vault.status = "opening";
    render(
      <AppShell>
        <div>page</div>
      </AppShell>,
    );
  };

  it("holds the rail column and shows the mascot on a workbench destination", () => {
    shellMocks.pathname = "/ko/projects";
    opening();
    expect(screen.getByTestId("vault-opening-rail-reserve")).toBeInTheDocument();
    expect(screen.getByTestId("brand-waiting-mark")).toBeInTheDocument();
    expect(screen.queryByTestId("map-wait-cluster")).not.toBeInTheDocument();
  });

  it("shows the map's orbit on the map, so both phases of its first load look alike", () => {
    shellMocks.pathname = "/ko/topology";
    opening();
    expect(screen.getByTestId("map-wait-cluster")).toBeInTheDocument();
    expect(screen.queryByTestId("brand-waiting-mark")).not.toBeInTheDocument();
  });

  it.each([
    ["names the folder when its last read found pages and no concept", 0, true],
    ["keeps the map's orbit when its last read found concepts", 12, false],
  ])("on the map, %s", (_condition, conceptCount, named) => {
    shellMocks.pathname = "/ko/topology";
    shellMocks.vault.status = "loading";
    shellMocks.vault.handle = { name: "notes", rootPath: "/Users/probe/notes" };
    shellMocks.vault.recentVaults = [{ desktopRootPath: "/Users/probe/notes", docCount: 450, conceptCount }];
    render(
      <AppShell>
        <div>page</div>
      </AppShell>,
    );
    expect(screen.queryByTestId("brand-waiting-mark") !== null).toBe(named);
    expect(screen.queryByTestId("map-wait-cluster") !== null).toBe(!named);
  });

  it.each([
    ["no part has brought anything yet", []],
    ["only wiki pages have arrived", [{ slug: "wiki/plan" }]],
  ])("keeps the map waiting while the folder arrives and %s", (_condition, docs) => {
    shellMocks.pathname = "/ko/topology";
    shellMocks.vault.status = "loading";
    shellMocks.vault.partialTotal = 450;
    shellMocks.arriving = { docs };
    render(
      <AppShell>
        <div>page</div>
      </AppShell>,
    );
    expect(screen.getByTestId("vault-route-identity-pending")).toBeInTheDocument();
    expect(screen.queryByText("page")).not.toBeInTheDocument();
  });

  it("draws the map once an arriving part brings a concept", () => {
    shellMocks.pathname = "/ko/topology";
    shellMocks.vault.status = "loading";
    shellMocks.vault.partialTotal = 450;
    shellMocks.arriving = { docs: [{ slug: "domains/reading", frontmatter: { kind: "domain" } }] };
    render(
      <AppShell>
        <div>page</div>
      </AppShell>,
    );
    expect(screen.queryByTestId("vault-route-identity-pending")).not.toBeInTheDocument();
    expect(screen.getByText("page")).toBeInTheDocument();
  });

  it("draws no second column when the rail is already on screen", () => {
    shellMocks.pathname = "/ko/projects";
    shellMocks.vault.manifest = { docs: [] };
    opening();
    expect(screen.queryByTestId("vault-opening-rail-reserve")).not.toBeInTheDocument();
  });
});

describe("shell column owns the viewport", () => {
  it("hides the rail and bundled destinations in the installed app without a vault", () => {
    shellMocks.pathname = "/ko/projects";

    render(
      <AppShell>
        <div>bundled sample destination</div>
      </AppShell>,
    );

    expect(screen.getByTestId("app-nav-rail")).toHaveAttribute("data-hidden", "true");
    expect(screen.queryByText("bundled sample destination")).not.toBeInTheDocument();
    expect(screen.getByTestId("vault-route-identity-pending")).toBeInTheDocument();
    expect(shellMocks.replace).toHaveBeenCalledWith("/");
  });

  it("holds the viewport height and scrolls only the body", () => {
    const { container } = render(
      <AppShell>
        <div>page</div>
      </AppShell>,
    );
    const shell = container.querySelector(".h-dvh");
    expect(shell).not.toBeNull();
    expect(shell?.className).toContain("overflow-hidden");
  });

  it("keeps the body slot from shrinking its children so the scroll-end gap survives", () => {
    // jsdom does no layout, so this pins the prescription.
    const { container } = render(
      <AppShell>
        <div>page</div>
      </AppShell>,
    );
    // By test id: `.overflow-y-auto` also matches the rail's `<nav>`.
    const slot = container.querySelector('[data-testid="app-shell-body-slot"]');
    expect(slot).not.toBeNull();
    expect(slot?.className).toContain("overflow-y-auto");
    expect(
      slot?.className,
      "direct children must not shrink; making each page remember shrink-0 regresses on the next screen",
    ).toContain("[&>*]:shrink-0");
  });

  it("renders no built-in terminal handle", () => {
    render(
      <AppShell>
        <div>page</div>
      </AppShell>,
    );
    expect(screen.queryByTestId("agent-terminal-handle")).not.toBeInTheDocument();
  });
});


describe("folder-optional cold arrival", () => {
  it.each(["/ko/agents", "/ko/changes", "/ko/library", "/ko/planning"])("waits for restoration before exposing controls on %s", (pathname) => {
    shellMocks.pathname = pathname;
    shellMocks.vault.restoreAttempted = false;
    const content = <AppShell><input aria-label="Source question" /></AppShell>;
    const { rerender } = render(content);
    expect(screen.queryByRole("textbox", { name: "Source question" })).not.toBeInTheDocument();
    expect(shellMocks.replace).not.toHaveBeenCalled();
    shellMocks.vault.status = "opening";
    rerender(<AppShell><input aria-label="Source question" /></AppShell>);
    expect(screen.queryByRole("textbox", { name: "Source question" })).not.toBeInTheDocument();
    shellMocks.vault.status = "idle";
    shellMocks.vault.restoreAttempted = true;
    rerender(<AppShell><input aria-label="Source question" /></AppShell>);
    const input = screen.getByRole("textbox", { name: "Source question" });
    input.focus();
    fireEvent.change(input, { target: { value: "Explain this change" } });
    rerender(<AppShell><input aria-label="Source question" /></AppShell>);
    expect(screen.getByRole("textbox", { name: "Source question" })).toBe(input);
    expect(input).toHaveFocus();
    expect(input).toHaveValue("Explain this change");
    expect(shellMocks.replace).not.toHaveBeenCalled();
  });
});
