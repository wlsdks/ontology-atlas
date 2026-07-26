/**
 * Pure view-model helpers for the topology-map-v2 "component datasheet" panel
 * (`docs/TOPOLOGY-V2-DESIGN.md` §5 — agent-handoff differentiation). No React,
 * no i18n, no DOM — so the grouping / metric line / handoff payload are
 * unit-testable on structure alone and stay locale-agnostic.
 *
 * The datasheet re-presents the SAME selection facts the shared popover already
 * derives (`TopologyNodeFocusModel`); the view maps that model into these
 * inputs. This module only groups + formats — it never recomputes counts.
 *
 * R+ 카운트 시맨틱 통일: groups used to split by relation TYPE (containment vs
 * depends) while the metric line above counted by DIRECTION (incoming vs
 * outgoing) — same words ("포함"/"의존" near "쓰는 곳"/"기대는 곳"), two
 * different axes, so the numbers never reconciled (persona finding: header
 * "used by 10 · depends on 73" vs groups "포함 71 / 의존 12"). Groups are now
 * DIRECTION-based too, computed from the exact same connection set the metric
 * line counts — the header count and the group total are the SAME number by
 * construction, not just by convention. Relation TYPE (containment vs depends)
 * demotes to a per-row trace mark (`TopologyV2DetailPanel.tsx`'s `TraceMark`),
 * still visible, just no longer the grouping axis.
 *
 * R+ full-detail A1: the base connection derivation (`buildConnections`/
 * `groupConnectionsByDirection` + structural types) moved to
 * `shared/lib/ontology-tree/connections.ts` so the NEW `full-detail-a1` widget
 * (topology "전체 상세" / `/ontology` full-detail surface) can reuse it too —
 * FSD forbids widget→widget imports, so shared derivation lives one layer
 * down. Re-exported here under the SAME `V2`-prefixed names so this file's
 * existing consumers (`HomePage.tsx`, `TopologyV2DetailPanel`, this module's
 * own tests) needed zero changes.
 */
export {
  buildConnections as buildV2Connections,
  groupConnectionsByDirection as groupV2ConnectionsByDirection,
  type DatasheetConnection as V2DatasheetConnection,
} from "@/shared/lib/ontology-tree/connections";
import { groupConnectionsByRole } from "@/shared/lib/ontology-tree/connections";
import type { DatasheetConnection as V2DatasheetConnection } from "@/shared/lib/ontology-tree/connections";

/**
 * S2 파트 3 — "담는 것" 리스트가 길면(>15) 개별 행 대신 kind·경로 프리픽스별
 * 집계 요약을 보여준다(예: "cli/src/commands 48 · .claude/skills 6 · 기타 12").
 * 순수 결정론: 프리픽스별 카운트 → count 내림차순, 동률은 key 사전순 → 상위
 * `maxGroups` 만 명명, 나머지 + 프리픽스 없는 행은 `otherCount`("기타").
 */
export interface V2ContainsGroupSummary {
  groups: { key: string; count: number }[];
  otherCount: number;
  total: number;
  /**
   * B4 (H1 비개발자 언어 레이어) — 요약이 실제로 정보를 담는가. `false`면 요약이
   * "기타" 한 덩어리로 무너져 정보가 0이라는 뜻 → 패널은 요약 대신 개별 리스트를
   * 렌더한다. 명명 그룹이 하나라도 있으면 `true`.
   */
  usable: boolean;
}

/** "담는 것" 그룹 요약을 켜는 임계 — 이 값을 **초과**하면 요약을 표시한다. */
export const V2_CONTAINS_SUMMARY_THRESHOLD = 15;

/** node id(`kind:slug`)에서 slug 부분만 뽑는다(`kind:` 프리픽스 제거). */
function idToSlug(id: string): string {
  const colon = id.indexOf(":");
  return colon === -1 ? id : id.slice(colon + 1);
}

/** 마지막 슬래시 앞까지의 디렉터리 프리픽스 — 슬래시 없으면 null(기타). 예:
 * `cli/src/commands/add` → `cli/src/commands`. */
function deepPrefixKey(id: string): string | null {
  const slug = idToSlug(id);
  const slash = slug.lastIndexOf("/");
  if (slash === -1) return null;
  return slug.slice(0, slash);
}

