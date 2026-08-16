import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  HOME_QUERY_KEYS,
  VAULT_SCOPED_HOME_QUERY_KEYS,
} from "@/views/home/model/url-state";

/**
 * # 선언된 범위 등록부 — 「범위를 넘긴 상태」의 게이트
 *
 * ## 이 부류가 무엇인가
 *
 * **범위를 넘긴 상태**: 어떤 상태가 범위 X(볼트)에서만 뜻이 있는데, X 가 바뀌어도
 * 살아남아 **거짓 판정의 입력**이 된다. 실제로 관측된 것들:
 *
 * - 문서함 `?slug=` — 아무도 요청하지 않은 문서를 "요청한 문서가 없다" 로 판정
 * - 에디터 초안 — 남의 볼트 본문이 내 미저장 변경으로 제시되고, 바이트가 같으면
 *   **저장이 남의 파일을 덮어썼다**
 * - 지도 `?p=` — 없는 노드를 선택으로 판정해 지도가 통째로 흐려짐
 * - `?pathFrom`/`?pathTo` — 없는 노드 둘을 놓고 **「경로 없음」이라고 단언**
 * - 변경 baseline · 알림 읽음 시각 — 볼트별 내용인데 전역 키
 *
 * ## 왜 lint 가 아니라 계약 테스트인가
 *
 * 결함이 **키와 다른 파일에 사는 범위 사이의 관계**이고, 실패 상태가 리터럴을
 * 남기지 않는다 — *없는* 정리 effect 는 AST 셀렉터에 보이지 않는다.
 * `no-restricted-syntax` 는 한 파일의 AST 매칭이라 이 규격을 표현할 수 없다
 * (`design.md` "lint 가 못 보는 층은 계약 테스트가 맡는다").
 *
 * ## 등록부가 곧 게이트
 *
 * 아래 두 표가 **모든** URL 쿼리 키와 영속 저장 키를 한 줄씩 담는다. 검사는 셋:
 *
 * 1. 등록부에 없는 키가 코드에 있으면 실패 (새 키를 몰래 만들 수 없다)
 * 2. 등록부에 있는데 코드에 없으면 실패 (죽은 줄이 쌓이지 않는다)
 * 3. `vault-scoped` 인데 보호되지 않으면 실패 — 저장 키는 범위 함수를 거쳐
 *    만들어졌는가, URL 키는 범위 변화 시 정리 목록에 있는가
 *
 * 선례: `tests/contract/rules-path-scope.contract.test.ts`(등록부가 곧 게이트) ·
 * `src/entities/docs-vault/lib/vault-scope-key.ts`(범위 키의 선례).
 */

// ────────────────────────────────────────────────────────────────────────────
// 범위 제공자 — **어떤 함수가 "정확한 범위" 인가**
// ────────────────────────────────────────────────────────────────────────────

/**
 * 볼트를 **정확히** 가르는 범위 제공자. `local:<폴더>` 와 `sample:<샘플>` 을
 * 모두 구별한다.
 */
const EXACT_SCOPE_PROVIDERS = [
  "vaultIdentityScope",
  "useVaultIdentityScope",
  "setChangeBaselineScope",
] as const;

/**
 * ⚠️ **`vaultScopeKey()` 만으로는 범위가 아니다.**
 *
 * 그 함수는 **저장 namespace** 용이라 샘플 둘(도그푸드 · 예시 쇼핑몰)을
 * `'server'` 하나로 뭉뚱그린다. 그것을 "볼트가 바뀌었나" 의 판정에 쓰면
 * **샘플↔샘플 전환이 변화로 안 잡히고**, 이 게이트는 자기가 막으려던 결함을
 * 그대로 **인증**하게 된다.
 *
 * 그렇다고 `vaultScopeKey` 를 넓히지도 않는다 — 그건 핀 · 최근 · 열린 탭의
 * **저장 자리를 옮기는 일**이라, 고치는 대신 사용자의 기존 목록을 고아로
 * 만든다. 그래서 이미 배포된 아래 네 자리만 이 거친 범위를 쓸 수 있고,
 * **목록은 얼어 있다** — 새 키가 여기 들어오려면 이 문단을 고쳐야 한다.
 */
