import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { OntologyTreeView } from "./OntologyTreeView";
import type { OntologyTreeBuildResult } from "@/shared/lib/ontology-tree";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";

function makeNode(id: string, kind: string, title?: string): KnowledgeGraphNode {
  return {
    id,
    title: title ?? id,
    kind,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date(),
    lastApprovedBy: "system",
  };
}

function makeResult(): OntologyTreeBuildResult {
  return {
    roots: [
      {
        node: makeNode("p1", "project", "Aslan Maps"),
        depth: 0,
        children: [
          {
            node: makeNode("d1", "domain", "인증"),
            depth: 1,
            children: [
              {
                node: makeNode("c1", "capability", "로그인"),
                depth: 2,
                children: [],
              },
            ],
          },
        ],
      },
    ],
    orphans: [],
    warnings: [],
  };
}

describe("OntologyTreeView — basic render", () => {
  it("renders all tree rows by default (defaultExpanded=true)", () => {
    render(<OntologyTreeView result={makeResult()} />);
    expect(screen.getByText("Aslan Maps")).toBeInTheDocument();
    expect(screen.getByText("인증")).toBeInTheDocument();
    expect(screen.getByText("로그인")).toBeInTheDocument();
  });

  it("renders kind chips in Korean", () => {
    render(<OntologyTreeView result={makeResult()} />);
    expect(screen.getByText("프로젝트")).toBeInTheDocument();
    expect(screen.getByText("도메인")).toBeInTheDocument();
    expect(screen.getByText("역량")).toBeInTheDocument();
  });

  it("indents rows by depth", () => {
    render(<OntologyTreeView result={makeResult()} />);
    const rows = screen.getAllByTestId("ontology-tree-row");
    expect(rows[0]!.getAttribute("data-depth")).toBe("0");
    expect(rows[1]!.getAttribute("data-depth")).toBe("1");
    expect(rows[2]!.getAttribute("data-depth")).toBe("2");
  });
});

describe("OntologyTreeView — expand / collapse", () => {
  it("hides children when toggle is clicked", () => {
    render(<OntologyTreeView result={makeResult()} />);
    const collapseBtn = screen.getAllByLabelText("접기")[0]!; // 첫 번째 (project root)
    fireEvent.click(collapseBtn);
    // 인증 / 로그인 should disappear
    expect(screen.queryByText("인증")).not.toBeInTheDocument();
    expect(screen.queryByText("로그인")).not.toBeInTheDocument();
    // root still visible
    expect(screen.getByText("Aslan Maps")).toBeInTheDocument();
  });

  it("shows children again on second toggle", () => {
    render(<OntologyTreeView result={makeResult()} />);
    const initialBtn = screen.getAllByLabelText("접기")[0]!;
    fireEvent.click(initialBtn);
    // After collapse, the same button is now "펼치기"
    const expandBtn = screen.getAllByLabelText("펼치기")[0]!;
    fireEvent.click(expandBtn);
    expect(screen.getByText("인증")).toBeInTheDocument();
  });
});

describe("OntologyTreeView — onSelect", () => {
  it("calls onSelect with the clicked node", () => {
    const handleSelect = vi.fn();
    render(<OntologyTreeView result={makeResult()} onSelect={handleSelect} />);
    fireEvent.click(screen.getByText("로그인"));
    expect(handleSelect).toHaveBeenCalledTimes(1);
    expect(handleSelect.mock.calls[0]![0]!.id).toBe("c1");
  });
});

