import { describe, expect, it } from "vitest";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { Project } from "@/entities/project";
import { isPathLikeTitle, matchOntologyNodes, matchProjects } from "./match";

const APPROVED_AT = new Date("2026-04-27T00:00:00Z");

function node(input: Partial<KnowledgeGraphNode> & { id: string; title: string }): KnowledgeGraphNode {
  return {
    kind: "capability",
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: APPROVED_AT,
    lastApprovedBy: "test",
    ...input,
  };
}

describe("matchOntologyNodes", () => {
  const corpus: KnowledgeGraphNode[] = [
    node({ id: "auth-login", title: "로그인" }),
    node({ id: "auth-logout", title: "로그아웃" }),
    node({ id: "iam", title: "IAM", summary: "신원 및 접근 관리" }),
    node({ id: "session", title: "세션", summary: "사용자 세션 토큰 발급" }),
  ];

  it("빈 query — 전체 (limit 까지)", () => {
    const r = matchOntologyNodes("", corpus, 2);
    expect(r).toHaveLength(2);
    expect(r.every((m) => m.score === 0)).toBe(true);
  });

  it("title exact > prefix > substring > summary > id 순 점수", () => {
    const r = matchOntologyNodes("세션", corpus);
    // "세션" 은 title 과 글자까지 같다 — 정확 일치.
    expect(r[0]?.node.id).toBe("session");
    expect(r[0]?.score).toBe(5);
  });

  it("정확 일치는 더 최근에 승인된 prefix 매치보다 위다 (2026-08-13 실측 회귀)", () => {
    // 실측: 「주문」을 치면 도메인 「주문」(정확 일치)이 「주문서 작성」 등
    // 나중에 승인된 접두 일치 5개 아래 6위였다 — 동점(4) 후 최신순이 정확
    // 일치를 가라앉혔다. 이름을 끝까지 친 사용자가 찾는 것은 그 이름의 노드다.
    const earlier = new Date("2026-04-01T00:00:00Z");
    const later = new Date("2026-04-27T00:00:00Z");
    const vault = [
      node({ id: "cap-checkout", title: "주문서 작성", lastApprovedAt: later }),
      node({ id: "cap-cancel", title: "주문 취소", lastApprovedAt: later }),
      node({ id: "domain-order", title: "주문", kind: "domain", lastApprovedAt: earlier }),
    ];
    const r = matchOntologyNodes("주문", vault);
    expect(r[0]?.node.id).toBe("domain-order");
    expect(r[0]?.score).toBe(5);
    expect(r[1]?.score).toBe(4);
  });

  it("summary 매치 (title 에 없음) — score 2", () => {
    const r = matchOntologyNodes("토큰", corpus);
    expect(r).toHaveLength(1);
    expect(r[0]?.node.id).toBe("session");
    expect(r[0]?.score).toBe(2);
  });

  it("id 매치 (kebab-case slug 직접 검색)", () => {
    const r = matchOntologyNodes("logout", corpus);
    expect(r).toHaveLength(1);
    expect(r[0]?.node.id).toBe("auth-logout");
    // title 'logout' 포함이라면 score 3, id-only fallback 이라면 1.
    // "로그아웃" title 에는 영어 logout 없으니 id fallback.
    expect(r[0]?.score).toBe(1);
  });

  it("같은 점수 — lastApprovedAt desc 정렬 (최신 우선)", () => {
    const earlier = new Date("2026-04-26T00:00:00Z");
    const later = new Date("2026-04-27T00:00:00Z");
    const same = [
      node({ id: "a", title: "베타 가능", lastApprovedAt: earlier }),
      node({ id: "b", title: "알파 가능", lastApprovedAt: later }),
    ];
    const r = matchOntologyNodes("가능", same);
    expect(r).toHaveLength(2);
    // 같은 점수 (둘 다 substring 매치 = score 3) — 최신 (알파) 가 먼저.
    expect(r[0]?.node.id).toBe("b");
    expect(r[1]?.node.id).toBe("a");
  });

  it("매치 없음 — 빈 결과", () => {
    const r = matchOntologyNodes("xyzqwerty", corpus);
    expect(r).toHaveLength(0);
  });

  // 흐름 점검 2026-07-26 D1 — 지도/INDEX 는 `display_ko` 를 그리는데 검색은
  // canonical title 만 봐서, 화면에서 읽은 한국어 이름을 그대로 치면 0건이었다.
  describe("어권별 표시 이름 (display_ko / display_en)", () => {
    const localized = node({
      id: "ontology-core",
      title: "Ontology Core",
      display: "온톨로지 코어",
      displayLocales: { ko: "온톨로지 코어", en: "Ontology Core" },
      summary: "그래프 파생 엔진",
    });

    it("화면에 보이는 한국어 표시 이름으로 찾힌다", () => {
      const r = matchOntologyNodes("온톨로지 코어", [localized]);
      expect(r).toHaveLength(1);
      expect(r[0]?.node.id).toBe("ontology-core");
      // 화면에 보이는 이름은 title 과 동급 — 표시 이름 정확 일치도 5.
      expect(r[0]?.score).toBe(5);
    });

    it("표시 이름 부분 일치는 substring 점수", () => {
      const r = matchOntologyNodes("코어", [localized]);
      expect(r[0]?.score).toBe(3);
    });

    it("원문 title 로도 그대로 찾힌다 (범위는 넓히기만 한다)", () => {
      const r = matchOntologyNodes("Ontology Core", [localized]);
      expect(r).toHaveLength(1);
      expect(r[0]?.score).toBe(5);
    });

    it("한국어 화면에서도 다른 어권 이름으로 찾힌다", () => {
      // display 는 ko 로 해석돼 있어도 en 이름이 검색에서 사라지면 안 된다.
      const koScreen = node({
        id: "cap-payments",
        title: "결제",
        display: "결제 처리",
        displayLocales: { ko: "결제 처리", en: "Payments" },
      });
      const r = matchOntologyNodes("payments", [koScreen]);
      expect(r).toHaveLength(1);
      expect(r[0]?.score).toBe(5);
    });

    it("자소 분리(NFD) 입력도 같은 결과", () => {
      const r = matchOntologyNodes("온톨로지".normalize("NFD"), [localized]);
      expect(r).toHaveLength(1);
    });

    it("표시 이름 매치가 summary 매치보다 위", () => {
      const bodyOnly = node({ id: "other", title: "Other", summary: "온톨로지 코어를 쓴다" });
      const r = matchOntologyNodes("온톨로지 코어", [bodyOnly, localized]);
      expect(r.map((m) => m.node.id)).toEqual(["ontology-core", "other"]);
    });
  });

  it("limit 적용", () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      node({ id: `node-${i}`, title: `노드 ${i}` }),
    );
    const r = matchOntologyNodes("노드", many, 7);
    expect(r).toHaveLength(7);
  });

  describe("kind / project 필터", () => {
    const filterCorpus: KnowledgeGraphNode[] = [
      node({ id: "cap-1", title: "능력 1", kind: "capability", projectIds: ["demo-iam"] }),
      node({ id: "cap-2", title: "능력 2", kind: "capability", projectIds: ["demo-knowledge"] }),
      node({ id: "dom-1", title: "도메인 1", kind: "domain", projectIds: ["demo-iam"] }),
      node({ id: "elem-1", title: "요소 1", kind: "element", projectIds: ["demo-iam", "demo-knowledge"] }),
      node({ id: "elem-orphan", title: "요소 미연결", kind: "element", projectIds: [] }),
    ];

    it("kind 필터 — capability 만", () => {
      const r = matchOntologyNodes("", filterCorpus, 30, {
        kinds: new Set(["capability"]),
      });
      expect(r.map((m) => m.node.id).sort()).toEqual(["cap-1", "cap-2"]);
    });

    it("kind 필터 + query 결합", () => {
      const r = matchOntologyNodes("능력", filterCorpus, 30, {
        kinds: new Set(["capability"]),
      });
      expect(r).toHaveLength(2);
      expect(r.every((m) => m.node.kind === "capability")).toBe(true);
    });

    it("project 필터 — 단일 project", () => {
      const r = matchOntologyNodes("", filterCorpus, 30, {
        projectIds: new Set(["demo-knowledge"]),
      });
      expect(r.map((m) => m.node.id).sort()).toEqual(["cap-2", "elem-1"]);
    });

    it("project 필터 — 노드의 projectIds 중 적어도 하나 매치 (OR within node)", () => {
      // elem-1 은 [iam, knowledge] 둘 다 — 어느 한쪽 set 이어도 매치.
      const iam = matchOntologyNodes("", filterCorpus, 30, {
        projectIds: new Set(["demo-iam"]),
      });
      const includes = iam.find((m) => m.node.id === "elem-1");
      expect(includes).toBeDefined();
    });

    it("project 필터 — projectIds 비어 있는 노드는 제외", () => {
      const r = matchOntologyNodes("", filterCorpus, 30, {
        projectIds: new Set(["demo-iam"]),
      });
      const orphan = r.find((m) => m.node.id === "elem-orphan");
      expect(orphan).toBeUndefined();
    });

    it("kind + project 필터 AND 조합", () => {
      const r = matchOntologyNodes("", filterCorpus, 30, {
        kinds: new Set(["capability"]),
        projectIds: new Set(["demo-iam"]),
      });
      expect(r.map((m) => m.node.id)).toEqual(["cap-1"]);
    });

    it("빈 set / 미지정 = 필터 비활성", () => {
      const all = matchOntologyNodes("", filterCorpus, 30);
      const emptySets = matchOntologyNodes("", filterCorpus, 30, {
        kinds: new Set(),
        projectIds: new Set(),
      });
      expect(all).toHaveLength(filterCorpus.length);
      expect(emptySets).toHaveLength(filterCorpus.length);
    });
  });
});