const FROZEN_COARSE_SCOPE_KEYS = new Set([
  "demo:docs-vault:pinned:v1:",
  "demo:docs-vault:recent:v2:",
  "docsVault:openTabs:",
  "docsVault:activeTab:",
]);

// ────────────────────────────────────────────────────────────────────────────
// ① URL 쿼리 키 등록부 — 지도(`/topology`)의 주소 어휘
// ────────────────────────────────────────────────────────────────────────────

type Scope = "global" | "vault-scoped";

/**
 * `global` = 값이 **고정된 열거**라 어느 볼트에서나 같은 뜻.
 * `vault-scoped` = 값이 **이 볼트의 이름**이라, 볼트가 바뀌면 아무것도 안 가리킨다.
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
  index: { scope: "global", note: "expanded|collapsed" },
  recent: { scope: "global", note: "auto|1|7|30" },
  via: { scope: "global", note: "인사이트 복귀 마커 — 탭 이름(볼트 무관)" },
  review: { scope: "global", note: "인사이트 큐 행 id — 큐가 매번 파생되므로 볼트 이름이 아니다" },
  ask: { scope: "global", note: "의도 종류 열거" },
};

// ────────────────────────────────────────────────────────────────────────────
// ② 영속 저장 키 등록부
// ────────────────────────────────────────────────────────────────────────────

interface StorageEntry {
  key: string;
  /**
   * `storage` = localStorage/sessionStorage/IndexedDB 키(또는 그 접두사).
   * `event` = 같은 namespace 를 쓰는 window 이벤트 이름 — 저장이 아니다.
   *   스캐너가 리터럴만 보고는 둘을 못 가르므로 여기 함께 등재한다(사각지대 0).
   * `legacy` = **더 이상 쓰지 않는 옛 키.** 되읽지 않고, 한 번 치우기만 한다.
   */
  kind: "storage" | "event" | "legacy";
  scope: Scope;
  /** `vault-scoped` 저장 키가 범위를 받는 함수 이름. */
  scopedBy?: string;
  /** 키 리터럴을 선언한 파일 — "선언 자리가 옮겨졌나" 검사가 이걸 본다. */
  file?: string;
  /**
   * **행동으로 잠근 시험 파일.** 소스에 범위 함수 *이름이 있는지* 보는 검사는
   * 보호를 증명하지 못한다 — 실측(2026-08-01): 훅 안에서 범위를 떼어냈는데
   * 파일이 여전히 그 이름을 언급해 계약 시험이 초록이었다. 그래서 각 키는
   * "볼트 A 에 쓴 값이 볼트 B 에서 안 보인다" 를 실제로 단언하는 시험을
   * 지목해야 한다. 그 시험이 이 부류의 진짜 탐지기다.
   */
  provenBy?: string;
  note: string;
}

