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

/**
 * #65 — The bottom rail utility tier (settings) is **the same on all screens.**
 *
 * Pages used to register it by hand via `useNavRailSettingsSlot`, and one page forgot,
 * leaving that screen with a single icon (measured 2026-07-25: map 3, docs/insights/projects 2,
 * that page 1). The shell now owns the default, so all three tiles must stand even when
 * nobody injects a slot.
 */

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

describe("AppShell rail utility tier (#65)", () => {
  it("shows settings when no page injects a slot", () => {
    render(
      <AppShell>
        <div>page</div>
      </AppShell>,
    );

    const tier = screen.getByTestId("app-nav-rail-utility-tier");
    // The fact being enforced is "the shell supplies the default slot", not the child **count**.
    // Previously it counted `children.length === 2`, which was a proxy metric that
    // broke as soon as one web-specific element was added to the tier (2026-07-28 「App fetch」 addition).
    // Instead of count, we look at **composition**.
    expect(screen.queryByTestId("app-nav-rail-agent-status")).not.toBeInTheDocument();
    expect(tier.querySelector("details")).not.toBeNull();
  });

  it("renders no git utility tile because git is a destination", () => {
    render(
      <AppShell>
        <div>page</div>
      </AppShell>,
    );

    // The old utility tile was absorbed; two entrances reproduce the same confusion.
    // (Whether the destination entry itself appears is checked by `AppNavRail.test.tsx` —
    //  this file's `@/i18n/navigation` mock renders `Link` children-only, so the testid
    //  disappears and asserting it here would fail falsely.)
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
    // Structure a page has to remember — such as `--app-viewport-h` — is exactly what
    // drifts. With the shell owning `h-dvh overflow-hidden`, a page needs only `h-full`.
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
    // The slot is a scroll container. The `min-h-full` a page root uses to fill it
    // overrides the flex item's automatic minimum size, so without blocking compression
    // the page box shrinks to viewport height as content grows and the bottom reserve is
    // trapped at the floor of the shrunken box (measured 1512×950: download gap 0px; at
    // 768 the last line of project detail sat 17px behind the tab bar).
    // jsdom does no layout, so pixels are invisible here — this pins only that the
    // prescription is in place, and `tests/e2e/scroll-end-gap.spec.ts` measures the real gap.
    const { container } = render(
      <AppShell>
        <div>page</div>
      </AppShell>,
    );
    /*
     * ⚠️ **Target it by name** (corrected 2026-08-20). This used to grab the first
     * `.overflow-y-auto`, and when the rail became eight destinations and gained scroll,
     * that selector grabbed **the rail's `<nav>`** and this check started measuring the
     * wrong element. A class can be shared by several elements, so "the first one with
     * that class" cannot be a contract.
     */
    const slot = container.querySelector('[data-testid="app-shell-body-slot"]');
    expect(slot).not.toBeNull();
    expect(slot?.className).toContain("overflow-y-auto");
    expect(
      slot?.className,
      "direct children must not shrink; making each page remember shrink-0 regresses on the next screen",
    ).toContain("[&>*]:shrink-0");
  });

  it("renders no built-in terminal handle", () => {
    // Regression guard: the bottom dock was removed on the decision that anyone running
    // an agent uses their own terminal. A handle reappearing means that decision was
    // quietly reversed.
    render(
      <AppShell>
        <div>page</div>
      </AppShell>,
    );
    expect(screen.queryByTestId("agent-terminal-handle")).not.toBeInTheDocument();
  });
});
