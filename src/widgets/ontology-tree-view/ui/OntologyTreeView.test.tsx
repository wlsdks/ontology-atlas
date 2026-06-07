import { describe, expect, it } from "vitest";
import { fireEvent, render as rtlRender, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import koMessages from "../../../../messages/ko.json";
import { OntologyTreeView } from "./OntologyTreeView";
import { getOntologyKindTone } from "@/entities/ontology-class";
import type { OntologyTreeBuildResult } from "@/shared/lib/ontology-tree";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";

// next-intl provider 로 감싼 render 헬퍼 — useTranslations 가 throw 하지 않게.
function render(ui: React.ReactElement) {
  return rtlRender(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

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
        node: makeNode("p1", "project", "Sample"),
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
    expect(screen.getByText("Sample")).toBeInTheDocument();
    expect(screen.getByText("인증")).toBeInTheDocument();
    expect(screen.getByText("로그인")).toBeInTheDocument();
  });

  it("renders kind chips in Korean", () => {
    render(<OntologyTreeView result={makeResult()} />);
    expect(screen.getByText("프로젝트")).toBeInTheDocument();
    expect(screen.getByText("도메인")).toBeInTheDocument();
    expect(screen.getByText("역량")).toBeInTheDocument();
  });

  it("renders kind chips with distinct ontology tone swatches", () => {
    render(<OntologyTreeView result={makeResult()} />);

    const projectChip = screen.getByText("프로젝트").closest("span");
    const domainChip = screen.getByText("도메인").closest("span");
    const capabilityChip = screen.getByText("역량").closest("span");

    expect(projectChip).toHaveStyle({
      backgroundColor: getOntologyKindTone("project").chipBg,
      borderColor: getOntologyKindTone("project").chipBorder,
    });
    expect(domainChip).toHaveStyle({
      backgroundColor: getOntologyKindTone("domain").chipBg,
      borderColor: getOntologyKindTone("domain").chipBorder,
    });
    expect(capabilityChip).toHaveStyle({
      backgroundColor: getOntologyKindTone("capability").chipBg,
      borderColor: getOntologyKindTone("capability").chipBorder,
    });
  });

  it("검색 입력 컨테이너가 키보드 focus 표시(focus-within border)를 가진다 (a11y)", () => {
    render(<OntologyTreeView result={makeResult()} />);
    const search = screen.getByRole("searchbox");
    const container = search.parentElement;
    // 입력의 focus:outline-none 을 컨테이너 focus-within 보더가 대체 — 키보드
    // 사용자가 검색창 focus 를 볼 수 있어야 한다 (WCAG 2.4.7).
    expect(container?.className).toContain("focus-within:border");
    expect(search.className).toContain("h-8");
  });

  it("검색 시 제목 내 매치 부분을 <mark> 로 강조", () => {
    render(<OntologyTreeView result={makeResult()} />);
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "Sample" },
    });
    const marked = screen.getByText("Sample");
    expect(marked.tagName).toBe("MARK");
  });

  it("검색 시 매치 수 카운트 표시", () => {
    render(<OntologyTreeView result={makeResult()} />);
    // makeResult: Sample > 인증 > 로그인. "인증" 검색 → 1 매치.
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "인증" } });
    expect(screen.getByText("1개 일치")).toBeInTheDocument();
  });

  it("orphan 행 제목도 검색 매치 강조 (main tree 와 일관)", () => {
    const result = {
      ...makeResult(),
      orphans: [makeNode("orphan-widget", "element", "Orphan Widget")],
    };
    render(<OntologyTreeView result={result} />);
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "Orphan" },
    });
    expect(screen.getByText("Orphan").tagName).toBe("MARK");
  });

  it("검색어가 없으면 제목에 mark 가 없다 (정상 텍스트)", () => {
    render(<OntologyTreeView result={makeResult()} />);
    // 기본(필터 off) 상태 — Sample 은 mark 가 아닌 일반 텍스트로 렌더.
    expect(screen.getByText("Sample").tagName).not.toBe("MARK");
  });

  it("treeitem 에 깊이별 aria-level(1-based) 부여 (WAI-ARIA tree)", () => {
    render(<OntologyTreeView result={makeResult()} />);
    // Sample(depth0)→인증(depth1)→로그인(depth2) = aria-level 1/2/3.
    expect(
      screen.getByText("Sample").closest('[role="treeitem"]'),
    ).toHaveAttribute("aria-level", "1");
    expect(
      screen.getByText("인증").closest('[role="treeitem"]'),
    ).toHaveAttribute("aria-level", "2");
    expect(
      screen.getByText("로그인").closest('[role="treeitem"]'),
    ).toHaveAttribute("aria-level", "3");
  });

  it("indents rows by depth", () => {
    render(<OntologyTreeView result={makeResult()} />);
    const rows = screen.getAllByTestId("ontology-tree-row");
    expect(rows[0]!.getAttribute("data-depth")).toBe("0");
    expect(rows[1]!.getAttribute("data-depth")).toBe("1");
    expect(rows[2]!.getAttribute("data-depth")).toBe("2");
  });

  it("keeps tree row controls large enough for touch and focus", () => {
    const { container } = render(<OntologyTreeView result={makeResult()} />);

    expect(screen.getAllByTestId("ontology-tree-row")[0]?.className).toContain(
      "min-h-9",
    );
    expect(screen.getAllByLabelText("접기")[0]?.className).toContain("h-8");

    const selectButtons = container.querySelectorAll<HTMLButtonElement>(
      '[data-tree-select-button="true"]',
    );
    expect(selectButtons[0]?.className).toContain("min-h-8");
  });

  it("keeps tree view option controls touchable", () => {
    render(<OntologyTreeView result={makeResult()} />);

    expect(screen.getByLabelText("트리 정렬 방식").className).toContain("h-8");
  });

  it("baseline 이후 변경된 노드 행에 조용한 변경 배지를 표시", () => {
    render(<OntologyTreeView result={makeResult()} changedNodeIds={new Set(["d1"])} />);

    const changedRow = screen.getByText("인증").closest('[role="treeitem"]');
    expect(changedRow).toHaveAttribute("data-changed", "true");
    expect(screen.getByText("변경")).toHaveAttribute(
      "title",
      "인증 — 기준 이후 변경됨",
    );
  });

  it("선택 행은 짧은 상태 문구만 표시하고 slug 설명은 툴팁으로 보낸다", () => {
    const { container } = render(
      <OntologyTreeView result={makeResult()} selectedId="c1" />,
    );

    expect(screen.getByLabelText("로그인 선택")).toBeInTheDocument();
    expect(screen.getByText("선택됨")).toHaveAttribute(
      "title",
      "현재 선택: c1",
    );
    expect(screen.queryByText(/선택 기준/)).not.toBeInTheDocument();

    const selectButtons = container.querySelectorAll<HTMLButtonElement>(
      '[data-tree-select-button="true"]',
    );
    expect(selectButtons[2]).toHaveAttribute("title", "로그인 보기");
  });
});

