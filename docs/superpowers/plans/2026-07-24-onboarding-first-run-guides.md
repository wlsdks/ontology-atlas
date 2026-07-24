# 온보딩 첫 실행 가이드 강화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 비개발자 첫 사용자가 가이드를 만나지 못하고 이탈하는 4개 순간(투어 미발견 · 폴더 선택 공포 · 빈 지도 dead-end · 용어 불투명)을 기존 온보딩 자산을 재배치해 해소하고, 투어 4단계 클릭 결함을 수정한다.

**Architecture:** 새 시스템을 만들지 않는다. 이미 존재하는 가이드 투어(`src/features/guided-tour`) · 첫 실행 카드(`src/features/first-run-starter`) · vault 생성 플로우(`src/features/docs-vault-local`) · 빈 상태(`src/widgets/topology-controls`)를 **결정적 순간에 배치**한다. FSD 방향 준수: 콜백은 HomePage(view) → TopologyIndexPanel(widget) → FirstRunStarterModule(feature) 로 props 다운.

**Tech Stack:** Next.js 16 App Router(static export) · TypeScript 5 · Tailwind 4 토큰 · next-intl(en/ko) · Vitest+Testing Library · Playwright.

## Global Constraints

- 다크 단일. 새 색상 시스템 금지 — 무채색 + 인디고 토큰(`--color-*`, `--topology-*`)만. hardcoded hex 금지.
- glassmorphism/`backdrop-blur`/glow/scale hover 금지 (`.claude/rules/design.md`).
- 모달은 dim/scrim으로 modality 증명. transient surface 는 다른 transient 를 닫는다.
- FSD import 방향: `app → views → widgets → features → entities → shared`. 역방향 금지.
- i18n: 모든 신규 카피는 `messages/en.json` + `messages/ko.json` 동시 추가. 인앱 링크는 `@/i18n/navigation`.
- 커밋: conventional prefix + 한국어 본문. `--no-verify` 금지. main 직접 push 금지 — 브랜치 `feat/onboarding-first-run-guides` 에서 작업 후 PR.
- 검증은 focused-first: `pnpm checks:changed` → 해당 test 파일 → 필요시 tsc/lint/build.
- 의미 있는 UI 변경은 Design Guardian verdict 필요 (Task 6).
- 각 step 의 코드 블록은 **정확한 최종 형태가 아니라 계약** — 실제 파일의 주변 idiom(토큰명, 주석 밀도)에 맞춰 적용하되 동작 계약(이름/props/조건)은 유지한다.

## 배경 (2026-07-24 라이브 답사에서 확인)

- 7단계 가이드 투어 존재하나 진입점이 우측 레일 아이콘 하나 + 자동 제안 없음.
- 투어 4단계(직접 눌러보세요)에서 보이는 노드 클릭이 4-스트립 blocker 에 막히는 현상 관측 (구멍이 그려진 노드 대비 ~45px 왼쪽). 라이브 계측: 구멍 x1084–1130 vs 노드 시각 중심 x≈1152.
- "내 마크다운 폴더 열기"/"새 vault 만들기" 클릭 → 사전 안내 0으로 OS 폴더 선택창 직행.
- 웹에서 빈 폴더 열면 `topology.empty.bodyNoProjectsDownload`("macOS 앱을 설치하고…") 오안내.
- 노드 카드 용어: "근거 선언됨" · "인계 복사". 첫 실행 카드 census 라벨 ko 값이 영어("concepts"…).
- '일반(쉬운 보기)' 모드(`AUDIENCE_PLAIN_KEY = "demo:audience-plain:v1"`, HomePage.tsx:268)는 톱니 메뉴 안에만 있음.

---

### Task 0: 브랜치 생성

- [ ] **Step 1: 브랜치**

```bash
git checkout -b feat/onboarding-first-run-guides
```

---

### Task 1: 투어 4단계 인터랙티브 컷아웃 클릭 결함 — 재현·진단·수정

**Files:**
- Modify: `src/features/guided-tour/ui/GuidedTourOverlay.tsx`
- Test: `tests/e2e/guided-tour.spec.ts` (기존 spec 에 케이스 추가)

