import { describe, expect, it } from "vitest";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  buildDomainChoices,
  buildMeaningGapRows,
  type ConceptDocFacts,
} from "./meaning-gap-rows";

// English prose fixture — mirrors messages/en.json handoffProse.
const PROSE = {
  verificationGate: 'query_ontology({operation:"health"}) to re-check the result',
  missingDefinition:
    'patch_concept({slug:"%ref%", frontmatter:{description:"<this concept in one sentence>"}}) to write its meaning',
  missingDefinitionProof: 'get_concept({slug:"%ref%"}) to confirm the sentence',
  missingDomain:
    'patch_concept({slug:"%ref%", frontmatter:{domain:"<domain name>"}}) to record where it belongs',
  missingDomainProof: 'get_concept({slug:"%ref%"}) to confirm the domain',
};

function node(partial: Partial<KnowledgeGraphNode> & { id: string }): KnowledgeGraphNode {
  return {
    title: partial.id,
    kind: "capability",
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "vault-frontmatter",
    ...partial,
  } as KnowledgeGraphNode;
}

const facts = (partial: Partial<ConceptDocFacts> = {}): ConceptDocFacts => ({
  findings: [],
  domainRef: "billing",
  mtime: 1700,
  ...partial,
});

describe("buildMeaningGapRows", () => {
  it("뜻도 본문도 없는 개념만 정의 공백으로 뽑는다", () => {
    const nodes = [
      node({ id: "capability:a", title: "A", evidenceIds: ["capabilities/a"], hasOwnDocument: true }),
      node({ id: "capability:b", title: "B", evidenceIds: ["capabilities/b"], hasOwnDocument: true }),
    ];
    const result = buildMeaningGapRows(
      nodes,
      new Map([
        ["capabilities/a", facts({ findings: ["definition-missing"] })],
        ["capabilities/b", facts({ findings: [] })],
      ]),
      { prose: PROSE },
    );
    expect(result.definitionRows.map((row) => row.ownSlug)).toEqual(["capabilities/a"]);
    expect(result.counts.missingDefinition).toBe(1);
  });

  it("자기 문서가 없는 파생 개념은 절대 오지 않는다 — 남의 문서에 쓰지 않기 위해", () => {
    const nodes = [
      node({
        id: "element:srcfoots",
        title: "src/foo.ts",
        // A derived node's evidenceIds[0] is *someone else's document that cited it*.
        evidenceIds: ["capabilities/owner"],
        hasOwnDocument: false,
        kind: "element",
      }),
    ];
    const result = buildMeaningGapRows(
      nodes,
      new Map([["capabilities/owner", facts({ findings: ["definition-missing"], domainRef: null })]]),
      { prose: PROSE },
    );
    expect(result.definitionRows).toEqual([]);
    expect(result.domainRows).toEqual([]);
  });

  it("도메인 키가 필요한 kind(역량·요소)만 소속 공백으로 센다", () => {
    const nodes = [
      node({ id: "capability:a", title: "A", evidenceIds: ["capabilities/a"], hasOwnDocument: true }),
      node({
        id: "element:e",
        title: "E",
        kind: "element",
        evidenceIds: ["elements/e"],
        hasOwnDocument: true,
      }),
      node({
        id: "domain:d",
        title: "D",
        kind: "domain",
        evidenceIds: ["domains/d"],
        hasOwnDocument: true,
      }),
    ];
    const result = buildMeaningGapRows(
      nodes,
      new Map([
        ["capabilities/a", facts({ domainRef: null })],
        ["elements/e", facts({ domainRef: null })],
        ["domains/d", facts({ domainRef: null })],
      ]),
      { prose: PROSE },
    );
    expect(result.domainRows.map((row) => row.ownSlug)).toEqual(["capabilities/a", "elements/e"]);
    expect(result.counts.missingDomain).toBe(2);
  });

  it("표시 상한을 넘겨도 총계는 절단 전 규모를 말한다", () => {
    const nodes = Array.from({ length: 5 }, (_, i) =>
      node({
        id: `capability:c${i}`,
        title: `C${i}`,
        evidenceIds: [`capabilities/c${i}`],
        hasOwnDocument: true,
      }),
    );
    const result = buildMeaningGapRows(
      nodes,
      new Map(nodes.map((n) => [n.evidenceIds[0], facts({ findings: ["definition-missing"] })])),
      { perKindLimit: 2, prose: PROSE },
    );
    expect(result.definitionRows).toHaveLength(2);
    expect(result.counts.missingDefinition).toBe(5);
  });

  it("행은 쓸 파일·인계 이름·동시수정 기준을 함께 들고 온다", () => {
    const result = buildMeaningGapRows(
      [
        node({
          id: "capability:pay",
          title: "결제 승인",
          evidenceIds: ["ontology/capabilities/pay"],
          agentSlug: "capabilities/pay",
          hasOwnDocument: true,
        }),
      ],
      new Map([["ontology/capabilities/pay", facts({ findings: ["definition-missing"], mtime: 42 })]]),
      { prose: PROSE },
    );
    const [row] = result.definitionRows;
    expect(row.ownSlug).toBe("ontology/capabilities/pay");
    expect(row.agentRef).toBe("capabilities/pay");
    expect(row.mtime).toBe(42);
    expect(row.handoffPayload).toContain('patch_concept({slug:"capabilities/pay"');
  });

  it("매니페스트에 없는 문서에는 행을 만들지 않는다", () => {
    const result = buildMeaningGapRows(
      [node({ id: "capability:ghost", evidenceIds: ["capabilities/ghost"], hasOwnDocument: true })],
      new Map(),
      { prose: PROSE },
    );
    expect(result.definitionRows).toEqual([]);
  });
});

