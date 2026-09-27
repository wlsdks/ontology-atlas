import { render, screen } from "@testing-library/react";
import { useMemo, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import {
  NavRailShellProvider,
  useNavRailContextHrefs,
  useNavRailShellValue,
} from "./shell-slot-context";

/** Callers must stabilise `hrefs` with useMemo; a fresh literal every render loops the effect. */
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
    // The rail lives in the layout and only the page unmounts on a route change.
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