**Interfaces:**
- Consumes: `tourAnchorRef` 프로브(`data-testid="topology-tour-anchor"`, `use-topology-loop.ts:2052` 가 매 프레임 transform + `--tour-anchor-r` 기록), `GuidedTourOverlay` 의 4-스트립 blocker(`interactiveHole`).
- Produces: 4단계에서 "프로브 rect 중심 클릭 = 항상 통과" 계약.

**진단 결정 트리** (라이브에서 구멍이 노드보다 ~45px 왼쪽이었다 — 원인 후보 2개):
1. **프로브 offset-parent 어긋남**: 프로브는 `absolute left-0 top-0` (TopologyMapV2.tsx:314 근처). offsetParent 원점이 canvas 원점(레일 64px 오른쪽)과 다르면 상시 수평 오프셋 발생.
2. **카메라 드리프트 중 계측 어긋남**: blocker 스트립은 React state(`canvasRect`) 경유라 1프레임 지연 — 단독으론 45px 설명 불가하나, 스프링 미정착 구간에서 관측 오차 가능.

- [ ] **Step 1: Playwright 회귀 테스트 먼저 추가 (실패 확인)**

`tests/e2e/guided-tour.spec.ts` 에 추가 — 기존 spec 의 투어 진입 헬퍼를 재사용한다:

```ts
test("step 4: clicking the spotlighted node's probe center advances the tour", async ({ page }) => {
  // 기존 케이스와 같은 방식으로 투어를 열고 4단계까지 [다음]으로 진행
  await openTourAndAdvanceTo(page, 4); // spec 내 기존 헬퍼/패턴 재사용
  const probe = page.getByTestId("topology-tour-anchor");
  const box = await probe.boundingBox();
  expect(box).not.toBeNull();
  const cx = box!.x + box!.width / 2;
  const cy = box!.y + box!.height / 2;
  // 구멍-프로브 정합: 클릭 지점의 elementFromPoint 가 blocker 스트립이 아니어야 한다
  const hitTag = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.tagName ?? "NONE",
    [cx, cy],
  );
  expect(hitTag).toBe("CANVAS");
  await page.mouse.click(cx, cy);
  await expect(page.getByText("5/")).toBeVisible({ timeout: 3000 });
});
```

- [ ] **Step 2: 로컬 재현 실행**

```bash
pnpm exec playwright test tests/e2e/guided-tour.spec.ts -g "probe center advances"
```

- 통과하면: 라이브 관측은 원격 계측 아티팩트 → Step 3의 **방어적 하드닝만** 적용하고 테스트 유지.
- 실패하면(스트립이 클릭을 삼킴): `page.evaluate` 로 프로브 `getBoundingClientRect()` vs 캔버스 `getBoundingClientRect()` vs blocker 스트립 rect 를 함께 덤프해 원인 1/2 판별 후 해당 수정 + Step 3 하드닝.

- [ ] **Step 3: 방어적 하드닝 — 구멍 패딩 + blocker 를 같은 프레임에 추종**

`GuidedTourOverlay.tsx` 의 `interactiveHole` 에 여유 패딩(노드 시각 반경 오차 흡수):

```tsx
const HOLE_PADDING = 16; // 프로브-시각 노드 오차 흡수 (2026-07-24 실측 결함 하드닝)
const interactiveHole = isInteractive && anchorRect
  ? {
      top: anchorRect.top - HOLE_PADDING,
      left: anchorRect.left - HOLE_PADDING,
      width: anchorRect.width + HOLE_PADDING * 2,
      height: anchorRect.height + HOLE_PADDING * 2,
    }
  : null;
```

원인 1(offset-parent)로 판명 시 추가로 `TopologyMapV2.tsx` 프로브를 캔버스와 같은 offset-parent(캔버스 wrapper) 안으로 이동.

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm exec playwright test tests/e2e/guided-tour.spec.ts
```
Expected: PASS (spec 전체 — 기존 케이스 회귀 없음)

- [ ] **Step 5: Commit**

```bash
git add src/features/guided-tour tests/e2e/guided-tour.spec.ts
git commit -m "fix: 가이드 투어 4단계 컷아웃-노드 클릭 정합 하드닝

