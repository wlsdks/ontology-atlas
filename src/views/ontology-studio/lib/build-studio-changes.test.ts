import { describe, expect, it } from "vitest";
import type { StudioSatellite, StudioRelation } from "./build-studio-item";
import {
  frontmatterEntryMatchesTarget,
  isRelationEditableFromFocal,
  planRelationRefUpdates,
  projectBearings,
  reduceStudioChanges,
  summarizeStudioChanges,
  type StudioChange,
  type StudioSummaryVocab,
} from "./build-studio-changes";

const sat = (id: string, title: string, ref: string, kind = "capability"): StudioSatellite => ({
  id,
  title,
  kind,
  ref,
});

const A = sat("capability:mcp-server", "MCP Tool Surface", "capabilities/mcp-server");
const B = sat("capability:topology", "Topology Map v2", "capabilities/topology");
const C = sat("element:parser", "Parser", "elements/parser", "element");

const emptyBase = (): Record<StudioRelation, StudioSatellite[]> => ({
  isA: [],
  dependsOn: [],
  contains: [],
  relates: [],
});

describe("reduceStudioChanges", () => {
  it("adds a fill and keeps one entry per target", () => {
    let s = reduceStudioChanges([], { type: "add", relation: "isA", target: A });
    s = reduceStudioChanges(s, { type: "add", relation: "dependsOn", target: A });
    expect(s).toEqual([{ op: "add", relation: "dependsOn", target: A }]);
  });

  it("removing a freshly-added link cancels the add", () => {
    let s = reduceStudioChanges([], { type: "add", relation: "isA", target: A });
    s = reduceStudioChanges(s, { type: "remove", relation: "isA", target: A });
    expect(s).toEqual([]);
  });

  it("records a remove for an existing neighbor", () => {
    const s = reduceStudioChanges([], { type: "remove", relation: "relates", target: B });
    expect(s).toEqual([{ op: "remove", relation: "relates", target: B }]);
  });

  it("retype preserves the ORIGINAL bearing across chained retypes", () => {
    let s = reduceStudioChanges([], { type: "retype", from: "relates", to: "dependsOn", target: B });
    s = reduceStudioChanges(s, { type: "retype", from: "dependsOn", to: "contains", target: B });
    expect(s).toEqual([{ op: "retype", from: "relates", to: "contains", target: B }]);
  });

  it("retype-then-remove collapses to a remove at the TRUE original bearing (sonnet 검증 결함 1)", () => {
    // 기대는 곳(dependsOn)에 실재하는 관계를 '비슷한 것'으로 옮겨둔 뒤 끊으면,
    // 실제로 기록돼 있는 dependsOn 을 끊어야 한다 — 옮긴 후 방위(relates)로
    // 끊으면 실재하지 않는 엣지를 지우려는 no-op 쓰기가 된다.
    let s = reduceStudioChanges([], { type: "retype", from: "dependsOn", to: "relates", target: A });
    s = reduceStudioChanges(s, { type: "remove", relation: "relates", target: A });
    expect(s).toEqual([{ op: "remove", relation: "dependsOn", target: A }]);
  });

  it("chained-retype-then-remove still removes at the TRUE original bearing", () => {
    let s = reduceStudioChanges([], { type: "retype", from: "dependsOn", to: "relates", target: A });
    s = reduceStudioChanges(s, { type: "retype", from: "relates", to: "contains", target: A });
    s = reduceStudioChanges(s, { type: "remove", relation: "contains", target: A });
    expect(s).toEqual([{ op: "remove", relation: "dependsOn", target: A }]);
  });

  it("retype back to the original bearing cancels the change", () => {
    let s = reduceStudioChanges([], { type: "retype", from: "relates", to: "dependsOn", target: B });
    s = reduceStudioChanges(s, { type: "retype", from: "dependsOn", to: "relates", target: B });
    expect(s).toEqual([]);
  });

  it("retyping a freshly-added link just re-places the add", () => {
    let s = reduceStudioChanges([], { type: "add", relation: "isA", target: A });
    s = reduceStudioChanges(s, { type: "retype", from: "isA", to: "contains", target: A });
    expect(s).toEqual([{ op: "add", relation: "contains", target: A }]);
  });

  it("undo removes a pending change by index; clear empties", () => {
    let s: StudioChange[] = [
      { op: "add", relation: "isA", target: A },
      { op: "remove", relation: "relates", target: B },
    ];
    s = reduceStudioChanges(s, { type: "undo", index: 0 });
    expect(s).toEqual([{ op: "remove", relation: "relates", target: B }]);
    expect(reduceStudioChanges(s, { type: "clear" })).toEqual([]);
  });
});

