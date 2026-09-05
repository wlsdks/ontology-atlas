import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  HOME_QUERY_KEYS,
  VAULT_SCOPED_HOME_QUERY_KEYS,
} from "@/views/home/model/url-state";

/**
 * # Declared scope registry — the gate for state that outlived its scope
 *
 * **What this class of defect is.** State that only has meaning within scope X (a
 * vault) survives a change of X and becomes **the input to a false verdict**.
 * Observed in practice:
 *
 * - docs `?slug=` — judging "the requested document does not exist" for a document
 *   nobody requested
 * - editor draft — another vault's body presented as my unsaved change, and when the
 *   bytes match, **saving overwrote someone else's file**
 * - map `?p=` — a non-existent node judged as the selection, dimming the whole map
 * - `?pathFrom`/`?pathTo` — **asserting "no path"** between two non-existent nodes
 * - change baseline and notification read timestamps — per-vault content under a
 *   global key
 *
 * **Why a contract test rather than lint.** The defect is **a relationship between a
 * key and a scope living in another file**, and the failing state leaves no literal
 * behind — a cleanup effect that is *absent* is invisible to an AST selector.
 * `no-restricted-syntax` matches the AST of one file and cannot express this spec
 * (.claude/rules/design.md: layers lint cannot see belong to contract tests).
 *
 * **The registry is the gate.** The two tables below carry **every** URL query key
 * and persistent storage key, one row each. Three checks:
 *
 * 1. a key in the code but not in the registry fails (no new key can appear quietly)
 * 2. a key in the registry but not in the code fails (dead rows do not accumulate)
 * 3. a `vault-scoped` key that is not protected fails — a storage key must be built
 *    through a scope function, and a URL key must be in the cleanup list on a scope
 *    change
 *
 * Precedents: `tests/contract/rules-path-scope.contract.test.ts` (registry as gate)
 * and `src/entities/docs-vault/lib/vault-scope-key.ts` (scoped keys).
 */

// ────────────────────────────────────────────────────────────────────────────
// Scope providers — **which functions count as an exact scope**
// ────────────────────────────────────────────────────────────────────────────

/**
 * Scope providers that separate vaults **exactly**. They distinguish both
 * `local:<folder>` and `sample:<sample>`.
 */
const EXACT_SCOPE_PROVIDERS = [
  "vaultIdentityScope",
  "useVaultIdentityScope",
  "setChangeBaselineScope",
] as const;

/**
 * ⚠️ **`vaultScopeKey()` alone is not a scope.**
 *
 * That function is for the **storage namespace**, so it collapses both samples
 * (dogfood and the example storefront) into a single `'server'`. Using it to decide
 * "did the vault change" means **a sample-to-sample switch is not seen as a change**,
 * and this gate would **certify** the very defect it exists to block.
 *
 * Widening `vaultScopeKey` is not the answer either — that would **move the storage
 * location** of pins, recents, and open tabs, orphaning users' existing lists instead
 * of fixing anything. So only the four already-shipped sites below may use this
 * coarse scope, and **the list is frozen**: a new key can only join by editing this
 * paragraph.
 */
const FROZEN_COARSE_SCOPE_KEYS = new Set([
  "demo:docs-vault:pinned:v1:",
  "demo:docs-vault:recent:v2:",
  "docsVault:openTabs:",
  "docsVault:activeTab:",
]);

// ────────────────────────────────────────────────────────────────────────────
// ① URL query key registry — the map's address vocabulary (`/topology`)
// ────────────────────────────────────────────────────────────────────────────

type Scope = "global" | "vault-scoped";

/**
 * `global` = the value is a **fixed enumeration**, so it means the same in any vault.
 * `vault-scoped` = the value is **a name from this vault**, so after a vault change it
 * points at nothing.
 */
