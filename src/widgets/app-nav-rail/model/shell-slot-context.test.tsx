import { render, screen } from "@testing-library/react";
import { useMemo, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import {
  NavRailShellProvider,
  useNavRailContextHrefs,
  useNavRailShellValue,
} from "./shell-slot-context";

/**
 * Carrying LNB context forward. `useNavRailContextHrefs` shares the same reverse
 * Context contract (leaf page → rail) as `useNavRailSettingsSlot`: registering makes
 * the rail read that value, and unmounting clears it automatically so another page
 * does not inherit leftover context.
 *
 * `hrefs` is stabilised with `useMemo` — the same contract as `HomePage`'s real usage
 * (the caller stabilises the reference). Passing a fresh object literal every render
 * would loop endlessly: effect re-runs → context value changes → re-render → a new
 * object … so that stabilisation is itself part of the
 * `useNavRailContextHrefs`/`useNavRailSettingsSlot` contract.
 */
function Registrar({ docsHref }: { docsHref?: string }) {
  const hrefs = useMemo(() => (docsHref ? { docs: docsHref } : null), [docsHref]);
  useNavRailContextHrefs(hrefs);
  return null;
}

function RailValueProbe() {
  const { contextHrefs } = useNavRailShellValue();
  return <span data-testid="probe">{contextHrefs?.docs ?? "none"}</span>;
}

describe("NavRailShellProvider contextHrefs", () => {
  it("starts with no contextHrefs registered", () => {
    render(
      <NavRailShellProvider>
        <RailValueProbe />
      </NavRailShellProvider>,
    );
    expect(screen.getByTestId("probe")).toHaveTextContent("none");
  });

  it("exposes the registered docs href to the rail", () => {
    render(
      <NavRailShellProvider>
        <Registrar docsHref="/docs/?slug=capabilities/mcp-server" />
        <RailValueProbe />
      </NavRailShellProvider>,
    );
    expect(screen.getByTestId("probe")).toHaveTextContent(
      "/docs/?slug=capabilities/mcp-server",
    );
  });

  it("clears the contextHrefs when the registering page unmounts, without unmounting the rail itself", () => {
    // Reproduces the real contract, where the rail (RailValueProbe) lives in the layout
    // and only the page (Registrar) unmounts on a route change — `showRegistrar=false`
    // simulates "navigated to another route".
    function Tree({ showRegistrar }: { showRegistrar: boolean }): ReactNode {
      return (
        <NavRailShellProvider>
          {showRegistrar ? (
            <Registrar docsHref="/docs/?slug=capabilities/mcp-server" />
          ) : null}
          <RailValueProbe />
        </NavRailShellProvider>
      );
    }

    const { rerender } = render(<Tree showRegistrar />);
    expect(screen.getByTestId("probe")).toHaveTextContent(
      "/docs/?slug=capabilities/mcp-server",
    );

    rerender(<Tree showRegistrar={false} />);
    expect(screen.getByTestId("probe")).toHaveTextContent("none");
  });
});
