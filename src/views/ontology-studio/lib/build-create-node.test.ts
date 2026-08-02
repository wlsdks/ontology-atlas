import { describe, expect, it } from "vitest";
import {
  buildCreateNodeDoc,
  buildCreateNodeSlug,
  buildEditPacket,
  buildFillPacket,
  buildMcpPacket,
  buildRemovePacket,
  candidateFromNode,
  computeCreateCompleteness,
  findCreateSlugCollision,
  groupRelationRefs,
  type CreateDraft,
  type PendingRelation,
} from "./build-create-node";

const orderCancel = candidateFromNode({ id: "capability:order-cancel", kind: "capability", title: "주문 취소" });
const gateway = candidateFromNode({ id: "element:gateway", kind: "element", title: "src/payment/gateway.ts" });
const payment = candidateFromNode({ id: "capability:payment", kind: "capability", title: "결제 처리" });
const occupiedKoreanOrderCancel = candidateFromNode({
  id: "capability:주문-취소",
  kind: "capability",
  title: "주문 취소",
});

function draft(overrides: Partial<CreateDraft> = {}): CreateDraft {
  return {
    kind: "capability",
    title: "결제 취소",
    domainValue: "payments",
    definition: "결제 후 사용자가 주문을 취소하면 승인을 취소한다",
    relations: [],
    ...overrides,
  };
}

describe("C12③ — per-locale display names", () => {
  it("writes sorted display_<locale> keys under title in the vault doc", () => {
    const { markdown } = buildCreateNodeDoc(
      draft({ localeLabels: { en: "Payment cancel", ko: "결제 취소" } }),
    );
    // deterministic: en before ko (sorted), both right under title.
    expect(markdown).toContain("display_en: Payment cancel");
    expect(markdown).toContain("display_ko: 결제 취소");
    expect(markdown.indexOf("display_en")).toBeLessThan(markdown.indexOf("display_ko"));
    expect(markdown.indexOf("title:")).toBeLessThan(markdown.indexOf("display_en"));
  });

  it("omits display_* entirely when no locale names are given (unchanged today)", () => {
    const { markdown } = buildCreateNodeDoc(draft());
    expect(markdown).not.toContain("display_");
  });

  it("ignores blank / malformed locale entries", () => {
    const { markdown } = buildCreateNodeDoc(
      draft({ localeLabels: { ko: "  ", en: "Payment cancel", "en-US": "x" } }),
    );
    expect(markdown).toContain("display_en: Payment cancel");
    expect(markdown).not.toContain("display_ko");
    expect(markdown).not.toContain("en-US");
  });

  it("emits labels: { ... } in the MCP packet (add_concept locale-label input)", () => {
    const packet = buildMcpPacket(draft({ localeLabels: { ko: "결제 취소", en: "Payment cancel" } }));
    expect(packet).toContain('labels: { en: "Payment cancel", ko: "결제 취소" }');
    // and none when absent.
    expect(buildMcpPacket(draft())).not.toContain("labels:");
  });
});