describe("OntologyTreeView — UX-11 element kind dim", () => {
  function withElement(): OntologyTreeBuildResult {
    return {
      roots: [
        {
          node: makeNode("p1", "project", "Aslan Maps"),
          depth: 0,
          children: [
            {
              node: makeNode("d1", "domain", "인증"),
              depth: 1,
              children: [
                {
                  node: makeNode("c1", "capability", "로그인"),
                  depth: 2,
                  children: [
                    {
                      node: makeNode("e1", "element", "JWT 토큰"),
                      depth: 3,
                      children: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      orphans: [],
      warnings: [],
    };
  }

  it("element kind row 에 data-dim=true + opacity-60 클래스", () => {
    render(<OntologyTreeView result={withElement()} />);
    const rows = screen.getAllByTestId("ontology-tree-row");
    const elementRow = rows.find((r) => r.getAttribute("data-kind") === "element");
    expect(elementRow).toBeDefined();
    expect(elementRow!.getAttribute("data-dim")).toBe("true");
    expect(elementRow!.className).toContain("opacity-60");
    expect(elementRow!.className).toContain("hover:opacity-100");
    expect(elementRow!.className).toContain("focus-within:opacity-100");
  });

  it("non-element kind row (project/domain/capability) 에 data-dim=false + opacity 클래스 없음", () => {
    render(<OntologyTreeView result={withElement()} />);
    const rows = screen.getAllByTestId("ontology-tree-row");
    const projectRow = rows.find((r) => r.getAttribute("data-kind") === "project");
    const domainRow = rows.find((r) => r.getAttribute("data-kind") === "domain");
    const capabilityRow = rows.find((r) => r.getAttribute("data-kind") === "capability");
    for (const row of [projectRow, domainRow, capabilityRow]) {
      expect(row).toBeDefined();
      expect(row!.getAttribute("data-dim")).toBe("false");
      expect(row!.className).not.toContain("opacity-60");
    }
  });
});

describe("OntologyTreeView — UX-16 project chip", () => {
  function withProjects(): OntologyTreeBuildResult {
    return {
      roots: [
        {
          node: makeNode("d1", "domain", "Auth"),
          depth: 0,
          children: [
            {
              node: {
                ...makeNode("c1", "capability", "JWT"),
                projectIds: ["aslan-iam"],
              },
              depth: 1,
              children: [
                {
                  node: {
                    ...makeNode("c2", "capability", "Multi"),
                    projectIds: ["paravel-app", "paravel-backend", "extra"],
                  },
                  depth: 2,
                  children: [],
                },
              ],
            },
          ],
        },
      ],
      orphans: [],
      warnings: [],
    };
  }

  it("capability 노드에 첫 projectIds chip 노출", () => {
    render(<OntologyTreeView result={withProjects()} />);
    const chips = screen.getAllByTestId("ontology-tree-project-chip");
    const aslan = chips.find(
      (c) => c.getAttribute("data-project-id") === "aslan-iam",
    );
    expect(aslan).toBeDefined();
  });

  it("다중 projectIds → 첫 + +N 표시", () => {
    render(<OntologyTreeView result={withProjects()} />);
    const chip = screen
      .getAllByTestId("ontology-tree-project-chip")
      .find((c) => c.getAttribute("data-project-id") === "paravel-app");
    expect(chip).toBeDefined();
    expect(chip!.textContent).toContain("paravel-app");
    expect(chip!.textContent).toContain("+2");
  });

  it("project / document kind 는 chip 미렌더 (자기참조 차단)", () => {
    const proj: OntologyTreeBuildResult = {
      roots: [
        {
          node: {
            ...makeNode("p1", "project", "Project Self"),
            projectIds: ["project-self"],
          },
          depth: 0,
          children: [],
        },
      ],
      orphans: [],
      warnings: [],
    };
    render(<OntologyTreeView result={proj} />);
    expect(
      screen.queryAllByTestId("ontology-tree-project-chip"),
    ).toHaveLength(0);
  });

  it("projectIds 빈 배열 → chip 미렌더", () => {
    const empty: OntologyTreeBuildResult = {
      roots: [
        {
          node: makeNode("c1", "capability", "Lonely"),
          depth: 0,
          children: [],
        },
      ],
      orphans: [],
      warnings: [],
    };
    render(<OntologyTreeView result={empty} />);
    expect(
      screen.queryAllByTestId("ontology-tree-project-chip"),
    ).toHaveLength(0);
  });
});

describe("OntologyTreeView — empty state", () => {
  it("shows the emptyHint when no roots and no orphans", () => {
    render(
      <OntologyTreeView result={{ roots: [], orphans: [], warnings: [] }} />,
    );
    expect(screen.getByTestId("ontology-tree-empty")).toBeInTheDocument();
    expect(screen.getByText(/아직 승인된 ontology 노드가 없어요/)).toBeInTheDocument();
  });

  it("uses custom emptyHint", () => {
    render(
      <OntologyTreeView
        result={{ roots: [], orphans: [], warnings: [] }}
        emptyHint="custom hint"
      />,
    );
    expect(screen.getByText("custom hint")).toBeInTheDocument();
  });
});

describe("OntologyTreeView — orphans + warnings", () => {
  it("renders orphan list when present", () => {
    render(
      <OntologyTreeView
        result={{
          roots: [],
          orphans: [makeNode("orph1", "element", "고립 요소")],
          warnings: [],
        }}
      />,
    );
    expect(screen.getByText("연결되지 않은 노드 1")).toBeInTheDocument();
    expect(screen.getByText("고립 요소")).toBeInTheDocument();
  });

  it("renders warnings details when present", () => {
    render(
      <OntologyTreeView
        result={{
          roots: [],
          orphans: [],
          warnings: ["cycle detected at p1", "duplicate parent for d1"],
        }}
      />,
    );
    expect(screen.getByText("데이터 경고 2 건")).toBeInTheDocument();
  });
});

// vitest auto-import vi for spies
import { vi } from "vitest";