/** 첫 경로 세그먼트(1단계) — 슬래시 없으면 null. 예:
 * `cli/src/commands/add` → `cli`, `.claude/skills/x` → `.claude`. 깊은
 * 프리픽스가 전부 count 1로 흩어져 "기타"로 무너질 때 더 굵게 재분할한다. */
function coarsePrefixKey(id: string): string | null {
  const slug = idToSlug(id);
  const slash = slug.indexOf("/");
  if (slash === -1) return null;
  return slug.slice(0, slash);
}

/** 하나의 키 함수로 프리픽스 버킷을 만든다(순수). count 내림차순, 동률 key
 * 사전순. 상위 `cap` 만 명명하고 나머지 + 프리픽스 없는 행은 `otherCount`. */
function bucketByKey(
  rows: readonly V2DatasheetConnection[],
  keyOf: (id: string) => string | null,
  cap: number,
): { groups: { key: string; count: number }[]; otherCount: number } {
  const counts = new Map<string, number>();
  let noPrefix = 0;
  for (const row of rows) {
    const key = keyOf(row.id);
    if (key === null) {
      noPrefix += 1;
      continue;
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0),
  );
  const named = sorted.slice(0, cap);
  let otherCount = noPrefix;
  for (const [, c] of sorted.slice(cap)) otherCount += c;
  return { groups: named.map(([key, count]) => ({ key, count })), otherCount };
}

/**
 * 담는 것 행들을 경로 프리픽스별로 집계한다. 결정론: count 내림차순, 동률은
 * key 사전순. 상위 `maxGroups` 개만 명명하고 나머지 프리픽스 + 프리픽스 없는
 * 행은 `otherCount` 로 합친다.
 *
 * B4 (H1) — 깊은 프리픽스가 전부 흩어져 "기타"가 과반을 먹으면(정보 0),
 * 경로 1단계(첫 세그먼트)로 더 굵게 재분할해 실제로 나뉘는 쪽을 택한다.
 * 그래도 명명 그룹이 하나도 없으면(=슬래시 있는 행이 없음) `usable: false` 로
 * 표시해 패널이 요약 대신 개별 리스트를 렌더하게 한다.
 */
export function summarizeContainsByPathPrefix(
  rows: readonly V2DatasheetConnection[],
  maxGroups: number = 4,
): V2ContainsGroupSummary {
  const total = rows.length;
  const cap = Math.max(0, maxGroups);
  const deep = bucketByKey(rows, deepPrefixKey, cap);

  // "기타"가 과반을 차지하거나 명명 그룹이 없으면 더 굵은 1단계 프리픽스로 재시도.
  let chosen = deep;
  if (deep.groups.length === 0 || deep.otherCount * 2 > total) {
    const coarse = bucketByKey(rows, coarsePrefixKey, cap);
    // 명명 커버리지(= total - otherCount)가 큰 쪽을 택하고, 동률이면 더 구체적인
    // deep 을 유지한다.
    const deepCovered = total - deep.otherCount;
    const coarseCovered = total - coarse.otherCount;
    if (coarseCovered > deepCovered) chosen = coarse;
  }

  return {
    groups: chosen.groups,
    otherCount: chosen.otherCount,
    total,
    usable: chosen.groups.length > 0,
  };
}

/** One relation-role group as the panel renders it: a capped preview of rows +
 * the group's TRUE total (so the header can say "쓰는 곳 23" while showing 6). */
export interface V2ConnectionGroupView {
  rows: V2DatasheetConnection[];
  total: number;
  /**
   * S2 파트 3 — "담는 것" 그룹에만 채워지는 경로 프리픽스 집계(총 행이 임계를
   * 넘을 때 개별 리스트 대신 표시). 전체 행 기준으로 계산(캡 이전).
   */
  summary?: V2ContainsGroupSummary;
}
export interface V2ConnectionGroupsView {
  /** Outgoing containment — plain "담는 것" (what this node contains). */
  contains: V2ConnectionGroupView;
  /** Incoming non-containment — plain "쓰는 곳" (places that use this). */
  usedBy: V2ConnectionGroupView;
  /** Outgoing non-containment — plain "기대는 곳" (places this leans on). */
  dependsOn: V2ConnectionGroupView;
  /**
   * Incoming containment — plain "속한 곳" (the parent(s) this node belongs to).
   *
   * 스코프 정정 (2026-07-26): 이 버킷은 한동안 컴팩트 팝오버에서 렌더되지도,
   * "이어진 곳" 집계에 세어지지도 않았다. 그래서 **부모만 있는 노드**(dogfood
   * 294개 중 221개 = 75%)의 팝오버가 "이어진 곳 0" 이라고 말했다 — 바로 위에
   * 클릭 가능한 도메인 칩을 띄운 채로. 검증 가능한 거짓이라 팝오버도 이 그룹을
   * 그리고 집계에 포함한다(전체 상세와 같은 네 버킷·같은 단어).
   */
  belongsTo: V2ConnectionGroupView;
}

