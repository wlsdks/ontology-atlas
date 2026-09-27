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
  // The manifest carries the file's path and the row shows it.
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
  it("files a capability under capabilities and an element under elements", () => {
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

  it("skips a concept already written, so a verdict that disagrees with the file writes nothing", () => {
    expect(
      buildContainmentProposals([{ slug: "capabilities/refund", domain: "domains/billing" }], DOCS),
    ).toEqual([]);
  });

  it("skips a concept the domain already holds through contains", () => {
    const docs = [
      doc("domains/billing", "domain", { contains: ["capabilities/pay"] }),
      doc("capabilities/pay", "capability"),
    ];
    expect(
      buildContainmentProposals([{ slug: "capabilities/pay", domain: "domains/billing" }], docs),
    ).toEqual([]);
  });

  it("skips a missing document or a wrong kind without writing a nonexistent file", () => {
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

  it("yields one row for a concept that arrives twice", () => {
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
 * When each fact is read is the guarantee: members and mtime freeze at open, and the justification is re-read at
 * Apply, or the guard compares a changed file against itself.
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

  it("writes each key of a file once, since a second write would fail its own mtime check", () => {
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

  it("writes the same file the row names", () => {
    const { writes } = selectContainmentWrites(
      buildContainmentPlan(proposals, DOCS),
      allTicked,
      DOCS,
    );
    const shop = writes.find((w) => w.domainSlug === "domains/shop");
    // The row shows `domainPath` and the run addresses `domainSlug`, both from one document.
    expect(shop?.domainPath).toBe("domains/shop.md");
    expect(proposals.find((p) => p.domainSlug === "domains/shop")?.domainPath).toBe(
      "domains/shop.md",
    );
  });

  it("does not write an unchecked row", () => {
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

  it("plans no write when nothing is selected", () => {
    const run = selectContainmentWrites(buildContainmentPlan(proposals, DOCS), new Set(), DOCS);
    expect(run.writes).toEqual([]);
    expect(run.skipped).toEqual([]);
  });

  it("carries every row a write resolves so failures report per row", () => {
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

  it("keeps the mtime measured at open as the baseline even if the file changes meanwhile", () => {
    const plan = buildContainmentPlan(proposals, DOCS);
    // The same folder re-read after an edit to billing: a new mtime and an unseen member. Rebuilding here would let the
    // guard accept the change.
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

  it("skips a document with an unknown mtime and records why", () => {
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

  it("skips a concept that meanwhile points at another domain, since nobody approved that sentence", () => {
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
    // The withdrawn row was its key's only member, so that key is not written; the same file's other key still is.
    const billingCapabilities = run.writes.find(
      (w) => w.domainSlug === "domains/billing" && w.key === "capabilities",
    );
    expect(billingCapabilities).toBeUndefined();
    const billingElements = run.writes.find(
      (w) => w.domainSlug === "domains/billing" && w.key === "elements",
    );
    expect(billingElements?.members).toEqual(["elements/receipt"]);
  });

  it("accepts a domain named by its slug tail, as the verdict did", () => {
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
  it("gives a skipped row a reason and marks it not attempted", async () => {
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