라이브(1920x1080)에서 스포트라이트 구멍이 그려진 노드보다 ~45px
왼쪽에 뚫려 인터랙티브 단계가 진행 불가였다. 구멍 패딩 + 프로브
중심 클릭 회귀 테스트로 계약을 고정한다."
```

---

### Task 2: 투어 발견성 — 첫 방문 자동 시작 + 첫 실행 카드 CTA

**Files:**
- Modify: `src/features/guided-tour/model/tour-storage.ts` (read 헬퍼 없으면 추가)
- Modify: `src/views/home/ui/HomePage.tsx` (자동 시작 effect + `onStartTour` 전달)
- Modify: `src/widgets/topology-index-panel/ui/TopologyIndexPanel.tsx` (prop 통과)
- Modify: `src/features/first-run-starter/ui/FirstRunStarterModule.tsx` (투어 CTA 버튼)
- Modify: `messages/en.json` · `messages/ko.json` (`firstRunStarter.tourCta`)
- Test: `src/features/guided-tour/model/tour-storage.test.ts` · `src/features/first-run-starter/ui/FirstRunStarterModule.test.tsx` (기존 테스트 파일 패턴에 추가)

**Interfaces:**
- Consumes: `useGuidedTour().start()` — HomePage 의 `openGuidedTour()`(HomePage.tsx:1715, 다른 transient 표면 강등 후 start) 를 그대로 재사용. `useFirstRunSampleModeSettled()` (`src/features/first-run-starter/model/use-first-run-sample-mode-settled.ts`).
- Produces: `readGuidedTourStatus(key?): GuidedTourStatus | null` · `FirstRunStarterModuleProps.onStartTour?: () => void` · `TopologyIndexPanel` 동명 prop.

- [ ] **Step 1: tour-storage read 헬퍼 테스트 작성 (없을 때만 — 이미 있으면 skip)**

`tour-storage.ts` 에 read 가 이미 있으면 이 Step·Step 2 를 건너뛴다. 없으면 `tour-storage.test.ts` 에:

```ts
it("readGuidedTourStatus returns null when unset, echoes written status", () => {
  const key = "guided-tour:test";
  window.localStorage.removeItem(key);
  expect(readGuidedTourStatus(key)).toBeNull();
  writeGuidedTourStatus("done", key);
  expect(readGuidedTourStatus(key)).toBe("done");
});
```

- [ ] **Step 2: read 헬퍼 구현**

```ts
export function readGuidedTourStatus(
  key: string = GUIDED_TOUR_STATUS_KEY,
): GuidedTourStatus | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(key);
    return v === "done" || v === "skipped" ? v : null;
  } catch {
    return null;
  }
}
```

Run: `pnpm test src/features/guided-tour/model/tour-storage.test.ts` → PASS

- [ ] **Step 3: HomePage 자동 시작 effect**

`HomePage.tsx` 의 `openGuidedTour` 선언 아래에 (조건: 샘플 모드 정착 + 저장된 투어 상태 없음 + 1회만):

```tsx
// 첫 방문 자동 투어 (2026-07-24 온보딩 라운드) — 투어 자산이 있는데
// 진입점이 우측 레일 아이콘뿐이라 비개발자가 발견하지 못했다. 샘플
// 모드(=vault 미선택 첫 실행)에서 저장된 done/skipped 가 없을 때 한
// 번만 자동 시작. skip 이 'skipped' 를 기록하므로 재방문엔 안 뜬다.
const sampleModeSettled = useFirstRunSampleModeSettled();
const autoTourFiredRef = useRef(false);
useEffect(() => {
  if (autoTourFiredRef.current || !sampleModeSettled) return;
  if (readGuidedTourStatus() !== null || tour.open) return;
  autoTourFiredRef.current = true;
  const id = window.setTimeout(openGuidedTour, 900); // 레이아웃/카메라 정착 후
  return () => window.clearTimeout(id);
}, [sampleModeSettled, tour.open, openGuidedTour]);
```

주의: `useFirstRunSampleModeSettled` 가 "로컬 vault 사용자" 에서 false 인지 확인 — vault 를 이미 연 사용자에게 자동 투어를 쏘지 않는 것이 계약.

- [ ] **Step 4: CTA prop 스레딩 + 버튼**

- `HomePage.tsx`: `TopologyIndexPanel` 에 `onStartTour={openGuidedTour}` 전달.
- `TopologyIndexPanel.tsx`: prop 받아 `FirstRunStarterModule` 로 통과.
- `FirstRunStarterModule.tsx`: "내 마크다운 폴더 열기" 버튼 아래, "새 vault 만들기" 줄 위에:

```tsx
{onStartTour ? (
  <button
    type="button"
    data-testid="first-run-tour-cta"
    onClick={onStartTour}
    className="mb-2 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-[color:var(--topology-v2-panel-divider)] text-[12px] text-[color:var(--topology-v2-panel-text-secondary)] transition-colors hover:border-[color:var(--color-indigo-line-a35)] hover:text-[color:var(--topology-v2-panel-text-primary)]"
  >
    {t("tourCta")}
  </button>
) : null}
```

i18n: `firstRunStarter.tourCta` — ko `"2분 구경하기 — 지도 읽는 법"` · en `"2-minute tour — how to read the map"`.

- [ ] **Step 5: FirstRunStarterModule 테스트 추가**

기존 테스트 파일 패턴에: `onStartTour` 전달 시 버튼 렌더 + 클릭 시 호출, 미전달 시 버튼 없음.

```bash
pnpm test src/features/first-run-starter
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/guided-tour src/features/first-run-starter src/widgets/topology-index-panel src/views/home messages/
git commit -m "feat: 가이드 투어 첫 방문 자동 시작 + 첫 실행 카드 CTA 승격

