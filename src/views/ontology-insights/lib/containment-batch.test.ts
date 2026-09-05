import { describe, expect, it } from "vitest";

import {
  buildContainmentProposals,
  planContainmentWrites,
  type ContainmentPlanDoc,
} from "./containment-batch";

const doc = (
  slug: string,
  kind: string,
  frontmatter: Record<string, unknown> = {},
  mtime?: number,
): ContainmentPlanDoc => ({
  slug,
  title: slug.split("/").pop() ?? slug,
  frontmatter: { kind, ...frontmatter },
  mtime,
});

const DOCS: ContainmentPlanDoc[] = [
  doc("domains/billing", "domain", { capabilities: ["capabilities/refund"] }, 111),
  doc("domains/shop", "domain", {}, 222),
  doc("capabilities/pay", "capability", { domain: "domains/billing" }),
  doc("capabilities/refund", "capability", { domain: "domains/billing" }),
  doc("elements/receipt", "element", { domain: "domains/billing" }),
  doc("capabilities/browse", "capability", { domain: "domains/shop" }),
];

describe("buildContainmentProposals", () => {
  it("역량은 capabilities, 요소는 elements 로 간다", () => {
    const proposals = buildContainmentProposals(
      [
        { slug: "capabilities/pay", domain: "domains/billing" },
        { slug: "elements/receipt", domain: "domains/billing" },
      ],
      DOCS,
    );
    expect(proposals.map((p) => [p.conceptSlug, p.key])).toEqual([
      ["capabilities/pay", "capabilities"],
      ["elements/receipt", "elements"],
    ]);
  });

  it("이미 적힌 개념은 제안하지 않는다 — 판정과 파일이 어긋나면 아무것도 쓰지 않는다", () => {
    expect(
      buildContainmentProposals([{ slug: "capabilities/refund", domain: "domains/billing" }], DOCS),
    ).toEqual([]);
  });

  it("contains 로 이미 담고 있어도 제안하지 않는다", () => {
    const docs = [
      doc("domains/billing", "domain", { contains: ["capabilities/pay"] }),
      doc("capabilities/pay", "capability"),
    ];
    expect(
      buildContainmentProposals([{ slug: "capabilities/pay", domain: "domains/billing" }], docs),
    ).toEqual([]);
  });

  it("문서를 못 찾거나 종류가 맞지 않으면 조용히 건너뛴다 — 없는 파일에 쓰지 않는다", () => {
    expect(
      buildContainmentProposals(
        [
          { slug: "capabilities/ghost", domain: "domains/billing" },
          { slug: "capabilities/pay", domain: "domains/ghost" },
          // A project is neither a capability nor an element, so no key is decided for it.
          { slug: "domains/shop", domain: "domains/billing" },
        ],
        DOCS,
      ),
    ).toEqual([]);
  });

  it("같은 개념이 두 번 와도 한 줄이다", () => {
    const proposals = buildContainmentProposals(
      [
        { slug: "capabilities/pay", domain: "domains/billing" },
        { slug: "capabilities/pay", domain: "domains/billing" },
      ],
      DOCS,
    );
    expect(proposals).toHaveLength(1);
  });
});

describe("planContainmentWrites", () => {
  const proposals = buildContainmentProposals(
    [
      { slug: "capabilities/pay", domain: "domains/billing" },
      { slug: "elements/receipt", domain: "domains/billing" },
      { slug: "capabilities/browse", domain: "domains/shop" },
    ],
    DOCS,
  );

  it("한 파일의 한 키는 한 번만 쓴다 — 두 번 쓰면 두 번째가 제 mtime 검사에 걸린다", () => {
    const writes = planContainmentWrites(
      proposals,
      new Set(proposals.map((p) => p.id)),
      DOCS,
    );
    expect(writes).toHaveLength(3);
    const billingCapabilities = writes.find(
      (w) => w.domainSlug === "domains/billing" && w.key === "capabilities",
    );
    expect(billingCapabilities?.members).toEqual(["capabilities/refund", "capabilities/pay"]);
    expect(billingCapabilities?.expectedMtime).toBe(111);
  });

  it("체크를 푼 줄은 쓰지 않는다 — 자동으로 도는 것은 없다", () => {
    const only = proposals.filter((p) => p.conceptSlug === "capabilities/browse");
    const writes = planContainmentWrites(proposals, new Set(only.map((p) => p.id)), DOCS);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      domainSlug: "domains/shop",
      key: "capabilities",
      members: ["capabilities/browse"],
      expectedMtime: 222,
    });
  });

  it("아무것도 고르지 않으면 쓰기도 없다", () => {
    expect(planContainmentWrites(proposals, new Set(), DOCS)).toEqual([]);
  });

  it("한 쓰기는 그것이 푸는 모든 줄을 들고 있다 — 실패는 줄마다 알린다", () => {
    const writes = planContainmentWrites(proposals, new Set(proposals.map((p) => p.id)), DOCS);
    const billingElements = writes.find(
      (w) => w.domainSlug === "domains/billing" && w.key === "elements",
    );
    expect(billingElements?.proposalIds).toEqual(["domains/billing::elements/receipt"]);
  });

  it("mtime 을 모르면 null 이다 — 없는 값을 지어내지 않는다", () => {
    const docs = [doc("domains/x", "domain"), doc("capabilities/y", "capability")];
    const built = buildContainmentProposals([{ slug: "capabilities/y", domain: "domains/x" }], docs);
    expect(planContainmentWrites(built, new Set(built.map((p) => p.id)), docs)[0].expectedMtime).toBeNull();
  });
});
