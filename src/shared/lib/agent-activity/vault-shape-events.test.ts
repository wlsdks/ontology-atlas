import { describe, expect, it } from "vitest";
import { diffVaultShape, snapshotVaultShape, type VaultShapeDoc } from "./vault-shape-events";

function doc(slug: string, frontmatter: Record<string, unknown> = {}): VaultShapeDoc {
  return { slug, title: slug.split("/").pop(), frontmatter };
}

describe("snapshotVaultShape", () => {
  it("uses the human-facing name, not the folder path", () => {
    const snap = snapshotVaultShape(
      [{ slug: "capabilities/checkout", title: "Checkout", frontmatter: { kind: "capability", display_ko: "주문서 작성" } }],
      "ko",
    );
    expect(snap.nodes.get("capabilities/checkout")).toEqual({
      slug: "capabilities/checkout",
      name: "주문서 작성",
      kind: "capability",
    });
  });

  it("expands a short reference into its tail, only when the tail is unique", () => {
    const snap = snapshotVaultShape([
      doc("domains/order", { kind: "domain" }),
      doc("capabilities/checkout", { kind: "capability", domain: "order" }),
    ]);
    expect(snap.parents.get("capabilities/checkout")).toBe("domains/order");
  });

  it("builds no parent when the tail is ambiguous, because a wrong parent is worse than none", () => {
    const snap = snapshotVaultShape([
      doc("domains/order", { kind: "domain" }),
      doc("elements/order", { kind: "element" }),
      doc("capabilities/checkout", { kind: "capability", domain: "order" }),
    ]);
    expect(snap.parents.get("capabilities/checkout")).toBeNull();
  });
});

describe("diffVaultShape", () => {
  it("counts only domains that appeared and disappeared, not capabilities", () => {
    const previous = snapshotVaultShape([doc("domains/order", { kind: "domain" })]);
    const next = snapshotVaultShape([
      doc("domains/catalog", { kind: "domain" }),
      doc("capabilities/checkout", { kind: "capability" }),
    ]);
    const diff = diffVaultShape(previous, next);
    expect(diff.domainsAdded.map((n) => n.slug)).toEqual(["domains/catalog"]);
    expect(diff.domainsRemoved.map((n) => n.slug)).toEqual(["domains/order"]);
  });

  it("a bridge is a new node that two or more children moved under (ledger 2026-08-01)", () => {
    const previous = snapshotVaultShape([
      doc("capabilities/payment-authorize", { kind: "capability" }),
      doc("capabilities/kakao-pay", { kind: "capability", belongs_to: "capabilities/payment-authorize" }),
      doc("capabilities/naver-pay", { kind: "capability", belongs_to: "capabilities/payment-authorize" }),
    ]);
    const next = snapshotVaultShape([
      doc("capabilities/payment-authorize", { kind: "capability" }),
      doc("capabilities/wallet-payment", { kind: "capability", belongs_to: "capabilities/payment-authorize" }),
      doc("capabilities/kakao-pay", { kind: "capability", belongs_to: "capabilities/wallet-payment" }),
      doc("capabilities/naver-pay", { kind: "capability", belongs_to: "capabilities/wallet-payment" }),
    ]);
    const diff = diffVaultShape(previous, next);
    expect(diff.bridges).toEqual([
      { slug: "capabilities/wallet-payment", name: "wallet-payment", kind: "capability", childCount: 2 },
    ]);
  });

  it("moving a single child is not a bridge, only a parent change", () => {
    const previous = snapshotVaultShape([
      doc("capabilities/a", { kind: "capability" }),
      doc("capabilities/child", { kind: "capability", belongs_to: "capabilities/a" }),
    ]);
    const next = snapshotVaultShape([
      doc("capabilities/a", { kind: "capability" }),
      doc("capabilities/b", { kind: "capability" }),
      doc("capabilities/child", { kind: "capability", belongs_to: "capabilities/b" }),
    ]);
    expect(diffVaultShape(previous, next).bridges).toEqual([]);
  });

  it("children that are all newly created are not a bridge, since nothing was reparented", () => {
    const previous = snapshotVaultShape([doc("capabilities/a", { kind: "capability" })]);
    const next = snapshotVaultShape([
      doc("capabilities/a", { kind: "capability" }),
      doc("capabilities/bridge", { kind: "capability", belongs_to: "capabilities/a" }),
      doc("capabilities/x", { kind: "capability", belongs_to: "capabilities/bridge" }),
      doc("capabilities/y", { kind: "capability", belongs_to: "capabilities/bridge" }),
    ]);
    expect(diffVaultShape(previous, next).bridges).toEqual([]);
  });

  it("also catches domains created in a batch, a spot the activity log could not see", () => {
    const previous = snapshotVaultShape([]);
    const next = snapshotVaultShape([
      doc("domains/order", { kind: "domain" }),
      doc("domains/catalog", { kind: "domain" }),
    ]);
    expect(diffVaultShape(previous, next).domainsAdded).toHaveLength(2);
  });
});