투어가 존재해도 진입점이 우측 레일 아이콘 하나뿐이라 발견되지
않았다. 샘플 모드 첫 방문에 한해 1회 자동 시작하고(skip 기록 존중),
첫 실행 카드에 명시 CTA 를 추가한다."
```

---

### Task 3: 폴더 열기 사전 안내 시트

**Files:**
- Create: `src/features/docs-vault-local/ui/VaultOpenGuideSheet.tsx`
- Modify: `src/features/docs-vault-local/index.ts` (export)
- Modify: `src/features/first-run-starter/ui/FirstRunStarterModule.tsx` (버튼 2개를 시트 경유로)
- Modify: `messages/en.json` · `messages/ko.json` (`vaultOpenGuide.*`)
- Test: `src/features/docs-vault-local/ui/VaultOpenGuideSheet.test.tsx`

**Interfaces:**
- Consumes: `useFirstRunStarter()` 의 `openFolder`(= `vault.open()`) · `createVault`(= `useVaultCreateFlow.handleCreate`).
- Produces:

```ts
export interface VaultOpenGuideSheetProps {
  open: boolean;
  onClose: () => void;
  onPickExisting: () => void;  // "기존 폴더 선택" → openFolder()
  onCreateNew: () => void;     // "빈 폴더로 새로 시작" → createVault()
}
export function VaultOpenGuideSheet(props: VaultOpenGuideSheetProps): JSX.Element | null;
```

- [ ] **Step 1: 컴포넌트 테스트 먼저**

```tsx
// VaultOpenGuideSheet.test.tsx
it("renders reassurance bullets and routes both actions", async () => {
  const onPick = vi.fn(); const onCreate = vi.fn(); const onClose = vi.fn();
  render(<VaultOpenGuideSheet open onClose={onClose} onPickExisting={onPick} onCreateNew={onCreate} />,
    { wrapper: IntlWrapper }); // 기존 테스트들의 NextIntlClientProvider 래퍼 패턴 재사용
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  await userEvent.click(screen.getByTestId("vault-guide-pick-existing"));
  expect(onPick).toHaveBeenCalledOnce();
  await userEvent.click(screen.getByTestId("vault-guide-create-new"));
  expect(onCreate).toHaveBeenCalledOnce();
  await userEvent.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalled();
});
it("renders nothing when closed", () => {
  const { container } = render(<VaultOpenGuideSheet open={false} onClose={vi.fn()} onPickExisting={vi.fn()} onCreateNew={vi.fn()} />, { wrapper: IntlWrapper });
  expect(container).toBeEmptyDOMElement();
});
```

Run: `pnpm test src/features/docs-vault-local/ui/VaultOpenGuideSheet.test.tsx` → FAIL (모듈 없음)

- [ ] **Step 2: 구현 — scrim 있는 소형 모달**

내용 구조 (전부 i18n 키, 디자인 토큰만 사용, `role="dialog"` + `aria-modal` + Esc 닫기 + scrim 클릭 닫기):

- 제목 `vaultOpenGuide.title` — ko `"내 폴더를 지도로 켜기"` / en `"Turn your folder into the map"`
- 안심 bullet 3개:
  - `bulletAnyFolder` — ko `"아무 마크다운 폴더나 괜찮아요 — 형식이 없어도 돼요."` / en `"Any markdown folder works — no special format required."`
  - `bulletLocal` — ko `"파일은 이 컴퓨터를 떠나지 않아요. 서버 전송 없음."` / en `"Files never leave this computer. Nothing is uploaded."`
  - `bulletStarter` — ko `"빈 폴더를 고르면 시작 문서를 자동으로 만들어 드려요."` / en `"Pick an empty folder and we scaffold starter docs for you."`
- 액션 2개: `actionPickExisting`(1차, 인디고) — ko `"기존 폴더 선택"` · `actionCreateNew`(2차) — ko `"빈 폴더로 새로 시작"` + `actionCancel` — ko `"다음에"`.

스크림: `bg-[color:var(--color-overlay-3)]` 계열 기존 모달 관례를 따른다 (`rg -l "aria-modal" src/` 로 기존 모달 하나를 참조해 같은 구조·토큰 사용).

Run: 같은 테스트 → PASS

- [ ] **Step 3: FirstRunStarterModule 연결**

"내 마크다운 폴더 열기"·"새 vault 만들기" 클릭 → 즉시 picker 대신 `setGuideOpen(true)`. 시트에서:
- `onPickExisting` = `() => { setGuideOpen(false); void openFolder(); }`
- `onCreateNew` = `() => { setGuideOpen(false); void createVault(); }`

(첫 실행 카드는 vault 미선택 신규 사용자에게만 렌더되므로 "이미 아는 사용자에게 시트 강요" 문제 없음 — 툴바의 "내 데이터로 전환" 버튼은 건드리지 않는다.)

FirstRunStarterModule 기존 테스트에 시트 경유 케이스 추가: 폴더 버튼 클릭 → dialog 노출 → `vault-guide-pick-existing` 클릭 시 `openFolder` 호출.

- [ ] **Step 4: 검증 + Commit**

```bash
pnpm test src/features/docs-vault-local src/features/first-run-starter
git add src/features/docs-vault-local src/features/first-run-starter messages/
git commit -m "feat: 폴더 열기 전 사전 안내 시트 추가

