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

  it('returns everything up to the limit for an empty query', () => {
    const { results: r } = matchOntologyNodes("", corpus, 2);
    expect(r).toHaveLength(2);
    expect(r.every((m) => m.score === 0)).toBe(true);
  });

  it('scores title exact above prefix, substring, summary and id', () => {
    const { results: r } = matchOntologyNodes("세션", corpus);
    // "Session" matches the title character for character — an exact match.
    expect(r[0]?.node.id).toBe("session");
    expect(r[0]?.score).toBe(7);
  });

  it('ranks an exact match above a more recently approved prefix match', () => {
    // An exact match must rank above later-approved prefix matches that tie on score.
    const earlier = new Date("2026-04-01T00:00:00Z");
    const later = new Date("2026-04-27T00:00:00Z");
    const vault = [
      node({ id: "cap-checkout", title: "주문서 작성", lastApprovedAt: later }),
      node({ id: "cap-cancel", title: "주문 취소", lastApprovedAt: later }),
      node({ id: "domain-order", title: "주문", kind: "domain", lastApprovedAt: earlier }),
    ];
    const { results: r } = matchOntologyNodes("주문", vault);
    expect(r[0]?.node.id).toBe("domain-order");
    expect(r[0]?.score).toBe(7);
    expect(r[1]?.score).toBe(6);
  });

  it('scores a summary-only match at 2', () => {
    const { results: r } = matchOntologyNodes("토큰", corpus);
    expect(r).toHaveLength(1);
    expect(r[0]?.node.id).toBe("session");
    expect(r[0]?.score).toBe(2);
  });

  it('matches a kebab-case slug through the id', () => {
    const { results: r } = matchOntologyNodes("logout", corpus);
    expect(r).toHaveLength(1);
    expect(r[0]?.node.id).toBe("auth-logout");
    // A title containing 'logout' would score in the name tier; 1 is the id-only fallback.
    expect(r[0]?.score).toBe(1);
  });

  it('breaks ties by lastApprovedAt descending', () => {
    const earlier = new Date("2026-04-26T00:00:00Z");
    const later = new Date("2026-04-27T00:00:00Z");
    const same = [
      node({ id: "a", title: "베타 가능", lastApprovedAt: earlier }),
      node({ id: "b", title: "알파 가능", lastApprovedAt: later }),
    ];
    const { results: r } = matchOntologyNodes("가능", same);
    expect(r).toHaveLength(2);
    // Same score (both literal substring matches) — the more recent (alpha) comes first.
    expect(r[0]?.node.id).toBe("b");
    expect(r[1]?.node.id).toBe("a");
  });

  it('returns nothing when nothing matches', () => {
    const { results: r } = matchOntologyNodes("xyzqwerty", corpus);
    expect(r).toHaveLength(0);
  });

  // Search must find the display name the map and INDEX draw.
  describe('per-locale display names', () => {
    const localized = node({
      id: "ontology-core",
      title: "Ontology Core",
      display: "온톨로지 코어",
      displayLocales: { ko: "온톨로지 코어", en: "Ontology Core" },
      summary: "그래프 파생 엔진",
    });

    it('finds a node by its visible Korean display name', () => {
      const { results: r } = matchOntologyNodes("온톨로지 코어", [localized]);
      expect(r).toHaveLength(1);
      expect(r[0]?.node.id).toBe("ontology-core");
    // The name visible on screen ranks with the title — an exact display-name match scores the same.
      expect(r[0]?.score).toBe(7);
    });

    it('scores a partial display-name match as substring', () => {
      const { results: r } = matchOntologyNodes("코어", [localized]);
      expect(r[0]?.score).toBe(5);
    });

    it('still finds a node by its original title', () => {
      const { results: r } = matchOntologyNodes("Ontology Core", [localized]);
      expect(r).toHaveLength(1);
      expect(r[0]?.score).toBe(7);
    });

    it('finds a node by another locale\'s name on the Korean screen', () => {
    // Even with display resolved as ko, the en name must not vanish from search.
      const koScreen = node({
        id: "cap-payments",
        title: "결제",
        display: "결제 처리",
        displayLocales: { ko: "결제 처리", en: "Payments" },
      });
      const { results: r } = matchOntologyNodes("payments", [koScreen]);
      expect(r).toHaveLength(1);
      expect(r[0]?.score).toBe(7);
    });

    it('gives decomposed (NFD) input the same result', () => {
      const { results: r } = matchOntologyNodes("온톨로지".normalize("NFD"), [localized]);
      expect(r).toHaveLength(1);
    });

    it('ranks a display-name match above a summary match', () => {
      const bodyOnly = node({ id: "other", title: "Other", summary: "온톨로지 코어를 쓴다" });
      const { results: r } = matchOntologyNodes("온톨로지 코어", [bodyOnly, localized]);
      expect(r.map((m) => m.node.id)).toEqual(["ontology-core", "other"]);
    });
  });

  // A Hangul IME emits a syllable one jamo at a time, so every Korean word is typed through these
  // states.
  describe('queries a Hangul keyboard actually produces', () => {
    const shop: KnowledgeGraphNode[] = [
      node({ id: "cap-cart", title: "장바구니" }),
      node({ id: "cap-order", title: "주문서 작성" }),
      node({ id: "cap-close", title: "회원 탈퇴" }),
      node({ id: "cap-coupon", title: "쿠폰 발급" }),
    ];

    it('matches by initial consonants alone', () => {
      const { results: r } = matchOntologyNodes("ㅈㅂㄱㄴ", shop);
      expect(r.map((m) => m.node.id)).toEqual(["cap-cart"]);
      expect(r[0]?.score).toBe(4);
    });

    it('matches a two-word name from initials typed without a space', () => {
      expect(matchOntologyNodes("ㅎㅇㅌㅌ", shop).results.map((m) => m.node.id)).toEqual(["cap-close"]);
      expect(matchOntologyNodes("ㅈㅁㅅㅈㅅ", shop).results.map((m) => m.node.id)).toEqual(["cap-order"]);
    });

    it('scores initials that do not start the name as substring', () => {
      const { results: r } = matchOntologyNodes("ㅌㅌ", shop);
      expect(r.map((m) => m.node.id)).toEqual(["cap-close"]);
      expect(r[0]?.score).toBe(3);
    });

    it('matches a syllable still being composed', () => {
      // The half-typed syllable reaches one name at the front and another in the middle; the front
      // match ranks first.
      expect(matchOntologyNodes("자", shop).results.map((m) => m.node.id)).toEqual([
        "cap-cart",
        "cap-order",
      ]);
      expect(matchOntologyNodes("장바ㄱ", shop).results.map((m) => m.node.id)).toEqual(["cap-cart"]);
    });

    it('ranks a literal name match above a Hangul-inferred match', () => {
      const both = [
        node({ id: "literal", title: "자동 승인" }),
        node({ id: "hangul", title: "장바구니" }),
      ];
      const { results: r } = matchOntologyNodes("자", both);
      expect(r.map((m) => m.node.id)).toEqual(["literal", "hangul"]);
      expect(r[0]?.score).toBe(6);
      expect(r[1]?.score).toBe(4);
    });

    it('ranks a Hangul name match above a summary match', () => {
      const both = [
        node({ id: "body", title: "Other", summary: "장바구니를 비운다" }),
        node({ id: "name", title: "장바구니 담기" }),
      ];
      const { results: r } = matchOntologyNodes("ㅈㅂㄱㄴ", both);
      expect(r.map((m) => m.node.id)).toEqual(["name"]);
    });

    it('does not pull in names whose initials differ', () => {
      expect(matchOntologyNodes("ㅋㅋㅋ", shop).results).toHaveLength(0);
    });
  });

  // Every row must say why it matched: the name, the summary or the id.
  describe('matched reason for each row', () => {
    const localized = node({
      id: "capability:shipping-fee",
      title: "Shipping Fee Policy",
      display: "배송비 정책",
      displayLocales: { ko: "배송비 정책", en: "Shipping Fee Policy" },
      summary: "Decides who pays to move the parcel.",
    });

    it('returns the matched name when it is not the visible one', () => {
      const { results: r } = matchOntologyNodes("policy", [localized]);
      expect(r[0]?.matched).toEqual({ field: "name", text: "Shipping Fee Policy" });
    });

    it('returns the visible name when it matched', () => {
      const { results: r } = matchOntologyNodes("배송비", [localized]);
      expect(r[0]?.matched).toEqual({ field: "name", text: "배송비 정책" });
    });

    it('returns summary when the summary matched', () => {
      const { results: r } = matchOntologyNodes("parcel", [localized]);
      expect(r[0]?.matched).toEqual({ field: "summary", text: "Decides who pays to move the parcel." });
    });

    it('returns the slug without the kind prefix when the id matched', () => {
      const { results: r } = matchOntologyNodes("fee", [node({ id: "capability:shipping-fee", title: "배송비" })]);
      expect(r[0]?.matched).toEqual({ field: "id", text: "shipping-fee" });
    });

    it('returns no reason for an empty query', () => {
      expect(matchOntologyNodes("", [localized]).results[0]?.matched).toBeUndefined();
    });
  });

  describe('does not match the kind prefix of an id', () => {
    const kinds = [
      node({ id: "element:order-number", title: "주문번호", kind: "element" }),
      node({ id: "element:login-session", title: "로그인 세션", kind: "element" }),
      node({ id: "capability:cart", title: "장바구니", kind: "capability" }),
    ];

    it('does not pull in every node of a kind for a kind word', () => {
      // Every element id begins with the kind, which the filter chips select.
      expect(matchOntologyNodes("element", kinds).results).toHaveLength(0);
      expect(matchOntologyNodes("capability", kinds).results).toHaveLength(0);
    });

    it('still matches by slug', () => {
      expect(matchOntologyNodes("order", kinds).results.map((m) => m.node.id)).toEqual(["element:order-number"]);
    });

    it('treats a query containing a colon as a pasted id', () => {
      const { results: r } = matchOntologyNodes("capability:cart", kinds);
      expect(r.map((m) => m.node.id)).toEqual(["capability:cart"]);
      expect(r[0]?.matched).toEqual({ field: "id", text: "capability:cart" });
    });

  });

  it('returns the found count alongside the limited list', () => {
    // The found count must not be the drawn limit.
    const many = Array.from({ length: 50 }, (_, i) =>
      node({ id: `node-${i}`, title: `노드 ${i}` }),
    );
    const page = matchOntologyNodes("노드", many, 7);
    expect(page.results).toHaveLength(7);
    expect(page.total).toBe(50);
  });

  it('counts the filtered total for an empty query', () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      node({ id: `node-${i}`, title: `노드 ${i}`, kind: i < 12 ? "domain" : "capability" }),
    );
    expect(matchOntologyNodes("", many, 7).total).toBe(50);
    expect(
      matchOntologyNodes("", many, 7, { kinds: new Set(["domain"]) }).total,
    ).toBe(12);
  });

  it('reports equal found and drawn counts under the limit', () => {
    const few = [node({ id: "a", title: "노드 하나" })];
    const page = matchOntologyNodes("노드", few, 20);
    expect(page.total).toBe(page.results.length);
  });

  describe('kind and project filters', () => {
    const filterCorpus: KnowledgeGraphNode[] = [
      node({ id: "cap-1", title: "능력 1", kind: "capability", projectIds: ["demo-iam"] }),
      node({ id: "cap-2", title: "능력 2", kind: "capability", projectIds: ["demo-knowledge"] }),
      node({ id: "dom-1", title: "도메인 1", kind: "domain", projectIds: ["demo-iam"] }),
      node({ id: "elem-1", title: "요소 1", kind: "element", projectIds: ["demo-iam", "demo-knowledge"] }),
      node({ id: "elem-orphan", title: "요소 미연결", kind: "element", projectIds: [] }),
    ];

    it('filters to capability only', () => {
      const { results: r } = matchOntologyNodes("", filterCorpus, 30, {
        kinds: new Set(["capability"]),
      });
      expect(r.map((m) => m.node.id).sort()).toEqual(["cap-1", "cap-2"]);
    });

    it('combines a kind filter with a query', () => {
      const { results: r } = matchOntologyNodes("능력", filterCorpus, 30, {
        kinds: new Set(["capability"]),
      });
      expect(r).toHaveLength(2);
      expect(r.every((m) => m.node.kind === "capability")).toBe(true);
    });

    it('filters to a single project', () => {
      const { results: r } = matchOntologyNodes("", filterCorpus, 30, {
        projectIds: new Set(["demo-knowledge"]),
      });
      expect(r.map((m) => m.node.id).sort()).toEqual(["cap-2", "elem-1"]);
    });

    it('keeps a node when any of its projectIds matches', () => {
    // elem-1 carries both [iam, knowledge] — either set matches.
      const { results: iam } = matchOntologyNodes("", filterCorpus, 30, {
        projectIds: new Set(["demo-iam"]),
      });
      const includes = iam.find((m) => m.node.id === "elem-1");
      expect(includes).toBeDefined();
    });

    it('excludes nodes with no projectIds under a project filter', () => {
      const { results: r } = matchOntologyNodes("", filterCorpus, 30, {
        projectIds: new Set(["demo-iam"]),
      });
      const orphan = r.find((m) => m.node.id === "elem-orphan");
      expect(orphan).toBeUndefined();
    });

    it('combines kind and project filters with AND', () => {
      const { results: r } = matchOntologyNodes("", filterCorpus, 30, {
        kinds: new Set(["capability"]),
        projectIds: new Set(["demo-iam"]),
      });
      expect(r.map((m) => m.node.id)).toEqual(["cap-1"]);
    });

    it('disables filtering for an empty or missing set', () => {
      const { results: all } = matchOntologyNodes("", filterCorpus, 30);
      const { results: emptySets } = matchOntologyNodes("", filterCorpus, 30, {
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

  it('ranks name prefix above substring', () => {
    const { results: r } = matchProjects("ia", corpus);
    expect(r[0]?.project.slug).toBe("demo-iam"); // an "IAM" prefix match
    expect(r[0]?.score).toBe(6);
  });

  it('puts an exact name match on top like the node matcher', () => {
    const { results: r } = matchProjects("iam", corpus);
    expect(r[0]?.project.slug).toBe("demo-iam");
    expect(r[0]?.score).toBe(7);
  });

  it('matches description, tags and category', () => {
    const { results: r } = matchProjects("agent", corpus);
    expect(r.find((m) => m.project.slug === "reactor-runtime")).toBeDefined();
  });

  it('matches a slug substring at a low score', () => {
    const { results: r } = matchProjects("knowledge", corpus);
    const knowledge = r.find((m) => m.project.slug === "demo-knowledge");
    expect(knowledge).toBeDefined();
  });

  it('finds projects by initial consonants like nodes', () => {
    const shops = [project({ slug: "shop", name: "온라인 쇼핑몰" })];
    const { results: r } = matchProjects("ㅇㄹㅇ", shops);
    expect(r[0]?.project.slug).toBe("shop");
    expect(r[0]?.score).toBe(4);
  });

  /* Both sides are normalised, so decomposed (NFD) names reach the literal tiers. */
  it('gives decomposed (NFD) input the same result as the node matcher', () => {
    const shops = [project({ slug: "shop", name: "온라인 쇼핑몰", description: "결제와 배송" })];
    const exact = matchProjects("온라인 쇼핑몰".normalize("NFD"), shops);
    expect(exact.results[0]?.project.slug).toBe("shop");
    expect(exact.results[0]?.score).toBe(7);

    const prose = matchProjects("배송".normalize("NFD"), shops);
    expect(prose.results[0]?.project.slug).toBe("shop");
    expect(prose.results[0]?.score).toBe(2);
  });

  it('returns nothing for zero matches', () => {
    expect(matchProjects("xyzqwerty", corpus).results).toHaveLength(0);
  });

  it('returns the found count for projects too', () => {
    const page = matchProjects("demo", corpus, 1);
    expect(page.results).toHaveLength(1);
    expect(page.total).toBe(3); // two by slug, one by name
  });

  it('sorts an empty query by updatedAt descending with the limit', () => {
    const { results: r } = matchProjects("", corpus, 2);
    expect(r).toHaveLength(2);
    expect(r[0]?.project.slug).toBe("reactor-runtime"); // 4-27
    expect(r[1]?.project.slug).toBe("demo-knowledge"); // 4-26
  });
});

describe("isPathLikeTitle", () => {
  it('detects a file-path-shaped title', () => {
    expect(isPathLikeTitle("mcp/src/ontology-engine.mjs")).toBe(true);
    expect(isPathLikeTitle("mcp/scripts/verify.mjs")).toBe(true);
    expect(isPathLikeTitle("src/widgets/global-search/ui/GlobalSearch.tsx")).toBe(true);
  });

  it('does not mistake an ordinary concept title for a path', () => {
    expect(isPathLikeTitle("MCP Server")).toBe(false);
    expect(isPathLikeTitle("로그인")).toBe(false);
    expect(isPathLikeTitle("Agent Graph Readiness")).toBe(false);
  });

  it('does not treat a slash string without an extension as a path', () => {
    expect(isPathLikeTitle("and/or")).toBe(false);
  });
});
