import { describe, expect, it } from "vitest";
import type { KnowledgeDocument } from "@/entities/knowledge-document";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { Project } from "@/entities/project";
import { matchKnowledgeDocuments, matchOntologyNodes, matchProjects } from "./match";

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

  it("title prefix > substring > summary > id 순 점수", () => {
    const r = matchOntologyNodes("세션", corpus);
    // "세션" 은 title prefix
    expect(r[0]?.node.id).toBe("session");
    expect(r[0]?.score).toBe(4);
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

  it("limit 적용", () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      node({ id: `node-${i}`, title: `노드 ${i}` }),
    );
    const r = matchOntologyNodes("노드", many, 7);
    expect(r).toHaveLength(7);
  });

  describe("kind / project 필터 (Fire 2)", () => {
    const filterCorpus: KnowledgeGraphNode[] = [
      node({ id: "cap-1", title: "능력 1", kind: "capability", projectIds: ["aslan-iam"] }),
      node({ id: "cap-2", title: "능력 2", kind: "capability", projectIds: ["aslan-knowledge"] }),
      node({ id: "dom-1", title: "도메인 1", kind: "domain", projectIds: ["aslan-iam"] }),
      node({ id: "elem-1", title: "요소 1", kind: "element", projectIds: ["aslan-iam", "aslan-knowledge"] }),
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
        projectIds: new Set(["aslan-knowledge"]),
      });
      expect(r.map((m) => m.node.id).sort()).toEqual(["cap-2", "elem-1"]);
    });

    it("project 필터 — 노드의 projectIds 중 적어도 하나 매치 (OR within node)", () => {
      // elem-1 은 [iam, knowledge] 둘 다 — 어느 한쪽 set 이어도 매치.
      const iam = matchOntologyNodes("", filterCorpus, 30, {
        projectIds: new Set(["aslan-iam"]),
      });
      const includes = iam.find((m) => m.node.id === "elem-1");
      expect(includes).toBeDefined();
    });

    it("project 필터 — projectIds 비어 있는 노드는 제외", () => {
      const r = matchOntologyNodes("", filterCorpus, 30, {
        projectIds: new Set(["aslan-iam"]),
      });
      const orphan = r.find((m) => m.node.id === "elem-orphan");
      expect(orphan).toBeUndefined();
    });

    it("kind + project 필터 AND 조합", () => {
      const r = matchOntologyNodes("", filterCorpus, 30, {
        kinds: new Set(["capability"]),
        projectIds: new Set(["aslan-iam"]),
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

function doc(input: Partial<KnowledgeDocument> & { id: string; title: string; updatedAt: Date }): KnowledgeDocument {
  return {
    kind: "spec",
    projectIds: ["aslan-maps"],
    sourceType: "manual" as KnowledgeDocument["sourceType"],
    currentVersionId: "v1",
    status: "draft" as KnowledgeDocument["status"],
    createdAt: input.updatedAt,
    createdBy: "test",
    ...input,
  };
}

describe("matchKnowledgeDocuments", () => {
  const D1 = new Date("2026-04-20T00:00:00Z");
  const D2 = new Date("2026-04-25T00:00:00Z");
  const D3 = new Date("2026-04-27T00:00:00Z");

  const corpus: KnowledgeDocument[] = [
    doc({ id: "doc-1", title: "온톨로지 설계", updatedAt: D1, kind: "spec" }),
    doc({ id: "doc-2", title: "인증 흐름", updatedAt: D2, kind: "runbook", projectIds: ["iam"] }),
    doc({ id: "doc-3", title: "토폴로지 가이드", updatedAt: D3, kind: "spec" }),
  ];

  it("빈 query — updatedAt desc 정렬 (최신 먼저)", () => {
    const r = matchKnowledgeDocuments("", corpus, 10);
    expect(r).toHaveLength(3);
    expect(r[0]?.document.id).toBe("doc-3"); // 가장 최신
    expect(r[2]?.document.id).toBe("doc-1");
  });

  it("title prefix > substring > kind/project > id", () => {
    expect(matchKnowledgeDocuments("온톨로지", corpus)[0]?.score).toBe(4);
    expect(matchKnowledgeDocuments("흐름", corpus)[0]?.score).toBe(3); // title substring
    expect(matchKnowledgeDocuments("runbook", corpus)[0]?.score).toBe(2); // kind
    expect(matchKnowledgeDocuments("iam", corpus)[0]?.score).toBe(2); // projectId
    expect(matchKnowledgeDocuments("doc-1", corpus)[0]?.score).toBe(1); // id fallback
  });

  it("같은 점수 — updatedAt desc 정렬", () => {
    const r = matchKnowledgeDocuments("spec", corpus); // doc-1, doc-3 둘 다 spec kind score 2
    expect(r).toHaveLength(2);
    expect(r[0]?.document.id).toBe("doc-3"); // 더 최신
    expect(r[1]?.document.id).toBe("doc-1");
  });

  it("매치 없음 — 빈 결과", () => {
    expect(matchKnowledgeDocuments("xyzqwerty", corpus)).toHaveLength(0);
  });

  it("limit 적용 + 빈 query 의 정렬도 limit 안에서 유지", () => {
    const r = matchKnowledgeDocuments("", corpus, 2);
    expect(r).toHaveLength(2);
    expect(r[0]?.document.id).toBe("doc-3");
    expect(r[1]?.document.id).toBe("doc-2");
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
      slug: "aslan-iam",
      name: "IAM",
      nameEn: "Identity Access Manager",
      description: "사용자 로그인 / 토큰",
      tags: ["security", "auth"],
      updatedAt: new Date("2026-04-25T00:00:00Z"),
    }),
    project({
      slug: "aslan-knowledge",
      name: "Knowledge",
      description: "문서 → 온톨로지 추출 파이프라인",
      tags: ["docs", "ontology"],
      updatedAt: new Date("2026-04-26T00:00:00Z"),
    }),
    project({
      slug: "reactor-runtime",
      name: "Reactor",
      description: "AI Agent 런타임",
      tags: ["agent"],
      updatedAt: new Date("2026-04-27T00:00:00Z"),
    }),
  ];

  it("name prefix > substring 우선", () => {
    const r = matchProjects("ia", corpus);
    expect(r[0]?.project.slug).toBe("aslan-iam"); // "IAM" prefix 매치
    expect(r[0]?.score).toBe(4);
  });

  it("description / tags / category 도 매치", () => {
    const r = matchProjects("agent", corpus);
    expect(r.find((m) => m.project.slug === "reactor-runtime")).toBeDefined();
  });

  it("slug substring 도 매치 (낮은 점수)", () => {
    const r = matchProjects("knowledge", corpus);
    const knowledge = r.find((m) => m.project.slug === "aslan-knowledge");
    expect(knowledge).toBeDefined();
  });

  it("매치 0 — 빈 결과", () => {
    expect(matchProjects("xyzqwerty", corpus)).toHaveLength(0);
  });

  it("빈 query — updatedAt desc 정렬 + limit", () => {
    const r = matchProjects("", corpus, 2);
    expect(r).toHaveLength(2);
    expect(r[0]?.project.slug).toBe("reactor-runtime"); // 4-27
    expect(r[1]?.project.slug).toBe("aslan-knowledge"); // 4-26
  });
});