폴더 버튼이 사전 설명 0으로 OS 선택창을 직행해 첫 사용자가 무엇을
골라야 하는지 몰랐다. 안심 3줄(아무 폴더/로컬 유지/자동 스캐폴드) +
기존 선택·새로 시작 분기를 시트 하나로 안내한다."
```

---

### Task 4: 빈 vault 시작 체크리스트 + 웹 오안내 제거

**Files:**
- Create: `src/widgets/topology-controls/ui/VaultStartChecklist.tsx`
- Modify: `src/widgets/topology-controls/index.ts` (export)
- Modify: `src/widgets/topology-controls/ui/TopologyEmptyState.tsx` (오안내 조건)
- Modify: `src/views/home/ui/HomePage.tsx:3368` 지점 (분기 렌더)
- Modify: `messages/en.json` · `messages/ko.json` (`topology.startChecklist.*`, `topology.empty.bodyNoProjectsPicker` 문구 순화)
- Test: `src/widgets/topology-controls/ui/VaultStartChecklist.test.tsx` · `TopologyEmptyState.test.tsx` 갱신

**Interfaces:**
- Consumes: HomePage 의 `canCreateNode`/`openCreateNode`(HomePage.tsx:3372-3373), census 값(concepts/relations/domains — TopologyIndexPanel 에 이미 내려가는 동일 값), local vault open 여부(`useLocalVault` 상태 — HomePage 에 이미 존재하는 신호 재사용).
- Produces:

```ts
export interface VaultStartChecklistProps {
  projectCount: number;
  domainCount: number;
  relationCount: number;
  onCreateNode: () => void;
  cliCommand: string; // "npx ontology-atlas init && npx ontology-atlas bootstrap"
}
export function VaultStartChecklist(props: VaultStartChecklistProps): JSX.Element;
```

- [ ] **Step 1: 테스트 먼저**

```tsx
it("marks steps done from live counts and routes the create CTA", async () => {
  const onCreate = vi.fn();
  render(<VaultStartChecklist projectCount={0} domainCount={0} relationCount={0} onCreateNode={onCreate} cliCommand="npx …" />, { wrapper: IntlWrapper });
  expect(screen.getAllByTestId(/checklist-step-/)).toHaveLength(4);
  expect(screen.getByTestId("checklist-step-project")).toHaveAttribute("data-done", "false");
  await userEvent.click(screen.getByTestId("checklist-cta-project"));
  expect(onCreate).toHaveBeenCalledOnce();
});
it("shows progress as counts appear", () => {
  render(<VaultStartChecklist projectCount={1} domainCount={1} relationCount={0} onCreateNode={vi.fn()} cliCommand="npx …" />, { wrapper: IntlWrapper });
  expect(screen.getByTestId("checklist-step-project")).toHaveAttribute("data-done", "true");
  expect(screen.getByTestId("checklist-step-domain")).toHaveAttribute("data-done", "true");
  expect(screen.getByTestId("checklist-step-relation")).toHaveAttribute("data-done", "false");
});
```

Run → FAIL (모듈 없음)

- [ ] **Step 2: 구현**

TopologyEmptyState 와 같은 패널 토큰/구조(카드 1장, 중앙 오버레이). 단계 4개 — 각 행: 완료 도트(성공 시 `--color-status-success` 계열 solid dot — success 신호 계약 준수) + 라벨 + 진행 CTA:

| 단계 | done 조건 | CTA |
|---|---|---|
| `project` — ko "첫 프로젝트 만들기" | `projectCount > 0` | `onCreateNode` 버튼 |
| `domain` — ko "영역(도메인) 하나 추가" | `domainCount > 0` | `onCreateNode` 버튼 |
| `relation` — ko "두 개념을 선으로 잇기" | `relationCount > 0` | `/ontology/edit/` Link ("빌더에서 잇기") |
| `agent` — ko "AI 에이전트 연결 (선택)" | 없음(정보 행) | `cliCommand` 복사 버튼(`useCopyFeedback` 재사용) + 부연 ko "새 vault 를 만들었다면 .mcp.json 이 이미 준비돼 있어요" |

카피 키: `topology.startChecklist.{title,subtitle,stepProject,stepDomain,stepRelation,stepAgent,agentHint,ctaCreate,ctaBuilder,ctaCopyCli}` — ko/en 동시.
title ko `"시작 체크리스트"` · subtitle ko `"이 순서대로 하면 지도가 살아나요"`.

Run 테스트 → PASS

- [ ] **Step 3: HomePage 분기 + 오안내 제거**

- HomePage.tsx:3368 분기: `structural-empty` && 로컬 vault 열림 && `canCreateNode` → `VaultStartChecklist` 렌더, 아니면 기존 `TopologyEmptyState`.
- `TopologyEmptyState.tsx`: 웹(non-Tauri)이라도 **vault 가 열려 있으면** `bodyNoProjectsDownload`(macOS 설치 권유) 대신 picker 카피를 쓰도록 prop `hasOpenVault?: boolean` 추가 — `isDesktopRuntime || hasOpenVault` 조건으로 변경. (checklist 분기가 대부분 흡수하지만 read-only vault 등 잔여 경로 방어.)
- `topology.empty.bodyNoProjectsPicker` ko 순화: `"로컬 vault를 열거나 저장·편집에서 첫 프로젝트 개념을 저장하면 지형도가 시작됩니다."` → `"폴더를 열고 첫 프로젝트를 만들면 지도가 시작돼요."`
- `TopologyEmptyState.test.tsx` 에 `hasOpenVault` 케이스 추가.

- [ ] **Step 4: 검증 + Commit**

```bash
pnpm test src/widgets/topology-controls
pnpm checks:changed
git add src/widgets/topology-controls src/views/home messages/
git commit -m "feat: 빈 vault 시작 체크리스트 + 웹 macOS 오안내 제거

