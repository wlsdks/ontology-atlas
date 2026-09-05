import { describe, expect, it, vi } from "vitest";

import {
  buildContainmentPlan,
  buildContainmentProposals,
  runContainmentBatch,
  selectContainmentWrites,
  type ContainmentPlanDoc,
  type ContainmentRowStatus,
} from "./containment-batch";

const doc = (
  slug: string,
  kind: string,
  frontmatter: Record<string, unknown> = {},
  mtime?: number,
): ContainmentPlanDoc => ({
  slug,
  // The manifest carries the file's path, and the row shows it — every fixture keeps that shape.
  path: `${slug}.md`,
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


/**
 * **When each fact is read is the whole guarantee.**
 *
 * The sheet promises a write never lands on a file that changed since the proposal, and that only
 * the named files are written. Neither survives if the plan is rebuilt at Apply: by then an
 * outside change has been read back in, and the guard would be comparing that new state against
 * itself. These cases pin the split — members and mtime frozen at open, justification re-read at
 * Apply.
 */
describe("buildContainmentPlan / selectContainmentWrites", () => {
  const proposals = buildContainmentProposals(
    [
      { slug: "capabilities/pay", domain: "domains/billing" },
      { slug: "elements/receipt", domain: "domains/billing" },
      { slug: "capabilities/browse", domain: "domains/shop" },
    ],
    DOCS,
  );
  const allTicked = new Set(proposals.map((p) => p.id));

  it("한 파일의 한 키는 한 번만 쓴다 — 두 번 쓰면 두 번째가 제 mtime 검사에 걸린다", () => {
    const { writes, skipped } = selectContainmentWrites(
      buildContainmentPlan(proposals, DOCS),
      allTicked,
      DOCS,
    );
    expect(skipped).toEqual([]);
    expect(writes).toHaveLength(3);
    const billingCapabilities = writes.find(
      (w) => w.domainSlug === "domains/billing" && w.key === "capabilities",
    );
    expect(billingCapabilities?.members).toEqual(["capabilities/refund", "capabilities/pay"]);
    expect(billingCapabilities?.expectedMtime).toBe(111);
  });

  it("줄이 말하는 파일과 실제로 쓰는 파일이 같다", () => {
    const { writes } = selectContainmentWrites(
      buildContainmentPlan(proposals, DOCS),
      allTicked,
      DOCS,
    );
    const shop = writes.find((w) => w.domainSlug === "domains/shop");
    // The row shows `domainPath`; the run addresses the file by `domainSlug`. Both come from the
    // one document, so what a person reads is the file that changes.
    expect(shop?.domainPath).toBe("domains/shop.md");
    expect(proposals.find((p) => p.domainSlug === "domains/shop")?.domainPath).toBe(
      "domains/shop.md",
    );
  });

  it("체크를 푼 줄은 쓰지 않는다 — 자동으로 도는 것은 없다", () => {
    const only = proposals.filter((p) => p.conceptSlug === "capabilities/browse");
    const { writes } = selectContainmentWrites(
      buildContainmentPlan(proposals, DOCS),
      new Set(only.map((p) => p.id)),
      DOCS,
    );
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      domainSlug: "domains/shop",
      key: "capabilities",
      members: ["capabilities/browse"],
      expectedMtime: 222,
    });
  });

  it("아무것도 고르지 않으면 쓰기도 없다", () => {
    const run = selectContainmentWrites(buildContainmentPlan(proposals, DOCS), new Set(), DOCS);
    expect(run.writes).toEqual([]);
    expect(run.skipped).toEqual([]);
  });

  it("한 쓰기는 그것이 푸는 모든 줄을 들고 있다 — 실패는 줄마다 알린다", () => {
    const { writes } = selectContainmentWrites(
      buildContainmentPlan(proposals, DOCS),
      allTicked,
      DOCS,
    );
    const billingElements = writes.find(
      (w) => w.domainSlug === "domains/billing" && w.key === "elements",
    );
    expect(billingElements?.proposalIds).toEqual(["domains/billing::elements/receipt"]);
  });

  it("열 때 잰 mtime 을 끝까지 들고 간다 — 그 사이 파일이 바뀌어도 기준은 바뀌지 않는다", () => {
    const plan = buildContainmentPlan(proposals, DOCS);
    // The same folder, read again after someone edited billing: a new mtime and a member the
    // sheet never saw. Rebuilding here is exactly the defect — the guard would accept the change.
    const laterDocs = DOCS.map((entry) =>
      entry.slug === "domains/billing"
        ? {
            ...entry,
            mtime: 999,
            frontmatter: { ...entry.frontmatter, capabilities: ["capabilities/refund", "hand/edit"] },
          }
        : entry,
    );
    const { writes } = selectContainmentWrites(plan, allTicked, laterDocs);
    const billingCapabilities = writes.find(
      (w) => w.domainSlug === "domains/billing" && w.key === "capabilities",
    );
    expect(billingCapabilities?.expectedMtime).toBe(111);
    expect(billingCapabilities?.members).toEqual(["capabilities/refund", "capabilities/pay"]);
  });

  it("mtime 을 모르는 문서는 적지 않고 이유를 남긴다 — 검사 없는 쓰기는 하지 않는다", () => {
    const docs = [doc("domains/x", "domain"), doc("capabilities/y", "capability", { domain: "domains/x" })];
    const built = buildContainmentProposals([{ slug: "capabilities/y", domain: "domains/x" }], docs);
    const run = selectContainmentWrites(
      buildContainmentPlan(built, docs),
      new Set(built.map((p) => p.id)),
      docs,
    );
    expect(run.writes).toEqual([]);
    expect(run.skipped).toEqual([
      {
        domainSlug: "domains/x",
        domainPath: "domains/x.md",
        reason: "unknown-mtime",
        proposalIds: ["domains/x::capabilities/y"],
      },
    ]);
  });

  it("그 사이에 개념이 다른 도메인을 가리키게 되면 적지 않는다 — 아무도 승인하지 않은 문장이다", () => {
    const plan = buildContainmentPlan(proposals, DOCS);
    const laterDocs = DOCS.map((entry) =>
      entry.slug === "capabilities/pay"
        ? { ...entry, frontmatter: { ...entry.frontmatter, domain: "domains/shop" } }
        : entry,
    );
    const run = selectContainmentWrites(plan, allTicked, laterDocs);
    expect(run.skipped).toContainEqual({
      domainSlug: "domains/billing",
      domainPath: "domains/billing.md",
      reason: "domain-changed",
      proposalIds: ["domains/billing::capabilities/pay"],
    });
    // The withdrawn row was the only member of that key, so nothing is written for it — while
    // the same file's other key, whose member still names this domain, is written as planned.
    const billingCapabilities = run.writes.find(
      (w) => w.domainSlug === "domains/billing" && w.key === "capabilities",
    );
    expect(billingCapabilities).toBeUndefined();
    const billingElements = run.writes.find(
      (w) => w.domainSlug === "domains/billing" && w.key === "elements",
    );
    expect(billingElements?.members).toEqual(["elements/receipt"]);
  });

  it("도메인을 슬러그 끝자리로 가리켜도 그대로 인정한다 — 판정이 받아준 이름을 뒤집지 않는다", () => {
    const docs = [
      doc("domains/billing", "domain", {}, 5),
      doc("capabilities/pay", "capability", { domain: "billing" }),
    ];
    const built = buildContainmentProposals([{ slug: "capabilities/pay", domain: "domains/billing" }], docs);
    const run = selectContainmentWrites(
      buildContainmentPlan(built, docs),
      new Set(built.map((p) => p.id)),
      docs,
    );
    expect(run.skipped).toEqual([]);
    expect(run.writes[0].members).toEqual(["capabilities/pay"]);
  });
});

describe("runContainmentBatch", () => {
  it("건너뛴 줄은 이유 문장을 달고, 시도하지 않았다고 말한다", async () => {
    const docs = [doc("domains/x", "domain"), doc("capabilities/y", "capability", { domain: "domains/x" })];
    const built = buildContainmentProposals([{ slug: "capabilities/y", domain: "domains/x" }], docs);
    const run = selectContainmentWrites(
      buildContainmentPlan(built, docs),
      new Set(built.map((p) => p.id)),
      docs,
    );
    let latest: ReadonlyMap<string, ContainmentRowStatus> = new Map();
    const write = vi.fn();
    await runContainmentBatch(run, {
      write,
      skipMessage: (skip) => `left alone: ${skip.reason}`,
      onStatuses: (statuses) => {
        latest = statuses;
      },
    });
    expect(write).not.toHaveBeenCalled();
    expect(latest.get("domains/x::capabilities/y")).toEqual({
      phase: "skipped",
      message: "left alone: unknown-mtime",
    });
  });
});