/** Default rows shown per group before the typed "+N" overflow. */
export const V2_CONNECTION_ROW_CAP = 6;

/**
 * Group the full connection set by relation ROLE (contains / usedBy /
 * dependsOn / belongsTo) and cap each group to `perGroupCap` rows, keeping the
 * true total. M-2: containment is pulled into its OWN `contains`/`belongsTo`
 * groups instead of folding into usedBy/dependsOn by raw direction — so a
 * domain's 18 `contains` children read as "담는 것 18", not "기대는 곳". This
 * is the SAME split `buildFullDetailGroups` uses (both delegate to
 * `groupConnectionsByRole`), so the popover and full-detail can never disagree.
 * Callers source `metric.contains`/`usedBy`/`dependsOn` from these `.total`s so
 * the metric line and the group headers stay the same number by construction.
 */
export function buildV2ConnectionGroups(
  connections: readonly V2DatasheetConnection[],
  perGroupCap: number = V2_CONNECTION_ROW_CAP,
): V2ConnectionGroupsView {
  const grouped = groupConnectionsByRole(connections);
  const cap = Math.max(0, perGroupCap);
  const toView = (rows: readonly V2DatasheetConnection[]): V2ConnectionGroupView => ({
    rows: rows.slice(0, cap),
    total: rows.length,
  });
  return {
    // S2 파트 3 — contains 는 전체 행 기준 경로 프리픽스 요약을 함께 싣는다
    // (임계 초과 시 패널이 개별 리스트 대신 이 요약을 렌더).
    contains: { ...toView(grouped.contains), summary: summarizeContainsByPathPrefix(grouped.contains) },
    usedBy: toView(grouped.usedBy),
    dependsOn: toView(grouped.dependsOn),
    belongsTo: toView(grouped.belongsTo),
  };
}

export interface V2MetricValues {
  /** Outgoing containment — plain "담는 것" (what this node contains). Only
   *  rendered when > 0 (leaf nodes contain nothing, so the segment is hidden
   *  for them rather than showing a noisy "담는 것 0"). */
  contains: number;
  /** Direct incoming non-containment — plain "쓰는 곳" (places that use this). */
  usedBy: number;
  /** Direct outgoing non-containment — plain "기대는 곳" (places this leans on). */
  dependsOn: number;
  /**
   * Direct incoming containment — plain "속한 곳" (the parent(s) this node sits
   * inside). 부모만 있는 노드가 대다수라, 이 값이 빠지면 집계가 0 이 된다
   * (`V2ConnectionGroupsView.belongsTo` 주석 참고).
   */
  belongsTo: number;
  /** Node-level evidence references — plain "근거". */
  evidence: number;
}

export interface V2MetricLabels {
  contains: string;
  usedBy: string;
  dependsOn: string;
  belongsTo: string;
  evidence: string;
}

/** One typed segment of the engraved metric line — `key` matches the
 * connection-group id below it (`data-datasheet-group`), so the strip and the
 * groups stay reconciled by construction. */
export interface V2MetricSegment {
  key: "contains" | "usedBy" | "dependsOn" | "belongsTo" | "evidence";
  label: string;
  value: number;
}

/**
 * The ONE engraved metric line's segments — "담는 것 18 · 쓰는 곳 4 · 기대는
 * 곳 2 · 근거 1". Replaces the old subtitle + count boxes (the owner's
 * "정보가 세 번 나온다" complaint); every fact appears exactly once. M-2: the
 * leading "담는 것" segment appears ONLY for container nodes (`contains > 0`)
 * — a leaf's line stays "쓰는 곳 · 기대는 곳 · 근거", so the typed split adds
 * signal for domains without adding a "담는 것 0" to every element.
 *
 * 데이터시트 내부 정제 (2026-07-23) — segments are exposed structured (not
 * only joined) so the panel can set label ink (tertiary) apart from value ink
 * (`--topology-v2-panel-metric-text`): the numbers are the data, the words
 * are the scale markings (Tufte data-ink). Each segment's ink pairing is the
 * SAME pairing the group headers use, which is what visually links a strip
 * count to its group below without any new interaction.
 */