빈 폴더를 연 직후 '지형도에 그릴 프로젝트가 없습니다'가 dead-end
였고 웹에서는 macOS 설치를 권하는 오안내였다. 실카운트 기반 4단계
진행형 체크리스트(프로젝트→도메인→관계→에이전트 연결)로 교체한다."
```

---

### Task 5: 용어 순화 — 노드 카드 · census 라벨 · 일반 모드 노출

**Files:**
- Modify: `messages/ko.json` (값만; en 은 기존 유지)
- Modify: `src/features/first-run-starter/ui/FirstRunStarterModule.tsx` (일반 모드 인라인 토글)
- Modify: `src/widgets/topology-index-panel/ui/TopologyIndexPanel.tsx` · `src/views/home/ui/HomePage.tsx` (`onEnablePlainMode` 스레딩 — Task 2 의 `onStartTour` 와 같은 경로)
- Test: `src/features/first-run-starter/ui/FirstRunStarterModule.test.tsx` 케이스 추가

**Interfaces:**
- Consumes: HomePage 의 `setAudiencePlainState`/`AUDIENCE_PLAIN_KEY` 저장 로직(HomePage.tsx:290 근처의 기존 setter 함수 — 새 저장 경로 만들지 말 것).
- Produces: `FirstRunStarterModuleProps.onEnablePlainMode?: () => void` · `audiencePlain?: boolean`.

- [ ] **Step 1: ko.json 값 교체**

| 키 | 현재 | 변경 |
|---|---|---|
| `topology.nodeDatasheet.metricEvidenceDeclared` | `선언됨` | `문서 있음` |
| `topology.nodeDatasheet.handoff` | `에이전트 인계 복사` | `AI에게 넘길 요약 복사` |
| `topology.nodeDatasheet.handoffCopied` | `에이전트 인계를 복사했어요` | `AI에게 넘길 요약을 복사했어요` |
| `topology.nodeDatasheet.actionCopyHandoff` | `인계 복사` | `AI 요약 복사` |
| `firstRunStarter.meterConcepts` | `concepts` | `개념` |
| `firstRunStarter.meterRelations` | `relations` | `관계` |
| `firstRunStarter.meterDomains` | `domains` | `도메인` |

이후 `rg "인계" messages/ko.json` 로 노드 카드 표면(`topology.nodeDatasheet.*`) 잔여 키만 함께 정리 — 다른 표면(insights/analysis)은 이번 슬라이스 범위 밖(전문가 표면).

- [ ] **Step 2: 일반 모드 인라인 토글**

FirstRunStarterModule 의 힌트 텍스트(`"더 쉬운 보기가 필요하면 왼쪽 아래 톱니에서 '일반'을 켜세요"` — i18n 키를 `rg` 로 확인) 를 버튼으로 교체:

```tsx
{onEnablePlainMode && !audiencePlain ? (
  <button
    type="button"
    data-testid="first-run-plain-toggle"
    onClick={onEnablePlainMode}
    className="mt-1 text-[11px] text-[color:var(--color-indigo-accent)] underline-offset-2 hover:underline"
  >
    {t("plainModeCta")}
  </button>
) : null}
```

`firstRunStarter.plainModeCta` — ko `"쉬운 말로 보기 켜기"` / en `"Switch to plain-language view"`. HomePage 에서 `onEnablePlainMode={() => setAudiencePlain(true)}` (기존 setter 재사용, 기존 저장 관례 그대로) + `audiencePlain` 전달.

- [ ] **Step 3: 테스트 + 검증**

FirstRunStarterModule 테스트: 토글 클릭 → 콜백 호출, `audiencePlain=true` 면 비노출.

```bash
pnpm test src/features/first-run-starter
pnpm exec tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add messages/ src/features/first-run-starter src/widgets/topology-index-panel src/views/home
git commit -m "feat: 비개발자 용어 순화 + 일반 모드 첫 화면 노출

