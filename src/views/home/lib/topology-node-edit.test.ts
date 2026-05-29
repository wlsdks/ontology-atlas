import { describe, expect, it } from "vitest";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  buildNodeFrontmatterEdit,
  resolveTopologyNodeEditTarget,
} from "./topology-node-edit";

const node = (evidenceIds: string[]): Pick<KnowledgeGraphNode, "evidenceIds"> => ({
  evidenceIds,
});

const doc = (slug: string, mtime?: number, frontmatter?: Record<string, unknown>) => ({
  slug,
  mtime,
  frontmatter,
});

describe("resolveTopologyNodeEditTarget", () => {
  it("evidenceIds[0] 와 매칭되는 vault 문서를 편집 대상으로", () => {
    const docs = [doc("capabilities/auth", 111, { kind: "capability", domain: "auth" })];
    const target = resolveTopologyNodeEditTarget(node(["capabilities/auth"]), docs);
    expect(target).toEqual({
      vaultSlug: "capabilities/auth",
      mtime: 111,
      frontmatter: { kind: "capability", domain: "auth" },
    });
  });

  it("evidenceIds 비었으면 null (합성 stub — 자체 문서 없음)", () => {
    expect(resolveTopologyNodeEditTarget(node([]), [doc("x")])).toBeNull();
  });

  it("매칭 문서 없으면 null (static 데모 / vault 미선택)", () => {
    expect(resolveTopologyNodeEditTarget(node(["domains/ghost"]), [doc("capabilities/auth")])).toBeNull();
  });

  it("frontmatter 없는 문서는 빈 객체로", () => {
    const target = resolveTopologyNodeEditTarget(node(["elements/jwt"]), [doc("elements/jwt", 9)]);
    expect(target?.frontmatter).toEqual({});
  });
});

describe("buildNodeFrontmatterEdit", () => {
  it("바뀐 키만 updates 에 — 값 trim", () => {
    const r = buildNodeFrontmatterEdit({ domain: "auth" }, { domain: "  billing  " });
    expect(r).toEqual({ updates: { domain: "billing" }, changed: true });
  });

  it("현재값과 같으면 omit + changed=false (불필요 write 회피)", () => {
    const r = buildNodeFrontmatterEdit({ domain: "auth" }, { domain: "auth" });
    expect(r).toEqual({ updates: {}, changed: false });
  });

  it("빈 문자열 → null (키 삭제)", () => {
    const r = buildNodeFrontmatterEdit({ domain: "auth" }, { domain: "   " });
    expect(r).toEqual({ updates: { domain: null }, changed: true });
  });

  it("여러 키 동시 — 바뀐 것만", () => {
    const r = buildNodeFrontmatterEdit(
      { kind: "capability", domain: "auth" },
      { kind: "capability", domain: "billing" },
    );
    expect(r.updates).toEqual({ domain: "billing" });
    expect(r.changed).toBe(true);
  });

  it("현재 frontmatter 에 없던 키 신규 추가", () => {
    const r = buildNodeFrontmatterEdit({}, { domain: "auth" });
    expect(r).toEqual({ updates: { domain: "auth" }, changed: true });
  });
});