export function buildV2MetricSegments(
  values: V2MetricValues,
  labels: V2MetricLabels,
): V2MetricSegment[] {
  const segments: V2MetricSegment[] = [];
  if (values.contains > 0)
    segments.push({ key: "contains", label: labels.contains, value: values.contains });
  segments.push({ key: "usedBy", label: labels.usedBy, value: values.usedBy });
  segments.push({ key: "dependsOn", label: labels.dependsOn, value: values.dependsOn });
  // "속한 곳"도 "담는 것"과 같은 규칙 — 0 일 때만 감춘다(루트/고아 노드에
  // "속한 곳 0" 을 붙이지 않기 위해). 있는데 감추면 그게 앞서의 결함이다.
  if (values.belongsTo > 0)
    segments.push({ key: "belongsTo", label: labels.belongsTo, value: values.belongsTo });
  segments.push({ key: "evidence", label: labels.evidence, value: values.evidence });
  return segments;
}

/** Joined-string form of `buildV2MetricSegments` — kept for handoff/plain
 * text consumers and as the single source of the "label value · …" grammar. */
export function formatV2MetricLine(
  values: V2MetricValues,
  labels: V2MetricLabels,
): string {
  return buildV2MetricSegments(values, labels)
    .map((s) => `${s.label} ${s.value}`)
    .join(" · ");
}

/** One row in the promoted 근거(evidence) group — RATIO-SYSTEM §4 scale-up
 * ("정보는 좋은데 너무 작고 그래"). Built from `KnowledgeGraphNode.evidenceIds`
 * (a vault slug like "capabilities/product-owner-operating-system" — the
 * node's own backing `.md`, see `derivationToInsight`'s doc comment), split
 * into a readable `title` (the last path segment) and a `path` prefix
 * (everything before it, trailing slash kept) so the row reads like the
 * mockup's doc-link ("PRODUCT-OWNER-OPERATING-SYSTEM.md" / "docs/"). Rows
 * are read-only/informational — evidenceIds are vault slugs, a different
 * namespace than the canvas's graph node ids, so they are not wired to
 * `onSelectConnection`. */
export interface V2EvidenceRow {
  id: string;
  title: string;
  path: string | null;
}

/**
 * Formats raw `evidenceIds` into display rows, one per non-blank id,
 * preserving input order. Pure/no dedup beyond blank-skipping — a node's
 * evidenceIds are already a short, mostly-single-entry list.
 */
export function buildV2EvidenceRows(
  evidenceIds: readonly string[],
): V2EvidenceRow[] {
  const rows: V2EvidenceRow[] = [];
  for (const raw of evidenceIds) {
    const id = raw.trim();
    if (!id) continue;
    const lastSlash = id.lastIndexOf("/");
    if (lastSlash === -1) {
      rows.push({ id, title: id, path: null });
    } else {
      rows.push({ id, title: id.slice(lastSlash + 1), path: id.slice(0, lastSlash + 1) });
    }
  }
  return rows;
}

/**
 * 파일경로형 문자열(슬러그/vault-path)의 마지막 세그먼트만 뽑는다 — sticky
 * 푸터가 전체 slug(`ontology/capabilities/mcp-server`)를 상시 노출하던 것의
 * 정리(Toss C2 청중 언어 평문화, 2026-07-24). `/`가 없으면 원문 그대로
 * 반환(이미 짧으므로 자를 것이 없음). 순수/결정론 — `buildV2EvidenceRows`의
 * title/path 분리와 같은 "마지막 슬래시 기준" 규칙을 재사용한다.
 *
 * 화면엔 이 결과만 보이고 원문 전체는 `title=` 네이티브 툴팁으로 접힌다 —
 * "전체 상세" 링크가 이미 목적지를 담당하므로 정보 손실은 없다(패널 쪽
 * 렌더는 `TopologyV2DetailPanel.tsx`의 sticky 푸터/근거 행 참고).
 */