const URL_KEY_REGISTRY: Record<string, { scope: Scope; note: string }> = {
  p: { scope: "vault-scoped", note: "선택 노드/프로젝트 슬러그" },
  c: { scope: "vault-scoped", note: "프로젝트 카테고리 값" },
  hub: { scope: "vault-scoped", note: "허브 노드 슬러그 (오늘 소비처 0 — 잠복)" },
  pathFrom: { scope: "vault-scoped", note: "경로 출발 슬러그" },
  pathTo: { scope: "vault-scoped", note: "경로 도착 슬러그" },
  from: { scope: "vault-scoped", note: "pathFrom 의 옛 별칭" },
  to: { scope: "vault-scoped", note: "pathTo 의 옛 별칭" },
  open: { scope: "vault-scoped", note: "펼친 부모 슬러그 목록" },
  realm: { scope: "vault-scoped", note: "영역 루트 슬러그" },
  impact: { scope: "global", note: "none|upstream|downstream|network" },
  pulse: { scope: "global", note: "all|7d|30d" },
  mode: { scope: "global", note: "overview|focus|path|health" },
  create: { scope: "global", note: "concept 하나뿐인 의도 플래그" },
  workbench: { scope: "global", note: "edit|create 작업대 의도" },
  edit: { scope: "vault-scoped", note: "관계 타입과 대상 노드 슬러그" },
  index: { scope: "global", note: "expanded|collapsed" },
  recent: { scope: "global", note: "auto|1|7|30" },
  via: { scope: "global", note: "인사이트 복귀 마커 — 탭 이름(볼트 무관)" },
  review: { scope: "global", note: "인사이트 큐 행 id — 큐가 매번 파생되므로 볼트 이름이 아니다" },
  ask: { scope: "global", note: "의도 종류 열거" },
};

// ────────────────────────────────────────────────────────────────────────────
// ② Persistent storage key registry
// ────────────────────────────────────────────────────────────────────────────

interface StorageEntry {
  key: string;
  /**
   * `storage` = a localStorage/sessionStorage/IndexedDB key (or its prefix).
   * `event` = a window event name sharing the same namespace — not storage. The
   *   scanner sees only literals and cannot tell them apart, so they are registered
   *   here too (zero blind spots).
   * `legacy` = **an old key no longer in use.** Never read back, only cleaned up once.
   */
  kind: "storage" | "event" | "legacy";
  scope: Scope;
  /** The function name through which a `vault-scoped` storage key receives its scope. */
  scopedBy?: string;
  /** The file declaring the key literal — the "did the declaration move" check reads this. */
  file?: string;
  /**
   * **The test file that locks the behaviour.** Checking whether the scope function's
   * *name appears* in the source does not prove protection — measured 2026-08-01: the
   * scope was removed inside a hook while the file still mentioned the name, and the
   * contract test stayed green. So every key must name a test that actually asserts
   * "a value written in vault A is not visible in vault B". That test is this class's
   * real detector.
   */
  provenBy?: string;
  note: string;
}