describe("C2 — CREATE-from-socket origin relation in ONE MCP packet", () => {
  it("appends add_relation A→new for a non-is_a origin bearing", () => {
    const packet = buildMcpPacket(draft({ relations: [] }), {
      focalSlug: "capabilities/order-cancel",
      relation: "contains",
    });
    const lines = packet.split("\n");
    // 첫 줄은 **어느 볼트에 쓰는지**다 — 이 문자열은 다른 창의 에이전트 세션에
    // 붙여넣어지고, 그 세션이 이 볼트에 물려 있다는 보장이 없다.
    expect(lines[0]).toMatch(/^#/);
    expect(lines[1]).toMatch(/^add_concept\(/);
    // the origin line records the A→new edge (A contains the new node).
    expect(packet).toContain(
      'add_relation(from: "capabilities/order-cancel", to: "capabilities/결제-취소", type: "contains")',
    );
  });

  it("patches A's broader for an is_a origin using the supplied post-add array", () => {
    const packet = buildMcpPacket(draft(), {
      focalSlug: "capabilities/order-cancel",
      relation: "isA",
      broaderRefsAfter: ["domains/payments", "capabilities/결제-취소"],
    });
    expect(packet).toContain(
      'patch_concept(slug: "capabilities/order-cancel", frontmatter: { broader: ["domains/payments", "capabilities/결제-취소"] })',
    );
    expect(packet).not.toContain("is_a");
  });

  it("no origin → packet is unchanged (just the node + its own relations)", () => {
    expect(buildMcpPacket(draft())).not.toContain("order-cancel");
  });
});

describe("candidateFromNode", () => {
  it("computes the folder-prefixed ref the derivation resolves", () => {
    expect(orderCancel.ref).toBe("capabilities/order-cancel");
    expect(gateway.ref).toBe("elements/gateway");
  });
  it("prefers the display title", () => {
    const c = candidateFromNode({ id: "domain:auth", kind: "domain", title: "auth", display: "인증" });
    expect(c.title).toBe("인증");
    expect(c.ref).toBe("domains/auth");
  });
});

describe("buildCreateNodeSlug", () => {
  it("slugs into the kind folder, preserving Korean", () => {
    expect(buildCreateNodeSlug({ kind: "capability", title: "결제 취소" })).toBe("capabilities/결제-취소");
  });
  it("returns null when the title has no slug-able characters", () => {
    expect(buildCreateNodeSlug({ kind: "capability", title: "!!!" })).toBeNull();
  });
});

describe("findCreateSlugCollision", () => {
  it("finds the existing node that occupies the deterministic create slug", () => {
    expect(
      findCreateSlugCollision(
        { kind: "capability", title: "주문 취소" },
        [occupiedKoreanOrderCancel, gateway],
      ),
    ).toEqual(occupiedKoreanOrderCancel);
  });

  it("does not confuse the same title in another kind with a path collision", () => {
    expect(
      findCreateSlugCollision(
        { kind: "element", title: "주문 취소" },
        [occupiedKoreanOrderCancel, gateway],
      ),
    ).toBeNull();
  });
});

describe("groupRelationRefs", () => {
  it("groups by frontmatter key in card order and dedupes", () => {
    const relations: PendingRelation[] = [
      { type: "dependsOn", candidate: orderCancel },
      { type: "dependsOn", candidate: orderCancel }, // dup
      { type: "contains", candidate: gateway },
      { type: "isA", candidate: payment },
    ];
    expect(groupRelationRefs(relations)).toEqual([
      { key: "broader", refs: ["capabilities/payment"] },
      { key: "dependencies", refs: ["capabilities/order-cancel"] },
      { key: "contains", refs: ["elements/gateway"] },
    ]);
  });
});

describe("buildCreateNodeDoc", () => {
  it("direct-create 문서에 테스트 UID를 주입해 영구 식별자를 기록", () => {
    const uid = "00000000-0000-4000-8000-000000000001";
    const { markdown } = buildCreateNodeDoc(draft(), { uid });
    expect(markdown).toContain(`uid: ${uid}`);
  });

  it("serializes the assembled node with runtime-read relation keys", () => {
    const { slug, markdown } = buildCreateNodeDoc(
      draft({
        relations: [
          { type: "dependsOn", candidate: orderCancel },
          { type: "contains", candidate: gateway },
          { type: "isA", candidate: payment },
        ],
      }),
    );
    expect(slug).toBe("capabilities/결제-취소");
    expect(markdown).toContain("kind: capability");
    expect(markdown).toContain("domain: payments");
    expect(markdown).toContain("title: 결제 취소");
    // dependsOn writes `dependencies` (dogfood + runtime convention, not depends_on)
    expect(markdown).toContain("dependencies: [capabilities/order-cancel]");
    expect(markdown).toContain("contains: [elements/gateway]");
    // is_a is additive as `broader:` (S3 wires validation)
    expect(markdown).toContain("broader: [capabilities/payment]");
    expect(markdown).toContain("definition: 결제 후");
    expect(markdown).toContain("# 결제 취소");
  });

  it("omits domain for project/domain kinds", () => {
    const { markdown } = buildCreateNodeDoc(draft({ kind: "domain", title: "결제", domainValue: null }));
    expect(markdown).not.toContain("domain:");
  });

  it("throws on an empty title", () => {
    expect(() => buildCreateNodeDoc(draft({ title: "   " }))).toThrow();
  });
});

describe("buildMcpPacket", () => {
  it("MCP 위임 packet에는 UID를 싣지 않고 서버 발급에 맡긴다", () => {
    const packet = buildMcpPacket(draft());
    expect(packet).not.toMatch(/\buid\s*:/);
  });

  it("reflects the assembled node and its relations as add_concept + add_relation", () => {
    const packet = buildMcpPacket(
      draft({
        relations: [
          { type: "dependsOn", candidate: orderCancel },
          { type: "isA", candidate: payment },
        ],
      }),
    );
    // `definition`·`broader` 는 **`add_concept` 이 받지 않는다** — 실어 보내면
    // 서버가 `unknown_argument` 로 반려한다. 프론트매터로 가는 값이라
    // `patch_concept` 한 줄이 뒤따른다(2026-07-29, MCP 실행 검증).
    expect(packet).toContain('add_concept(slug: "capabilities/결제-취소", kind: "capability", title: "결제 취소", domain: "payments")');
    expect(packet).toContain('patch_concept(slug: "capabilities/결제-취소", frontmatter: { definition: "결제 후');
    expect(packet).toContain('add_relation(from: "capabilities/결제-취소", to: "capabilities/order-cancel", type: "depends_on")');
    // is-a lands as a `broader:` frontmatter array on the new node itself (MCP
    // has no is_a edge type) — NOT an add_relation edge.
    expect(packet).toContain('broader: ["capabilities/payment"]');
    expect(packet).not.toContain('type: "is_a"');
  });
});

describe("buildFillPacket", () => {
  it("emits add_relation for a depends-on fill on an existing node", () => {
    expect(buildFillPacket("capabilities/mcp-server", "dependsOn", "capabilities/parser")).toBe(
      'add_relation(from: "capabilities/mcp-server", to: "capabilities/parser", type: "depends_on")',
    );
  });

  it("patches the broader frontmatter key for an is-a fill (no is_a edge type)", () => {
    expect(buildFillPacket("capabilities/mcp-server", "isA", "capabilities/server-interface")).toBe(
      'patch_concept(slug: "capabilities/mcp-server", frontmatter: { broader: ["capabilities/server-interface"] })',
    );
  });
});

describe("buildRemovePacket", () => {
  it("removes a non-is_a relation via remove_relation", () => {
    expect(buildRemovePacket("capabilities/focal", "dependsOn", "elements/parser")).toBe(
      'remove_relation(from: "capabilities/focal", to: "elements/parser", type: "depends_on", confirm: true)',
    );
    expect(buildRemovePacket("capabilities/focal", "relates", "capabilities/topology")).toBe(
      'remove_relation(from: "capabilities/focal", to: "capabilities/topology", type: "relates", confirm: true)',
    );
  });

  it("removes an is_a relation by patching the remaining broader array", () => {
    expect(
      buildRemovePacket("capabilities/focal", "isA", "capabilities/gone", {
        broaderRefsAfter: ["capabilities/kept"],
      }),
    ).toBe('patch_concept(slug: "capabilities/focal", frontmatter: { broader: ["capabilities/kept"] })');
  });
});

describe("buildEditPacket", () => {
  it("non-is_a → non-is_a is one atomic replace_relation", () => {
    expect(buildEditPacket("capabilities/focal", "relates", "dependsOn", "capabilities/topology")).toBe(
      'replace_relation(from: "capabilities/focal", oldTo: "capabilities/topology", oldType: "relates", newTo: "capabilities/topology", newType: "depends_on", confirm: true)',
    );
  });

  it("is_a → other drops broader then adds the new edge", () => {
    const out = buildEditPacket("capabilities/focal", "isA", "dependsOn", "capabilities/x", {
      broaderRefsAfter: [],
    });
    expect(out).toBe(
      [
        'patch_concept(slug: "capabilities/focal", frontmatter: { broader: [] })',
        'add_relation(from: "capabilities/focal", to: "capabilities/x", type: "depends_on")',
      ].join("\n"),
    );
  });

  it("other → is_a removes the old edge then appends to broader", () => {
    const out = buildEditPacket("capabilities/focal", "dependsOn", "isA", "capabilities/x", {
      broaderRefsAfter: ["capabilities/x"],
    });
    expect(out).toBe(
      [
        'remove_relation(from: "capabilities/focal", to: "capabilities/x", type: "depends_on", confirm: true)',
        'patch_concept(slug: "capabilities/focal", frontmatter: { broader: ["capabilities/x"] })',
      ].join("\n"),
    );
  });
});

describe("computeCreateCompleteness", () => {
  it("is 33% with name + one relation (2 of 6 checkpoints)", () => {
    const c = computeCreateCompleteness(
      draft({ definition: "", relations: [{ type: "dependsOn", candidate: orderCancel }] }),
    );
    expect(c.filledCount).toBe(2);
    expect(c.percent).toBe(33);
    expect(c.pips[0]).toBe("on"); // name
    expect(c.pips[1]).toBe("next"); // definition is the next gap
  });
  it("reaches 100% when every checkpoint is filled", () => {
    const c = computeCreateCompleteness(
      draft({
        relations: [
          { type: "isA", candidate: payment },
          { type: "dependsOn", candidate: orderCancel },
          { type: "contains", candidate: gateway },
          { type: "relates", candidate: payment },
        ],
      }),
    );
    expect(c.percent).toBe(100);
    expect(c.pips.every((p) => p === "on")).toBe(true);
  });
});

/**
 * ── slug 오버라이드 ──────────────────────────────────────────────────────
 *
 * 이미 남의 문서가 이름을 적어 둔 개념에 문서를 붙일 때는, 그 인용이 가리키는
 * 경로에 그대로 앉아야 한다. 제목에서 새로 만든 slug 를 쓰면 인용은 여전히
 * 허공을 가리키고, 지도에는 같은 개념이 둘로 보인다.
 */
describe("slug 오버라이드 — 기존 인용이 가리키는 자리에 앉힌다", () => {
  it("buildCreateNodeDoc 은 넘긴 slug 를 경로와 frontmatter 에 그대로 쓴다", () => {
    const { slug, markdown } = buildCreateNodeDoc(
      draft({ kind: "element", title: "src/payment/gateway.ts", domainValue: null, definition: "" }),
      { slug: "elements/gateway" },
    );
    expect(slug).toBe("elements/gateway");
    expect(markdown).toContain("slug: elements/gateway");
    // 제목에서 파생한 slug(`elements/srcpaymentgatewayts` 류)로 새지 않는다.
    expect(markdown).not.toContain(buildCreateNodeSlug({ kind: "element", title: "src/payment/gateway.ts" }));
  });

  it("buildMcpPacket 도 같은 slug 를 쓴다 — 에이전트가 같은 파일을 만든다", () => {
    const packet = buildMcpPacket(
      draft({ kind: "element", title: "src/payment/gateway.ts", domainValue: null, definition: "", relations: [{ type: "dependsOn", candidate: payment }] }),
      undefined,
      { slug: "elements/gateway" },
    );
    expect(packet).toContain('add_concept(slug: "elements/gateway"');
    expect(packet).toContain('add_relation(from: "elements/gateway", to: "capabilities/payment", type: "depends_on")');
  });
});