function project(input: Partial<Project> & { slug: string; name: string }): Project {
  return {
    category: "frontend",
    status: "active",
    description: "",
    tags: [],
    stack: [],
    links: [],
    dependencies: [],
    isHub: false,
    screenshots: [],
    timeline: { start: undefined, end: undefined } as Project["timeline"],
    position: { x: 0, y: 0 } as Project["position"],
    createdAt: new Date(),
    updatedAt: new Date("2026-04-20T00:00:00Z"),
    ...input,
  } as Project;
}

describe("matchProjects", () => {
  const corpus: Project[] = [
    project({
      slug: "demo-iam",
      name: "IAM",
      nameEn: "Identity Access Manager",
      description: "사용자 로그인 / 토큰",
      tags: ["security", "auth"],
      updatedAt: new Date("2026-04-25T00:00:00Z"),
    }),
    project({
      slug: "demo-knowledge",
      name: "Knowledge",
      description: "문서 → 온톨로지 추출 파이프라인",
      tags: ["docs", "ontology"],
      updatedAt: new Date("2026-04-26T00:00:00Z"),
    }),
    project({
      slug: "reactor-runtime",
      name: "Demo Reactor",
      description: "AI Agent 런타임",
      tags: ["agent"],
      updatedAt: new Date("2026-04-27T00:00:00Z"),
    }),
  ];

  it("name prefix > substring 우선", () => {
    const r = matchProjects("ia", corpus);
    expect(r[0]?.project.slug).toBe("demo-iam"); // "IAM" prefix 매치
    expect(r[0]?.score).toBe(4);
  });

  it("name 정확 일치는 5 — 노드 매처와 같은 사다리", () => {
    const r = matchProjects("iam", corpus);
    expect(r[0]?.project.slug).toBe("demo-iam");
    expect(r[0]?.score).toBe(5);
  });

  it("description / tags / category 도 매치", () => {
    const r = matchProjects("agent", corpus);
    expect(r.find((m) => m.project.slug === "reactor-runtime")).toBeDefined();
  });

  it("slug substring 도 매치 (낮은 점수)", () => {
    const r = matchProjects("knowledge", corpus);
    const knowledge = r.find((m) => m.project.slug === "demo-knowledge");
    expect(knowledge).toBeDefined();
  });

  it("매치 0 — 빈 결과", () => {
    expect(matchProjects("xyzqwerty", corpus)).toHaveLength(0);
  });

  it("빈 query — updatedAt desc 정렬 + limit", () => {
    const r = matchProjects("", corpus, 2);
    expect(r).toHaveLength(2);
    expect(r[0]?.project.slug).toBe("reactor-runtime"); // 4-27
    expect(r[1]?.project.slug).toBe("demo-knowledge"); // 4-26
  });
});

describe("isPathLikeTitle", () => {
  it("N12 — 파일 경로 형태 title 을 감지한다", () => {
    expect(isPathLikeTitle("mcp/src/ontology-engine.mjs")).toBe(true);
    expect(isPathLikeTitle("mcp/scripts/verify.mjs")).toBe(true);
    expect(isPathLikeTitle("src/widgets/global-search/ui/GlobalSearch.tsx")).toBe(true);
  });

  it("일반 개념 title 은 경로로 오판하지 않는다", () => {
    expect(isPathLikeTitle("MCP Server")).toBe(false);
    expect(isPathLikeTitle("로그인")).toBe(false);
    expect(isPathLikeTitle("Agent Graph Readiness")).toBe(false);
  });

  it("확장자 없는 슬래시 문자열은 경로로 보지 않는다 (오탐 방지)", () => {
    expect(isPathLikeTitle("and/or")).toBe(false);
  });
});