const STORAGE_KEY_REGISTRY: StorageEntry[] = [
  // ── State about the app itself (vault-independent) ───────────────────────
  { key: "app-update:dismissed-version", kind: "storage", scope: "global", note: "무시한 업데이트 버전" },
  { key: "app-update:last-check", kind: "storage", scope: "global", note: "업데이트 확인 시각" },
  { key: "atlas.appearance.frameMeter", kind: "storage", scope: "global", note: "프레임 미터 표시 선호" },
  { key: "atlas.appearance.view3d", kind: "storage", scope: "global", note: "3D 보기(지도 돔 뷰) 선호 — 기본 꺼짐(2D)" },
  { key: "atlas.appearance.map-arrangement", kind: "storage", scope: "global", note: "3D 배치 기준: 소유(돔, 기본)/결합(힘 구름)" },
  { key: "atlas.agentActivity.status", kind: "storage", scope: "global", note: "상태 칩 on/off 선호" },
  { key: "atlas.agentActivity.notifications", kind: "storage", scope: "global", note: "알림함 on/off 선호" },
  { key: "atlas.agentActivity.kinds", kind: "storage", scope: "global", note: "음소거한 알림 종류" },
  { key: "ontology-atlas:canvas-background:v1", kind: "storage", scope: "global", note: "캔버스 배경 선호" },
  { key: "ontology-atlas:glyph-set:v1", kind: "storage", scope: "global", note: "글리프 세트 선호" },
  { key: "ontology-atlas:accent:v1", kind: "storage", scope: "global", note: "악센트 팔레트 선호(잉걸/인디고)" },
  { key: "ontology-atlas:footprint:v1", kind: "storage", scope: "global", note: "발자국 트레일 선호" },
  // Expansion affordance, structure, and three numbers. Screen preferences like the
  // footprint and the background, so vault-independent — changing folder must not
  // change my preference for how things expand.
  { key: "ontology-atlas:expand:v1", kind: "storage", scope: "global", note: "확장 어포던스·구조·개수 선호" },
  { key: "atlas.acp-chat.width", kind: "storage", scope: "global", note: "대화 칸 폭 — 이 컴퓨터의 화면 취향이라 볼트를 바꿔도 그대로다" },
  { key: "ontology-atlas:locale", kind: "storage", scope: "global", note: "화면 언어" },
  { key: "ontology-atlas:local-endpoint", kind: "storage", scope: "global", note: "LLM 로컬 엔드포인트" },
  { key: "ontology-atlas:guide-auto-start:v1", kind: "storage", scope: "global", note: "투어 자동 시작 선호" },
  { key: "demo:audience-plain:v1", kind: "storage", scope: "global", note: "평문 레지스터 선호" },
  { key: "demo:left-panel-collapsed:v2", kind: "storage", scope: "global", note: "좌측 패널 접힘 선호" },
  { key: "demo:index-panel-collapsed:v1", kind: "storage", scope: "global", note: "INDEX 접힘 선호" },
  { key: "demo:sigma-hub-rail-open:v1", kind: "storage", scope: "global", note: "허브 레일 열림 선호" },
  { key: "demo:docs-vault:list-collapsed", kind: "storage", scope: "global", note: "문서 목록 접힘 선호" },
  { key: "dev:desktop-shell", kind: "storage", scope: "global", note: "데스크톱 셸 개발 오버라이드" },
  { key: "demo:gesture-hint:dismissed:v1", kind: "storage", scope: "global", note: "제스처 힌트 1회성" },
  { key: "demo:sample-node-hint-dismissed:v1", kind: "storage", scope: "global", note: "샘플 노드 힌트 1회성" },
  { key: "demo:first-run-starter-dismissed:v1", kind: "storage", scope: "global", note: "첫 실행 카드 1회성(세션)" },
  { key: "demo:vault-start-steps-dismissed:v1", kind: "storage", scope: "global", note: "첫 걸음 카드 1회성(세션) — 마지막 걸음을 지나면 거둔다" },
  { key: "vault-open-guide:auto:v1", kind: "storage", scope: "global", note: "폴더 열기 안내 1회성" },
  { key: "guided-tour:v1", kind: "storage", scope: "global", note: "투어 완료 표시" },
  { key: "guided-tour:${destination}:v1", kind: "storage", scope: "global", note: "목적지별 투어 완료 표시" },
  { key: "ontology-atlas:last-route", kind: "storage", scope: "global", note: "**아무도 안 읽는다** — 라우트 복원이 2026-07-30 에 폐기됐다(`locale-redirect.tsx`). 결함이 아니라 죽은 키라 이 등록부는 사실만 적고 삭제는 별건으로 남긴다" },

  // ── Things that *define* the scope (they are the answer to "which vault") ──
  { key: "demo:sample-source:v1", kind: "storage", scope: "global", note: "어느 내장 샘플인가 — 범위의 입력이지 범위 안의 상태가 아니다" },
  { key: "demo:docs-vault:source", kind: "storage", scope: "global", note: "local|server 중 무엇을 보는가" },
  { key: "docs-vault:current-handle", kind: "storage", scope: "global", note: "IndexedDB — 현재 볼트 핸들" },
  { key: "docs-vault:fs-handle:", kind: "storage", scope: "global", note: "IndexedDB store 접두사 — 볼트 핸들 보관" },
  { key: "docs-vault:fs-handle:recent", kind: "storage", scope: "global", note: "IndexedDB — 최근 볼트 핸들" },

  // ── One-shot intent handed from one screen to the next (session) ─────────
  { key: "demo:open-search", kind: "storage", scope: "global", note: "세션 — 검색 팔레트 열기 의도" },
  { key: "demo:open-shortcuts", kind: "storage", scope: "global", note: "세션 — 단축키 시트 열기 의도" },
  { key: "ontology-atlas:route-focus-intent", kind: "storage", scope: "global", note: "세션 — 라우트 이동 후 포커스 대상" },
  { key: "ontology-atlas:settings-locale-focus", kind: "storage", scope: "global", note: "세션 — 설정 시트 언어 칸 포커스" },
  { key: "ontology-atlas:agent-chat-intent:pending", kind: "storage", scope: "global", note: "세션 — 에이전트 목적지에서 지도 대화 도크로 넘기는 실행기 id" },

  // ── Per-vault content — protected by an exact scope ──────────────────────
  {
    key: "demo:change-baseline:v1:",
    kind: "storage",
    scope: "vault-scoped",
    scopedBy: "setChangeBaselineScope",
    file: "src/entities/knowledge-graph/lib/ontology-tree/change-baseline-store.ts",
    provenBy: "src/entities/knowledge-graph/lib/ontology-tree/change-baseline-store.test.ts",
    note: "변경 baseline — 볼트별 그래프 스냅숏",
  },
  {
    // Which unmatched rows this reader chose not to look at. Per vault for the same
    // reason as the read-at slot below: the list of missing names is per folder, so a
    // dismissal in one folder must not hide a different folder's row.
    key: "atlas.insights.unmatchedDismissed:",
    kind: "storage",
    scope: "vault-scoped",
    scopedBy: "useVaultIdentityScope",
    file: "src/views/ontology-insights/lib/unmatched-dismissals.ts",
    provenBy: "src/views/ontology-insights/lib/unmatched-dismissals.test.ts",
    note: "안 맞는 이름 목록에서 이 사람이 숨긴 줄 — 목록이 폴더별이라 숨김도 폴더별",
  },
  {
    key: "ontology-atlas:insights-unmatched-dismissals-change",
    kind: "event",
    scope: "global",
    note: "같은 탭 안에서 숨김 변경을 알리는 이벤트 — 저장 키가 아니다",
  },
  {
    key: "atlas.agentActivity.readAt:",
    kind: "storage",
    scope: "vault-scoped",
    scopedBy: "useVaultIdentityScope",
    file: "src/features/agent-activity/model/read-at-storage.ts",
    provenBy: "src/features/agent-activity/model/read-at-storage.test.ts",
    note: "알림 「여기까지 봤다」 — 피드가 볼트별이라 임계값도 볼트별",
  },

  // ── Per-vault content — protected only by the coarse scope (`vaultScopeKey`) ──
  //    Already-shipped storage locations; widening them orphans users' lists.
  //    The `FROZEN_COARSE_SCOPE_KEYS` paragraph above is the evidence.
  {
    key: "demo:docs-vault:pinned:v1:",
    kind: "storage",
    scope: "vault-scoped",
    scopedBy: "vaultScopeKey",
    file: "src/entities/docs-vault/lib/vault-scope-key.ts",
    provenBy: "src/entities/docs-vault/lib/vault-scope-key.test.ts",
    note: "고정 문서 — 샘플 둘은 같은 자리를 쓴다(알려진 거친 범위)",
  },
  {
    key: "demo:docs-vault:recent:v2:",
    kind: "storage",
    scope: "vault-scoped",
    scopedBy: "vaultScopeKey",
    file: "src/entities/docs-vault/lib/vault-scope-key.ts",
    provenBy: "src/entities/docs-vault/lib/vault-scope-key.test.ts",
    note: "최근 문서 — 위와 같음",
  },
  {
    key: "docsVault:openTabs:",
    kind: "storage",
    scope: "vault-scoped",
    scopedBy: "vaultScopeKey",
    file: "src/views/docs-vault/lib/doc-tabs.ts",
    provenBy: "src/views/docs-vault/lib/doc-tabs.test.ts",
    note: "열린 탭 — 호출부가 `sourceKey` 이름으로 recentKey(=vaultScopeKey)를 넘긴다",
  },
  {
    key: "docsVault:activeTab:",
    kind: "storage",
    scope: "vault-scoped",
    scopedBy: "vaultScopeKey",
    file: "src/views/docs-vault/lib/doc-tabs.ts",
    provenBy: "src/views/docs-vault/lib/doc-tabs.test.ts",
    note: "활성 탭 — 위와 같음",
  },

  // ── Per-vault content that is **not protected** (see KNOWN_UNPROTECTED below) ──
  {
    key: "ontology-atlas:docs-vault-editor-draft:",
    kind: "storage",
    scope: "vault-scoped",
    file: "src/widgets/docs-vault/ui/DocsVaultEditor.tsx",
    note: "에디터 초안 — 데이터 손실 경로. PR #827 이 고치는 중",
  },
  {
    key: "demo:recent-search-slugs:v1",
    kind: "storage",
    scope: "vault-scoped",
    file: "src/widgets/search-palette/ui/SearchPalette.tsx",
    note: "최근 검색 슬러그 — 소비처가 현재 노드와 교집합으로 걸러 피해가 작다",
  },

  // ── Legacy keys — never read back ────────────────────────────────────────
  {
    key: "demo:change-baseline:v1",
    kind: "legacy",
    scope: "global",
    note: "볼트를 모르던 시절의 전역 baseline. 어느 볼트 것인지 알 수 없어 되읽지 않고 한 번 치운다",
  },
  {
    key: "atlas.agentActivity.readAt",
    kind: "legacy",
    scope: "global",
    note: "볼트를 모르던 시절의 전역 읽음 시각. 위와 같음",
  },
  {
    key: "demo:docs-vault:recent:v1",
    kind: "legacy",
    scope: "global",
    note: "최근 문서 v1 — v2 로 마이그레이션 후 읽고 치우기만 한다",
  },

  // ── Event names (not storage — registered here because they share the namespace) ──
  { key: "ontology-atlas:agent-activity-read", kind: "event", scope: "global", note: "읽음 표시 브로드캐스트" },
  { key: "ontology-atlas:appearance-preference-change", kind: "event", scope: "global", note: "" },
  { key: "ontology-atlas:audience-preference-change", kind: "event", scope: "global", note: "" },
  { key: "ontology-atlas:guide-auto-start-change", kind: "event", scope: "global", note: "" },
  { key: "ontology-atlas:local-endpoint-change", kind: "event", scope: "global", note: "" },
  {
    key: "ontology-atlas:navigation-intent",
    kind: "event",
    scope: "global",
    note: "이동 시작 — 상시 rAF 루프가 프레임 예산을 비켜 준다 (shared/lib/navigation-intent.ts)",
  },
  { key: "ontology-atlas:secret-change", kind: "event", scope: "global", note: "" },
  { key: "ontology-atlas:settings-view-intent", kind: "event", scope: "global", note: "설정 시트 드릴인 요청" },
  { key: "ontology-atlas:agent-chat-intent", kind: "event", scope: "global", note: "설정 → 대화 열기 요청 (위 신호의 반대 방향)" },
  { key: "ontology-atlas:verify-edge-selected", kind: "event", scope: "global", note: "e2e 검증 훅" },
  { key: "ontology-atlas:verify-select-edge", kind: "event", scope: "global", note: "e2e 검증 훅" },
];