export function slugDisplaySegment(slug: string): string {
  const lastSlash = slug.lastIndexOf("/");
  return lastSlash === -1 ? slug : slug.slice(lastSlash + 1);
}

export interface V2HandoffInput {
  /** The graph facts and the MCP write target must describe the same source. */
  source: "loaded-vault" | "read-only-sample";
  slug: string;
  /**
   * 이 노드에 자기 `.md` 문서가 있는가. 없으면 `slug` 는 볼트가 적어 둔 참조
   * 원문이라 `get_concept` / `patch_concept` 이 성립하지 않는다 — 그때는
   * 문서를 먼저 만드는 호출을 준다(미지정은 종전대로 문서 있음으로 읽는다).
   */
  documented?: boolean;
  kind: string;
  domainTitle: string | null;
  /** Outgoing containment count (M-2) — `contains` edges, split out from the
   * old direction-only `depends_on` so an agent reading the handoff sees the
   * same typed facts the panel shows. */
  contains: number;
  usedBy: number;
  dependsOn: number;
  /** Incoming containment count — 부모. 이게 빠져 있던 동안 부모만 있는 노드의
   *  핸드오프는 `contains: 0 / used_by: 0 / depends_on: 0` 이라 에이전트에게
   *  "고아 노드" 로 읽혔다(실제로는 도메인·역량 아래 있는 노드). */
  belongsTo: number;
  evidence: number;
  /** Names of the containment-child (contains) group's rows. */
  containsNames: readonly string[];
  /** Names of the incoming non-containment (usedBy) group's rows. */
  usedByNames: readonly string[];
  /** Names of the outgoing non-containment (dependsOn) group's rows. */
  dependsNames: readonly string[];
  /** Names of the incoming containment (belongsTo) group's rows — 부모 이름. */
  belongsToNames: readonly string[];
}

/**
 * Agent-ready handoff payload (MCP/CLI-style) for a single node — the "다음
 * 액션 복사" differentiation. Stable English field keys + a suggested MCP call
 * so it pastes cleanly into a coding agent regardless of UI locale; the button
 * label is localized, this payload is intentionally not. Deterministic.
 *
 * M-2 payload shape change: containment is now its own `contains` /
 * `contains_names` fields, split OUT of `depends_on` / `depends_names` (which
 * previously folded containment children in via the direction-only grouping).
 * `used_by` no longer includes the parent either — the parent is its own
 * `belongs_to` / `belongs_to_names` pair (2026-07-26), so the payload carries
 * the same four typed buckets the panel and the full-detail surface render.
 */
export function formatV2HandoffText(input: V2HandoffInput): string {
  const list = (names: readonly string[]) =>
    names.length > 0 ? names.join(", ") : "-";
  const documented = input.documented !== false;
  const next =
    input.source !== "loaded-vault"
      ? "next: open a markdown vault, then copy a node handoff from that loaded vault"
      : documented
        ? `next: get_concept("${input.slug}") → review context, then patch_concept / add_relation as needed`
        // 문서 없는 파생 노드 — `get_concept` 은 존재하지 않는 이름을 조회하고
        // 끝난다. 볼트가 이 개념을 아는 유일한 형태는 다른 문서가 적어 둔
        // 참조 문자열이므로, 첫 걸음은 그 이름으로 문서를 만드는 것이다.
        : `next: add_concept({slug:"${input.slug}", kind:"${input.kind}"}) — this concept has no document yet; it exists only as a reference written in another doc`;
  return [
    `source: ${input.source}`,
    `node: ${input.slug}`,
    `has_document: ${documented ? "yes" : "no"}`,
    `kind: ${input.kind}`,
    `domain: ${input.domainTitle ?? "-"}`,
    `contains: ${input.contains}`,
    `used_by: ${input.usedBy}`,
    `depends_on: ${input.dependsOn}`,
    `belongs_to: ${input.belongsTo}`,
    `evidence: ${input.evidence}`,
    `contains_names: ${list(input.containsNames)}`,
    `used_by_names: ${list(input.usedByNames)}`,
    `depends_names: ${list(input.dependsNames)}`,
    `belongs_to_names: ${list(input.belongsToNames)}`,
    ...(input.source === "read-only-sample"
      ? [
          "write_guard: do not run get_concept / patch_concept / add_relation for this sample node",
        ]
      : []),
    next,
  ].join("\n");
}