describe("frontmatterEntryMatchesTarget", () => {
  it("matches folder-prefixed, bare tail, and title forms", () => {
    expect(frontmatterEntryMatchesTarget("capabilities/mcp-server", A)).toBe(true);
    expect(frontmatterEntryMatchesTarget("mcp-server", A)).toBe(true);
    expect(frontmatterEntryMatchesTarget("MCP Tool Surface", A)).toBe(true);
    expect(frontmatterEntryMatchesTarget("something-else", A)).toBe(false);
    expect(frontmatterEntryMatchesTarget("", A)).toBe(false);
  });
});

describe("isRelationEditableFromFocal", () => {
  it("is editable when the neighbor is in the focal's own array for that key", () => {
    const fm = { broader: ["capabilities/mcp-server"], relates: ["capabilities/topology"] };
    expect(isRelationEditableFromFocal(fm, "isA", A)).toBe(true);
    expect(isRelationEditableFromFocal(fm, "relates", B)).toBe(true);
  });

  it("is NOT editable when the edge is authored on the other node", () => {
    // focal domain 'contains' a child only because the child said `domain: focal`
    const fm = { kind: "domain", contains: [] };
    expect(isRelationEditableFromFocal(fm, "contains", A)).toBe(false);
    expect(isRelationEditableFromFocal(undefined, "contains", A)).toBe(false);
  });
});

describe("projectBearings", () => {
  it("applies add / remove / retype optimistically and flags pending", () => {
    const base = emptyBase();
    base.relates = [B];
    base.dependsOn = [C];
    const changes: StudioChange[] = [
      { op: "add", relation: "isA", target: A },
      { op: "retype", from: "relates", to: "contains", target: B },
      { op: "remove", relation: "dependsOn", target: C },
    ];
    const r = projectBearings(base, changes);
    expect(r.byRelation.isA.neighbors.map((n) => n.id)).toEqual([A.id]);
    expect(r.byRelation.isA.filled).toBe(true);
    expect(r.byRelation.relates.neighbors).toEqual([]);
    expect(r.byRelation.contains.neighbors.map((n) => n.id)).toEqual([B.id]);
    expect(r.byRelation.dependsOn.neighbors).toEqual([]);
    expect(r.pendingTargetIds).toEqual(new Set([A.id, B.id, C.id]));
    expect(r.pendingRelations.has("relates")).toBe(true);
    expect(r.pendingRelations.has("contains")).toBe(true);
  });

  it("does not mutate the base arrays", () => {
    const base = emptyBase();
    base.isA = [A];
    projectBearings(base, [{ op: "remove", relation: "isA", target: A }]);
    expect(base.isA).toEqual([A]);
  });
});

describe("planRelationRefUpdates", () => {
  const base = (): Record<StudioRelation, string[]> => ({
    isA: [],
    dependsOn: ["elements/parser"],
    contains: [],
    relates: ["capabilities/topology"],
  });

  it("adds, removes, and retypes into the right arrays with dedupe", () => {
    const out = planRelationRefUpdates(base(), [
      { op: "add", relation: "isA", target: A },
      { op: "remove", relation: "dependsOn", target: C },
      { op: "retype", from: "relates", to: "contains", target: B },
    ]);
    expect(out.isA).toEqual(["capabilities/mcp-server"]);
    expect(out.dependsOn).toEqual([]);
    expect(out.relates).toEqual([]);
    expect(out.contains).toEqual(["capabilities/topology"]);
    // untouched relations are omitted
    expect(Object.keys(out).sort()).toEqual(["contains", "dependsOn", "isA", "relates"]);
  });

  it("only returns relations that actually changed", () => {
    const out = planRelationRefUpdates(base(), [{ op: "add", relation: "isA", target: A }]);
    expect(Object.keys(out)).toEqual(["isA"]);
  });
});

// ── ko + en summary vocab (thin fakes standing in for next-intl `t`) ──────────
const REL_KO: Record<StudioRelation, string> = {
  isA: "상위개념",
  dependsOn: "기대는 곳",
  contains: "담는 것",
  relates: "비슷한 것",
};
const REL_EN: Record<StudioRelation, string> = {
  isA: "broader",
  dependsOn: "depends on",
  contains: "contains",
  relates: "related",
};