/**
 * **Knowingly unfixed today** — each row carries its reason.
 *
 * Why this list exists: naming what is unprotected is more honest than a gate that
 * claims everything is protected. A new violation is not on this list and therefore
 * fails immediately. The ceiling (`MAX_KNOWN_UNPROTECTED`) is a ratchet, so the list
 * cannot grow — and when it shrinks (a repair merges) it passes quietly.
 */
const KNOWN_UNPROTECTED: Record<string, string> = {
  "ontology-atlas:docs-vault-editor-draft:":
    "PR #827 이 볼트 범위를 넣는 중 — 이 브랜치의 base(origin/main)에는 아직 없다",
  "demo:recent-search-slugs:v1":
    "소비처가 현재 노드와 교집합으로 걸러 화면에 거짓이 안 뜬다 — 수리 우선순위 낮음",
};
const MAX_KNOWN_UNPROTECTED = 2;

// ────────────────────────────────────────────────────────────────────────────
// Scanner — key literals that really exist in the code
// ────────────────────────────────────────────────────────────────────────────

const REPO_ROOT = join(__dirname, "..", "..");

/**
 * The namespaces storage keys live in — every prefix this app uses. A key created
 * under a new prefix is invisible to the scanner, so such a key must widen this list
 * first.
 */
const KEY_NAMESPACE_SHAPE =
  /^(demo:|ontology-atlas:|atlas\.|atlas:|docs-vault:|docsVault:|guided-tour:|app-update:|dev:|vault-open-guide:)[A-Za-z0-9:._$%{}-]*$/;

function sourceFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      if (/\.(test|spec)\.tsx?$/.test(entry.name)) continue;
      if (path.includes("__tests__")) continue;
      files.push(path);
    }
  };
  walk(join(REPO_ROOT, "src"));
  walk(join(REPO_ROOT, "app"));
  return files;
}

/** An example string inside a comment is not a key — blanked out while preserving offsets. */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, lead: string) =>
      lead + " ".repeat(m.length - lead.length),
    );
}

function scanKeyLiterals(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of sourceFiles()) {
    const text = stripComments(readFileSync(file, "utf8"));
    const literal = /(["'`])([^"'`\n]*)\1/g;
    let match: RegExpExecArray | null;
    while ((match = literal.exec(text)) !== null) {
      const value = match[2];
      if (!KEY_NAMESPACE_SHAPE.test(value)) continue;
      const relative = file.slice(REPO_ROOT.length + 1);
      const paths = found.get(value) ?? [];
      if (!paths.includes(relative)) paths.push(relative);
      found.set(value, paths);
    }
  }
  return found;
}

const SCANNED = scanKeyLiterals();
const REGISTERED = new Map(STORAGE_KEY_REGISTRY.map((entry) => [entry.key, entry]));

// ────────────────────────────────────────────────────────────────────────────
// Checks
// ────────────────────────────────────────────────────────────────────────────

describe("범위 등록부 — URL 쿼리 키", () => {
  it("지도의 모든 쿼리 키가 등록돼 있다", () => {
    const declared = new Set(Object.values(HOME_QUERY_KEYS));
    const registered = new Set(Object.keys(URL_KEY_REGISTRY));

    const unregistered = [...declared].filter((key) => !registered.has(key));
    expect(
      unregistered,
      "새 쿼리 키를 만들었으면 URL_KEY_REGISTRY 에 global/vault-scoped 를 적어라",
    ).toEqual([]);
  });

  it("등록부에 죽은 줄이 없다", () => {
    const declared = new Set<string>(Object.values(HOME_QUERY_KEYS));
    const dead = Object.keys(URL_KEY_REGISTRY).filter((key) => !declared.has(key));
    expect(dead, "HOME_QUERY_KEYS 에서 사라진 키는 등록부에서도 지운다").toEqual([]);
  });

  /**
   * The tag must match the actual cleanup list. A mismatch leaves the registry saying
   * "protected" while the code clears nothing — precisely where a gate certifies a
   * defect.
   */
  it("vault-scoped 로 태그된 키가 곧 정리 목록이다", () => {
    const tagged = Object.entries(URL_KEY_REGISTRY)
      .filter(([, meta]) => meta.scope === "vault-scoped")
      .map(([key]) => key)
      .sort();
    expect(tagged).toEqual([...VAULT_SCOPED_HOME_QUERY_KEYS].sort());
  });

  /**
   * Testing the pure predicate alone **cannot see missing wiring** — the function is
   * green while the screen is unchanged. So the source is checked for consumers really
   * calling it (precedent: `rules-path-scope.contract.test.ts`).
   */
  it("판정 함수들이 지도에 실제로 배선돼 있다", () => {
    const homePage = readFileSync(
      join(REPO_ROOT, "src/views/home/ui/HomePage.tsx"),
      "utf8",
    );
    for (const wired of [
      // On a vault change, clear vault-specific address state
      "clearVaultScopedRouteState",
      "useVaultSessionIdentityScope",
      // Never hand a non-existent node through as the focus
      "resolveCanvasSelectedSlug",
      // Never assert "no path" for non-existent endpoints, and never pass them to the agent
      "resolveTopologyPathChipState",
      "canCopyTopologyPathPacket",
    ]) {
      expect(homePage, `${wired} 이 HomePage 에 배선되지 않았다`).toContain(wired);
    }
  });
});

describe("범위 등록부 — 영속 저장 키", () => {
  it("등록부에 없는 키 리터럴이 코드에 없다", () => {
    const unregistered = [...SCANNED.entries()]
      .filter(([key]) => !REGISTERED.has(key))
      .map(([key, paths]) => `${key}  (${paths.join(", ")})`);
    expect(
      unregistered,
      "새 저장 키/이벤트를 만들었으면 STORAGE_KEY_REGISTRY 에 한 줄 적어라",
    ).toEqual([]);
  });

  it("등록부에 죽은 줄이 없다", () => {
    const dead = STORAGE_KEY_REGISTRY.filter((entry) => !SCANNED.has(entry.key)).map(
      (entry) => entry.key,
    );
    expect(dead, "코드에서 사라진 키는 등록부에서도 지운다").toEqual([]);
  });

  it("등록부가 선언한 파일에 그 키가 실제로 있다", () => {
    const misplaced: string[] = [];
    for (const entry of STORAGE_KEY_REGISTRY) {
      if (!entry.file) continue;
      const paths = SCANNED.get(entry.key) ?? [];
      if (!paths.includes(entry.file)) {
        misplaced.push(`${entry.key} → ${entry.file} (실제: ${paths.join(", ")})`);
      }
    }
    expect(misplaced).toEqual([]);
  });

  /**
   * **`vaultScopeKey` is not an exact scope.** Without this test the registry certifies
   * a key that collapses the two samples as "protected" — the gate approving the defect
   * it exists to block.
   */
  it("거친 범위(vaultScopeKey)는 얼어 있는 네 자리에서만 허용된다", () => {
    const offenders = STORAGE_KEY_REGISTRY.filter(
      (entry) =>
        entry.scopedBy === "vaultScopeKey" && !FROZEN_COARSE_SCOPE_KEYS.has(entry.key),
    ).map((entry) => entry.key);
    expect(
      offenders,
      "vaultScopeKey 는 샘플 둘을 'server' 로 뭉뚱그린다 — 새 키는 vaultIdentityScope 를 써라",
    ).toEqual([]);
  });

  it("얼어 있는 네 자리 목록이 늘지 않았다", () => {
    expect([...FROZEN_COARSE_SCOPE_KEYS].sort()).toEqual([
      "demo:docs-vault:pinned:v1:",
      "demo:docs-vault:recent:v2:",
      "docsVault:activeTab:",
      "docsVault:openTabs:",
    ]);
  });

  /**
   * **The evidence of protection is a test.** Checking whether the scope function's
   * name appears in the source passed in a real measurement (see the
   * `StorageEntry.provenBy` comment). So each key names a test file asserting "a value
   * written in vault A is not visible in vault B", and this check only verifies that
   * file exists and really handles that key — what turns red on a revert is **that
   * test**, not this one.
   */
  it("vault-scoped 저장 키는 행동으로 잠긴 시험을 지목한다", () => {
    const unprotected: string[] = [];
    for (const entry of STORAGE_KEY_REGISTRY) {
      if (entry.kind !== "storage" || entry.scope !== "vault-scoped") continue;
      if (entry.key in KNOWN_UNPROTECTED) continue;

      if (!entry.scopedBy || !entry.provenBy) {
        unprotected.push(`${entry.key} — scopedBy/provenBy 미선언`);
        continue;
      }
      // It must be a prefix — with no room for a scope suffix it cannot receive one.
      if (!entry.key.endsWith(":")) {
        unprotected.push(`${entry.key} — 접두사가 아니라 붙일 자리가 없다`);
        continue;
      }
      let proof: string;
      try {
        proof = readFileSync(join(REPO_ROOT, entry.provenBy), "utf8");
      } catch {
        unprotected.push(`${entry.key} — 시험 파일 ${entry.provenBy} 가 없다`);
        continue;
      }
      if (!proof.includes(entry.key)) {
        unprotected.push(`${entry.key} — ${entry.provenBy} 이 이 키를 다루지 않는다`);
      }
    }
    expect(unprotected).toEqual([]);
  });

  it("보호되는 vault-scoped 키는 정확한 범위 제공자를 쓴다 (거친 네 자리 제외)", () => {
    const wrong = STORAGE_KEY_REGISTRY.filter((entry) => {
      if (entry.kind !== "storage" || entry.scope !== "vault-scoped") return false;
      if (entry.key in KNOWN_UNPROTECTED) return false;
      if (FROZEN_COARSE_SCOPE_KEYS.has(entry.key)) return false;
      return !EXACT_SCOPE_PROVIDERS.includes(
        entry.scopedBy as (typeof EXACT_SCOPE_PROVIDERS)[number],
      );
    }).map((entry) => `${entry.key} (scopedBy=${entry.scopedBy})`);
    expect(wrong).toEqual([]);
  });

  it("알면서 안 고친 목록은 늘지 않는다 (래칫)", () => {
    const listed = Object.keys(KNOWN_UNPROTECTED);
    expect(listed.length).toBeLessThanOrEqual(MAX_KNOWN_UNPROTECTED);
    for (const key of listed) {
      expect(REGISTERED.get(key)?.scope, `${key} 는 등록부에 vault-scoped 로 있어야 한다`).toBe(
        "vault-scoped",
      );
      expect(KNOWN_UNPROTECTED[key].length, `${key} 에 이유가 없다`).toBeGreaterThan(10);
    }
  });

  it("옛 키는 되읽히지 않는다 — 제거만 한다", () => {
    for (const entry of STORAGE_KEY_REGISTRY) {
      if (entry.kind !== "legacy") continue;
      for (const file of SCANNED.get(entry.key) ?? []) {
        const source = stripComments(readFileSync(join(REPO_ROOT, file), "utf8"));
        // Reading `demo:docs-vault:recent:v1` is legitimate because it is a migration.
        if (entry.key === "demo:docs-vault:recent:v1") continue;
        const readsIt = new RegExp(
          `getItem\\(\\s*["'\`]${entry.key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
        ).test(source);
        expect(readsIt, `${entry.key} 를 ${file} 이 되읽는다`).toBe(false);
      }
    }
  });
});