노드 카드의 '근거 선언됨'·'인계 복사', census 영문 라벨이 비개발자
에게 불투명했다. ko 카피를 평문화하고, 톱니 안에 숨어 있던 '일반'
보기를 첫 실행 카드에서 1클릭 토글로 승격한다."
```

---

### Task 6: Design Guardian 검증 + 문서 + PR

**Files:**
- Modify: `docs/FEATURES.md` (온보딩 항목) · `docs/CHANGELOG.md` (2026-07-24 항목)
- Modify: `docs/ontology/` dogfood vault (Onboarding & UX 도메인에 capability 반영 — `/ontology-sync` 스킬)

- [ ] **Step 1: 로컬 실검증**

```bash
pnpm dev  # :3000
```

chrome-devtools 로 첫 실행 → 자동 투어 → 시트 → (임시 빈 폴더) 체크리스트까지 시나리오 스크린샷 확보. `responsive-sweep` 스킬로 시트/체크리스트의 `<lg` 하단 탭바 reserve 확인.

- [ ] **Step 2: Design Guardian verdict**

`design-guardian` subagent 호출 — 변경 표면(투어 CTA · 시트 · 체크리스트 · 토글) 스크린샷 기반 검토: attention winner / typed fact / token contract / motion state / 증거. 반려 항목은 직접 수정 반영.

- [ ] **Step 3: 전체 검증 (escalation 조건 충족 — 라우트/뷰/공용 위젯 다수)**

```bash
pnpm exec tsc --noEmit && pnpm lint && pnpm test:run
pnpm exec playwright test tests/e2e/guided-tour.spec.ts
```
Expected: 모두 PASS

- [ ] **Step 4: 문서 + dogfood vault 동기화**

- `docs/FEATURES.md`: 온보딩 절에 자동 투어/사전 안내 시트/시작 체크리스트 3줄.
- `docs/CHANGELOG.md`: 2026-07-24 항목.
- `/ontology-sync` 스킬로 Onboarding & UX 도메인 capability 반영.

- [ ] **Step 5: Commit + PR**

```bash
git add docs/
git commit -m "docs: 온보딩 가이드 라운드 기록 (FEATURES·CHANGELOG·dogfood)"
gh pr create --title "feat: 첫 실행 온보딩 가이드 강화 (투어 자동 시작·사전 안내 시트·시작 체크리스트·용어 순화)" --body "..."
```

PR 본문: Summary + Test plan (tsc/lint/test:run/guided-tour spec 결과 명시) + before/after 스크린샷(다크).

---

## Out of scope (이번 슬라이스에서 하지 않음)

- 패널/도구별 첫 오픈 코치마크 프레임워크 — 이번 라운드 효과 관측 후 재평가 (PO: Investigate first).
- 노드 라벨 로케일 레이어(`display_ko`) — 스키마·parser 3-way contract 영향, 별도 슬라이스.
- 스타터 vault 콘텐츠 한국어화 — CLI 템플릿(`cli/templates/vault/`)과 동기 필요, 별도 슬라이스.
- `/docs` 첫 진입 기본 문서(영문 dev 문서) 교체 — 별도 논의.
- insights/analysis 전문가 표면의 "인계/근거" 용어 — 대상 페르소나가 달라 유지.
