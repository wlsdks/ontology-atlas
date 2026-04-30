import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { OntologyStubList } from "./OntologyStubList";
import type { StubNode } from "@/entities/knowledge-graph";

function makeStub(overrides: Partial<StubNode> = {}): StubNode {
  return {
    id: "unknown:iam",
    title: "iam",
    kind: "unknown",
    projectIds: [],
    evidenceIds: ["doc-1"],
    isStub: true,
    pendingType: "depends_on",
    pendingFromId: "capability:auth-login",
    ...overrides,
  };
}

describe("OntologyStubList — empty state", () => {
  it("shows empty hint when no stubs", () => {
    render(
      <OntologyStubList stubs={[]} onPromote={() => {}} onDismiss={() => {}} />,
    );
    expect(screen.getByTestId("ontology-stub-list-empty")).toBeInTheDocument();
  });
});

describe("OntologyStubList — render", () => {
  it("renders title, pendingFromId, type label, evidence count", () => {
    render(
      <OntologyStubList
        stubs={[makeStub()]}
        onPromote={() => {}}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText("iam")).toBeInTheDocument();
    expect(screen.getByText("capability:auth-login")).toBeInTheDocument();
    expect(screen.getByText("의존")).toBeInTheDocument();
    expect(screen.getByText(/근거 문서 1/)).toBeInTheDocument();
  });

  it("renders count banner with stub count", () => {
    render(
      <OntologyStubList
        stubs={[makeStub({ id: "unknown:a" }), makeStub({ id: "unknown:b" })]}
        onPromote={() => {}}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText(/미해결 참조 2 건/)).toBeInTheDocument();
  });
});

describe("OntologyStubList — promote flow", () => {
  it("opens kind picker on promote click and calls onPromote with chosen kind", () => {
    const onPromote = vi.fn();
    render(
      <OntologyStubList
        stubs={[makeStub()]}
        onPromote={onPromote}
        onDismiss={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("promote"));
    expect(screen.getByTestId("ontology-stub-kind-picker")).toBeInTheDocument();
    fireEvent.click(screen.getByText("프로젝트"));
    expect(onPromote).toHaveBeenCalledWith("unknown:iam", "project");
  });

  it("can cancel the kind picker", () => {
    render(
      <OntologyStubList
        stubs={[makeStub()]}
        onPromote={() => {}}
        onDismiss={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("promote"));
    fireEvent.click(screen.getByText("✕"));
    expect(screen.queryByTestId("ontology-stub-kind-picker")).not.toBeInTheDocument();
  });

  it("disables actions when busyNodeId matches", () => {
    render(
      <OntologyStubList
        stubs={[makeStub()]}
        busyNodeId="unknown:iam"
        onPromote={() => {}}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText("처리 중...")).toBeDisabled();
  });
});

describe("OntologyStubList — dismiss flow", () => {
  it("calls onDismiss after window.confirm true", () => {
    const onDismiss = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <OntologyStubList
        stubs={[makeStub()]}
        onPromote={() => {}}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByText("dismiss"));
    expect(confirmSpy).toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalledWith("unknown:iam");
    confirmSpy.mockRestore();
  });

  it("does not call onDismiss when confirm cancelled", () => {
    const onDismiss = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <OntologyStubList
        stubs={[makeStub()]}
        onPromote={() => {}}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByText("dismiss"));
    expect(onDismiss).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
