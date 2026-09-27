import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "./AppShell";

const shellMocks = vi.hoisted(() => ({
  pathname: "/ontology/studio",
  desktop: false,
  replace: vi.fn(),
  vault: {
    status: "idle",
    handle: null,
    manifest: null as object | null,
    restoreAttempted: true,
    isReloadingSameVault: false,
  },
}));

/** The shell owns the rail's utility tier, so it stands even when no page injects a slot. */

vi.mock("next-intl", () => ({
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
vi.mock("@/entities/vault-session/model/LocalVaultProvider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/entities/vault-session/model/LocalVaultProvider")>()),
  useLocalVault: () => shellMocks.vault,
}));
vi.mock("@/entities/vault-session/model/use-data-source-mode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/entities/vault-session/model/use-data-source-mode")>()),
  useDataSourceMode: () => "static",
}));

vi.mock("@/shared/lib/desktop-shell", () => ({
  isDesktopShell: () => shellMocks.desktop,
}));

vi.mock("@/features/vault-ontology", () => ({
  useOntologyInsight: () => ({ insight: null }),
}));


vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: shellMocks.replace }),
  usePathname: () => shellMocks.pathname,
  Link: ({ children }: { children?: unknown }) => children,
}));

beforeEach(() => {
  shellMocks.pathname = "/ontology/studio";
  shellMocks.desktop = false;
  shellMocks.replace.mockClear();
  shellMocks.vault.status = "idle";
  shellMocks.vault.handle = null;
  shellMocks.vault.manifest = null;
  shellMocks.vault.restoreAttempted = true;
  shellMocks.vault.isReloadingSameVault = false;
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

describe("shell column owns the viewport", () => {
  it("hides the rail and bundled destinations in the installed app without a vault", () => {
    shellMocks.desktop = true;
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
    // jsdom does no layout, so this pins the prescription; `tests/e2e/scroll-end-gap.spec.ts`
    // measures the real gap.
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
    // The bottom terminal dock was removed on purpose; people run agents in their own terminal.
    render(
      <AppShell>
        <div>page</div>
      </AppShell>,
    );
    expect(screen.queryByTestId("agent-terminal-handle")).not.toBeInTheDocument();
  });
});
