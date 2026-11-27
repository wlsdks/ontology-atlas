import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import koMessages from "../../../../messages/ko.json";
import { FirstRunStarterModule } from "./FirstRunStarterModule";

/**
 * The card collapses once the map is in use and can be brought back; both directions are
 * measured. Mocks follow `FirstRunStarterModule.glossary.test.tsx`.
 */
const mocks = vi.hoisted(() => ({
  vault: {
    status: "idle",
    manifest: null,
    errorMessage: null,
    restoreAttempted: true,
    recentVaults: [] as unknown[],
    open: vi.fn(async () => undefined),
    scaffoldOntology: vi.fn(async () => ({ created: 8, skipped: 0 })),
  },
}));

vi.mock("@/entities/vault-session/model/vault-provider/LocalVaultProvider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/entities/vault-session/model/vault-provider/LocalVaultProvider")>()),
  useLocalVault: () => mocks.vault,
}));
vi.mock("@/entities/vault-session/model/vault-source/use-data-source-mode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/entities/vault-session/model/vault-source/use-data-source-mode")>()),
  useDataSourceMode: () => "no-folder",
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function mount(nodeSelected: boolean) {
  return render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <FirstRunStarterModule nodeSelected={nodeSelected} />
    </NextIntlClientProvider>,
  );
}

const REOPEN = koMessages.firstRunStarter.reopenLabel;

describe("first-run card collapses once the map is in use", () => {
  it("stays expanded while no node is selected", () => {
    mount(false);
    expect(screen.queryByText(REOPEN)).toBeNull();
  });

  it("collapses on node selection and leaves a return row", () => {
    mount(true);
    expect(screen.getByText(REOPEN)).toBeInTheDocument();
  });
});
