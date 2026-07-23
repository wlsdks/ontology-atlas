import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { buildFullDetailGroups } from "../lib/full-detail-groups";
import { buildFullDetailReachModel } from "../lib/full-detail-reach";
import { FullDetailA1 } from "./FullDetailA1";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const messages = {
  kinds: {
    project: "프로젝트",
    domain: "도메인",
    capability: "캡슐",
    element: "엘리먼트",
    document: "문서",
    "vault-readme": "볼트 README",
    unknown: "알 수 없음",
  },
  fullDetailA1: {
    backToMap: "← 지도",
    breadcrumbSeparator: "/",
    census: "{concepts} CONCEPTS · {relations} RELATIONS",
    freshOn: "최근 갱신",
    freshOff: "정체",
    copyLink: "노드 링크 복사",
    copyLinkCopied: "노드 링크를 복사했어요",
    close: "닫기",
    metric: {
      contains: "담는 것",
      usedBy: "이 노드를 쓰는 곳",
      dependsOn: "이 노드가 기대는 곳",
      reach: "3단계 도달",
    },
    groups: {
      containsTitle: "이 노드가 담는 것",
      containsCaption: "contains",
      usedByTitle: "이 노드를 쓰는 곳",
      usedByCaption: "used by",
      dependsOnTitle: "이 노드가 기대는 곳",
      dependsOnCaption: "depends on",
      belongsToTitle: "속한 곳",
      belongsToCaption: "belongs to",
      empty: "직접 연결이 없습니다.",
      freshDotTitle: "최근 갱신",
    },
    reach: {
      leadIn: "이 노드에서",
      stepUnit: "단계",
      afterSteps: "안에 닿는 개념",
      ofTotal: "{count} / {total}",
      mostlyNone: "도달하는 개념이 없습니다.",
      mostlyOne: "대부분 {a}({aCount})에 있다.",
      mostlyTwo: "대부분 {a}({aCount})와 {b}({bCount})에 있다.",
      selfDomainLabel: "도메인 내부",
      noDomainLabel: "소속 없음",
    },
    handoff: {
      label: "에이전트 핸드오프",
      copy: "다음 액션 복사",
      copied: "에이전트 핸드오프 호출을 복사했어요",
      openDocument: "문서 열기 →",
    },
    codeLocations: {
      heading: "코드 위치",
      copy: "복사",
      copied: "복사됨",
    },
    body: {
      title: "본문",
      empty: "작성된 본문이 없습니다.",
      edit: "본문 편집",
      save: "저장",
      cancel: "취소",
      placeholder: "설명을 적어보세요…",
      saving: "저장 중…",
    },
  },
};

function node(id: string, kind: string, title = id): KnowledgeGraphNode {
  return {
    id,
    title,
    kind,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "",
  };
}

function edge(id: string, from: string, to: string, type: string): KnowledgeGraphEdge {
  return {
    id,
    from,
    to,
    type,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "",
  };
}

const nodes = [
  node("domain:a", "domain", "Domain A"),
  node("capability:child", "capability", "Child Capability"),
  node("capability:user", "capability", "User Capability"),
];
const edges = [
  edge("e1", "domain:a", "capability:child", "contains"),
  edge("e2", "capability:user", "domain:a", "depends_on"),
];

function renderFullDetail(overrides: Partial<Parameters<typeof FullDetailA1>[0]> = {}) {
  const groups = buildFullDetailGroups("domain:a", nodes, edges);
  const reach = buildFullDetailReachModel("domain:a", nodes, edges);
  const onSelectNode = vi.fn();
  const onClose = vi.fn();
  render(
    <NextIntlClientProvider locale="ko" messages={messages}>
      <FullDetailA1
        node={{ id: "domain:a", title: "Domain A", kind: "domain", slug: "domains/a", fresh: true }}
        groups={groups}
        reach={reach}
        bodyMarkdown="본문 텍스트입니다."
        onSelectNode={onSelectNode}
        onClose={onClose}
        {...overrides}
      />
    </NextIntlClientProvider>,
  );
  return { onSelectNode, onClose };
}