describe("buildMeaningGapRows — 검사 소견 줄", () => {
  const nodes = [
    node({
      id: "capability:pay",
      title: "Pay",
      evidenceIds: ["capabilities/pay"],
      hasOwnDocument: true,
    }),
    node({
      id: "capability:refund",
      title: "Refund",
      evidenceIds: ["capabilities/refund"],
      hasOwnDocument: true,
    }),
  ];

  it("경계가 없는 개념은 경계 자리에 한 줄로 선다", () => {
    const result = buildMeaningGapRows(
      nodes.slice(0, 1),
      new Map([["capabilities/pay", facts({ findings: ["boundary-missing"] })]]),
      { prose: PROSE },
    );
    expect(result.findingRows["missing-boundary"]).toEqual([
      {
        id: "missing-boundary:capabilities/pay",
        gap: "missing-boundary",
        nodeId: "capability:pay",
        ownSlug: "capabilities/pay",
        title: "Pay",
        nodeKind: "capability",
      },
    ]);
    expect(result.counts.findings["missing-boundary"]).toBe(1);
    // The other three sections stay empty — one finding does not raise four rows.
    expect(result.counts.findings["missing-uncertainty"]).toBe(0);
    expect(result.counts.findings["epistemic-exclusion"]).toBe(0);
    expect(result.counts.findings["slug-outside-kind-folder"]).toBe(0);
    expect(result.definitionRows).toEqual([]);
  });

  it("양쪽이 다 비어도 문서 하나에 줄 하나", () => {
    const result = buildMeaningGapRows(
      nodes.slice(0, 1),
      new Map([
        [
          "capabilities/pay",
          facts({ findings: ["boundary-missing", "boundary-missing"] }),
        ],
      ]),
      { prose: PROSE },
    );
    expect(result.findingRows["missing-boundary"]).toHaveLength(1);
    expect(result.counts.findings["missing-boundary"]).toBe(1);
  });

  it("줄은 이름순이고, 총계는 자르기 전 수를 말한다", () => {
    const result = buildMeaningGapRows(
      nodes,
      new Map([
        ["capabilities/pay", facts({ findings: ["uncertainty-missing"] })],
        ["capabilities/refund", facts({ findings: ["uncertainty-missing"] })],
      ]),
      { prose: PROSE, perKindLimit: 1 },
    );
    expect(result.findingRows["missing-uncertainty"].map((row) => row.title)).toEqual([
      "Pay",
    ]);
    expect(result.counts.findings["missing-uncertainty"]).toBe(2);
  });

  it("자기 문서가 없는 개념은 소견 줄도 만들지 않는다", () => {
    const derived = node({
      id: "capability:derived",
      title: "Derived",
      evidenceIds: ["capabilities/pay"],
      hasOwnDocument: false,
    });
    const result = buildMeaningGapRows(
      [derived],
      new Map([["capabilities/pay", facts({ findings: ["boundary-missing"] })]]),
      { prose: PROSE },
    );
    expect(result.findingRows["missing-boundary"]).toEqual([]);
  });
});

describe("buildDomainChoices", () => {
  // Values are the domain document's own address since 2026-09-26 (map-edit QA D10): the
  // bare tail was a second spelling of the relation every agent-written node qualifies.
  it("offers only domains with a document, by that document's address, in name order", () => {
    const choices = buildDomainChoices([
      node({
        id: "domain:z",
        title: "Zeta",
        kind: "domain",
        evidenceIds: ["domains/zeta"],
        hasOwnDocument: true,
      }),
      node({
        id: "domain:a",
        title: "Alpha",
        display: "알파",
        kind: "domain",
        evidenceIds: ["ontology/domains/alpha"],
        hasOwnDocument: true,
      }),
      node({
        id: "domain:ghost",
        title: "Ghost",
        kind: "domain",
        evidenceIds: ["capabilities/owner"],
        hasOwnDocument: false,
      }),
      node({ id: "capability:x", kind: "capability", evidenceIds: ["capabilities/x"] }),
    ]);
    // By name — that latin sorts before Korean is ICU's decision; the property needed here is that
    // opening the same folder twice gives the same order.
    expect(choices).toEqual([
      { value: "domains/zeta", label: "Zeta" },
      { value: "ontology/domains/alpha", label: "알파" },
    ]);
  });
});