const STORAGE_KEY_REGISTRY: StorageEntry[] = [
  // ── 앱 자체에 대한 상태 (볼트 무관) ─────────────────────────────────────
  { key: "app-update:dismissed-version", kind: "storage", scope: "global", note: "무시한 업데이트 버전" },
  { key: "app-update:last-check", kind: "storage", scope: "global", note: "업데이트 확인 시각" },
  { key: "atlas.appearance.frameMeter", kind: "storage", scope: "global", note: "프레임 미터 표시 선호" },
  { key: "atlas.agentActivity.status", kind: "storage", scope: "global", note: "상태 칩 on/off 선호" },
  { key: "atlas.agentActivity.notifications", kind: "storage", scope: "global", note: "알림함 on/off 선호" },
  { key: "atlas.agentActivity.kinds", kind: "storage", scope: "global", note: "음소거한 알림 종류" },
  { key: "ontology-atlas:canvas-background:v1", kind: "storage", scope: "global", note: "캔버스 배경 선호" },
  { key: "ontology-atlas:glyph-set:v1", kind: "storage", scope: "global", note: "글리프 세트 선호" },
  { key: "ontology-atlas:footprint:v1", kind: "storage", scope: "global", note: "발자국 트레일 선호" },
  // 확장 어포던스·구조·세 숫자. 발자국·배경과 같은 화면 취향이라 볼트와 무관하다 —
  // 폴더를 바꿔도 "펼치는 방식"에 대한 내 선호는 그대로여야 한다.
  { key: "ontology-atlas:expand:v1", kind: "storage", scope: "global", note: "확장 어포던스·구조·개수 선호" },
  { key: "atlas.acp-chat.width", kind: "storage", scope: "global", note: "대화 칸 폭 — 이 컴퓨터의 화면 취향이라 볼트를 바꿔도 그대로다" },
  { key: "ontology-atlas:locale", kind: "storage", scope: "global", note: "화면 언어" },
  { key: "ontology-atlas:local-endpoint", kind: "storage", scope: "global", note: "LLM 로컬 엔드포인트" },
  { key: "ontology-atlas:agent-config-scope", kind: "storage", scope: "global", note: "MCP 설정 적용 범위(project|global)" },
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

  // ── 범위를 *정의*하는 것들 (그 자체가 "어느 볼트인가" 의 답) ──────────
  { key: "demo:sample-source:v1", kind: "storage", scope: "global", note: "어느 내장 샘플인가 — 범위의 입력이지 범위 안의 상태가 아니다" },
  { key: "demo:docs-vault:source", kind: "storage", scope: "global", note: "local|server 중 무엇을 보는가" },
  { key: "docs-vault:current-handle", kind: "storage", scope: "global", note: "IndexedDB — 현재 볼트 핸들" },
  { key: "docs-vault:fs-handle:", kind: "storage", scope: "global", note: "IndexedDB store 접두사 — 볼트 핸들 보관" },
  { key: "docs-vault:fs-handle:recent", kind: "storage", scope: "global", note: "IndexedDB — 최근 볼트 핸들" },

  // ── 한 화면에서 다음 화면으로 넘기는 1회성 의도 (세션) ────────────────
  { key: "demo:open-search", kind: "storage", scope: "global", note: "세션 — 검색 팔레트 열기 의도" },
  { key: "demo:open-shortcuts", kind: "storage", scope: "global", note: "세션 — 단축키 시트 열기 의도" },
  { key: "ontology-atlas:route-focus-intent", kind: "storage", scope: "global", note: "세션 — 라우트 이동 후 포커스 대상" },
  { key: "ontology-atlas:settings-locale-focus", kind: "storage", scope: "global", note: "세션 — 설정 시트 언어 칸 포커스" },

  // ── 볼트별 내용 — 정확한 범위로 보호됨 ────────────────────────────────
  {
    key: "demo:change-baseline:v1:",
    kind: "storage",
    scope: "vault-scoped",
    scopedBy: "setChangeBaselineScope",
    file: "src/shared/lib/ontology-tree/change-baseline-store.ts",
    provenBy: "src/shared/lib/ontology-tree/change-baseline-store.test.ts",
    note: "변경 baseline — 볼트별 그래프 스냅숏",
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

  // ── 볼트별 내용 — 거친 범위(`vaultScopeKey`)로만 보호됨 ───────────────
  //    이미 배포된 저장 자리라 넓히면 사용자 목록이 고아가 된다.
  //    위 `FROZEN_COARSE_SCOPE_KEYS` 문단이 근거.
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

  // ── 볼트별 내용인데 **보호되지 않음** (아래 KNOWN_UNPROTECTED 참조) ────
  {
    key: "ontology-atlas:docs-vault-editor-draft:",
    kind: "storage",
    scope: "vault-scoped",
    file: "src/widgets/docs-vault/ui/DocsVaultEditor.tsx",
    note: "에디터 초안 — 데이터 손실 경로. PR #827 이 고치는 중",
  },
  {
    key: "ontology-atlas:studio-drafts:v1",
    kind: "storage",
    scope: "vault-scoped",
    file: "src/views/ontology-studio/lib/studio-draft-store.ts",
    note: "공방 초안 — 소비처가 현재 그래프와 교집합으로 걸러 피해가 작다",
  },
  {
    key: "ontology-atlas:studio-create-draft",
    kind: "storage",
    scope: "vault-scoped",
    file: "src/views/ontology-studio/lib/create-draft-store.ts",
    note: "공방 생성 초안 — 세션 저장이라 탭과 함께 죽지만, 같은 탭에서 볼트를 바꾸면 남의 초안이 뜬다",
  },
  {
    key: "demo:recent-search-slugs:v1",
    kind: "storage",
    scope: "vault-scoped",
    file: "src/widgets/search-palette/ui/SearchPalette.tsx",
    note: "최근 검색 슬러그 — 소비처가 현재 노드와 교집합으로 걸러 피해가 작다",
  },

  // ── 옛 키 — 되읽지 않는다 ────────────────────────────────────────────
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

  // ── 이벤트 이름 (저장이 아니다 — 같은 namespace 라 함께 등재) ─────────
  { key: "ontology-atlas:agent-activity-read", kind: "event", scope: "global", note: "읽음 표시 브로드캐스트" },
  { key: "ontology-atlas:appearance-preference-change", kind: "event", scope: "global", note: "" },
  { key: "ontology-atlas:audience-preference-change", kind: "event", scope: "global", note: "" },
  { key: "ontology-atlas:guide-auto-start-change", kind: "event", scope: "global", note: "" },
  { key: "ontology-atlas:local-endpoint-change", kind: "event", scope: "global", note: "" },
  { key: "ontology-atlas:secret-change", kind: "event", scope: "global", note: "" },
  { key: "ontology-atlas:settings-view-intent", kind: "event", scope: "global", note: "설정 시트 드릴인 요청" },
  { key: "ontology-atlas:studio-draft-change", kind: "event", scope: "global", note: "" },
  { key: "ontology-atlas:studio-url-change", kind: "event", scope: "global", note: "" },
  { key: "ontology-atlas:verify-edge-selected", kind: "event", scope: "global", note: "e2e 검증 훅" },
  { key: "ontology-atlas:verify-select-edge", kind: "event", scope: "global", note: "e2e 검증 훅" },
];

/**
 * **오늘 알면서 안 고친 것** — 각 줄에 이유가 있다.
 *
 * 이 목록이 있는 이유: 게이트가 "모두 보호됨" 이라고 거짓말하는 것보다, 무엇이
 * 안 보호됐는지 이름으로 적혀 있는 편이 정직하다. 새 위반은 여기 없으므로 즉시
 * 실패한다. 상한(`MAX_KNOWN_UNPROTECTED`)이 래칫이라 목록은 늘지 못한다 —
 * 줄어들 때는(수리가 머지되면) 조용히 통과한다.
 */
const KNOWN_UNPROTECTED: Record<string, string> = {
  "ontology-atlas:docs-vault-editor-draft:":
    "PR #827 이 볼트 범위를 넣는 중 — 이 브랜치의 base(origin/main)에는 아직 없다",
  "ontology-atlas:studio-drafts:v1":
    "소비처가 현재 그래프와 교집합으로 걸러 화면에 거짓이 안 뜬다 — 수리 우선순위 낮음",
  "ontology-atlas:studio-create-draft":
    "세션 저장이라 탭과 함께 죽는다 — 같은 탭 안 볼트 전환에서만 샌다",
  "demo:recent-search-slugs:v1":
    "소비처가 현재 노드와 교집합으로 걸러 화면에 거짓이 안 뜬다 — 수리 우선순위 낮음",
};
const MAX_KNOWN_UNPROTECTED = 4;

// ────────────────────────────────────────────────────────────────────────────
// 스캐너 — 코드에 실재하는 키 리터럴
// ────────────────────────────────────────────────────────────────────────────

const REPO_ROOT = join(__dirname, "..", "..");

/**
 * 저장 키가 사는 namespace. 이 앱이 쓰는 접두사 전부 — 새 접두사로 키를 만들면
 * 스캐너가 못 보므로, 그런 키는 여기부터 넓혀야 한다.
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

/** 주석 안의 예시 문자열은 키가 아니다 — 자리를 유지한 채 지운다. */
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
// 검사
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
   * 태그가 실제 정리 목록과 일치해야 한다. 어긋나면 등록부는 "보호된다" 고
   * 적혀 있는데 코드는 아무것도 안 걷어내는 상태가 된다 — 게이트가 결함을
   * 인증하는 바로 그 자리.
   */
  it("vault-scoped 로 태그된 키가 곧 정리 목록이다", () => {
    const tagged = Object.entries(URL_KEY_REGISTRY)
      .filter(([, meta]) => meta.scope === "vault-scoped")
      .map(([key]) => key)
      .sort();
    expect(tagged).toEqual([...VAULT_SCOPED_HOME_QUERY_KEYS].sort());
  });

  /**
   * 순수 판정 함수만 시험하면 **배선이 빠진 것을 못 본다** — 함수는 초록인데
   * 화면은 옛날 그대로일 수 있다. 그래서 소비처가 실제로 그 함수를 부르는지
   * 소스로 확인한다(선례: `rules-path-scope.contract.test.ts`).
   */
  it("판정 함수들이 지도에 실제로 배선돼 있다", () => {
    const homePage = readFileSync(
      join(REPO_ROOT, "src/views/home/ui/HomePage.tsx"),
      "utf8",
    );
    for (const wired of [
      // 볼트가 바뀌면 볼트 전용 주소 상태를 걷어낸다
      "clearVaultScopedRouteState",
      "useVaultIdentityScope",
      // 없는 노드를 포커스로 넘기지 않는다
      "resolveCanvasSelectedSlug",
      // 없는 끝점을 「경로 없음」이라 단언하지 않고, 에이전트에게도 안 넘긴다
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
   * **`vaultScopeKey` 는 정확한 범위가 아니다.** 이 시험이 없으면 등록부는
   * 샘플 둘을 뭉뚱그리는 키를 "보호됨" 으로 인증한다 — 막으려던 결함을
   * 게이트가 승인하는 자리.
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
   * **보호의 증거는 시험이다.** 소스에 범위 함수 이름이 있는지 보는 검사는
   * 실측에서 통과해 버렸다(`StorageEntry.provenBy` 주석). 그래서 각 키는
   * "볼트 A 에 쓴 값이 볼트 B 에서 안 보인다" 를 단언하는 시험 파일을 지목하고,
   * 이 검사는 그 파일이 실재하고 그 키를 실제로 다루는지만 본다 — 되돌리면
   * 빨개지는 것은 이 시험이 아니라 **그 시험**이다.
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
      // 접두사여야 한다 — 뒤에 범위가 붙을 자리가 없으면 범위를 못 받는다.
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
        // `demo:docs-vault:recent:v1` 은 마이그레이션이라 읽기가 정당하다.
        if (entry.key === "demo:docs-vault:recent:v1") continue;
        const readsIt = new RegExp(
          `getItem\\(\\s*["'\`]${entry.key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
        ).test(source);
        expect(readsIt, `${entry.key} 를 ${file} 이 되읽는다`).toBe(false);
      }
    }
  });
});