const koVocab: StudioSummaryVocab = {
  relationLabel: (r) => REL_KO[r],
  addLine: (rel, title) => `'${rel}: ${title}' 추가`,
  moveLine: (title, to) => `'${title}' 를 '${to}' 으로 이동`,
  removeLine: (rel, title) => `'${rel}: ${title}' 끊기`,
  enhanceHeadline: (name, n) => `${name} 에 ${n}가지를 기록해요`,
  enhanceFileEffect: () => "파일 1개 수정.",
  createHeadline: (kind, name, domain) =>
    domain ? `${kind} '${name}' 가 ${domain} 도메인 아래 생겨요` : `${kind} '${name}' 가 생겨요`,
  createFileEffect: (n) => `파일 1개 생성 · 관계 ${n}줄 기록.`,
  collapsedCount: (n) => `기록될 내용 ${n}가지`,
  empty: "기록할 변경이 없어요",
};
const enVocab: StudioSummaryVocab = {
  relationLabel: (r) => REL_EN[r],
  addLine: (rel, title) => `add '${rel}: ${title}'`,
  moveLine: (title, to) => `move '${title}' to '${to}'`,
  removeLine: (rel, title) => `cut '${rel}: ${title}'`,
  enhanceHeadline: (name, n) => `Record ${n} change(s) on ${name}`,
  enhanceFileEffect: () => "1 file modified.",
  createHeadline: (kind, name, domain) =>
    domain ? `New ${kind} '${name}' under ${domain}` : `New ${kind} '${name}'`,
  createFileEffect: (n) => `1 file created · ${n} relation line(s).`,
  collapsedCount: (n) => `${n} change(s) to record`,
  empty: "Nothing staged yet",
};

describe("summarizeStudioChanges — enhance", () => {
  const changes: StudioChange[] = [
    { op: "add", relation: "isA", target: A },
    { op: "retype", from: "relates", to: "dependsOn", target: B },
  ];

  it("ko: headline + plain lines + file effect", () => {
    const s = summarizeStudioChanges({ mode: "enhance", focalName: "CLI Developer Entry", changes }, koVocab);
    expect(s.count).toBe(2);
    expect(s.headline).toBe("CLI Developer Entry 에 2가지를 기록해요");
    expect(s.lines).toEqual(["'상위개념: MCP Tool Surface' 추가", "'Topology Map v2' 를 '기대는 곳' 으로 이동"]);
    expect(s.fileEffect).toBe("파일 1개 수정.");
    expect(s.collapsed).toBe("기록될 내용 2가지");
    expect(s.empty).toBe(false);
  });

  it("en: parallel strings", () => {
    const s = summarizeStudioChanges({ mode: "enhance", focalName: "CLI Developer Entry", changes }, enVocab);
    expect(s.headline).toBe("Record 2 change(s) on CLI Developer Entry");
    expect(s.lines[0]).toBe("add 'broader: MCP Tool Surface'");
    expect(s.lines[1]).toBe("move 'Topology Map v2' to 'depends on'");
  });

  it("remove line renders and empty plan reports empty", () => {
    const s = summarizeStudioChanges(
      { mode: "enhance", focalName: "X", changes: [{ op: "remove", relation: "relates", target: B }] },
      koVocab,
    );
    expect(s.lines).toEqual(["'비슷한 것: Topology Map v2' 끊기"]);
    const none = summarizeStudioChanges({ mode: "enhance", focalName: "X", changes: [] }, koVocab);
    expect(none.empty).toBe(true);
    expect(none.headline).toBe("기록할 변경이 없어요");
    expect(none.fileEffect).toBe("");
  });
});

describe("summarizeStudioChanges — create", () => {
  const changes: StudioChange[] = [
    { op: "add", relation: "contains", target: C },
    { op: "add", relation: "dependsOn", target: A },
  ];

  it("ko: identity headline + relation lines + create file effect", () => {
    const s = summarizeStudioChanges(
      { mode: "create", kindLabel: "capability", name: "결제 취소", domainLabel: "커머스 코어", changes },
      koVocab,
    );
    expect(s.headline).toBe("capability '결제 취소' 가 커머스 코어 도메인 아래 생겨요");
    expect(s.fileEffect).toBe("파일 1개 생성 · 관계 2줄 기록.");
    expect(s.empty).toBe(false);
  });

  it("en: no-domain headline", () => {
    const s = summarizeStudioChanges(
      { mode: "create", kindLabel: "capability", name: "Refund", domainLabel: null, changes: [] },
      enVocab,
    );
    expect(s.headline).toBe("New capability 'Refund'");
    expect(s.fileEffect).toBe("1 file created · 0 relation line(s).");
  });
});
