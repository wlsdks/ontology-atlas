import { describe, expect, it } from "vitest";
import { diffVaultShape, snapshotVaultShape, type VaultShapeDoc } from "./vault-shape-events";

function doc(slug: string, frontmatter: Record<string, unknown> = {}): VaultShapeDoc {
  return { slug, title: slug.split("/").pop(), frontmatter };
}

describe("snapshotVaultShape", () => {
  it("사람이 부르는 이름을 쓴다 — 폴더 경로가 아니라", () => {
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

  it("짧은 참조를 꼬리로 편다 — 단, 꼬리가 유일할 때만", () => {
    const snap = snapshotVaultShape([
      doc("domains/order", { kind: "domain" }),
      doc("capabilities/checkout", { kind: "capability", domain: "order" }),
    ]);
    expect(snap.parents.get("capabilities/checkout")).toBe("domains/order");
  });

  it("꼬리가 모호하면 부모를 짓지 않는다 — 틀린 부모는 없는 부모보다 나쁘다", () => {
    const snap = snapshotVaultShape([
      doc("domains/order", { kind: "domain" }),
      doc("elements/order", { kind: "element" }),
      doc("capabilities/checkout", { kind: "capability", domain: "order" }),
    ]);
    expect(snap.parents.get("capabilities/checkout")).toBeNull();
  });
});

describe("diffVaultShape", () => {
  it("도메인이 생기고 사라진 것만 센다 — 역량은 세지 않는다", () => {
    const prev = snapshotVaultShape([doc("domains/order", { kind: "domain" })]);
    const next = snapshotVaultShape([
      doc("domains/catalog", { kind: "domain" }),
      doc("capabilities/checkout", { kind: "capability" }),
    ]);
    const diff = diffVaultShape(prev, next);
    expect(diff.domainsAdded.map((n) => n.slug)).toEqual(["domains/catalog"]);
    expect(diff.domainsRemoved.map((n) => n.slug)).toEqual(["domains/order"]);
  });

  it("브릿지 = 새 노드로 자식 둘 이상이 옮겨 붙은 것 (원장 2026-08-01)", () => {
    const prev = snapshotVaultShape([
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
    const diff = diffVaultShape(prev, next);
    expect(diff.bridges).toEqual([
      { slug: "capabilities/wallet-payment", name: "wallet-payment", kind: "capability", childCount: 2 },
    ]);
  });

  it("자식 하나만 옮겨 오면 브릿지가 아니다 — 그냥 부모가 바뀐 것", () => {
    const prev = snapshotVaultShape([
      doc("capabilities/a", { kind: "capability" }),
      doc("capabilities/child", { kind: "capability", belongs_to: "capabilities/a" }),
    ]);
    const next = snapshotVaultShape([
      doc("capabilities/a", { kind: "capability" }),
      doc("capabilities/b", { kind: "capability" }),
      doc("capabilities/child", { kind: "capability", belongs_to: "capabilities/b" }),
    ]);
    expect(diffVaultShape(prev, next).bridges).toEqual([]);
  });

  it("자식들이 통째로 새로 태어난 것은 브릿지가 아니다 (재부모화가 없다)", () => {
    const prev = snapshotVaultShape([doc("capabilities/a", { kind: "capability" })]);
    const next = snapshotVaultShape([
      doc("capabilities/a", { kind: "capability" }),
      doc("capabilities/bridge", { kind: "capability", belongs_to: "capabilities/a" }),
      doc("capabilities/x", { kind: "capability", belongs_to: "capabilities/bridge" }),
      doc("capabilities/y", { kind: "capability", belongs_to: "capabilities/bridge" }),
    ]);
    expect(diffVaultShape(prev, next).bridges).toEqual([]);
  });

  it("배치로 태어난 도메인도 잡는다 — 활동 로그가 못 보던 자리", () => {
    const prev = snapshotVaultShape([]);
    const next = snapshotVaultShape([
      doc("domains/order", { kind: "domain" }),
      doc("domains/catalog", { kind: "domain" }),
    ]);
    expect(diffVaultShape(prev, next).domainsAdded).toHaveLength(2);
  });
});