describe("FullDetailA1", () => {
  it("헤더에 제목/kind/slug 를 렌더", () => {
    renderFullDetail();
    expect(screen.getByText("Domain A")).toBeInTheDocument();
    expect(screen.getByText("domains/a")).toBeInTheDocument();
  });

  it("과제 ⑩ — fullTitle 이 title 과 다르면 secondary 텍스트로 렌더", () => {
    renderFullDetail({
      node: {
        id: "domain:a",
        title: "CLI Developer Entry",
        fullTitle: "CLI Developer Entry (49 commands — vault + MCP verify + ...)",
        kind: "domain",
        slug: "domains/a",
        fresh: true,
      },
    });
    expect(screen.getByText("CLI Developer Entry")).toBeInTheDocument();
    expect(
      screen.getByTestId("full-detail-a1-full-title"),
    ).toHaveTextContent(
      "CLI Developer Entry (49 commands — vault + MCP verify + ...)",
    );
  });

  it("과제 ⑩ — fullTitle 이 title 과 같으면 secondary 텍스트를 생략", () => {
    renderFullDetail();
    expect(
      screen.queryByTestId("full-detail-a1-full-title"),
    ).not.toBeInTheDocument();
  });

  it("engraved metric strip 이 담는 것/쓰는 곳/기대는 곳/reach 를 한 줄로", () => {
    renderFullDetail();
    const metric = screen.getByText(/담는 것 1/);
    expect(metric.textContent).toContain("이 노드를 쓰는 곳 1");
    expect(metric.textContent).toContain("이 노드가 기대는 곳 0");
  });

  it("contains 그룹의 행 클릭 → onSelectNode 호출", () => {
    const { onSelectNode } = renderFullDetail();
    fireEvent.click(screen.getByText("Child Capability"));
    expect(onSelectNode).toHaveBeenCalledWith("capability:child");
  });

  it("reach step 토글 클릭 → 다른 단계 숫자로 갱신", () => {
    renderFullDetail();
    const step1 = screen.getByTestId("full-detail-a1").querySelector(
      '[data-fulldetail-reach-step="1"]',
    ) as HTMLElement;
    fireEvent.click(step1);
    expect(step1.getAttribute("data-active")).toBe("true");
  });

  it("닫기 버튼 클릭 → onClose 호출", () => {
    const { onClose } = renderFullDetail();
    fireEvent.click(screen.getByTestId("full-detail-a1-close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("본문 섹션에 markdown body 를 렌더", () => {
    renderFullDetail();
    expect(screen.getByText("본문 텍스트입니다.")).toBeInTheDocument();
  });

  it("본문이 없으면 empty 문구", () => {
    renderFullDetail({ bodyMarkdown: null });
    expect(screen.getByText("작성된 본문이 없습니다.")).toBeInTheDocument();
  });

  it("explanationEdit 이 있으면 읽기↔편집 primitive 로 본문을 렌더", () => {
    const onSave = vi.fn();
    renderFullDetail({ explanationEdit: { onSave } });
    expect(screen.getByTestId("node-explanation-read")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("node-explanation-edit-button"));
    expect(screen.getByTestId("node-explanation-edit")).toBeInTheDocument();
  });
});

// R+ "코드 위치" (code location) — the REAL code evidence (raw file paths),
// distinct from the `node.slug` already shown top-right (a vault-doc
// reference, not code).
describe("FullDetailA1 — 코드 위치 (code location) section", () => {
  it("renders a heading + row for each code path when codeLocations is non-empty", () => {
    renderFullDetail({ codeLocations: ["mcp/src/index.js", "mcp/src/verify.mjs"] });
    expect(screen.getByText("코드 위치")).toBeInTheDocument();
    expect(screen.getByText("mcp/src/index.js")).toBeInTheDocument();
    expect(screen.getByText("mcp/src/verify.mjs")).toBeInTheDocument();
  });

  it("omits the section entirely when codeLocations is empty or omitted", () => {
    renderFullDetail();
    expect(
      screen.getByTestId("full-detail-a1").querySelector("[data-fulldetail-code-locations]"),
    ).toBeNull();
  });

  it("copies the path when the row's copy button is clicked", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderFullDetail({ codeLocations: ["mcp/src/index.js"] });
    fireEvent.click(screen.getByTestId("full-detail-a1-code-location-copy"));
    expect(writeText).toHaveBeenCalledWith("mcp/src/index.js");
  });
});
