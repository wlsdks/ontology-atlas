import { render, screen } from "@testing-library/react";
import { useMemo, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import {
  NavRailShellProvider,
  useNavRailContextHrefs,
  useNavRailShellValue,
} from "./shell-slot-context";

/**
 * 과제 ⑪ — LNB 컨텍스트 이월. `useNavRailContextHrefs` 는
 * `useNavRailSettingsSlot`과 같은 역방향(리프 페이지 → 레일) Context 계약을
 * 공유한다: 등록하면 레일이 그 값을 읽고, 언마운트되면 자동으로 비워
 * 다른 페이지가 남은 컨텍스트를 물려받지 않는다.
 *
 * `useMemo`로 `hrefs` 를 안정화한다 — `HomePage`의 실제 사용과 동일한 계약
 * (호출부가 참조를 안정화)이다. 매 렌더 새 객체 리터럴을 넘기면 effect
 * 재실행 → context 값 변경 → 리렌더 → 새 객체 … 무한 루프가 되므로, 이 안정화
 * 자체가 `useNavRailContextHrefs`/`useNavRailSettingsSlot` 계약의 일부다.
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
    // 레일(RailValueProbe)은 layout 에 상주하고, 페이지(Registrar)만
    // 라우트 이동으로 unmount 되는 실제 계약을 재현 — `showRegistrar=false`
    // 는 "다른 라우트로 이동" 시뮬레이션.
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