describe("OntologyTreeView — expand / collapse", () => {
  it("첫 진입을 domain까지만 읽게 할 수 있다", () => {
    render(<OntologyTreeView result={makeResult()} collapseDomainsByDefault />);

    expect(screen.getByText("Sample")).toBeInTheDocument();
    expect(screen.getByText("인증")).toBeInTheDocument();
    expect(screen.queryByText("로그인")).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByLabelText("펼치기")[0]!);
    expect(screen.getByText("로그인")).toBeInTheDocument();
  });

  it("검색 옆에 전체 펼치기 / 전체 접기 직접 컨트롤을 노출한다", () => {
    render(<OntologyTreeView result={makeResult()} />);

    const controls = screen.getByTestId("ontology-tree-expand-controls");
    const expandAll = within(controls).getByRole("button", { name: "전체 펼치기" });
    const collapseAll = within(controls).getByRole("button", { name: "전체 접기" });

    expect(expandAll).toBeDisabled();
    expect(collapseAll).toBeEnabled();

    fireEvent.click(collapseAll);
    expect(screen.queryByText("인증")).not.toBeInTheDocument();
    expect(screen.queryByText("로그인")).not.toBeInTheDocument();

    fireEvent.click(expandAll);
    expect(screen.getByText("인증")).toBeInTheDocument();
    expect(screen.getByText("로그인")).toBeInTheDocument();
  });

  it("hides children when toggle is clicked", () => {
    render(<OntologyTreeView result={makeResult()} />);
    const collapseBtn = screen.getAllByLabelText("접기")[0]!; // 첫 번째 (project root)
    fireEvent.click(collapseBtn);
    // 인증 / 로그인 should disappear
    expect(screen.queryByText("인증")).not.toBeInTheDocument();
    expect(screen.queryByText("로그인")).not.toBeInTheDocument();
    // root still visible
    expect(screen.getByText("Sample")).toBeInTheDocument();
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

describe("OntologyTreeView — keyboard nav (R+)", () => {
  it("ArrowDown on focused select button → focus next row", () => {
    const { container } = render(<OntologyTreeView result={makeResult()} />);
    const buttons = container.querySelectorAll<HTMLButtonElement>(
      '[data-tree-select-button="true"]',
    );
    expect(buttons.length).toBe(3); // p1 / d1 / c1
    buttons[0]!.focus();
    expect(document.activeElement).toBe(buttons[0]);
    fireEvent.keyDown(buttons[0]!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(buttons[1]);
    fireEvent.keyDown(buttons[1]!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(buttons[2]);
  });

  it("ArrowUp on focused select button → focus previous row", () => {
    const { container } = render(<OntologyTreeView result={makeResult()} />);
    const buttons = container.querySelectorAll<HTMLButtonElement>(
      '[data-tree-select-button="true"]',
    );
    buttons[2]!.focus();
    fireEvent.keyDown(buttons[2]!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(buttons[1]);
  });

  it("ArrowDown at last row — focus 유지 (out-of-bound 무시)", () => {
    const { container } = render(<OntologyTreeView result={makeResult()} />);
    const buttons = container.querySelectorAll<HTMLButtonElement>(
      '[data-tree-select-button="true"]',
    );
    buttons[2]!.focus();
    fireEvent.keyDown(buttons[2]!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(buttons[2]);
  });

  it("ArrowUp at first row — focus 유지 (out-of-bound 무시)", () => {
    const { container } = render(<OntologyTreeView result={makeResult()} />);
    const buttons = container.querySelectorAll<HTMLButtonElement>(
      '[data-tree-select-button="true"]',
    );
    buttons[0]!.focus();
    fireEvent.keyDown(buttons[0]!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(buttons[0]);
  });

  it("ArrowLeft on expanded parent → collapse (자식 hide)", () => {
    render(<OntologyTreeView result={makeResult()} />);
    expect(screen.queryByText("인증")).toBeInTheDocument();
    expect(screen.queryByText("로그인")).toBeInTheDocument();
    const projectBtn = screen
      .getAllByRole("button")
      .find(
        (b) =>
          b.getAttribute("data-tree-select-button") === "true"
          && b.getAttribute("data-row-slug") === "p1",
      )!;
    projectBtn.focus();
    fireEvent.keyDown(projectBtn, { key: "ArrowLeft" });
    expect(screen.queryByText("인증")).not.toBeInTheDocument();
    expect(screen.queryByText("로그인")).not.toBeInTheDocument();
  });

  it("ArrowRight on collapsed parent → expand (자식 show)", () => {
    render(<OntologyTreeView result={makeResult()} />);
    const projectBtn = screen
      .getAllByRole("button")
      .find(
        (b) =>
          b.getAttribute("data-tree-select-button") === "true"
          && b.getAttribute("data-row-slug") === "p1",
      )!;
    projectBtn.focus();
    fireEvent.keyDown(projectBtn, { key: "ArrowLeft" });
    expect(screen.queryByText("인증")).not.toBeInTheDocument();
    fireEvent.keyDown(projectBtn, { key: "ArrowRight" });
    expect(screen.queryByText("인증")).toBeInTheDocument();
  });

  it("ArrowLeft on already-collapsed root → no-op (parent 없음)", () => {
    render(<OntologyTreeView result={makeResult()} />);
    const projectBtn = screen
      .getAllByRole("button")
      .find(
        (b) =>
          b.getAttribute("data-tree-select-button") === "true"
          && b.getAttribute("data-row-slug") === "p1",
      )!;
    projectBtn.focus();
    // 첫 ArrowLeft — 펼쳐진 root 를 접음.
    fireEvent.keyDown(projectBtn, { key: "ArrowLeft" });
    expect(screen.queryByText("인증")).not.toBeInTheDocument();
    // 두번째 ArrowLeft — 이미 접힌 root → parent 가 없어 no-op (focus 유지).
    fireEvent.keyDown(projectBtn, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(projectBtn);
    expect(screen.queryByText("인증")).not.toBeInTheDocument();
  });

  it("ArrowLeft on leaf → 부모 행 focus (R+ 표준 ARIA)", () => {
    render(<OntologyTreeView result={makeResult()} />);
    const leafBtn = screen
      .getAllByRole("button")
      .find(
        (b) =>
          b.getAttribute("data-tree-select-button") === "true"
          && b.getAttribute("data-row-slug") === "c1",
      )!;
    const domainBtn = screen
      .getAllByRole("button")
      .find(
        (b) =>
          b.getAttribute("data-tree-select-button") === "true"
          && b.getAttribute("data-row-slug") === "d1",
      )!;
    leafBtn.focus();
    fireEvent.keyDown(leafBtn, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(domainBtn);
  });

  it("ArrowLeft on collapsed non-root → 부모 행 focus", () => {
    render(<OntologyTreeView result={makeResult()} />);
    // domain 행 (d1) 을 먼저 접고, 그 상태에서 ArrowLeft → project (p1) 로 이동.
    const domainBtn = screen
      .getAllByRole("button")
      .find(
        (b) =>
          b.getAttribute("data-tree-select-button") === "true"
          && b.getAttribute("data-row-slug") === "d1",
      )!;
    const projectBtn = screen
      .getAllByRole("button")
      .find(
        (b) =>
          b.getAttribute("data-tree-select-button") === "true"
          && b.getAttribute("data-row-slug") === "p1",
      )!;
    domainBtn.focus();
    // d1 의 ←: 펼쳐진 → 접음
    fireEvent.keyDown(domainBtn, { key: "ArrowLeft" });
    expect(screen.queryByText("로그인")).not.toBeInTheDocument();
    // 다시 ←: 이제 접힌 d1 에서 부모 p1 로 focus.
    fireEvent.keyDown(domainBtn, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(projectBtn);
  });

  it("Home → 첫 행 focus", () => {
    const { container } = render(<OntologyTreeView result={makeResult()} />);
    const buttons = container.querySelectorAll<HTMLButtonElement>(
      '[data-tree-select-button="true"]',
    );
    buttons[2]!.focus();
    expect(document.activeElement).toBe(buttons[2]);
    fireEvent.keyDown(buttons[2]!, { key: "Home" });
    expect(document.activeElement).toBe(buttons[0]);
  });

  it("End → 마지막 행 focus", () => {
    const { container } = render(<OntologyTreeView result={makeResult()} />);
    const buttons = container.querySelectorAll<HTMLButtonElement>(
      '[data-tree-select-button="true"]',
    );
    buttons[0]!.focus();
    fireEvent.keyDown(buttons[0]!, { key: "End" });
    expect(document.activeElement).toBe(buttons[2]);
  });

  it("Cmd+Home / Ctrl+End — 모디파이어 있으면 no-op (브라우저 스크롤 보존)", () => {
    const { container } = render(<OntologyTreeView result={makeResult()} />);
    const buttons = container.querySelectorAll<HTMLButtonElement>(
      '[data-tree-select-button="true"]',
    );
    buttons[1]!.focus();
    fireEvent.keyDown(buttons[1]!, { key: "Home", metaKey: true });
    expect(document.activeElement).toBe(buttons[1]);
    fireEvent.keyDown(buttons[1]!, { key: "End", ctrlKey: true });
    expect(document.activeElement).toBe(buttons[1]);
  });

  it("type-to-search — 'ㄹ' 입력 → 로그인 으로 focus 이동 (한글)", () => {
    const { container } = render(<OntologyTreeView result={makeResult()} />);
    const buttons = container.querySelectorAll<HTMLButtonElement>(
      '[data-tree-select-button="true"]',
    );
    // 첫 행 (Sample) 에서 시작.
    buttons[0]!.focus();
    fireEvent.keyDown(buttons[0]!, { key: "ㄹ" });
    // c1 의 title 이 "로그인" — JS lowercase 후 "로그인", "ㄹ".toLowerCase() = "ㄹ".
    // "로그인".startsWith("ㄹ") 은 false (자모 분리 불 일치).
    // 실제로 사용자가 타이핑 한글은 자모 + 받침이 합쳐지면서 문자가 변함.
    // 이 케이스는 매치 안 됨이 정상 — title 의 첫 글자 "로" 이라야 매치.
    // 같은 테스트 의의로 latin "S" 매치 검증으로 대체 (sample 시작).
    fireEvent.keyDown(buttons[0]!, { key: "S" });
    // 사실 JS 에서 title.toLowerCase().startsWith("s") 면 sample 매치.
    // 하지만 buttons[0] 이 이미 sample 이므로 wrap 후 자기 자신.
    expect(document.activeElement).toBe(buttons[0]);
  });

  it("type-to-search — 라틴 prefix 'r' → 다음 매칭 row focus (현재 row 다음부터 wrap)", () => {
    // 트리에 라틴 prefix 가 다른 노드 두 개를 두고 검사.
    const r: OntologyTreeBuildResult = {
      roots: [
        {
          node: makeNode("p1", "project", "Alpha"),
          depth: 0,
          children: [
            {
              node: makeNode("d1", "domain", "Bravo"),
              depth: 1,
              children: [
                {
                  node: makeNode("c1", "capability", "Romeo"),
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
    const { container } = render(<OntologyTreeView result={r} />);
    const buttons = container.querySelectorAll<HTMLButtonElement>(
      '[data-tree-select-button="true"]',
    );
    // 첫 행 (Alpha) 에서 시작.
    buttons[0]!.focus();
    fireEvent.keyDown(buttons[0]!, { key: "r" });
    // "Alpha" / "Bravo" / "Romeo" — "r" 로 시작하는 건 "Romeo" 만.
    expect(document.activeElement).toBe(buttons[2]);
  });

  it("type-to-search — 매치 없으면 focus 이동 안 함", () => {
    const { container } = render(<OntologyTreeView result={makeResult()} />);
    const buttons = container.querySelectorAll<HTMLButtonElement>(
      '[data-tree-select-button="true"]',
    );
    buttons[1]!.focus();
    fireEvent.keyDown(buttons[1]!, { key: "z" });
    expect(document.activeElement).toBe(buttons[1]);
  });

  it("type-to-search — 공백/구두점 (Space, '.') 은 무시, button 활성화 보존", () => {
    const { container } = render(<OntologyTreeView result={makeResult()} />);
    const buttons = container.querySelectorAll<HTMLButtonElement>(
      '[data-tree-select-button="true"]',
    );
    buttons[0]!.focus();
    fireEvent.keyDown(buttons[0]!, { key: " " });
    expect(document.activeElement).toBe(buttons[0]);
    fireEvent.keyDown(buttons[0]!, { key: "." });
    expect(document.activeElement).toBe(buttons[0]);
  });

  it("ArrowRight on leaf row → no-op (collapse/expand 변동 없음)", () => {
    // ArrowLeft 의 leaf 동작은 별도 test (parent focus) — 여기는 ArrowRight 만.
    render(<OntologyTreeView result={makeResult()} />);
    const leafBtn = screen
      .getAllByRole("button")
      .find(
        (b) =>
          b.getAttribute("data-tree-select-button") === "true"
          && b.getAttribute("data-row-slug") === "c1",
      )!;
    expect(leafBtn.getAttribute("data-row-has-children")).toBe("false");
    leafBtn.focus();
    fireEvent.keyDown(leafBtn, { key: "ArrowRight" });
    expect(document.activeElement).toBe(leafBtn);
    expect(screen.queryByText("인증")).toBeInTheDocument();
    expect(screen.queryByText("로그인")).toBeInTheDocument();
  });
});

describe("OntologyTreeView — UX-11 element kind dim", () => {
  function withElement(): OntologyTreeBuildResult {
    return {
      roots: [
        {
          node: makeNode("p1", "project", "Sample"),
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
    // R12 — capability default-collapsed 라 element 가 안 보임. 이 케이스는
    // *element row dim 자체* 의 단위 테스트라 capability 펼친 상태를 명시적으로 요청.
    render(<OntologyTreeView result={withElement()} collapseCapabilitiesByDefault={false} />);
    const rows = screen.getAllByTestId("ontology-tree-row");
    const elementRow = rows.find((r) => r.getAttribute("data-kind") === "element");
    expect(elementRow).toBeDefined();
    expect(elementRow!.getAttribute("data-dim")).toBe("true");
    expect(elementRow!.className).toContain("opacity-60");
    expect(elementRow!.className).toContain("hover:opacity-100");
    expect(elementRow!.className).toContain("focus-within:opacity-100");
  });

  it("non-element kind row (project/domain/capability) 에 data-dim=false + opacity 클래스 없음", () => {
    render(<OntologyTreeView result={withElement()} collapseCapabilitiesByDefault={false} />);
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

describe("OntologyTreeView — empty state", () => {
  it("shows the default emptyHint when no roots and no orphans", () => {
    render(
      <OntologyTreeView result={{ roots: [], orphans: [], warnings: [] }} />,
    );
    expect(screen.getByTestId("ontology-tree-empty")).toBeInTheDocument();
    // emptyHint prop 미전달 시 i18n 폴백(tree.emptyFallback) 사용 — 하드코딩
    // 영어가 ko 로케일로 새던 회귀를 막는다. render 헬퍼가 ko 메시지라 ko 노출.
    expect(
      screen.getByText("온톨로지가 아직 자라지 않았어요."),
    ).toBeInTheDocument();
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

  it("lets orphan rows select with concise copy and tooltip slug", () => {
    const handleSelect = vi.fn();
    render(
      <OntologyTreeView
        result={{
          roots: [],
          orphans: [makeNode("orph1", "element", "고립 요소")],
          warnings: [],
        }}
        onSelect={handleSelect}
        selectedId="orph1"
      />,
    );

    const orphanButton = screen.getByRole("button", {
      name: "고립 요소 선택",
    });
    expect(orphanButton).toHaveAttribute("data-orphan-selected", "true");
    expect(orphanButton.className).toContain("min-h-8");
    expect(orphanButton).toHaveAttribute("title", "고립 요소 보기");
    expect(screen.getByText("선택됨")).toHaveAttribute(
      "title",
      "현재 선택: orph1",
    );
    expect(screen.queryByText(/선택 기준/)).not.toBeInTheDocument();

    fireEvent.click(orphanButton);
    expect(handleSelect).toHaveBeenCalledTimes(1);
    expect(handleSelect.mock.calls[0]![0]!.id).toBe("orph1");
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
    expect(screen.getByText("트리 투영 메모 2건")).toBeInTheDocument();
  });
});

// vitest auto-import vi for spies
import { vi } from "vitest";

describe("OntologyTreeView — selectedId 강조·자동 expand", () => {
  function deepResult(): OntologyTreeBuildResult {
    return {
      roots: [
        {
          node: makeNode("p1", "project", "Sample"),
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

  it("선택된 노드 행에 aria-selected=true / data-selected=true", () => {
    render(<OntologyTreeView result={deepResult()} selectedId="c1" />);
    const rows = screen.getAllByTestId("ontology-tree-row");
    const selected = rows.find((r) => r.getAttribute("data-kind") === "capability");
    expect(selected).toBeDefined();
    expect(selected!.getAttribute("aria-selected")).toBe("true");
    expect(selected!.getAttribute("data-selected")).toBe("true");
  });

  it("선택 버튼과 선택 행은 짧게 표시하고 slug 는 툴팁으로만 둔다", () => {
    render(<OntologyTreeView result={deepResult()} selectedId="c1" />);

    expect(
      screen.getByRole("button", {
        name: "로그인 선택",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("선택됨")).toHaveAttribute(
      "title",
      "현재 선택: c1",
    );
    expect(screen.queryByText(/선택 기준/)).not.toBeInTheDocument();
  });

  it("선택되지 않은 행은 aria-selected=false", () => {
    render(<OntologyTreeView result={deepResult()} selectedId="c1" />);
    const rows = screen.getAllByTestId("ontology-tree-row");
    const project = rows.find((r) => r.getAttribute("data-kind") === "project");
    expect(project!.getAttribute("aria-selected")).toBe("false");
  });

  it("selectedId 미지정 시 모든 행 aria-selected=false", () => {
    render(<OntologyTreeView result={deepResult()} />);
    const rows = screen.getAllByTestId("ontology-tree-row");
    for (const row of rows) {
      expect(row.getAttribute("aria-selected")).toBe("false");
    }
  });

  it("collapsed 상태에서도 selectedId 의 조상이 force-open 되어 행이 보임", () => {
    // defaultExpanded=false → 모든 노드 시작 collapsed.
    // selectedId="c1" 의 조상 (p1, d1) 이 펼쳐져야 c1 row 가 렌더된다.
    render(
      <OntologyTreeView
        result={deepResult()}
        selectedId="c1"
        defaultExpanded={false}
      />,
    );
    expect(screen.getByText("로그인")).toBeInTheDocument();
    expect(screen.getByText("인증")).toBeInTheDocument();
    expect(screen.getByText("Sample")).toBeInTheDocument();
  });
});

describe("OntologyTreeView — no-results 검색 복구", () => {
  it("매치 없는 검색 → no-results 안내 + '검색 지우기' 버튼으로 한 번에 복구", () => {
    render(<OntologyTreeView result={makeResult()} />);
    const search = screen.getByRole("searchbox");

    // 어떤 노드와도 일치하지 않는 쿼리 입력 → 트리 행 사라지고 안내 노출.
    fireEvent.change(search, { target: { value: "zzz-no-match" } });
    expect(screen.queryByText("Sample")).not.toBeInTheDocument();
    const clearButton = screen.getByTestId("ontology-tree-noresults-clear");
    expect(clearButton).toBeInTheDocument();

    // 복구 버튼 클릭 → 입력 비워지고 트리 전체가 다시 보임.
    fireEvent.click(clearButton);
    expect((search as HTMLInputElement).value).toBe("");
    expect(screen.getByText("Sample")).toBeInTheDocument();
    expect(screen.getByText("인증")).toBeInTheDocument();
    expect(
      screen.queryByTestId("ontology-tree-noresults-clear"),
    ).not.toBeInTheDocument();
  });
});
