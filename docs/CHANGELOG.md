# CHANGELOG

> Major change history. Code commit messages answer *why*; this file answers *when / which surface changed*. Focused on **user-visible changes**, not PR-level granularity.
>
> Newest at the top. Date-based since we're pre-semver in the v0.x stage.

---

## 2026-07-20 — 헌장 danger 색 토큰화 + 빌더 인스펙터 중복 DOM 렌더 제거

전 페이지 육안 감사에서 나온 실수정 2건.

- **에러/danger 색 토큰화** — 7개 파일이 `app/globals.css` 의 헌장
  danger 토큰(`--color-danger-a08/a32/a46/a50`, `--color-danger-text`,
  `--color-danger-text-strong`) 대신 비헌장 red 리터럴(`rgba(220,120,120,*)`
  · `rgba(240,180,180,*)` · `rgba(236,116,116,*)`)을 직접 쓰고 있었다 —
  `toast.tsx` 에러 토스트 보더, 지도 "노드 못찾음" 칩, vault picker 에러
  힌트, 문서함 아웃라인 삭제 버튼 hover, 에디터 에러 배너, 프로젝트 deps bar
  제거 버튼 hover, 콜아웃(`> [!danger]`) 인라인 스타일. 헌장 에러 red
  (`#e5484d` 계열)로 통일.
- **빌더 인스펙터 중복 DOM 렌더 제거** — `OntologyEditPage` 가
  `OntologyInspector` 를 같은 props 로 두 번 렌더하고 있었다 (xl+ 상주
  사이드바 + 그 아래 시트 모달을 CSS `hidden xl:flex`/`xl:hidden` 로만
  나눠 항상 둘 다 마운트). `input[name="node-title"]` 같은 필드가 DOM 에
  2벌 존재해 Playwright strict-mode 매치가 깨졌었다. SSR-safe
  `useIsWideViewport()` 훅(서버/첫 페인트 기본값 `true` = 데스크톱 상주,
  마운트 후 실뷰포트로 갱신)으로 두 분기를 배타적 렌더로 전환 — 인스펙터
  공통 props 는 `sharedInspectorProps` 객체로 추출.

## 2026-07-20 — e2e 스위트 부패 정리 + CI 연결 (no product change)

Playwright e2e 139개 중 108개가 실패하고 있었다 — 전부 이미 삭제된 화면을
기다리다 타임아웃난 것으로, 제품 결함은 0건. `topology-map-v2` 캔버스 엔진
전환(c84ecb25e)으로 Sigma WebGL 렌더러(`sigma-*` testid)가 물리적으로
삭제됐고, `/ontology` 구 트리 페이지가 `/topology?index=expanded` 로의
얇은 리다이렉트로 수렴(B3)했는데 두 표면을 겨냥한 spec 은 그대로 남아
있었다 — Playwright 가 CI 에 안 물려 있어 조용히 썩었다.

- 주제가 통째로 사라진 spec 5개 삭제 — `topology-overlap` / `topology-drag`
  / `topology-analysis-workflow`(은퇴한 분석 패널) / `topology-visual-
  regression` / `topology-loading`.
- `ontology-ui.spec.ts` 23개 중 구 `/ontology` 페이지를 겨냥한 17개 삭제,
  현행 표면(`/`, `/download`, `/projects`, 리다이렉트 후 `/topology`)을
  겨냥해 지금도 유효한 5개만 보존 — green 이었던 "데이터가 없으면 detail
  패널은 노출되지 않음" 테스트는 예외적으로 함께 삭제했다 (겨냥하던
  `ontology-node-detail` testid 의 프로듀서가 더 이상 없어 항상 공허하게
  통과할 뿐이었다).
- `user-journey-a.spec.ts` 의 `getByText("Ontology Atlas", exact)` 가 구
  마케팅 랜딩 히어로 카피를 겨냥해 실패 — root-first-open 이후 남은 유일한
  마크는 `AppNavRail` 의 아이콘 전용 브랜드 링크라 접근성 이름 기반
  셀렉터로 교체(삭제 아님).
- 현행 캔버스 엔진 계약을 덮는 `topology-v2-smoke.spec.ts` 신설(5개) —
  캔버스 렌더, 유효/미존재 딥링크, Esc 선택 해제, 문서함 왕복.
- `.github/workflows/e2e.yml` 신설 — PR/push 마다 정리된 스위트 전체를
  chromium 하나로 돌려 같은 부패가 재발하지 않게 CI 게이트를 건다.
- `.claude/rules/testing.md` 에 규율 한 줄 추가: UI 표면/렌더러를 삭제하면
  같은 PR 에서 e2e spec 도 함께 스윕한다.
- **실제 a11y 결함 1건 수정** — 지도 INDEX 트리 행의 셰브론 버튼 21개가
  접근성 이름 없이 a11y 트리에 남아 스크린리더가 정체불명 버튼을 읽었다
  (aria-audit e2e 가 잡음). 바깥 `role="treeitem"` 행이 `aria-expanded` +
  화살표 키로 펼침을 이미 노출하므로 셰브론은 AT 에 중복 — WAI-ARIA tree
  패턴대로 `aria-hidden` presentational 처리.
- **flakiness 근절** — e2e 가 `next dev`(Turbopack) 를 상대하는 데서 오는
  세 아티팩트(라우트 온디맨드 컴파일 지연 · StrictMode 이중 마운트로 첫
  Escape no-op · 하이드레이션 중복 렌더)를 정면 처리: `global-setup.ts`
  라우트 워밍업 + expect 타임아웃 15초 + Escape 재시도의 내부 단언 짧은
  타임아웃(재시도가 실제로 돌게) + CI 한정 2회 재시도. 전부 정적 export
  엔 없는 dev-only 아티팩트라 제품 결함이 아니며, 재시도는 환경 편차만
  흡수하고 진짜 회귀는 재시도 후에도 실패한다.


## 2026-07-19 — 문서함 상단 그래프 census 제거 (docs-chrome-round 마감)

문서함(`/docs`) 브레드크럼 행의 `개념 N개 · 관계 N개` 각인 수치를 삭제했다.
문서를 읽는 표면에서 그래프 총계는 어떤 읽기 판단도 바꾸지 못하는 비행동
잉크였고, 같은 수치가 **문서함 점검 모달**의 그래프 행에 맥락(둘러보기 CTA)
과 함께 이미 있다 — zone-r 점검 타일 1클릭 거리. 대체 버튼은 만들지 않았다
(점검 타일이 이미 그 진입점이라 크롬을 다시 늘릴 이유가 없다).

한 화면에 `문서 155개`(vault 칩) / `문서 53개`(목록) / `개념·관계 총계`
세 계수 체계가 겹치던 것도 함께 해소돼, 32px 크럼 행은 순수 내비게이션
(워크스페이스 / 문서함)만 남는다. census 는 그래프가 주인공인 지도
(`/topology`) 크롬이 계속 소유한다 — 그쪽은 변경 없음.

## 2026-07-19 — 문서함 크롬 재구성 슬라이스 A — 헤더 3존·목록 완전 접힘·점검 중앙 모달 (docs-chrome-round)

`.qa-scratch/docs-chrome-round/design-prescription.md` 확정 처방 반영. 2차
시안이 방향은 옳았지만 잔여 중복 3건(macOS 다운로드 2회·"문서함" 라벨 3회·
점검 버튼 2회)과 밀도 결함(34px 유령 레일·헤더 세로 리듬 미정·점검 카드
3-across 불균등)이 남아 있었다는 재심문 결과를 수치로 제거.

- **헤더 3존 + 76px 크롬 그리드** — 브레드크럼 32px + 헤더 44px 고정(lg+,
  `data-chrome-grid="76"` 마커) = 토폴로지 `--topology-index-top` 와 같은
  발상의 고정 클리어런스. zone-l(PanelLeft 접기 타일 + VaultChip) · zone-c
  (문서 탭 스트립 예약 — 이번 슬라이스는 비움) · zone-r(소스 pill → ⌘K →
  점검 → 문서정보 → gear, 순서 고정) 3분할. `<lg` 는 기존 2행 wrap + 모바일
  drawer 유지(가로 스크롤 0 계약, `local-vault-picker.spec.ts`).
- **macOS 다운로드 헤더 삭제** — 읽기 전용 샘플 배너(`SampleNotice`) 1곳 +
  `/download` 페이지만 CTA 소유. **"문서함" h1 sr-only 화** — 앱 내비
  레일 + 브레드크럼과의 3중 라벨을 2중으로. **점검 토글 2→1 통합** — 데스크톱/
  모바일 중복 렌더 해소, 34px `DocsHeaderTile` 아이콘 타일 하나로.
- **VaultChip** — vault pill(경로·문서수·폴더수·local badge·swap 텍스트버튼)
  을 칩 + 팝오버 메뉴로 접음. census(개념·관계)는 브레드크럼 스트립 단독
  소유로 정리해 중복 해소.
- **문서 목록 완전 접힘(0px)** — `--docs-list-width`(280px) 토큰화, 접힘 시
  aside width 0(34px 힌트 레일 안 씀 — 재열기는 zone-l PanelLeft 타일의
  active 상태 하나로 담보). localStorage persist(`demo:docs-vault:list-collapsed`,
  `readStoredListCollapsed`/`storeListCollapsed`).
- **문서함 점검 = 중앙 모달** — 기존 absolute 밴드(`DocsVaultSourceContractBar`)
  를 `DocsVaultAuditModal` 로 교체: `--docs-audit-modal-width`(680px) 세로
  3행 스택(불균등 3-카드 그리드 폐기) + hairline 구분 + `--docs-scrim`
  scrim + focus trap(Tab 순환) + Esc·바깥클릭·× 3경로 닫기 +
  `role="dialog" aria-modal aria-labelledby`. proof marker
  (`relation_name_parity` · `pattern_walk/project_map`)와 `그래프 점검
  복사` 게이트는 문자 그대로 보존(에이전트 핸드오프 계약). **의도적 계약
  변경** — open 상태 persist 를 제거하고 항상 닫힌 채 시작(페이지 로드마다
  모달이 뜨면 modality 위반) — `readStoredContractOpen`/`storeContractOpen`
  삭제.
- **신규 토큰 4종**(`app/globals.css`, 신규 채색 0) — `--docs-tab-min`/
  `--docs-tab-max`(132/208px, 탭 스트립은 다음 슬라이스), `--docs-audit-modal-width`
  (680px), `--docs-list-width`(280px), `--docs-scrim`(다크 단일).
- 문서 탭 스트립(열린 문서 워킹셋)은 별도 슬라이스로 미룸 — 이번 슬라이스는
  중앙 zone-c 를 구조로만 비워둔다.

## 2026-07-19 — 문서함 크롬 재구성 슬라이스 B — 열린 문서 탭 스트립 (docs-chrome-round)

슬라이스 A 가 예약해 둔 헤더 zone-c(`data-docs-header-zone="tabs"`)를 채운다.
탭은 열린 문서의 **워킹셋**이지 상위 모드가 아니다 — `view==='doc'` 일 때만
렌더하고 `folder-topology` 뷰에선 구조적으로 비운다.

- **`DocsVaultTabStrip`** — 파일 글리프 + 문서 타이틀(frontmatter title 우선,
  `VaultDoc.title` 재사용) + `×` 닫기. 탭 폭은 `--docs-tab-min`(132px)~
  `--docs-tab-max`(208px), `data-token="docs-tab"` 마커. overflow 는 스트립
  내부 가로 스크롤(스크롤바 숨김, 활성 탭 `scrollIntoView`).
- **"한 끗"** — 활성 탭 배경 = `--color-canvas`(본문과 동일), 헤더의 1px
  baseline(`--color-border-soft`, 이제 `border-b` 대신 절대배치 + 음수
  z-index 로 분리, 헤더에 `isolate` 스코프)이 활성 탭 아래에서만 2px
  `--color-indigo-brand` 언더라인으로 완전히 치환된다 — 이중선 0(스크린샷
  검증: baseline z -10 · 언더라인 z 2 · 활성 탭 bg 가 canvas 로 baseline 을
  덮음).
- **상태 계약** — `src/views/docs-vault/lib/doc-tabs.ts`(순수 로직, TDD
  18 case) + `use-open-doc-tabs.ts`(React 연결). **localStorage 영구**
  (`docsVault:openTabs:<sourceKey>`, sourceKey 는 `useDocsVaultPersistence`
  의 `recentKey` 재사용 — vault 별 키 분리, 초안 계약의 sessionStorage 안을
  소유자가 override: "macOS 앱을 다시 켜도 그대로"). 상한 8개 + LRU 축출.
  활성 탭의 진실원은 URL `?slug=`(탭 훅은 워킹셋 목록만 소유, `selectedSlug`
  변화를 관찰해 부수효과로 open). 존재하지 않는 slug 복원 시 조용히 제거
  (`pruneMissingDocTabs`). `×` 닫기 — 활성 탭을 닫으면 왼쪽 인접 탭(없으면
  오른쪽)으로 이동, 마지막 탭을 닫으면 README(없으면 목록 첫 문서)로 폴백.
- Guardian 이월 P3 2건 동반 — `DocsHeaderTile` 의 `h-[34px]` 리터럴을
  `--docs-header-tile-size` 토큰으로 승격, 검색 타일 tooltip 에 `⌘K` 병기.

## 2026-07-19 — 라이트 모드 전면 폐기 (dark-only)

소유자 전략 결정: 앱은 **다크 단일**이 된다. 관리 부담 대비 사용 신호가
낮았던 라이트 테마를 코드/토큰/설정 UI에서 전부 걷어낸다 — 다크 렌더
결과는 1px도 변경 없음.

- **토큰** — `app/globals.css` 의 `html[data-theme="light"]` 블록과 라이트
  전용 override(카드 elevation, 인디고 알파 톤다운, pale text 시프트,
  트리 dim 보정, `full-detail-a1` 라이트 스코프 등) 전부 삭제. 다크 값이
  유일한 값.
- **전환 메커니즘 제거** — `src/features/theme-toggle/`, `src/shared/lib/theme.ts`
  (테마 localStorage 키 `demo:theme`, `useTheme` 훅) 삭제. `app/layout.tsx`
  의 라이트 모드 flash-방지 inline script 제거.
  `DocsVaultFolderTopology` 의 `data-theme` MutationObserver 도 다크
  단일이라 더 이상 필요 없어 제거.
- **설정 UI** — 지도 설정 기어 팝오버와 앱 설정 메뉴의 라이트/다크 토글
  섹션 제거(언어 등 나머지 설정은 유지). en/ko 메시지 카탈로그에서
  `themeToggle` / `settingsGearTheme` / `appearanceTitle` / `appearanceBody`
  키 삭제.
- **문서** — `.claude/rules/design.md` "라이트 / 다크 모드" 섹션을 다크
  단일 선언으로 개정, `.claude/rules/git.md` PR 스크린샷 규칙을 다크
  단일로 갱신, `docs/DESIGN-SYSTEM.md` / `docs/TOPOLOGY-V2-DESIGN.md` 의
  라이트 모드 예정/가드 문구 정리.

## 2026-07-19 — 문서함 읽기 경험 — 목차 레일·맨 위로·frontmatter 접힘·샘플 안내 평문화 (docs-reading-round)

`.qa-scratch/docs-reading-round/po-pass.md` PO 패스 — 66분짜리 긴 온톨로지
문서(`capabilities/cli-developer-entry.md`)를 캡처해보니 지속 표시되는 구조
내비게이션이 화면에 0개, frontmatter 블록이 본문 H1 을 첫 화면 밖으로 밀어내고,
샘플(vault 미선택) 상태의 편집 불가 이유가 작은 점 칩으로만 전달돼 발견되지
않는다는 관찰. 5개 큐 중 2개(목차 데이터/스크롤스파이, 지도 왕복 링크)는 이미
출시돼 있어 실제 gap 에만 착수 — 새 렌더러·모드·저장소 0.

- **목차 레일 발견성 격상** — 기존 `DocsVaultDocOutlinePanel`(문서 정보 토글
  뒤)과 별개로, 사이드바–본문 사이 낭비되던 빈 띠에 상시 읽기 전용 목차 레일
  (`DocReadingOutlineRail`)을 추가. depth 2–3 heading ≥ 4개 & `lg` 이상 뷰포트
  에서만 표시(`shouldShowOutlineRail`), 짧은 문서는 노이즈 없이 그대로. 현재
  섹션은 인디고 좌측 2px 보더(색 채움 아님). 스크롤 컨테이너 밖 `position:
  relative` 래퍼에 절대 위치로 얹혀 본문 max-w-760 을 어떤 폭에서도 침범하지
  않는다.
- **맨 위로 버튼** — 긴 문서를 내려가면 상단 복귀 수단이 없었다. 아티클
  스크롤 컨테이너 우하단에 기존 chrome floating 타일 언어를 재사용한 pill
  추가. `scrollTop > 640px` 에서 fade-in(`use-back-to-top.ts`), 클릭 시
  `scrollTo({top:0, behavior:'smooth'})`, `prefers-reduced-motion` 시 instant.
- **frontmatter 기본 접힘** — `DocFrontmatterBlock` 이 항상 펼쳐 렌더돼 본문
  H1 을 밀어냈다. 기본 접힘 `<details>` 로 전환 — 접힘 요약 줄에
  `kind`/`slug`/`속성 N개` 는 그대로 보여 무엇이 들었는지 알 수 있고, 그래프
  소스이므로 삭제/은닉이 아니라 접힘만. 문서 전환 시 컴포넌트가
  `key={selectedDoc.slug}` 로 remount 돼 접힘 상태가 자동 초기화(URL/세션
  오염 없음).
- **샘플 안내 평문화** — 우상단 작은 mono 점 칩만으로는 "왜 편집이 안
  되는지·어떻게 켜는지"가 전달되지 않았다. 아티클 헤더 바로 아래 중립 패널
  (`--color-elevated` + 좌측 2px 인디고 보더) 평문 스트립(`SampleNotice`)
  추가 — 데스크톱 런타임이면 기존 로컬 vault 선택 흐름("내 폴더 열기"), 웹이면
  기존 macOS 앱 다운로드 CTA 재사용. 신규 라우트/모달 없음.
- **문서함 탭 타이틀 동기화** — `useDocumentTitle` 을 문서함 뷰에 배선해
  선택한 문서 제목이 브라우저 탭에 반영(예: "CLI Developer Entry ·
  Ontology Atlas"). 정적 export 는 slug 단위 metadata 를 미리 빌드할 수 없는
  로컬 vault 특성상 클라이언트 사이드 보완.
- 노드→지도 왕복 링크(`buildTopologyDeeplinkForDoc`)는 이미 출시돼 있어
  착수하지 않음 — 회귀 없음만 확인.

새 i18n 키 11개(en/ko 양쪽) — `docsVault.frontmatterBlock.*`,
`docsVault.readingAids.*`, `docsVault.sampleNotice.*`,
`vaultWidgets.parts.outline.railLabel/railAria`. 전부 기존 토큰 재사용,
신규 채색 0.

## 2026-07-19 — UX 전문가 라운드 교차검증 — 소형 결함 5건 (ux-expert-fixes)

UX 전문가 라운드 조사를 리드가 코드/재현으로 교차 검증해 살아남은 5건 수정.
새 색·새 모션 없음, 기존 fallback 토스트 재사용.

- **ko FirstRunChooser 캡션 영어 하드코딩 정정** — `messages/ko.json`
  `firstRunStarter.caption` 이 ko 로케일인데 "First run" 이 그대로 남아
  있었다. "첫 실행" 으로 교체(각인 mono eyebrow 시각 스타일은 그대로 유지).
- **"그냥 둘러볼게요 →" 화살표 제거** — 이 버튼은 페이지 이동이 아니라
  dismiss(세션 한정)인데 "→" 가 이동을 암시했다. en/ko 양쪽에서 화살표 제거
  ("Just looking around here" / "여기서 둘러볼게요").
- **bare 미존재 슬러그 `?p=` 딥링크 무통보 정리 확장** — kind-접두 슬러그
  (`element:foo`)의 미존재 딥링크만 가시 토스트가 떴고, bare 슬러그
  (`?p=project`)는 project 목록 로드를 무기한 기다리다 조용히 사라질 수
  있었다. 로드가 끝나지 않아도 짧은 유예 후 같은 fallback 토스트를 띄우도록
  `resolveDeeplinkMissDecision` 로 결정 로직을 분리하고 bounded grace
  타이머를 추가.
- **dogfood MCP Server 노드 타이틀 드리프트 정정** — 실제 MCP 도구는 25개
  (read 16 + write 9, `absorb_document` 포함)인데 `docs/ontology/capabilities/
  mcp-server.md` 는 "24 tools"로 고정돼 있었다. 카운트 전면 정정 +
  `absorb_document` 항목 추가(vault 매니페스트 재생성은 별도).
- **TopologyRelationLegend 주석↔코드 불일치 정정** — 주석이 "상시 켜져
  있는다"였는데 실제로는 `md:flex` (768px 미만에서 의도적으로 숨김). 주석을
  실동작에 맞게 정정(코드 변경 없음).

## 2026-07-19 — 빌더 소형 UX 개선 — 빈 캔버스 안내·팔레트 추가 배지·줌 표시·버튼 위계·탭 툴팁 (builder-ux-polish)

haiku UX 부대 조사에서 검증된 `/ontology/edit` 빌더 소형 개선 큐. 전부
기존 토큰/컴포넌트 재사용 — 새 색·새 모션 없음.

- **빈 캔버스 첫 안내 재구성** — "왼쪽에서 종류를 고르세요" 조작 지시만
  있어 이 화면이 무엇을 위한 캔버스인지(개념 카드를 만들고 서로 연결하는
  곳) 안 보였다. 캔버스 성격을 먼저 설명하는 한 줄로 en/ko 갱신.
- **접힌 팔레트에도 보이는 "추가" 진입점** — 팔레트가 접히면 kind 글리프만
  남아 클릭하면 새 카드가 추가된다는 신호가 없었다(필터 칩처럼 보일 위험).
  각 타일 모서리에 인디고 "+" 배지 추가.
- **캔버스 줌 % 표시** — 마우스 휠로 확대/축소는 되는데 현재 배율을 알 방법이
  없었다. 좌하단에 헤더 census 와 같은 각인 모노(`--engraved-numeral-*`)
  스타일로 실시간 줌 % 노출.
- **쓰기/미리보기 버튼 위계** — 두 버튼이 거의 같은 인디고 alpha 톤이라
  주(쓰기)/보조(미리보기) 구분이 약했다. 공유 `Button` variant(primary=
  인디고 solid · outline=중립)로 교체해 위계 분리.
- **인스펙터 탭 아이콘 + 툴팁** — "개요/관계/문서" 탭이 텍스트만이라 스캔이
  느렸다. 각 탭에 아이콘을 붙이고 hover 시 평문 설명 툴팁 추가(레이블은
  그대로 유지).

## 2026-07-19 — UX 부대 1차 — 인사이트 허브 딥링크·신선도 시간축·평문 카피 (ux-wave-1)

haiku UX 부대(8명)가 모든 LNB 탭을 처음 사용자 관점으로 실조작한 조사에서
교차 검증으로 살아남은 항목의 1차 수정. 오탐(문서함 탭/버튼 이동 주장,
/download 실패, 인사이트 탭 URL 미반영 등)은 코드·HTTP 검증으로 걸러냈다.

- **인사이트 허브 행 클릭 가능화** — 관계 탭 허브 리스트가 일반 div 라 클릭이
  안 됐다. 행 전체를 지도 노드 포커스 딥링크(`buildOntologyNodeHref`)로 감싸고
  hover overlay 로 클릭 가능성을 표출.
- **신선도 히트스트립 시간축** — 12주 셀의 시간 방향이 안 보였다. 스트립 아래
  "{N}주 전 ↔ 이번 주" 축 라벨 추가.
- **프로젝트 카피 평문화** — "vault 의 kind: project 문서 / containment
  그래프에서 유도" 류 전문용어를 "내 폴더의 프로젝트 문서 / 문서 사이의
  연결에서 자동 계산" 평문으로 (en/ko). 행동이 필요한 빈 상태에만 frontmatter
  레시피를 괄호로 유지.
- **잘린 텍스트 title 툴팁** — 프로젝트 최근 활동 행(슬러그·내용·도메인)과
  도메인 용량 요약이 좁은 폭에서 truncate 될 때 전체 텍스트를 title 로 확인
  가능하게.

## 2026-07-19 — 빌더 엣지 2차 — 커스텀 접선 곡률·관계선 호 라우팅 (builder-edges-2)

1차 개편 후에도 곡선이 뻣뻣하고 세로로 쌓인 도메인 사이를 관계선이 직선으로
관통해 보였다. 원인은 (1) xyflow `getBezierPath` 가 마주보는 포트에서 접선을
`0.5×수평간격` 으로 하드코딩해 `curvature` 값을 무시했고, (2) 같은 컬럼의
세로 스택 관계선이 상/하 포트로 붙어 곡률 0 의 세로 직선(스큐어)이 됐기 때문.

- **커스텀 bezier 접선** — `getBezierPath` 를 걷어내고 접선 크기를 수평간격 +
  `|Δy|` 비례(하한 46 · 상한 260px)로 계산하는 자체 경로 빌더 도입. 멀리 가는
  선일수록 크게 부풀어 n8n 식 부채꼴이 자연 형성.
- **세로 스택 관계선 호 라우팅** — 같은 컬럼 노드쌍의 `relates` 는 오른쪽
  포트로 카드 옆을 호로 감아 나간다. 좌=포함 계층 / 우=관계로 방향 문법 분리,
  카드 사이 직선 관통 소멸.
- **관계선 위계** — 관계/근거선 기본 opacity 0.55/0.5 로 낮추고 hover 시 1 로
  승격(지도의 dim→focus 문법과 동일).

## 2026-07-19 — 빌더 캔버스 엣지·연결 UX 재설계 (builder-edges)

`/ontology/edit` 빌더에서 project→domain 6개 연결이 캔버스 중앙에 헤어핀/S자
루프로 뒤엉키고, 관계선이 우측에서 큰 우회 루프를 그렸다. 원인은 (1) dagre LR
레이아웃에서 한 rank 가 세로로 길게 퍼지면 좌우로 갈린 노드쌍인데도 |Δy|>|Δx|
가 되어 핸들 선택이 same-side 포트(right→right)를 골라 U-턴을 만들었고, (2)
smoothstep 직교 라우팅이 그 우회를 직각 ㄷ자로 증폭했기 때문.

- **cubic bezier 라우팅** — `VaultEdge`/`EphemeralEdge` 가 smoothstep 대신 포트
  방향 접선으로 스윕하는 bezier 로 전환. trace 문법(실선 contains · 파선 depends ·
  점선 evidence)은 stroke 스타일로 유지.
- **핸들 자동 선택 재설계** — 수평 분리가 카드 폭의 절반을 넘으면 무조건 마주보는
  좌/우 포트, 같은 세로줄이면 상/하 포트. same-side 루프 분기 제거
  (`builder-edge-handles.ts`).
- **평행 엣지 분리** — 같은 두 노드(방향 무시)를 잇는 엣지를 연결선 법선으로 갈라
  겹침 제거 (`builder-edge-route.ts`).
- **연결 UX (n8n 원칙 참조)** — 포트 히트존 ≥16px(투명 `::before`), 노드 hover 시
  보조 포트 절제된 표출, 자석 스냅(`connectionRadius`), 유효/무효 타깃 즉시 시각
  피드백(`isValidConnection` + 인디고/red 신호), 드래그 연결선 인디고 bezier.
- **drop to add** — 노드 포트에서 선을 끌어 빈 캔버스에 놓으면 그 자리에 새 개념
  초안(자식 kind 추론)을 만들고 source 와 잇는다. 새 초안이 선택된 채 남아
  인스펙터 이름 입력이 자동 포커스 — 기존 초안 생성 플로우 재사용.

## 2026-07-19 — 에이전트 활동 가시화 — 지도 위 앰버 포커스 링 (agent-visibility)

`LiveActivityIndicator`(레일 하단 점)만으로는 "에이전트가 지금 어느 노드를
만지고 있는지" 를 지도 위에서 볼 수 없었다 — agent-native 정체성의 핵심
약속(사람과 에이전트가 같은 지도를 본다)이 지도 자체에는 아직 없었다.

- **에이전트 focus 노드 링** — heartbeat 의 `focus.ontologySlug` 가 가리키는
  노드에 정적 앰버 헤어라인 링(1px, r+8 — 허브 링과 같은 `amberHub` 신호톤,
  glow 없음)과 라벨 옆 소형 activity 마크를 그린다
  (`render/node-shapes.ts#agentFocus`, `render/labels.ts#drawActivityMark`).
  heartbeat 가 fresh 할 때만(`hasFreshHeartbeat` 와 동일 기준) — 실데이터
  없으면 아무것도 그리지 않는다. 슬러그→노드 id 해석은 `/ontology` 딥링크가
  이미 쓰던 `translateOntologyDeeplinkToTopologyParam` +
  `resolveTopologySelectedOntologyNode` 를 그대로 재사용
  (`views/home/lib/resolve-agent-focus-node.ts`) — 새 매핑 로직 0.
- **변경 감지 배너** — vault manifest 갱신으로 touched-node 수가 늘어나면
  지도 상단 중앙에 "N개 개념이 갱신됨 — 반영됨" 칩이 4초 떠 있다 자동
  소멸(`views/home/ui/TopologyChangeAnnouncement.tsx`). 상시 노출되는
  `TopologyReviewLink`("Self-Drawing Diff #5" — 미리뷰 누적 카운트)와는
  다른 순간을 담당 — 이 칩은 "방금 반영됐다" 는 일회성 확인이고, 리뷰 링크는
  "아직 볼 게 N개 남았다" 는 상시 CTA. 같은 `changedSlugs` 카운트를 재사용,
  새 스토어 없음.
- **레일 에이전트 타일 title 강화** — `AppNavRail` 의 에이전트 상태 타일
  hover title 에 "마지막 활동: {슬러그} · {시간}" 를 덧붙인다. `formatActivityAge`
  를 `LiveActivityIndicator` 에서 `features/vault-ontology/lib/` 로 끌어내려
  두 표면이 같은 시간 포맷을 공유.
- `translateOntologyDeeplinkToTopologyParam` 을 `views/ontology-redirect` 에서
  `entities/knowledge-graph` 로 이동 — `views/home` 도 같은 함수가 필요해졌고
  FSD 가 view→view import 를 막기 때문(둘 다 entities 는 참조 가능).

## 2026-07-19 — "분석 보기" 은퇴 — overview 패널 내용 3곳으로 이관 (analysis-retire)

`TopologyAnalysisBar`(3049줄) 의 overview 모드 전용 콘텐츠 — 색 원형 리더
렌즈, 관계선 범례, 핸드오프 복사 3종(brief/재분석/동기화), 관계
provenance/quality/agent-readiness 계기 — 를 은퇴했다. 리더 렌즈는 kind=형태
원칙 위반이라 순삭제, 나머지는 지도·INDEX·insights 세 곳이 이미 보여주는
정보를 overview 패널이 네 번째로 중복 노출하고 있어 단일 출처로 이관했다.

- **관계선 범례** → `TopologyRelationLegend`(`src/views/home/ui/`) — 지도
  우하단에 `FirstRunReadout` 과 같은 계기 판독 문법으로 상시 노출(이전엔
  overview 모드 + first-run 상태에서만 보였다).
- **핸드오프 복사 3종** → INDEX 패널 푸터의 "Handoff" 메뉴
  (`TopologyIndexAgentHandoff`, `src/widgets/topology-index-panel/ui/`) —
  복사 UI 만 위젯이 소유, 텍스트 조립은 여전히 `views/home/lib/
  topology-analysis.ts` (+ `shared/lib/ontology-tree`) 가 단일 출처.
- **agent readiness 계기** → `/ontology/insights` 관계 탭 상단
  (`RelationsTab`) — 분류 로직을 `entities/knowledge-graph/lib/
  relation-quality.ts` 로 끌어내려 지도의 핸드오프 브리프 텍스트와 insights
  게이지가 같은 공식을 공유한다. relation provenance/quality 계기는
  insights 에 중복 생성하지 않고 그대로 은퇴.
- overview 의 "View analysis" 리빌 칩과 `overviewChromeRevealed` 상태를
  제거 — 남길 overview 전용 크롬이 더 없어졌다(`resolveLeftSlotOwner` 단순화).
- focus/path/health 모드 패널은 이번 라운드에서 변경 없음 — 소유자가 이후
  세션에서 플로팅 패널 전체 은퇴(경로=미니멀 상태 칩, health=insights 이관)
  범위를 추가 지시했으나, 어중간한 중간 상태를 남기지 않기 위해 이번
  커밋에서는 손대지 않고 다음 슬라이스로 넘긴다.

## 2026-07-19 — 내비 3체계 → 1체계 통합 (rail-rollout)

`AppNavRail`(#375 지형도 전용 구현·#376 대형화면 스케일)을 지형도 외 전
페이지(`/docs`, `/ontology/edit`, `/ontology/insights`, `/projects`,
`/project/[slug]`(+`/edit`, `/new`), `/download`)로 확장하고, 구 상단 탭바
`OperationsNav` 와 그 인라인 서브탭 `OntologySubNav` 를 완전히 삭제했다.
표시 breakpoint 를 `md` → `lg` 로 올려 `BottomTabBar`(모바일)와의 경계를
분명히 하고, 둘이 공유하는 활성-항목 판정 로직을 `src/shared/lib/
nav-destination.ts` 하나로 합쳤다(레일-바텀탭 불일치 가능성 자체를 제거).

- `LiveActivityIndicator`·`AppSettingsMenu`(구 `OperationsNav` 설정 기어) —
  좁은 레일이 못 품는 넓은 popover 라 별도 위젯(`src/widgets/
  app-settings-menu`)으로 분리해 필요한 세 페이지(프로젝트 목록·빌더·
  인사이트) 헤더에 그대로 유지 — 기능 손실 0.
- `BottomTabBar` 도 레일과 동일한 5 목적지(지도·문서함·빌더·인사이트·
  프로젝트)로 정합.
- `pnpm design:ontology`(대상 디렉터리) · i18n 메시지 카탈로그(`nav.*`
  잔여 키·`ontologySubNav`·`modeBadge` 네임스페이스 전체) · `test:desktop:
  runtime` 스크립트 매핑을 새 위젯 기준으로 갱신.

## 2026-07-19 — 토폴로지 캔버스 강조 위계 (canvas-emphasis)

"중앙(프로젝트 노드)이 뭔가 다르게 빛나야, 클릭한 노드는 특별한 색/이펙트
필요" — 발광(glow/halo) 대신 재질(材質)과 1회성 모션 피드백으로 구현.

- **프로젝트 헥사곤(Layer-0 컨테이너)** — 앰버 이중 헤어라인(외곽 1.5px
  amber-hub + 안쪽 오프셋 1px hairline) · 4방향 6px 핀 틱 · 회절 스파이크
  (허브 노드와 동일 패턴 재사용) · 앰버 틴트 각인 숫자 · 라벨 폰트 1단계 업
  (13→15px) + 앰버 유지(`#ececf0`→`#d4b478`) · 반지름 25→30(도메인 칩 대비
  시각 무게 강화, 비율 1.47→1.76×). design.md 가 명시적으로 허용하는 "Hub
  노드와 Layer 0 컨테이너 전용 보조 톤(앰버)" 헌장 예외를 그대로 적용.
- **선택 노드** — 정적 이중 링(2px 인디고 + 6px 바깥 1px 헤어라인, 글로우
  아님)과 클릭 순간의 1회성 커밋 펄스(≤200ms, 1.0→1.15× 확장+알파
  페이드아웃, 루프 없음, `prefers-reduced-motion` 시 생략)를 분리 — 영구
  선택 표시는 절대 애니메이션하지 않는다.
- **호버 노드** — 정적 1px 인디고 헤어라인 미리보기 링("잡을 수 있다" 신호).
- 신규 순수 로직 `model/selection-pulse.ts`(TDD, 결정론적 — 프레임 타임스탬프
  인자, `Date.now()` 미사용) + `render/node-shapes.ts`의 `strokeKindOutline`
  헬퍼로 허브 링/프로젝트 헤어라인/선택 링/호버 링 5종을 공통화.

## 2026-07-18 — 전 페이지 시안-우선 재구성 웨이브 (PR #355~#366)

"화면에 보여지는 모든 페이지는 시안 만들고 그 기반으로 작업" 워크플로우의
완주. `docs/prototypes/` 의 승인 시안(1920×1080 표준 + RATIO-SYSTEM 비율
계약)을 계약으로 모든 가시 라우트를 재구성했다. 슬라이스마다 Design Guardian
verdict 를 거쳤고, 검증 과정에서 실결함 9건이 머지 전에 잡혔다.

- **`/` · `/topology`** — 데이터시트 352px 스케일업(타이포 1단계 업 + 근거
  그룹 신설) + 우측 레일 설정 기어(언어·테마·INDEX 기본값 팝오버). 선택
  노드의 glow-like ring 제거(금지 패턴 잔재).
- **`/project/[slug]`** — 3-zone 재구축(히어로 메트릭 스트립 · 도메인 구성
  3×2 그리드 + 실데이터 미니 도메인 지도 SVG · 본문+요약 레일). document
  노드가 containment BFS 에서 `projectIds` 를 못 받아 문서 카운트가 항상 0
  으로 읽히던 결함을 relates 엣지 fallback 으로 수정. RATIO 토큰
  (`--page-max` 등 5종)을 `app/globals.css` 로 승격.
- **`/ontology/edit`** — 3-pane 빌더(팔레트 240 · 캔버스 · Inspector 340
  상주, xl+ 에서 구 상세 모달 은퇴) + 하단 vault 쓰기 확인바(기존 저장
  핸들러 재사용) + 관계 trace-mark(solid=contains · dashed=depends ·
  dotted=evidence — 데이터시트 규약과 정합).
- **`/ontology/insights`** — 3탭(개요/관계/신선도) 전면 재구축. 구 4탭
  reader-persona 시스템 ~6,200줄 삭제. 신선도는 epoch-0 sentinel
  (`lastApprovedAt`) 대신 vault manifest `updatedAt` 을 조인해 표시하고,
  갱신일 미상 노드는 stale 집계에서 제외("모른다"≠"오래됐다"). 공유
  `TabBar` 컴포넌트(RATIO §3 탭 패턴) 신설.
- **`/docs`** — lg+ 상주 사이드바 · engraved census crumbs · frontmatter
  블록(kind/slug/domain/depends_on/evidence 를 화면에 노출 — "frontmatter 가
  곧 그래프"의 증명) · 하단 backlinks strip(중복 출처 제거).
- **`/projects` · `/download` · project 폼** — engraved census 헤더 +
  실데이터 최근 활동 스트립, 정직한 릴리스 fact strip(SHA-256/사이즈는 가짜
  수치 대신 "게시 시 기록" placeholder, version 은 드리프트 가드 테스트로
  실값 고정), 폼 640px 컬럼 + 삭제 버튼을 하단 danger row 하나로 격리.
- **부수 정리** — 대량 삭제가 남긴 스테일 i18n 카피 테스트 562줄 제거,
  dogfood vault 정합 패스(삭제 노드 5 · patch 12, `validate_vault` issue 0),
  `design:ontology` 게이트를 새 3탭 insights 계약으로 교체(삭제된 파일
  참조로 크래시하던 회귀 수정), 머지 완료 원격 브랜치 15개 삭제.

---

## 2026-07-18 — Project detail Connection map 제거 + SigmaTopology 렌더러 물리 삭제

`/project/[slug]` 상세 페이지의 "Connection map" 미니 지도(`SigmaTopology`
520px 임베드)를 제거 (소유자 지시: "안쓰게 된 페이지나 소스코드는 깔끔하게
지워주고"; 디자인 리뷰 판정 — 이 임베드는 데모로 도달 불가능했다. dogfood
vault 가 프로젝트 1개뿐이라 "이웃 > 1" 게이트가 항상 empty state 만 보여줬고,
같은 typed fact(연결 개수)가 바로 옆 "Linked projects" 카드에 이미 있었다.
"Linked projects" 카드는 그대로 유지 — 그 카드가 이 typed fact 의 단일 표현.
남는 empty-state 안내문 중복도 카드 삭제로 자연히 1개로 정리됐고, 남은
`neighborsMoreNote` i18n 카피는 사라진 지도 섹션을 더 이상 가리키지 않도록
재작성.

같은 패스에서 지난 항목(위 2026-07-18 "구엔진 물리 삭제")이 남겨둔 조건 —
"`topology-map-sigma` 위젯은 `/project/[slug]` 이웃 지도와 홈 화면 공용
컨트롤 칩이 그 위에서 동작해 남는다" — 가 이제 앞쪽 절반만 해당하므로,
`SigmaTopology.tsx`(3,780줄)와 그 렌더 전용 lib/model/ui 82개 파일(약
15,400줄, reducer 10개·physics/layout/worker 6개·SigmaContextMenu 등
UI 8개·이미 고아였던 `relation-label-geometry.ts` 포함)을 물리 삭제.
홈 화면이 쓰는 `SigmaControls` / `SigmaHubRail` / `TopologyEmptyState` +
`model/controls-state` 4개 파일만 위젯에 남는다 — 홈의 지도 렌더링 자체는
이미 `topology-map-v2` 엔진이 담당하고, 이 4개는 그 위에 얹히는 공용 컨트롤
칩일 뿐이었다. `docs/DocsVaultFolderTopology` 는 `sigma`/`graphology`를 직접
쓰는 별도 위젯이라 무관 — 두 패키지 의존성은 그대로 유지.

`topology-map-v2` 가 기본 엔진이 된 뒤 (#330) 남아있던 옛 캔버스 코드를
물리 삭제 (소유자 지시: "예전 캔버스 코드는 싹 다 지워줘"): 레거시 Sigma
전체화면 엔진 렌더 분기 · `topology-map-canvas` (skeleton-card DOM 지도) ·
`?mapEngine=` 탈출구 · `topology-map-v2` feature flag/hook 자체 · 관련 골격
계산 lib 6개 · `TopologyNodePopover` (datasheet 전용 전환). `topology-map-sigma`
위젯은 물리적으로 남는다 — `/project/[slug]` 이웃 지도와 홈 화면의 공용 컨트롤
칩(SigmaControls/SigmaHubRail/TopologyEmptyState)이 여전히 그 위에서 동작.
같은 패스에서 Esc 가 "드로어·오버레이 단계적 닫기" 약속(단축키 시트)을
실제로 지키도록 staged-close 사다리 구현 — 이전엔 선택된 노드의
datasheet/relation lens 에 Esc 바인딩 자체가 없었고, local-graph ego 되돌리기만
다른 오버레이 상태와 무관하게 무조건 발동했다.

## 2026-07-18 — 설치형 앱 first-run 온보딩 (진입 표면 2원화)

설치형 앱(Tauri)에서 볼트 미선택 시 마케팅 랜딩(자기 자신 다운로드 CTA 모순)
또는 `/docs` 리다이렉트 인터스티셜 대신 **옵시디언식 FirstRunPage** 를 제자리
렌더: 볼트 폴더 열기 · 새 볼트 만들기(빈 폴더면 기존 scaffold — 마크다운 시드
5개 + 에이전트 설정) · 데모 볼트 둘러보기 + local-first 신뢰 라인. 감지는
`isDesktopShell()`(Tauri 런타임 1:1, dev 전용 시뮬 시임). 웹 `/` 랜딩은
바이트-동일 유지. 릴리스 프리플라이트(check-desktop-readiness)도 새 계약으로
갱신. 다음 DMG 전 `desktop:verify-app` 실기기 증명 필수.

## 2026-07-18 — 정체성 공식 문서화 (v10): agent-native, human-sovereign

"에이전트를 *위한* 시스템"이 아니라 "에이전트가 1급 사용자인, 사람과
에이전트의 공유 의미 계층"으로 정체성을 명문화. README(Identity 절) ·
AGENTS.md(개요) · PRODUCT-DIRECTION(v10 배너) · dogfood project 노드에 동일
공식 반영, GitHub repo 설명 갱신. 프로젝트명은 유지(브랜드 Ontology Atlas /
저장소·CLI·MCP `ontology-atlas` 이원 체계, v6 결정 재확인).

## 2026-07-18 — 랜딩 B2+ 리디자인 (페이지 롤아웃 #1)

`/` 랜딩을 v2 "Circuit × Constellation" (B2+) 기계가공 언어로 전면 재구성.
장식이던 히어로 그래프(가짜 14노드 + entrance 애니메이션)를 **정직한
topology 미니어처**로 교체 — 실제 dogfood vault(docs/ontology) frontmatter
에서 빌드타임에 유도한 project hex + domain 칩 6 + 허브 capability 원을
정적 SVG 로 그리고, 음각 mono 숫자로 실측 census (106 CONCEPTS · 500
RELATIONS) 를 각인한다. 목업 데이터 0.

- **census 파이프라인** — `scripts/lib/vault-census.mjs` 에
  `dogfoodVaultGraphSummary` 추가, `scripts/build-docs-vault.mjs` 가
  `src/views/landing/model/dogfood-census.generated.ts` (작은 상수 모듈,
  deterministic) 를 생성. 400KB manifest 를 랜딩 번들에 싣지 않는다.
- **전역 승격 토큰** — `--engraved-numeral-*` · `--kind-glyph-*` 12종을
  `app/globals.css` 에 승격 (다크 = v2 값 복사, 라이트 = 신규 정의).
  `--topology-v2-*` 직접 참조 0 유지.
- 01/02/03 카드 · OSS 스펙 테이블 · CTA 를 machined 스타일(1px border-soft
  + 컴팩트 radius + 음각 index)로 통일. 다크/라이트 · en/ko 모두 지원.

제품 계획 v9 (`docs/PRODUCT-PLAN-2026-07.md`) 네트워크 트랙 N0 실행 — 이미
구현·검증된 vault frontmatter 스키마를 `docs/ONTOLOGY-ATLAS-SPEC.md` 공개
명세로 승격했다. 새 필드/규칙 없음, 문서 전용. 5 kind · 관계 타입 ·
untrusted-content 원칙 · 준수 테스트로 기존 contract test 스위트를 인용한다.
8주 RFC 피드백 창 (kill criteria) 동안 GitHub Issues 로 코멘트 받는다.
## 2026-07-17 — 제품 계획 v9: 2층 정체성 (Layer 1 로컬 코어 + Layer 2 Atlas Network)

하루 집중 재기획의 확정 (조사 17건 · 페르소나 7인 · CPO 심사 · 사상가 렌즈
10인 × 3라운드 · 도입 심사 10인). 캘리브레이션 결과 기획 단계 평가 7.6은
Obsidian/dbt 의 기획 단계 소급 점수(7.3)를 상회 — 문서 단계 종료 판정.

- **`docs/PRODUCT-PLAN-2026-07.md` 신설** — canonical 제품 계획. 1차 타겟을
  "2~10인 팀 테크리드" 단일로 정밀화, 매직 모먼트·kill criteria 13행·해자
  5층·승인 3계층·인젝션 방어 Tier 1~3 정의.
- **정체성 개정** — R10 "클라우드 영구 제거"를 2층 구조로 개정 (AGENTS.md 의
  cloud collab 재설계 예약 조항의 조기 개시). Layer 1 은 불변 (영원히
  무료·오프라인·백엔드 0), Layer 2 (Spec/Hub/Team Sync) 는 신뢰 헌장 6조
  준수 시에만. `.claude/rules/forbidden.md` · `local-first.md` 개정.
- **다중 이해관계자 문구 정정** — v8 의 "기획자·마케터·C-level" 을 증거
  기반("비개발자는 유지하지 않는다, 질문한다")으로 "질문자 (게이트 뒤)"
  모델로 교체.

## 2026-07-03 — 지도 뷰 재구성: 단일 컨테이너 변환 엔진 (TopologyMapCanvas)

소유자 결정("지도가 부드럽지도 않고 버벅거림 — 전체 재구성")의 실행.
docs/archive/TOPOLOGY-MAP-REBUILD.md 설계대로 per-frame DOM 동기화 구조를 제거했다.

- **새 엔진** `src/widgets/topology-map-canvas/` — 카드/커넥터 좌표는 배치 시
  1회만 기록, 팬/줌 = 컨테이너 하나의 CSS transform (카메라 수학은 순수 함수
  + 단위 테스트 6건: 커서 앵커 줌·fit 코너 보장). 카드 시각 크기는 CSS 변수
  역스케일로 줌 무관 px 고정, 커넥터는 non-scaling-stroke.
- **FLIP 전환** — 펼침/접기 시 카드가 이전 위치에서 미끄러져 온다 (CSS
  `translate` 속성, reduced-motion 존중). 등장 카드는 fade-rise.
- **스왑 범위** — overview/focus/path/health (지도 계열 전체). 그래프 뷰와
  local-graph ego 는 기존 Sigma 경로 유지. 클릭=선택·배지=펼치기·닫기=접기
  계약과 `mode=`/`p=` 딥링크 전부 보존 (focus 딥링크 복원 실측).
- **verify 이관** — `topologyMapEngine`/`topologyMapCanvasCardCount` 마커 신설,
  검증기는 canvas 계약(카드 ≥8, 팬 임계 12px, fixed-surface 오버랩 0)으로
  검증. Sigma/skeleton 전용 검사는 canvas 게이트. 드래그 클러스터 증명은
  deploy 에서 opt-in (--topology-drag) 으로 강등.
- 잔여(설계 문서 S6): 미니맵/선 범례 canvas 재공급, 관계 커넥터 클릭 →
  관계 카드, 카드 드래그 재배치.

## 2026-07-03 — 지도 인터랙션 계약: 클릭=선택 · 배지=펼치기 · 닫기=접기

소유자 피드백: "클릭하면 그냥 바뀌고 헷갈린다 — 바로 확장돼서 그런가?" —
정확한 진단이었다. 클릭 한 번에 [선택+focus 승격+지형 재배치+카메라 핏]이
겹쳐 인과가 사라졌다. 탐색(안전)과 확장(의도)을 분리한다:

- **클릭 = 선택만** — 지형 불변, 팝오버·커넥터 강조만. overview→focus
  자동 승격 제거 (`selectTopologyNodeRouteState`), overview 에서 선택은
  reveal 전개를 유발하지 않음.
- **펼치기 = 명시적** — 카드의 하위 개수 배지가 펼치기 버튼이 됨
  (`하위 N개 펼치기` 툴팁 — 기획자 감사 ⑧-c 무설명 배지 문제 겸용 해결,
  core 계층 카드에서도 복권) + 카드 더블클릭. 둘 다 focus 모드 진입 —
  기존 `p=…&mode=focus` 딥링크와 동일한 URL 계약.
- **닫기 = 접기** — 배경 클릭/팝오버 X 가 focus 를 overview 로 복귀
  (펼침의 대칭). path/health 워크플로 모드는 선택만 해제.
- 데스크톱 verify 의 카드 클릭 시나리오도 명시적 배지 클릭 경로로 갱신 —
  설치 앱 드래그 계약 검증이 새 인터랙션 문법을 그대로 탄다.

## 2026-07-03 — 기획자 감사 Top 3: 지도 잉크·그래프 ego dim·정리 칩 신호

온톨로지 제품 기획자 렌즈의 감사(경쟁: Obsidian graph / Foundry ontology)로
토폴로지 표면을 점검하고 최고 가치 3건을 즉시 수리:

- **지도 관계 잉크 1단계 상향** — 1.1~1.6px × 실효알파 ~0.25 는 다크
  캔버스에서 비가시라 카드가 "허공에 뜬 라벨"로 읽혔다 (소유자 불만).
  강함/근거/약함/검토 스트로크와 containment 스파인 halo 를 3:1 대비로 —
  범례가 약속한 4종이 실제 화면에서 식별된다.
- **그래프 뷰 ego dim (불투명)** — design.md 의 ego 계약(포커스+이웃만
  살리고 나머지 dim)을 알파 없이 구현: 비-ego 노드를 캔버스 프리블렌드
  불투명 dim 디스크(`--topology-graph-node-dim`)로 강등 + 라벨 제거,
  ego 이웃은 40개까지 라벨 즉시 표시 ("34번 호버" 제거).
- **정리 칩 신호 품질** — (a) ontology containment 에 참여하는 프로젝트
  루트를 "소속 미정" 오탐에서 제외 (`filterOntologyConnectedOrphans`,
  단위 테스트 4건), (b) 허브 승격 *제안*은 칩 카운트에서 제외 — 칩 숫자 =
  진짜 결함만, 결함 0 이면 칩 숨김 (alert fatigue 방지).

잔여 백로그(기획자 감사): 줌인 시 카드→글리프 강등 역전, fit-to-bounds
미포함 카드, 그래프 뷰 경로 오버레이, 포커스 이웃 리스트 확장, 경로 이유
한글화 — `docs/CHANGELOG.md` 이 항목 참조.

## 2026-07-03 — 토폴로지 모드 레일 5탭 → 2뷰 통합

소유자 피드백: "그래프 빼고는 다 이상한데.. 애초에 5개나 필요한 거임?" —
지도/초점/경로/상태 4개 모드가 같은 골격 화면에 패널만 갈아끼우는 구조라
"누를 때마다 정체불명으로 바뀌는 5형제"로 읽혔다. 진짜 *뷰*는 2개뿐이고
나머지는 뷰 위의 상태/액션/큐라는 진단으로 정리:

- **뷰 레일 = [지도 | 그래프] 2탭** — 지도 탭은 Relief 계열
  (overview/focus/path/health) 전체를 대표. 어느 상태에서든 지도 탭이 활성.
- **초점 탭 삭제** — 노드 클릭이 곧 초점 (원래 동작). **경로 탭 삭제** —
  shift-클릭 2노드 / URL 딥링크로 진입. **상태 탭 삭제 → 정리 큐 칩** —
  레일 우측에 `♡ N` 카운트 칩 (0건이면 숨김), 클릭 시 수리 워크플로.
- `mode=focus/path/health` URL·agent handoff·verify 계약은 전부 보존 —
  진입점만 재배치.
- **그래프 뷰 전용 패널 폭** (`--topology-panel-graph-width`, 280~336px) —
  프롬프트 1줄짜리 레일이 overview 폭(560px)을 물려받아 "가로가 너무 긴 빈
  상자"가 되던 것 (소유자 피드백) 을 캔버스-주인공 폭으로.

## 2026-07-02 — 토폴로지 "그래프" 모드 (옵시디언식 살아있는 그래프)

소유자 피드백: "드래그도 안 되고 클릭하면 상세로 빨려 들어간다 — 원래는
옵시디언 같은 그래프를 그리던 건데." Relief 골격이 읽기-우선 결정 표면으로
진화하며 촉각적 탐색 경로가 사라진 것이 결핍. 라이브 물리·드래그 pin/release·
좌표 persist 는 코드에 이미 있었고 골격 모드가 가리고 있었다 — 재활성화가 답.

- **`mode=graph`** — 분석 바에 "그래프" 탭 신설 (지도 다음). 골격 카드 안무
  없이 전체 ontology 노드(294+)를 상시 가동 d3-force(Web Worker)로 그린다.
  노드 드래그 = 자유 배치(+localStorage persist), 호버 = ego 하이라이트,
  클릭 = 선택만 (focus 모드 하이재킹 없음 — `url-state` 가 graph 모드 보존).
- **`livePhysics` prop** — 기존 `autoStartPhysics` 의 120-노드 컷을 graph
  모드에서 해제해 로드 직후부터 시뮬레이션이 살아있게.
- **탄성 드래그** — graph 모드는 잡은 노드 하나만 pin (클러스터 강체 X),
  release 시 물리로 반환 (Relief 의 commit+freeze 계약과 분리) — "드래그 후
  전체 정지" 증상 해소. 실측: release 후 스프링 정착 19.6px, 이웃 탄성 46.6px.
- **불투명 graph 잉크 토큰** (`--topology-graph-edge-*`) — WebGL edge 합성이
  저알파를 불투명으로 그리는 결함(Design Guardian blocker) 회피. hover ego 는
  인디고 + 비-ego hidden, idle 은 contains 백본 hairline 상시.
- 분석 바 모드 레일 5탭 grid 정합(`grid-cols-5`), graph 전용 프롬프트,
  미니맵 "카드→노드" 어휘 정정. `--verify-topology-frame-profile` 로 설치 앱
  프레임 실측 (전 인터랙션 120fps).
- Relief(지도)·초점·경로·상태 모드와 agent handoff 계약은 변경 없음.

## 2026-07-02 — macOS 앱 120Hz 해제 (WKWebView 60fps 캡 제거) + 프레임 프로파일 프로브

"앱 전체가 버벅인다"는 체감의 근본 원인을 실측으로 잡았다: WKWebView 가
ProMotion(120Hz) 디스플레이에서도 requestAnimationFrame 을 60fps 로 캡해
시스템(커서·다른 앱)은 120Hz 인데 토폴로지 캔버스만 격프레임으로 갱신 —
전 인터랙션이 "반박자 끊기는" 판정.

- **120Hz 해제** — WebKit 내부 feature `PreferPageRenderingUpdatesNear60FPSEnabled`
  를 private `_features` API 로 끔 (Safari 가 내부에서 쓰는 것과 같은 메커니즘,
  `src-tauri/src/lib.rs`). selector 존재 확인 후에만 호출 — API 가 사라지면 조용히
  60fps 유지. 실측: 팬/호버/카드드래그 16.7ms → **8.3ms (120fps)**, 줌 16.5 → 11.6ms.
- **프레임 프로파일 프로브** — `pnpm desktop:verify-topology-frame-profile:ko`.
  설치된 앱의 WKWebView 안에서 합성 줌/팬/호버/카드드래그를 돌리고 phase 별
  rAF 프레임 분포(avg/p50/p95/worst/>33ms)를 webview evidence marker
  (`topologyFrameProfile`)로 남긴다 — 성능 회귀를 설치 앱 기준으로 가드.
- **카메라 핸들러 스로틀** — 카메라 `updated` 마다 돌던 전체 엣지 가시성 스윕을
  120ms trailing throttle 로 (`trailing-throttle.ts`, 단위 테스트 5건). 120Hz 에선
  핸들러가 2배 자주 발화하므로 그래프가 커질수록 중요한 스케일 가드.

`/topology` 구조 골격 진입(6/9)의 후속 — 골격이 *읽히고*, 클릭으로 *펼쳐지게* 했다.

- **중앙 spine 연결** — project↔domain `contains` 엣지가 그려진다. ontology 엣지의
  `project:` prefixed id 를 토폴로지의 bare project 노드로 해석(`buildGraph`
  endpoint resolve)해, 중앙 대장 노드가 도메인들과 선으로 이어진 별 모양 골격 완성.
  도메인은 줌 무관 항상 라벨(never anonymous).
- **클릭-레벨 확장 (semantic zoom, 누적 드릴다운)** — 도메인 클릭 → 그 도메인의
  모든 역량이 wedge 부채꼴로 전개(다른 골격 유지) / 역량 클릭 → 형제 역량 유지 +
  그 역량의 요소가 바깥 호에 전개 / 요소 클릭 → 시야 유지 / 배경 클릭 → overview
  복귀. 좌표는 순수 함수(`computeRevealState` + `buildRevealRadialLayout`)가
  결정론적으로 찍는다 — 물리/난수 0.
- **범례 계층 태그** — 좌하단 kind 범례가 세로 1열로 바뀌고 각 행에
  1계층(프로젝트)~4계층(요소)/별도(미분류) 태그가 붙어 색=위계가 명시된다.
- **분석 패널 축소** — 지도·초점·경로·상태 탭을 아이콘으로, 패널 폭 320→280px,
  overview 복사 명령들은 "작업" 접기 안으로 — 지도가 화면의 주인공이 되게.

## 2026-06-09 — 토폴로지 노드 "so what" 평문 합성 (비개발자 설계도 surface)

기획자·C-level 이 토폴로지에서 노드를 클릭했을 때 **왜 중요한지·무엇에 기대는지·
바뀌면 어디 영향인지** 가 그래프 jargon(숫자·`depends_on`) 이 아니라 평문 문장으로
보이게 했다. 결핍 정의: 노드를 봐도 business "so what" 이 안 읽힌다.

- **노드 so-what 합성기** (`topology-node-significance.ts`) — 이미 있는 그래프
  데이터(직접 degree · 전이 reach/blast-radius · owner domain · 이웃)에서 평문
  의미를 *결정론적으로 파생*. 새 authoring 0, 갓 bootstrap 한 vault 에서도 즉시
  동작. "핵심 축/보조/말단" 판정은 기존 health-signal 의 fan-in 임계값
  (`PROMOTION_MIN_FAN_IN`)을 재사용해 일관.
- **컴팩트 팝오버에 4줄 노출** — 노드 클릭 시 뜨는 `TopologyNodePopover` 에
  "무엇인가 / 왜 중요한가 / 무엇에 기대나 / 바뀌면 어디 영향" 4줄을 평문으로.
  kind·관계어는 기존 `kinds.*` / `edgeTypes.*` 메시지 재사용(단일 진실원).
- **작성형 override (얇은 레이어)** — frontmatter `significance:` 가 있으면 "왜
  중요한가" 줄을 그걸로 우선. 미지정 키는 파서가 보존하므로 schema 변경 0.

## 2026-06-01 — 리서치-그라운디드 개발로 루프 방향 전환 · `docs/FOUNDATIONS.md` 신설

사용자가 루프 방향을 **공개·검증된 레퍼런스에 묶인 개발**로 전환("온톨로지가 뭔지
알고 만들자"). 6-facet × research→adversarial-fact-check 워크플로로 **25개 레퍼런스를
독립 web-verify(25/25)** 한 뒤 신설:

- **`docs/FOUNDATIONS.md`** — 제품을 느낌이 아니라 인용 가능한 근거에 묶는 단일
  진실원. (1) 온톨로지 이론 — Gruber 1993("explicit specification of a
  conceptualization"), Studer/Benjamins/Fensel 1998(4-part 정의), Noy &
  McGuinness, W3C RDF/OWL/SKOS 스펙트럼(우리는 SKOS-light·RDF-shaped 중간점).
  (2) agent-memory/LLM×KG — MemGPT, agent-memory 서베이(ACM TOIS), Zep/Graphiti,
  Mem0, Pan et al. 로드맵(IEEE TKDE), GraphRAG. (3) code-KG — Code Property
  Graphs, Glean, SCIP, CodeQL, tree-sitter. (4) 디자인 lineage — Rams, Tufte,
  Refactoring UI, Maeda, Linear/Saarinen, Rauno, Kowalski, Geist, Radix.
  (5) "our own thing" — agent-maintained + git-native + live-topology +
  codebase-meaning-layer 의 조합.
- **`docs/DESIGN-SYSTEM.md`** — cited-lineage 표 추가(각 디자인 규칙 → 출처 매핑).
- **charter v3** — 루프가 v2 게이트(retention + 객관·적대)를 유지하면서 모든 작업을
  FOUNDATIONS 레퍼런스에 그라운딩. 리서치 작업의 객관 artifact = "인용 환각 0(web-verified)".

## 2026-05-31 — cold-start 정리 · 실시간 폴링 · 에이전트 그래프 도구 정합

자율 개선 루프가 첫-접촉(cold-start)·실시간·에이전트 사용성 레버를 한 바퀴 돌며
다듬었다.

- **fresh-init false alarm 제거** — `ontology-atlas init`(및 웹 starter)가 3개
  starter 파일을 모두 `example` 슬러그 꼬리로 만들어 ambiguous-alias compile
  issue 1개를 ship → 갓 만든 빈 vault 가 첫 세션부터 "고치고 쓰라"는 false
  alarm 을 띄웠다. starter 를 `example-domain`/`-capability`/`-element` 로
  고유 rename 해 pristine vault 가 깨끗(0 issue)하게 출발한다.
- **실시간 adaptive 폴링** — 로컬 vault 자동 새로고침이 고정 5s 에서 변경 직후
  ~1.5s burst → idle 시 ~5s 로 감쇠하는 adaptive 폴링으로 바뀌어, 에이전트/CLI
  쓰기가 더 빨리 화면에 뜬다(generation-token 으로 orphan 타이머 제거).
- **에이전트 그래프 도구 정합** — `find_evidence` 가 관련도 score 로 best-first
  정렬, `validate_vault` 가 vault→code 경로 drift(`pathDrift`)를 노출,
  `infer_imports` 가 코드↔vault import 엣지를 reconcile.

## 2026-05-31 — `/docs` 편집기: 저장 충돌 시 미저장 편집 손실 수정

로컬 vault 편집기에서 **저장이 디스크 충돌로 거부됐을 때 미저장 편집이 조용히
사라지던 데이터 손실 버그**를 고쳤다. 사람이 `.md` 를 편집하는 동안 AI 에이전트가
(MCP 로) 같은 파일을 디스크에서 다시 쓰면 저장 시 `VaultConflictError` 가 나야
하는데, 그 에러를 화면 단에서 삼켜버려(swallow) 편집기가 *저장에 성공한 것으로*
오인했다 — 버퍼를 clean 으로 표시하고 "저장됨" 을 띄운 뒤, 다음 폴링 재조회가
미저장 내용을 디스크 버전으로 덮어썼다.

- 이제 충돌은 삼키지 않고 편집기로 전파되어 버퍼가 **dirty 로 유지**된다(폴링
  clobber 가드가 계속 보호) — 편집 내용은 보존된다.
- 충돌 시 "이 파일이 디스크에서 변경되어 저장하지 못했습니다. 편집 내용은
  유지됩니다." 라는 안내를 편집기 안에 띄운다(기존 토스트도 유지).

## 2026-05-29 — 접근성 · 성능 · 디자인 일관성 개선 패스

세 핵심 surface(토폴로지 · 온톨로지 · `/docs`)를 한 바퀴 돌며 사용성·접근성·
성능을 다듬고, 디자인 시스템 규율을 자동 가드로 고정했다.

- **접근성(키보드 · 스크린리더)** — 통합 팔레트를 WAI-ARIA combobox 패턴으로
  (`aria-activedescendant`), 허브 rail 을 roving tabindex(tab stop 1개)로,
  관계 쓰기 확인 모달에 Escape·초기 focus 를 추가했다. 토폴로지 컨트롤 range
  슬라이더와 `/docs` 마크다운 편집기 textarea 에 접근명(`aria-label`)을, 온톨로지
  로딩 상태·로딩 스켈레톤에 `role=status` announce 를 부여했다.
- **성능** — 토폴로지 검색 필터를 build-time precompute 로(per-frame
  toLowerCase 제거), pulse sine 를 프레임당 1회 계산으로 바꿨고, 온톨로지
  reachability · projectIds 파생 · 관계 제안 최단경로의 BFS 에서 `Array.shift()`
  (O(n²)) 를 head-pointer(O(n)) 로 통일했다 — 큰 vault 일수록 체감.
- **사용성** — 온톨로지 트리 검색 무결과에 '검색 지우기' 복구 버튼, 인사이트
  허브 패널에 "상위 N / 전체 M" truncation 표시(silent cap 해소)를 추가했다.
- **디자인 시스템** — 라이트 모드 status 신호색을 WCAG AA(≥4.5:1) 충족하도록
  토큰 override(특히 안 보이던 노랑 경고), 루트 redirect 색을 토큰화(라이트 모드
  다크 깜빡임 제거). hardcoded hex·금지 패턴(glassmorphism/scale hover/보라핑크
  그라디언트)·status 대비를 회귀 차단하는 가드 테스트를 추가했다.

## 2026-05-28 — Topology layout off the main thread (web worker)

토폴로지 force 레이아웃을 Web Worker 로 이전해 데스크톱(WKWebView)에서 드래그 ·
자동 정렬 시 끊김을 줄였다. 진단상 Sigma WebGL 렌더는 2000노드까지도 병목이
아니었고(120fps), 끊김의 원인은 메인스레드에서 도는 d3-force 계산이었다.

- **워커 기반 레이아웃** — d3-force 스프링-질량 시뮬을 Web Worker 에서 계산하고
  좌표만 메인으로 스트림한다. 자동 정렬 중 메인스레드 프레임 스파이크(이전
  ~132ms)가 사라졌다. 기존 `PhysicsController` 인터페이스를 그대로 구현해
  드래그/정렬/튠 동작은 동일하며, Worker 미지원 환경은 메인스레드 시뮬로
  안전하게 fallback 한다.
- **Tauri CSP** — 워커 로딩을 위해 데스크톱 앱 CSP 에 `worker-src 'self' blob:`
  추가.
- **dev 서버 블로커 fix** — CodeGraph MCP 의 `.codegraph/`(live unix socket
  포함)가 gitignore 되지 않아 Tailwind v4 소스 스캔이 소켓을 읽다 죽으며
  `pnpm dev` 첫 화면이 500 이 되던 문제를 정정 (`.codegraph/` ignore).
- **문서 vault 위생** — `docs/superpowers/`(AI 에이전트 내부 계획·스펙)를
  docs-vault 빌드 스캔에서 제외해 사용자 docs 콘텐츠 오염을 막았다.

## 2026-05-23 — Starter agent loop verification

Starter vaults now tell users how to prove the Claude Code / Cursor / Codex MCP
loop works before the agent writes anything.

- **Creation-time UX** — the empty-vault starter CTA now previews the three
  things the starter creates for agent use: config files, read-first MCP checks,
  and a CLI `mcp-verify` proof path.
- **Copyable agent prompt** — the same CTA can copy the first-contact
  verification prompt directly for Claude Code / Codex, with inline copied /
  failed feedback.
- **Existing-vault path** — folders that already contain markdown now get the
  same copyable verification prompt beside the starter-add option, so users can
  prove MCP connectivity without adding starter files.
- **Palette access** — the Docs command palette also exposes the same copyable
  verification prompt whenever a local vault is loaded, with toast feedback for
  copied / failed states.
- **Agent setup status** — the local vault tools menu now shows whether
  `.mcp.json`, `.codex/config.toml`, and `.mcp.json.example` exist, and can
  create only the missing agent config files without adding starter markdown.
- **Setup-to-verify flow** — the same agent setup panel can now copy the
  read-first verification prompt, so users can go from config readiness to
  Claude Code / Codex proof without opening the command palette.
- **Installed CLI verification copy** — the agent setup panel also copies the
  matching terminal verification sequence (`validate` → `workspace-brief` →
  `agent-brief --prompt` → `mcp-verify`) for users who already have the CLI
  installed and want proof before MCP is attached.
- **Codebase-root MCP template copy** — the same panel now copies the
  `.mcp.json.example` body with the current vault name in the absolute-path
  placeholder, so Claude Code / Cursor sessions opened from a separate
  codebase root do not have to hunt for the template file first.
- **Codebase-root Codex template copy** — Codex users get the same copy path
  for `.codex/config.toml`, with the vault-name-specific absolute-path
  placeholder in `OATLAS_VAULT`.
- **Grouped setup actions** — the agent setup panel now separates read-first
  verification actions from separate-root connection templates, so the next
  step is clearer when several copy buttons are visible.
- **First-contact MCP prompt** — generated starter READMEs ask the agent to run
  `validate_vault`, `workspace_brief`, and `agent_brief`, then report whether
  the vault is readable and write tools are available.
- **Installed CLI fallback** — the same section gives terminal checks for
  `validate`, `workspace-brief`, `agent-brief --prompt`, and
  `mcp-verify --timeout-ms 15000`, with a codebase-root vault-path adjustment.
- **Template parity gate** — web starter output and CLI vault templates remain
  byte-for-byte aligned, with a focused assertion for the new verification
  section.

## 2026-05-23 — 10-minute memory loop smoke

Fresh-repo launch readiness now has an automated gate instead of only a
backlog note.

- **Memory loop smoke** — `pnpm smoke:memory-loop` creates a temporary TS repo
  and proves `init -> bootstrap -> validate -> workspace_brief -> agent_brief ->
  node_profile -> sync proposal` within a 10-minute budget.
- **Side-effect-free proposal check** — after the baseline ontology is
  committed in the temp repo, the smoke adds a new feature file and confirms
  `analyze_repo_structure` proposes `capabilities/export` while the vault stays
  unchanged.
- **Git diff alignment** — the smoke asserts the sync proposal corresponds to
  the actual changed code path, so the product loop remains reviewable before
  an agent writes back to the vault.

## 2026-05-23 — Repo-local Codex onboarding

Fresh vault setup now gives Codex the same repo-local MCP path as Claude Code
and Cursor.

- **CLI init Codex config** — `ontology-atlas init` writes
  `.codex/config.toml` beside the generated `.mcp.json` in both the codebase
  root and the vault folder. Root configs point at `./<vault>`; vault-local
  configs use `OATLAS_VAULT=.`.
- **Web starter Codex config** — the `/docs` starter writes `.mcp.json`,
  `.codex/config.toml`, and a manual `.mcp.json.example` into an empty vault
  folder without requiring terminal setup.
- **Fallback still available** — `init` still prints the global
  `codex mcp add ...` command for users who prefer Codex global config.
- **Onboarding gates** — starter parity, CLI init integration, clean onboarding
  smoke, packed CLI smoke, i18n, docs-vault freshness, typecheck, lint, and
  dogfood script-reference checks cover the new path.

## 2026-05-23 — Copyable agent run order

The `/ontology/insights` agent recipe panel now exposes the first-contact graph
query sequence as one copyable runbook, not only as individual MCP calls.

- **Copy run order** — copies the `agent_brief` / `workspace_brief` /
  `query_plan` / `health` / `node_profile` MCP payload sequence with the same
  all-paths evidence contract and CLI fallbacks used by the full handoff prompt.
- **Shared formatter** — the run-order prompt is produced by
  `formatAgentRunOrderPrompt`, so the UI button and handoff prompt stay aligned.
- **UI regression gate** — the focused Playwright insights test now checks that
  the run-order copy action is visible beside the first-contact rail.

## 2026-05-23 — MCP graph query compile cache

Repeated graph queries in one MCP server session now avoid recompiling the same
vault snapshot.

- **Indexed artifact cache** — `query_ontology` reuses the compiled indexed
  artifact while the loaded vault docs have the same slug / mtime / raw-content
  signature.
- **Write-safe invalidation** — write paths clear the cache before generating
  post-write maintenance, and external file edits naturally miss the cache
  because the document signature changes.
- **Package safety** — the cache helper is covered by focused unit tests and is
  included in the published MCP package files list.

## 2026-05-19 — CLI growth plan dogfood

The developer CLI now exposes MCP `growth_plan` directly, so agents and humans
can inspect ontology write candidates without raw JSON-RPC.

- **`ontology-atlas growth`** — read-only wrapper for relation recommendations,
  external element refs, dangling references, unassigned nodes, empty domains,
  and ignored external refs, with human output showing candidate reasons and
  proposed tool calls.
- **Growth payload gate** — CLI output now fail-closes on malformed
  `growth_plan` summary/group/candidate rows before JSON or human output.
- **Dogfood shortcut** — `pnpm dogfood:growth` snapshots the project ontology's
  growth plan as a focused check.
- **Maintenance dogfood shortcut** — `pnpm dogfood:maintenance` snapshots the
  project ontology's `maintenance_plan` queue as a focused check without running
  the full human-readable status preflight.
- **Direct MCP verify help** — `npm run verify -- --help` now lists the same
  narrow dogfood shortcuts for arguments, compile-fix idempotence, health,
  brief, growth, maintenance, and status before the full installed-style gate.
- **Maintenance focused gate discovery** — CLI and direct MCP verify help now
  point to `pnpm test:mcp:maintenance` when only the `maintenance_plan` queue,
  cursor, and formatter contracts changed.
- **Dogfood help gate discovery** — `pnpm dogfood:help` now also surfaces
  `pnpm test:mcp:maintenance`, so dogfood users can jump to the maintenance-only
  focused gate without reading the broader MCP docs.
- **Dogfood status failure hints** — failing `pnpm dogfood:status` runs now print
  child-specific focused follow-ups (`dogfood:health`, `dogfood:brief`, or the
  maintenance JSON/test gates) before escalating to full `dogfood:verify`.
- **Focused test matched count** — `scripts/run-focused-node-test.mjs` now prints
  `matched=N` before file-level `tests=N` on TAP-summary runs, including matched
  test failures, so scoped runs show the actual number of pattern-matched tests
  without manual skip-count math. File setup/import failures are split out as
  `setupFailures=N` instead of inflating `matched`.
- **Focused wrapper discovery** — dogfood and MCP verify help now describe
  `pnpm test:dogfood:script-refs` as the focused filter parser + wrapper
  summary contract too, not only the help/package-script reference check.
- **MCP registration template guard** — `pnpm test:mcp:docs` now locks the
  tracked `.mcp.json`, `.mcp.json.example`, and `.codex/config.toml`
  source-checkout templates to
  `node ./mcp/src/index.js` with `OATLAS_VAULT=./docs/ontology`, so local agent
  registration drift is caught by the focused docs gate. The narrower
  `pnpm test:mcp:registration` shortcut checks only that registration-template
  contract when those files change, and CLI / direct MCP / dogfood help now
  surface the shortcut in their Focused checks lists.
- **Changed-file focused check advisor** — `pnpm checks:changed` now maps
  tracked `git diff --name-only HEAD` paths, untracked
  `git ls-files --others --exclude-standard` paths (excluding local `.agents/`
  / `.codex/` agent state), or explicit paths after `--`, to the first focused
  checks plus escalation gates so agents can avoid broad test runs when a
  narrower verification path is enough. Vault helper scripts now route to
  direct sibling `pnpm exec node --test ...` checks when available before
  `pnpm test:docs-vault`, `pnpm test:vault:validate`, or
  `pnpm test:vault:audit` and broader docs/package gates; vault migration
  runner/files now route to `pnpm vault:migrate --list` and migration
  implementations also route to `pnpm test:contracts`; parser/schema/
  validator parity files, including `tests/fixtures/vault-schema-cases.mjs`,
  route to `pnpm test:contracts`; MCP core source/test
  changes print direct sibling `pnpm exec node --test mcp/src/<name>.test.mjs`
  commands before `pnpm test:mcp:unit`, including the installed verify helper's
  shared `mcp/scripts/json-rpc-lines.mjs`; MCP suggestions source/test changes
  now print `pnpm exec node --test mcp/src/suggestions.test.mjs` before the
  broader `pnpm test:mcp:suggestions`; CLI shared helper source/test changes
  print direct sibling `pnpm exec node --test cli/src/lib/<name>.test.mjs`
  commands before `pnpm test:cli:lib`; dogfood helper scripts now print direct
  `pnpm exec node --test scripts/...test.mjs` commands before
  `pnpm test:dogfood:args`, `pnpm test:dogfood:compile-fix`,
  `pnpm test:dogfood:status`, or `pnpm test:mcp:dogfood:*` and broader dogfood gates.
  Package contract helper changes now print direct
  `pnpm exec node --test scripts/check-package-contracts.test.mjs` before
  package/docs contract subsets.
  Benchmark/perf/onboarding
  smoke scripts now route to dry-run or small-input checks, and
  `benchmark:scale` now supports `--dry-run` without Codex spawn. Benchmark
  README updates also route through script-reference checks, so documented
  benchmark commands cannot drift from `package.json` unnoticed. Package-script
  i18n validator test changes now also print direct
  `pnpm exec node --test scripts/validate-messages.test.mjs` before the package
  shortcut.
  GitHub issue/discussion community templates now route to `pnpm test:mcp:docs`
  instead of having no focused advisor result.
  MCP `analyze_repo_structure` / `infer_imports` implementation changes now
  start with direct unit tests plus `pnpm integration:mcp:repo-analysis` instead
  of also starting the broader read/query subset.
  The root `pnpm integration:mcp:read` shortcut also excludes graph and
  repo-analysis handlers now, so explicit read/query runs do not duplicate
  those focused subsets.
  `mcp/src/query.mjs` changes now stay on the `query_concepts` read path instead
  of also suggesting the graph-engine integration subset.
  reference checks now resolve `pnpm -C <dir>` / `pnpm --dir <dir>` examples
  against the matching package scripts instead of the root package. CLI package
  lockfile changes now route to the same package-contract checks as MCP
  lockfile changes. Script helper changes
  for `focused-check-suggestions`,
  `pnpm-script-refs`, `test-name-pattern`, and `vault-census` now print direct
  `pnpm exec node --test scripts/lib/<name>.test.mjs` commands before broader
  helper gates; focused node-test runner changes print
  `pnpm exec node --test scripts/run-focused-node-test.test.mjs` before the
  script-reference aggregate; and focused-check CLI changes print
  `pnpm exec node --test scripts/suggest-focused-checks.test.mjs` before
  `pnpm test:checks:changed`. CLI/MCP integration harness changes now route to
  `pnpm integration:cli` / `pnpm integration:mcp` instead of an unrelated
  narrow subset. Root and MCP lockfile changes now route to
  `pnpm test:mcp:package` with package-check escalation instead of no focused
  mapping. Bundle guard script changes now route to `pnpm build` followed by
  `pnpm bundle:check`, because the guard is artifact-based. `next.config.ts`
  changes now route to `pnpm exec tsc --noEmit`, `pnpm build`, and
  `pnpm bundle:check` instead of no focused mapping. `eslint.config.mjs`
  changes now route to `pnpm lint`; `tsconfig.json` changes route to
  `pnpm exec tsc --noEmit` plus CLI/MCP repo-analysis focused integrations.
  GitHub CI / PR template changes now route to package-docs contract checks,
  and the pre-push hook routes to its enforced `pnpm exec tsc --noEmit` gate.
  Claude Code hook wiring and npm publish guard changes now route to
  `pnpm test:claude:hooks`, which exercises the real hook script and settings
  references without starting broader docs/package checks.
  Claude Code agent rules and skills now route to
  `pnpm test:dogfood:script-refs`, and that gate scans their `pnpm ...`
  snippets for stale package-script references. The script-reference parser now
  treats `pnpm patch` as a pnpm built-in, not a missing root package script.
  Any `docs/**/*.md` change now routes to `pnpm docs-vault:check`, matching the
  static docs-vault builder's actual input scope.
  App/source TypeScript files under `app/` or `src/` now route to direct
  sibling Vitest tests when available, so small UI/helper changes get a narrow
  `pnpm exec vitest run <file>.test.ts[x]` first check instead of no mapping.
  Source TypeScript files under `src/**/*.ts[x]` now also route to
  `pnpm exec tsc --noEmit`, giving files without sibling tests a focused
  type-safety gate instead of no mapping.
  Playwright specs under `tests/e2e/` now route to exact
  `pnpm exec playwright test tests/e2e/<name>.spec.ts` commands, keeping E2E
  journey edits focused before any broader browser sweep.
  `vitest.config.ts` / `vitest.setup.ts` now route to a small Vitest smoke that
  covers jsdom setup plus contract discovery, and `playwright.config.ts` routes
  to the local-vault picker spec before broader E2E.
  `postcss.config.mjs` and `app/globals.css` now route to the responsive
  overflow sweep spec, so global styling changes get a focused browser check.
  Next App Router entries under `app/**/*.ts[x]` and `next-env.d.ts` now route
  to `pnpm exec tsc --noEmit`, covering route exports and metadata types before
  broader browser/build checks.
  Locale routing and `messages/*.json` changes now route to
  `pnpm test:i18n:messages`, which checks configured locale files and
  translation key parity before broader app verification.
  Changes to the shared package/docs contract test now also route to
  `pnpm test:mcp:docs`, not only `pnpm test:mcp:package`, so docs assertion
  edits do not get verified by a package-only subset that skips them.

## 2026-05-18 — MCP first-contact and packed-smoke hardening

MCP verification now keeps the installed agent surface, first-contact guidance,
release smoke, and dogfood ontology in lockstep for batch writer failures.

- **Batch unknown-field diagnostics** — `add_concepts` / `add_relations`
  row-isolation checks now require every offending unknown field, nearest field
  hints, and `Received fields: ...` in row-level errors, so agents can repair
  malformed batch rows without guessing which keys were actually sent.

- **Batch relation type hints** — `add_relations` row-isolation checks now cover
  invalid relation types as row-level `ok:false` results with closest-value
  hints, not only non-object and unknown-field rows.
- **First-contact guidance gate** — `initialize.instructions` must explain the
  same invalid-type recovery path, so a newly attached agent sees the repair
  contract before writing.
- **Packed install smoke parity** — `scripts/smoke-packed-cli.mjs` now expects
  the same invalid-type + closest-value hint output from installed CLI/MCP
  verify paths, blocking source-checkout and tarball verification drift.
- **Dogfood docs contract** — MCP/CLI capability docs and package-contract tests
  now keep this verify scope visible in the project's own ontology.

## 2026-05-17 — CLI maintenance queue + focused verification

The developer CLI now exposes the MCP maintenance work queue directly, closing
one more gap between agent-side graph repair guidance and terminal dogfood.

- **`ontology-atlas maintenance`** — thin wrapper around
  `query_ontology({operation:"maintenance_plan"})`. It shows remaining /
  filtered / total queue counts, cursor state, active filters, phase / severity
  / kind bucket summaries, action severity, proposed tool hints, and next
  executable / review pointers without writing to the vault.
- **Focused CLI gate** — `pnpm integration:cli:maintenance` runs only the
  maintenance command and maintenance-related installed verify integration
  cases, so small work-queue changes no longer require the full CLI integration
  suite by default.
- **First-contact sample gate** — focused MCP/CLI verification now checks
  `workspace_brief.nextActions[].sample` executable shapes, so dogfood cleanup
  guidance cannot drift from real `add_relation` / `add_concept` inputs.
- **Dogfood docs contract** — README, CLI docs, and the self-ontology
  `cli-developer-entry` capability now document the 27-command CLI surface and
  maintenance shortcut.

## 2026-05-11 — Ontology surface UX pass + 토폴로지 별자리 톤

UI 점검 보고서 (`/`, `/topology`, `/ontology`, `/ontology/insights`,
`/ontology/edit`, `/docs`, `/projects`) 의 우선순위 항목들을 30+ 작은 PR
로 풀어낸 세션.

- **`/ontology` 트리** — multi-parent silent drop 을 stat strip 의 amber
  warning pill 로 표면화 + capability 노드 default 접힘 + 모바일 element
  파일명 truncate. 트리의 데이터 경고 disclosure 톤도 red→amber 통일.
- **`/topology` 시각** — 사용자 피드백 *"대벌레 다리"* 해결 시리즈: zoom
  out 시 edge size 감쇠, edge curvature 직선→곡선, 노드 별빛 halo +
  푸른 dust edge ("은하계 별자리" 톤), 라이트 모드 회귀 정정, recenter
  의 bbox center fallback, minimap 톤 정합.
- **드래그→릴리스 후 detail 드로어 열림 회귀** — `dragMoved`
  `queueMicrotask` reset 이 `clickNode` 가드 무력화 → 다음 `downNode`
  까지 reset 유지.
- **`/projects` 카드 fact strip** — single-project vault 에서 *도메인 6 /
  역량 14 / 요소 62* 가 hide 되던 회귀 4 단계 fix (UI fallback → BFS 로
  contains 후손 projectIds 매달림 → project node id 를 frontmatter.slug 로
  정합).
- **`/docs` 첫 진입** — default slug `FEATURES` 우선 + `?intent=local` +
  vault 미선택 케이스 server fetch fallback (영문 에러 노출 회귀 차단).
- **SEO sweep** — `/ontology/edit` sitemap, hreflang trailing slash +
  x-default, locale 별 canonical, PWA manifest 의 R12 mission 어휘.
- **R10 cleanup sweep** — tsconfig stale exclude, CI continue-on-error,
  .gitignore Firebase section, hardcoded white alpha 14 곳 → 디자인 토큰.

## 2026-05-10 — Mobile docs responsive polish

Real mobile browser review found the `/docs` header and local-vault tools were
too desktop-shaped after the Topology shortcut was added.

- The mobile docs header now keeps Back, title, doc count, and Topology in one
  compact row, with source/search/tools controls on the second row.
- The local-vault tools panel no longer stays open after a successful folder
  load from `?intent=local`, so the first document is not covered by a floating
  menu.
- The tools menu uses a viewport-bounded mobile sheet when opened manually.
- Follow-up cmux-width review fixed `/ontology` narrow layout: mobile stat
  cards stack, the demo badge no longer pushes past 320 px, and deep tree rows
  clamp indentation/truncate inside the viewport.

## 2026-05-09 — Cleaner single-file repo bootstrap graph

Large demo bootstrap uncovered a second cold-start quality issue: single-file
layered repos could land support folders such as `src/domain` and `src/storage`
as fake capability nodes (`capabilities/domain`, `capabilities/storage`).

- Import graph module collapse now keeps `src/features/*.js` as capabilities
  while classifying support-layer files (`domain`, `storage`, `integrations`,
  `reports`, `shared`, `app`, `lib`, `utils`) as elements.
- A clean `init → bootstrap` run on the large demo now lands 5 README domains,
  8 user-facing capabilities, and 18 implementation elements with zero errors.
- Regression coverage now blocks folder-name capability noise from returning
  for single-file layered projects.

## 2026-05-09 — Docs-to-topology navigation visibility

Large demo project follow-up found a real discoverability gap: after loading a
local vault in `/docs`, the Topology entry existed only inside the small vault
tools menu, and mobile bottom navigation did not expose Topology at all.

- `/docs` header now has a direct Topology link beside the vault title/source
  controls.
- Mobile bottom navigation now exposes Topology as its own first-class tab
  instead of hiding it under Ontology.
- Browser smoke verified desktop `/docs` and mobile `/docs` can navigate
  directly to `/topology`.

## 2026-05-09 — Large clean-room bootstrap hardening

큰 단일 파일 feature 구조의 clean-room 프로젝트
`/Users/jinan/side-project/ontology-atlas-large-demo` 로 `init → bootstrap → validate →
MCP verify → web /docs + /ontology + /topology`를 실제 수행했다. 발견한 문제:
`analyze`가 FSD marker만 보고 `src/features/*.js` 파일형 feature를 노드로 만들지
못했고, `infer-imports`가 만든 edge endpoint가 vault에 없어 bootstrap이 깨질 수
있었다.

- `bootstrap`이 import graph endpoint를 먼저 capability/domain 노드로 생성한 뒤
  `depends_on`을 적용한다. 단일 파일 feature slug는 `.js/.ts` 확장자를 제거한다.
- import로 만든 capability는 project→domain→capability containment로 연결해 웹
  ontology tree의 다중 부모 warning 없이 프로젝트 아래에 붙는다.
- 웹 `deriveOntologyFromVault`가 `domain: domains/foo`,
  `dependencies: [capabilities/bar]`, `contains: [capabilities/bar]` 같은
  folder-prefixed ref를 CLI/MCP와 같은 node id로 해석한다. 19 docs가 31 nodes로
  부풀던 중복 unknown/stub 문제가 사라졌다.
- 회귀 테스트 추가: 단일 파일 layered repo bootstrap, single-file feature import
  slug, folder-prefixed frontmatter ref 해석.

## 2026-05-09 — Clean onboarding bootstrap polish

Fresh user setup now covers the full `init → bootstrap → validate → MCP
register` journey. `analyze --apply` and `bootstrap` remove untouched `init`
starter examples before real repo-derived nodes land, while preserving any
starter file the user already edited. The clean onboarding smoke uses isolated
`HOME` and `CODEX_HOME`, confirms Codex starts with no MCP servers, then
registers the printed command.

CLI help now matches the current setup contract: auto-prefix is default,
`--raw-slug` is the opt-out, `init` writes real `.mcp.json` files for
Claude/Cursor, and later follow-up adds repo-local `.codex/config.toml` for
Codex while keeping the printed `mcp add` command as a global fallback.
`init` also prints copy-pasteable repo-root bootstrap commands
(`ontology-atlas analyze . --vault ./ontology` and `bootstrap . --vault
./ontology`) instead of placeholder `/path/to/your/repo` examples.

### Docs first-time path and route drift cleanup

The `/docs/?intent=local` first-time path now has E2E coverage for the
`docs/ontology/` dogfood hint. README and PRODUCT-DIRECTION were realigned with
the current route/tool surface: `/ontology/relations` is no longer listed as a
live route, MCP is 20 tools, and the dogfood vault count is 26 nodes.

### Launch copy current-surface guard

Launch drafts, publish notes, and README setup copy now describe the current
MCP/onboarding contract: 20 tools, generated `.mcp.json` files for Claude
Code/Cursor, Codex setup guidance, and the 26-node dogfood vault.
A unit test blocks stale launch claims such as "12 tools", old dogfood demo
counts, and obsolete test totals from returning to current-facing docs.

### Starter vault agent setup parity

The starter vault README now spells out both AI-agent setup paths: generated
`.mcp.json` for Claude Code/Cursor and Codex setup guidance. Later follow-up
adds generated `.codex/config.toml` for Codex while retaining the explicit
`codex mcp add` fallback. Web workbench starter content and CLI templates are
covered by a byte-for-byte parity test, so the two onboarding surfaces cannot
drift silently.

### Local vault change toast coverage

`VaultDiffToaster` now delegates toast planning to a pure helper. Unit coverage
locks added/modified classification, null `mtime` skip behavior, removed-node
silence, preview ordering, and overflow copy so local vault polling can keep
showing concise external edit feedback without brittle component-only logic.

### Web E2E modernization

Playwright E2E was realigned to the current local-first, locale-prefixed
surface. Stale `/login`, `/knowledge`, `/review/*`, and `/project/sample`
expectations were replaced with `/en` routes, the dogfood `ontology-atlas`
project, local vault picker copy, and static topology smoke. Full browser E2E
now passes (`27 passed`), and the accessibility structure audit reports zero
findings after adding the ontology page main landmark and demoting rendered
markdown document H1s inside the Docs Vault page.

## 2026-05-07 — Round 18: AI agent UX 강화 루프 — read shape · batch tools · vault health · ARIA tree · CLI --apply

자율 개선 루프 ~30 PR. **mcp 16→20 tools (read 10→12, write 6→8), cli 13→15 commands, /ontology-bootstrap round-trip ~25→3**. agent (Claude Code · Cursor · Codex) 가 적은 호출로 더 정확한 vault sync, 사용자가 키보드만으로 tree 완전 항해, agent-less CLI 도 batch parity.

### MCP — read tool 응답 shape 완전 일관 (#176 #180 #183 #186 #189 #191 #194 #195 #196)

read tool 5종 (`list_concepts` · `find_backlinks` · `find_orphans` · `query_concepts` · `find_evidence`) 매치 row 가 모두 같은 shape: `{ slug, kind, title, domain, mtime, ...specific }`. agent 가 어느 read tool 결과든 동일 sort/filter 로직 재사용 — staleness 감지 (mtime), 도메인 필터 모두 후속 `get_concept` 없이.

- `list_concepts`: `domain` 필터 (kind 결합), `since` 필터 (mtime-based incremental sync), 각 row `mtime`, `summary: true` opt-in (prose 미리보기 N+1→1 호출).
- `get_concept`: excerpt 가 *prose-aware* (heading/표/코드/리스트/인용 skip). dogfood `mcp-server.md` excerpt 800ch (table syntax) → 78ch (clear summary).
- 에러 메시지가 *actionable* — "Did you mean: ..." suggestion + 다음 액션 한 호출에 결정.
- `find_path` 응답에 `edges[via]` 추가 — agent 가 *왜* A↔B 가 연결됐는지 (어느 frontmatter key 가 link 했는지) 한눈에.

### MCP — 배치 도구 3개 + vault health 신규 (R+, 16→20 tools, #197 #198 #199 #220)

- **`get_concepts`** (read 11번째) — 입력 `{slugs: string[]}` (max 50), 출력 `{concepts: [...]}`. K round-trip → 1, partial result (missing slug 은 row-level `ok: false`).
- **`add_concepts`** (write 7번째) — 배치 노드 작성. 입력 *내* 중복 slug 사전 감지로 명료한 에러 (`concepts[n] duplicate slug in input batch; first seen at concepts[m]`), atomic rollback 없음 (partial 시맨틱).
- **`add_relations`** (write 8번째) — 배치 edge 작성. idempotent (동일 edge → `alreadyExists: true`), 50-row chunk 분할 가능.
- **`validate_vault`** (read 12번째) — vault 전체 health 를 한 호출에 반환. agent 가 `list_concepts` 후 K개의 `get_concept` 경고를 모으는 패턴을 1 round-trip 으로 대체.

이로써 `/ontology-bootstrap` 흐름이 `analyze_repo_structure → add_concepts → add_relations` **3 round-trip 으로 완결** (이전 ~25). skill 본문 (`#200`) 도 새 도구 사용 가이드로 갱신.

### Tree — full ARIA tree 키보드 패턴 (#188 #190 #201 #202)

`/ontology` · `/` 페이지의 tree widget 이 W3C WAI tree role 표준 키 셋 완전 정합:

- **↑/↓** — 다음/이전 visible row focus
- **←/→** — collapse/expand
- **Home/End** — 첫/마지막 row (Cmd/Ctrl/Alt 모디파이어 무시 — 브라우저 스크롤 보존)
- **type-to-search** — 라틴/한글/숫자 1글자, 600ms 누적 buffer, wrap-around, 같은 char 반복으로 advance
- **← (leaf 또는 이미 접힘)** — parent row focus (depth-based walk-back)

기존 Tab 흐름은 그대로 유지 — additive layer.

### CLI — agent-less full bootstrap (#203 #204)

agent (Claude Code 등) 없는 환경 (CI · plain shell) 도 1줄로 vault 부트스트랩:

```bash
ontology-atlas analyze . --apply       # 노드 batch land (add_concepts + add_relations)
ontology-atlas infer-imports . --apply # depends_on edges land (50-row chunk)
```

`--apply` 미지정 default 는 read-only — \"git push --force\" UX 로 명시적 opt-in. partial result ("N landed · M already existed · K errors"), `--json` 시 머신 가독, 두번째 실행 idempotent.

### CLI — graph-level 명령 보강 (#182 #192 #193)

- `validate` — grouped-by-code 요약 섹션 (큰 vault 가독성)
- `orphans` — `find_orphans` MCP wrapper (15번째 명령)
- `path` — 회귀 fix 재도입 + `edges[via]` CLI 노출

### /topology 사용성 (#173 #174 #185)

- 도메인·고연결 ontology 노드 라벨 항상 노출, multi-parent self-warning 침묵 (시각적 noise 차단)
- ontology 노드 클릭 → 빈 drawer 대신 `/ontology` ego graph 로 라우팅
- edge dedup · `?` 키 글로벌 검색 충돌 fix · 모바일 truncate 회귀 일괄 정리

### Skill / Docs / Dogfood (#178 #179 #181 #200 #205)

- MCP `instructions` 필드 — agent 가 첫 메시지부터 정확한 가이드 (kind 계층 · 첫 호출 순서 · dry-run + confirm 패턴 · `expected_mtime` conflict guard)
- AGENTS.md / README.md / docs/FEATURES.md / mcp/README.md — tool count + read/write 분포 일괄 동기화 (16→19 흐름 따라 매 cycle)
- `/ontology-bootstrap` skill — 본문이 새 batch 도구 사용으로 갱신, CLI fallback 도 `--apply` 짝으로 batch parity
- dogfood `capabilities/cli-developer-entry` — 11→15 명령, --apply 반영 (cycle 동안 stale)

### 측정

| 지표 | R17 끝 | R18 끝 |
|---|---|---|
| MCP 도구 | 16 (read 10 + write 6) | **20 (read 12 + write 8)** |
| CLI 명령 | 13 | **15** |
| `/ontology-bootstrap` round-trip | ~25 | **3** |
| 전체 vitest | ~810 | **839** |
| MCP integration test | 14 | **24** |
| CLI integration test | 32 | **49** |
| stale tool count refs | 5 docs | 0 |

## 2026-05-06 — Round 17: `infer_imports` — TS/JS import graph → depends_on edges

R16 의 `analyze_repo_structure` (heuristic 후보) 의 *강력한 짝*. 코드의 *진짜 import graph* 를 자동 추출해 `depends_on` 관계 후보로. mcp v0.8.0 → v0.9.0 (15 → 16 tools), cli v0.4.0 → v0.5.0 (12 → 13 명령).

### MCP `infer_imports` (16번째 tool)

- TS/JS file 들 (`.ts/.tsx/.js/.jsx/.mjs/.cjs/.mts/.cts`) walk + regex parse
- import 종류 6 — static / dynamic `import()` / `require()` / `export ... from` / side-effect `import "X"` / type-only
- 상대 경로 (`./` `../`) → 실 파일 resolve (확장자 + `index.*` fallback)
- **`@/*` path alias** convention 자동 resolve (Next.js / FSD 의 80%+ case)
- external (npm) 분리, unresolved 분리 (`relative-not-found` / `alias-not-found`)
- **module-level edge collapse** — capability/feature folder 간 import 합산 (FSD bucket 인식: `features/X` / `entities/X` / `widgets/X` / `views/X`)

응답: `{ rootPath, filesScanned, edges[], externalImports[], unresolved[], moduleEdges[] }`. side effect 0.

### Validated — Paravel real-codebase

사용자 본인 React Native + Expo + FSD 1.8 GB:

| 측정 | 값 |
|---|---|
| files | 304 |
| edges | **837** (이전 R17 미적용 시 355 → alias resolve 로 2배+) |
| external (npm) | 506 |
| unresolved | 0 |
| **module edges** | **103** |

상위 module edges:
- `screens → shared` × 98
- `app → screens` × 22
- `features/diary → shared` × 18
- `features/create-post → entities/post` × 6
- ... 87 more

FSD layering 정확 자동 추출. 사용자 본인이 *수동 add_relation* 으로 그릴 그래프를 *코드에서 자동* 산출. **mission *"완벽에 가깝게 그래프 생성"* 의 다음 큰 step**.

### CLI `infer-imports` 명령 (13번째)

mcp child_process spawn wrapper. `--max-files N` / `--json`. 사용자 본인 daily 로 `ontology-atlas infer-imports` 한 줄 → 이 codebase 의 *진짜 의존 관계* 표시.

### 단일 source of truth 보존

- 결과는 **return only** — vault frontmatter 절대 안 건드림
- 사용자 / agent 검토 후 *명시 `add_relation depends_on`* 만 진입
- 별도 cache / index 0
- drift surface 0

### Tests

- 8 unit case — relative / external / alias / dynamic+require+reexport / module collapse / unresolved / ignored folders / side-effect
- mcp 29 → **37 tests** (R17 8 추가)
- cli integration 32/32 (회귀 0)

### Mission align

R16 *analyze_repo_structure* 가 *kind 후보* 자동, R17 *infer_imports* 가 *관계 후보* 자동. 둘이 합쳐 사용자 한 번 호출 = 30+ 노드 + 100+ 관계 candidate. *기가막히게 잘해줘서 완벽에 가깝게 그래프* 의 base 둘 다 land.

---

## 2026-05-06 — Round 16: 자율 ingest base — `analyze_repo_structure` 첫 도구

사용자 grill-me 결정 (Q1: AI 자동 ontology 화 / Q2: 자율 ingest from codebase 가 가장 critical 약점). *"MCP 가 잘 되면서 온톨로지화를 기가막히게"* + *"단일 source of truth 보존"* 의 첫 step.

### MCP `analyze_repo_structure` (15번째 tool, mcp v0.7.1 → v0.8.0)

사용자 한 줄 *"이 codebase 분석해줘"* 후 AI agent (Claude Code, Codex, Cursor) 가 호출할 *deterministic helper*. **side effect 0** — vault frontmatter 절대 안 건드림, 후보만 return:

- `package.json` `name/description` → project candidate
- `README.md` 첫 H1 → project title fallback
- `README.md` H2 sections (Usage / Installation / Tests 등 generic skip) → domain candidates
- `src/features|entities|widgets|views/*` (FSD) 또는 `src/*` (generic) → capability/element candidates
- `suggestedRelations` — project contains 각 capability

응답 shape: `{ rootPath, framework, project, domains[], capabilities[], elements[], suggestedRelations[], skipped[] }`. 사용자 검토 후 *명시 add_concept / add_relation* 만 vault 진입 → **단일 source of truth 보존**.

### CLI `analyze` 명령 (cli v0.3.0 → v0.4.0, 11 → 12 명령)

mcp child_process spawn wrapper. 동일 contract — color CLI / `--json` / `--max-depth`. publish 후 `npx ontology-atlas analyze` 한 줄로 분석.

### Tests + dogfood

mcp/src/analyze.test.mjs — 7 unit case (FSD / generic / no package.json / generic README skip / ignored folders / empty dir / suggested relations). dogfood `capabilities/mcp-server.md` 갱신 (15 tools, analyze.mjs element 추가). AGENTS.md *"빈 vault bootstrap"* 섹션 영문 + 한국어 추가.

### Mission align

이전 — 사용자가 `init` 후 *수동 add* 25 회 (Paravel real-codebase dogfood 측정). *첫 user Aha moment* 부족.
이후 — agent 가 한 번 `analyze_repo_structure` → 30+ 후보 즉시. 사용자 검토 + 1-clicks add_concept 다발 호출. *기가막히다* 의 base.

### R16 follow-up — `/ontology-bootstrap` skill

`/ontology-sync` (이미 자란 vault 의 incremental sync) 의 cold-start 짝. agent 한 줄 사용자 의도 ("이 codebase 분석해줘") → `analyze_repo_structure` → 5 줄 요약 → yes/pick/refine 분기 → `add_concept` / `add_relation` 다발 → 마무리 census diff.

- `.claude/skills/ontology-bootstrap/SKILL.md` 신설 — agent prompt 수준에서 흐름 orchestrate. 진입은 `add_concept` 만 → 단일 source of truth 보존
- AGENTS.md 의 *빈 vault bootstrap* 섹션 (영문 + 한국어) 갱신 — skill cross-ref
- dogfood `capabilities/ontology-bootstrap-skill` (26번째 노드) + `domains/ai-agent-partner.capabilities` endorse

vault 25 → 26 노드 (capability 14). orphan 1 (의도적 project) / drift 0 / validate clean.

### 다음 step (R18 후보)

- `extract_domains_from_readme` (heading 계층 + body 분석 deeper)
- agent 의 *implicit detect* 강화 (작업 중 자율 sync, b2 단계)
- `/ontology-bootstrap` skill 의 infer-imports 단계 통합 (analyze → infer → add 다발)

---

## 2026-05-06 — Round 15 follow-up #2: Project type honest (Concern 1 fix)

post-publish architectural audit (Plan agent advisor) 의 *blocking* Concern 1 fix. **`Project` 18 fields silent fabrication** — vault frontmatter 4 fields ↔ web 18 fields *두 source-of-truth*. `deriveProjectsFromVault` 가 fabricated default (`category: 'uncategorized'` / `status: 'active'` / `isHub: false` / `position: { x:0, y:0 }`) 을 박아 web 이 *vault 가 가지지 않은 정보* 를 표시. README *"frontmatter is the graph"* 약속과 충돌.

### 변경 — Project type 정직화

`src/entities/project/model/types.ts`:

| field | before | after |
|---|---|---|
| `category` | required | **optional** (vault frontmatter `category:` 명시 시만) |
| `status` | required | **optional** |
| `isHub` | required `boolean` | **optional** (vault `isHub: true` 명시 시만 true. false fabrication 차단) |
| `position` | required `ProjectPosition` | **optional** (vault `position:`/`positionX/Y:` 명시 시만) |
| `timeline` | required `ProjectTimeline` (often `{}`) | **optional** (`startedAt`/`launchedAt` 명시 시만) |

각 field 에 JSDoc *"vault frontmatter X 에서 derive. 없으면 undefined."* 명시.

### derive 함수 — silent fabrication 제거

`deriveProjectsFromVault` (src/entities/docs-vault/lib/derive-projects-from-vault.ts):
- `category: fm.category || 'uncategorized'` → frontmatter 명시 시만 string, 없으면 `undefined`
- 동일 패턴 — `status` / `isHub` / `position` / `timeline` 모두 honest. *empty 가 아니면 undefined*.

### Callsite 정리 (legacy fabrication 명시화)

20+ files 의 callsite 가 fabricated default 가정 — type level 변경으로 ts errors 발생. 일관 전략:
- *form-local default* (`ProjectInput` / form schema 등 사용자 vault frontmatter 작성 도구) — `?? 'uncategorized'` / `?? 'active'` / `?? { x:0, y:0 }` 적용. form 진입 시 default 채움 → frontmatter 에 기록 → 다음 derive 부터 honest.
- *integrity check* — frontmatter 가 명시 안 한 건 issue 아님 (사용자 의도). 명시됐는데 taxonomy 에 없으면 issue.
- *placement / topology* — undefined position 은 *원형 자동 배치* fallback (이전엔 fabricated `{0,0}` 으로 모든 노드 원점에 겹쳤음).
- *ProjectCard / SearchPalette / graph-build* — `Boolean(project.isHub)` 으로 narrow.

### TaxonomyProvider signature 변경

`categoryLabel: (id: string) => string` → `(id: string | undefined) => string`. undefined 이면 `'—'` (em-dash) placeholder. fabricated `'uncategorized'` 라벨 보다 honest.

### Test

derive test — `isHub 없으면 false` → `isHub 없으면 undefined` (R15 honest 명시). 814/814 unit, 32/32 cli integration, vault 25 nodes clean, 17 lint warnings (17 floor 그대로), build OK.

### Mission align

이전 — vault 4 fields, web 18 fields → README *"frontmatter is the graph"* 약속 violation. AI agent 가 `add_concept(kind:'project')` 해도 web 에선 placeholder taxonomy 로 렌더.
이후 — vault 가 가진 만큼만 web 에 표시. *honest second-source-of-truth 제거*. AI agent 가 만든 노드와 web 의 표시가 *정확히 일치*.

---

## 2026-05-06 — Round 15 follow-up: CLI graph-level 5 명령 (Concern 4 fix)

post-publish architectural audit (Plan agent advisor) 발견 *blocking* concern — **CLI 6 vs MCP 14 ergonomic asymmetry**. 개발자가 *위험한-그러나-필수* 작업 (rename / merge / delete / query / backlinks) 을 *AI agent 통해서만* 할 수 있어 mission *"developer + AI agent grow together"* inversion. 이 PR 이 fix.

### CLI 5 graph-level 명령 추가 (cli v0.2.0 → v0.3.0, 6 → **11 명령**)

| Command | Wraps MCP tool |
|---|---|
| `backlinks <slug>` | `find_backlinks` |
| `query "<filter>"` | `query_concepts` (typed DSL) |
| `rename <old> <new>` | `rename_concept` (dry-run + --confirm) |
| `merge <from> <into>` | `merge_concepts` (dry-run + --confirm) |
| `delete <slug>` | `delete_concept` (dry-run + --confirm + --force) |

### Implementation — `cli/src/lib/mcp-call.mjs` (single source of truth via spawn)

새 명령들은 MCP server child_process spawn + JSON-RPC 로 호출. mcp 가 *진실원*, cli 는 thin wrapper. drift surface 0 (logic 복제 안 함). spawn overhead ~50-100ms per call — 한 번씩 호출이라 acceptable.

- mcp entry resolution: `OATLAS_MCP_PATH` env → `require.resolve('ontology-atlas-mcp/src/index.js')` → monorepo dev fallback
- `cli/package.json` 에 `dependencies: { "ontology-atlas-mcp": "^0.7.1" }` 명시 — npm install 시 mcp 자동

### Mission align

이전 — cli 는 *온톨로지 노드 만들기* (init/add/import) 까지만, *그래프 변경* 은 mcp-only. AI agent 가 *유일한 ergonomic write surface* 였음. 이제 — cli 가 mcp 와 *동등 권한*. 사용자가 본인 daily 로 rename/merge/delete 사용 가능.

### Tests

cli integration **24 → 32** (+8 new):
- backlinks 컬러 + JSON
- query DSL filter
- rename dry-run + --confirm + backlink redirect 검증
- delete backlinks 가드 + --confirm
- merge dry-run preview

### Dogfood vault

`capabilities/cli-developer-entry.md` 갱신 — 6 → 11 명령, 5 element 추가 (backlinks/query/rename/merge/delete + mcp-call helper).

---

## 2026-05-06 — Round 15: VSCode plugin 제거 — AI-agent 터미널 시대로 진입점 단순화

R14 closeout (PR #164) 후 사용자 명시 — *"vscode plugin 은 없어도 될 듯. 이제 대부분 vscode 안 쓰고 claude code / codex 를 사용하지"*. R13 에서 v0.1.0 → v0.9.0 까지 키운 4번째 surface 통째 제거. 4 surface (CLI · MCP · Web · VSCode) → **3 surface (CLI · MCP · Web)**.

### 왜 제거?

- **daily driver 변화** — 사용자 본인을 포함한 *primary audience (developer)* 가 일상 IDE 를 Claude Code / Codex 같은 AI-agent 터미널로 전환. VSCode 자체 점유율 감소.
- **가치 중복** — VSCode plugin 의 4 surface (TreeView / 코드↔ontology 점프 / Add concept / Backlinks panel) 가 모두 *MCP (AI agent) + CLI (developer terminal) + Web (그래프 시각화)* 의 조합으로 같은 가치 cover. graph webview 는 R13 #67 (v0.9.0) 에서 이미 *웹의 강점 영역으로 위임* 결정.
- **유지비 감소** — 매 PR 마다 4-layer 자동 검증 (단위 27 / MCP integration 3 / VSCode integration 5 / vsce package gate) + 5-way parser contract (12 fixture × 5 = 60 case) 부담. 3 surface 로 회복하면 4-way (12 × 4 = 48 case) 로 단순화.

### 제거 범위

- `vscode-plugin/` 폴더 통째 (15+ 파일, ~3000 LOC, v0.9.0 vsix 포함)
- `tests/contract/parse-frontmatter.contract.test.ts` 5-way → 4-way (vscode parser import 제거)
- `.github/workflows/ci.yml` 의 "VSCode plugin — install + test + e2e + package" step 제거 (xvfb-run + @vscode/test-electron + vsce package)
- dogfood vault: `capabilities/vscode-plugin-ide-entry.md` 삭제 + `domains/onboarding-ux.capabilities[]` 에서 endorse 제거 → 26 → 25 노드
- README / AGENTS.md (영문 + 한국어) / PRODUCT-DIRECTION 의 "(planned) VSCode plugin" / "VSCode plugin v0.1.0 MVP" / "4 surface" 표기 정리

### 보존 (재도입 시 root)

- 코드 자체는 git history 에 보존 (R13 wave PR #49-#67 commits). 미래 VSCode 재도입 결정 시 `git revert` 또는 cherry-pick 가능.
- `docs/CHANGELOG.md` R13 항목은 그대로 보존 — *역사적 사실* 이고, "한 번 빌드했다가 daily driver 변화로 제거" 결정 자체가 product call 기록.

### Surface 표 갱신

| Surface | 진입 | 상태 |
|---|---|---|
| **CLI** | `ontology-atlas init / list / validate / add / find / import` | v0.2.x (6 명령) |
| **MCP** | 14 tools (8 read + 6 write) | v0.7.1 |
| **Web** | `/`, `/topology`, `/docs`, `/ontology`, `/ontology/edit`, `/ontology/insights`, `/projects`, `/project/[slug]` | R10 surface diet 후 |
| ~~VSCode plugin~~ | ~~status bar match · backlinks · add concept · MCP connect~~ | **제거 (R15)** |

→ "개발자가 어디 있든 같은 vault" 약속은 그대로 — *AI agent 터미널 (Claude Code · Codex · Cursor)* 이 IDE 역할을 흡수하며 VSCode plugin 의 일상 사용 가치가 자연스럽게 0 으로 수렴.

### CLI `init` 의 mcp 등록 마찰 1 step 제거

3 surface 의 onboarding 단순화 후속. 이전엔 `init` 이 `.mcp.json.example` 만 생성 → 사용자가 cp 해야 했음. 변경:

- `.mcp.json` 자체를 직접 생성. 사용자가 vault 폴더를 AI agent 에서 열면 *cp 단계 없이* 14 tools 즉시 등록.
- 기존 `.mcp.json` 보존 + `.mcp.json.example` 별도 (수동 merge 가능).
- `OATLAS_VAULT` absolute → **relative `.`** (portability).

```diff
- npx ontology-atlas init my-vault
- cd my-vault
- cp .mcp.json.example .mcp.json   # 마찰 1 step
- # AI agent 재시작
+ npx ontology-atlas init my-vault
+ cd my-vault
+ # AI agent 즉시 인식
```

---

## 2026-05-05 — Round 14: AI agent ↔ vault 자동 sync + 웹 즉시 반영 + frontmatter schema

R13 closure 후 *"개발자와 AI agent 가 같이 키운다"* 미션의 자동성 강화. 두 갈래 — agent 가 vault 를 알아서 읽고/쓰고, 그 변화가 웹에 즉시 흘러오고. 9 PR 묶음 (#155-#163).

### Web 즉시 반영 — polling → 그래프 pulse → 두 toast (#155 #156 #157 #158)

사용자 명시 *"웹에서나 잘 반영되면 좋겠는데? 그걸 강화하는건 어때"* 의 4 단계 완성.

| Step | What | Where 인지 |
|---|---|---|
| #155 polling | 5s 간격 fingerprint check + visible-only 자동 reload | 백그라운드 |
| #156 graph diff pulse | 새 노드 amber sine 5s | `/topology` 그래프 |
| #157 added toast | `Added: <slug>` info toast | 모든 페이지 |
| #158 modified toast | `Edited: <slug>` success toast (mtime 변화) | 모든 페이지 |

이제 IDE / AI agent / CLI 어느 surface 가 vault 만지면 웹 탭 *focus 안 해도* ~5s 안에 그래프 + toast. `prevSlugsRef Set` → `prevMapRef Map<slug, mtime|null>` 로 확장해 added/modified 분기. static manifest (mtime null) 은 비교 skip 으로 false-positive 차단.

- `use-local-vault.ts` — `setInterval(tryReload, 5000)` visible-only, hidden 시 dispose
- `widgets/topology-map-sigma` — `runtimeRecentSlugs` 5s set, 기존 `recentPulse` 인프라 재사용
- `features/docs-vault-local/model/VaultDiffToaster.tsx` 신설 — 첫 mount baseline, 이후 added/modified 분류, PREVIEW 3 + "+N more"
- 사용자 검증 단계: dev server → IDE 에서 `ontology-atlas add` 또는 `.md` 편집 → 5s 안 toast + 그래프 pulse

### Walkthrough 검증 + topology↔ontology 회복 (#159)

R14 walkthrough 에서 발견된 4 이슈 + 사용자 약속한 topology↔ontology 연계 회복.

- **i18n 404** — `app/[locale]/not-found.tsx` 추가, client-side locale 감지로 ko/en 분기. 이전엔 정적 export 한계로 `/ko/foo` 가 영문 fallback 만 떴다.
- **home UX 간격** — 좌하단 hint 카드와 stats bar 가 거의 붙어 있던 것을 `bottom-14` → `bottom-20` 으로 24px gap. 데이터 경고 alert 에 `ChevronRight` affordance.
- **stale doc** — AGENTS.md / .claude/rules/architecture.md 의 살아있는 라우트 목록에서 `/ontology/relations` 표기 제거 (R12 에서 사라졌고 분포 정보는 `/ontology/insights` 안으로 통합).
- **🚨 topology↔ontology 연계 회복** — `/topology` 가 dogfood 환경에서 *"1 노드 · 0 엣지"* 빈 화면이었던 회귀를 회복. `buildGraph` 에 `ontologyExtension` 옵션 추가, vault frontmatter 의 도메인 / 역량 / 요소 노드와 그 관계까지 같은 그래프에 그림. `isOntology` 플래그로 size scaling / owner overlay 분기에서 제외 → project 본 골격 보존. 결과 1 노드 → **68 노드 · 112 엣지** 로 회복.

### Frontmatter schema 양식 — three entry points 동기화 (#160)

사용자 질문 *"AI agent 가 같은 양식으로 작성하게 인식 가능한 구조"* 의 1차 답변. 두 진입점 (`add_concept` MCP · `add` CLI) 이 같은 schema 모듈을 통해 .md 만들고, 같은 advisory warnings 노출.

이전: `cli/templates/vault/` 에 kind 별 견본은 있었지만 `cli init` 만 사용. `add_concept` / `cli add` 는 `slug + kind + title` 만 박고 arrayDefaults 미채움 → AI agent 가 만든 capability 가 `elements: []` 슬롯조차 없는 .md 로 disk 에 남았다.

- **`mcp/src/schema.mjs` · `cli/src/lib/schema.mjs`** — single source. kind 별 `arrayDefaults` (project: domains/capabilities/elements, domain: capabilities, capability: elements), `requiredExtras` (capability/element 의 domain), `folder`, kind 별 starter body. 두 파일 lock-step.
- **3-way validator** 가 새 issue code `missing-expected-field` 동시에 인식. severity=warning (error 아님) → pre-existing vault 호환 보존.
- **Contract test** `tests/contract/vault-schema.contract.test.ts` — mcp/cli 두 schema 가 같은 결과 + UI 측 `KIND_EXPECTED_EXTRAS` 일치 강제.

### CLI `import` — 외부 .md schema 정규화 후 vault 정착 (#161)

#160 위에 분기, 사용자 약속의 *"우리 양식을 주면 그대로 작성해서 md import"* 답변. 세 진입점 (`add_concept` MCP · `add` CLI · 새 `import` CLI) 이 모두 같은 schema 모듈 통해 .md 만든다.

```bash
ontology-atlas import <path...> [options]
  --vault path          target vault root (default: cwd)
  --kind K              fallback kind when input has no frontmatter kind:
  --auto-prefix         kind→folder (capability → capabilities/)
  --rename              slug clash 시 -2 / -3 ... 자동 회피
  --dry-run             디스크 변경 0, plan 만 출력
```

처리: `parseFrontmatter` → kind/slug/title resolve (입력 frontmatter > flag > basename) → `buildFrontmatter` → 충돌 detect → `writeDoc`. 입력의 다른 키 (depends_on / 사용자 정의 …) 보존, 빈 body 면 schema starter. `.git` / `node_modules` / dotfile 디렉토리 walk skip.

cli integration test 13 → **20 case**. cli `init / list / validate / add / find / import` **6 명령** 으로 확장.

### `/ontology-sync` agent skill + AGENTS read-while-coding 룰 (#162)

사용자 의도 *"AI agent 가 작업 중간 ontology 읽어서 도움받고, 끝나면 알아서 vault 에 기록"* 의 자동성 강화.

- **AGENTS.md 의 'Working with the ontology while you code' 섹션** 추가 — Read at start (`list_kinds` / `list_concepts` / `get_concept` / `find_backlinks` / `find_path`) + Write at end (`add_concept` / `add_relation` / `rename_concept` / `merge_concepts` / `patch_concept`) + skip 케이스 (typo, style, fixture). agent 시스템 prompt 수준에 박혀 매 prompt 활성.
- **`.claude/skills/ontology-sync/SKILL.md`** — `/ontology-sync` slash command. 사용자 명시 invoke 시 git diff + 컨텍스트로 ontology delta 식별 → MCP write 도구로 반영. reply 5 줄 max, failure mode 4 종 (duplicate slug / dangling parent / mtime conflict / backlink rot) cover.

Demo: 자연 prompt — *"password reset 추가하려고 plan"* — 만으로 agent 가 11 → 13 노드, frontmatter R14 양식 정확, validate 0 issue 로 자율 작성. 사용자가 "ontology" 단어 0 회 사용.

### SessionStart hook — vault 요약 자동 inject (#163)

#162 의 후속. 명시 호출 없이 *읽기 면* 활성. Claude Code 가 vault 있는 repo 에 attach 하면 한 번 census 를 system context 에 자동 inject — agent 가 매 prompt message #1 부터 ontology 인지.

vault 결정 우선순위: `OATLAS_VAULT` env → `<cwd>/docs/ontology` → `<cwd>/vault` → cwd 의 `kind:` 가진 `.md` → 못 잡으면 silent exit. **vault 없는 repo 에서 noise 0**.

| 진입점 | 시점 | 효과 |
|---|---|---|
| **SessionStart hook** (#163) | 새 세션 시작 시 1회 | vault 인지가 message #1 부터 |
| **`/ontology-sync` skill** (#162) | 사용자 명시 invoke | git diff 기반 변경 추출 + write back |

암시적 + 명시적 두 갈래 활성. 메타 검증: dogfood vault 가 자기 자신의 새 hook 을 자기 ontology 에 자율 박음 — *"방금 추가한 SessionStart hook, ontology 에 sync 해줘"* 한 줄에 24 → 25 노드, dependencies/relates 자동 추론.

### Dogfood vault 갱신

R14 의 새 capability 2 노드 추가:
- `capabilities/ontology-sync-skill` (`.claude/skills/ontology-sync`)
- `capabilities/session-start-ontology-context` (`.claude/hooks/inject-ontology-summary.sh`)

23 → **25 노드** (capability 13 · domain 6 · element 4 · project 1 · vault-readme 1). `pnpm vault:validate` clean.

### 4 surface 모두 작동

| Surface | 진입 | 상태 |
|---|---|---|
| **CLI** | `ontology-atlas init / list / validate / add / find / import` | v0.2.x (6 명령) |
| **MCP** | 14 tools (8 read + 6 write) | v0.7.1 |
| **Web** | `/`, `/topology`, `/docs`, `/ontology`, `/ontology/edit`, `/ontology/insights`, `/projects`, `/project/[slug]` | R10 surface diet 후 |
| **VSCode plugin** | status bar match · backlinks · add concept · MCP connect (graph webview R13 #67 에서 제거) | v0.9.0 |

→ "개발자가 어디 있든 같은 vault, 같이 자라남" 의 read 자동 + write 자동 + 즉시 반영 까지 도달.

---

## 2026-05-04 — Round 13: AI agent quality 첫 측정 + VSCode plugin MVP

R12 closure 후 *제품 핵심 가설* 첫 측정. 측정 결과 강한 confirming evidence 위에 README 약속의 미완성 surface (VSCode plugin) 첫 구현.

### AI agent quality benchmark (#47, #48)

`docs/benchmark/` 신설 — 7 task × 3 카테고리 (cross-cutting / semantic / negative-control), Claude Code + Codex 양 agent. Claude Code 자동 측정 (mcp/src/index.js spawn JSON-RPC), Codex 자동 측정 (codex exec). Codex 는 사용자 명시 승인 후 `--dangerously-bypass-approvals-and-sandbox` 로 진짜 MCP 실행.

**Cross-agent 결과 (n=2)**:
- **Claude Code**: MCP 가 hallucination 제거 — Cat A hallucinations 9 → 0, correctness +1.0
- **Codex (bypass)**: MCP 가 efficiency — Cat A tool calls 7.0 → 1.67 (76% 감소), correctness 이미 saturated
- **두 agent 모두 negative control (Cat C) 통과** — raw read 적절한 task 에 ontology 도구 over-reach 안 함

→ MCP integration 가치가 *agent 별로 다른 mechanism* 으로 measurable. README "Verifiable promises" 표에 "AI agent quality measurement (cross-agent, n=2)" 행 추가.

### MCP `instructions` field (#45)

mcp v0.7.0 → v0.7.1. Initialize 응답에 시스템-prompt 수준 안내 surface — kind 계층 (project→domain→capability→element), 호출 순서, write 도구 dry-run/confirm 패턴, expected_mtime 충돌 가드. 모든 연결 agent (Claude Code, Cursor) 가 매 세션 시행착오로 학습하던 부분을 단번에 해소.

### VSCode plugin v0.1.0 MVP (#49)

`vscode-plugin/` 신설. README 가 약속해 둔 *(planned) VSCode plugin* 의 first MVP. Activity Bar entry + TreeView (vault 노드 kind 별 그룹화) + 노드 클릭 → .md 열기. workspace 의 `docs/ontology/` 자동 detect 또는 picker. `globalState` 영속.

**5-way parser contract 편입** — `vscode-plugin/src/parse-frontmatter.ts` 가 5번째 진입점. 12 fixture × 5 parser = 60 case 가 매 PR 마다 drift 차단. `tests/contract/parse-frontmatter.contract.test.ts` 가 5-way 로 확장.

dogfood vault 에 `capabilities/vscode-plugin-ide-entry` 추가 (23 노드).

### Scaffold drift 정정 (#46)

`cli/templates/vault/README.md` + `src/features/docs-vault-local/lib/ontology-starter.ts` 의 "12 tools / write 4" stale 표기 → "14 tools / write 6" + rename_concept · merge_concepts 명시. 신규 사용자 첫 README 거짓말 차단.

### VSCode plugin v0.2.0 → v0.5.0 (#50 #51 #52 #54 #55)

MVP 후 5 PR 으로 v0.5.0 까지 — practically complete + 자동 회귀 가드.

- **v0.2.0 코드 ↔ ontology 점프 (#50)** — 활성 editor 의 파일이 vault 노드와 매치되면 status bar 좌측에 노드 title (kind icon + 제목). 클릭 → `.md` 점프. 매치 우선순위: exact path > directory ancestor > capability.elements 배열, longest-specific 한 매치 우승.
- **v0.3.0 Add concept (#51)** — Command Palette / TreeView `+` 버튼. kind picker → slug → title → optional domain → vault 에 새 `.md` 작성 + tree refresh + 새 .md 자동 열림. CLI `add` 와 동일 contract (auto-prefix, duplicate throw).
- **v0.4.0 MCP server connect + Backlinks panel (#52)** — plugin 이 `mcp/src/index.js` 를 child_process 로 spawn, stdio JSON-RPC 로 통신. 두 번째 TreeView 'Backlinks (current file)' 가 매치 노드의 `find_backlinks` 결과 표시. MCP 실패 시 raw filesystem scan (`computeBacklinksLocally`) 으로 graceful fallback. `useMcp` 설정으로 끄기 가능.
- **v0.5.0 self-match + e2e (#54 #55)** — ontology `.md` 직접 열어도 그 노드를 매치 결과로 surface (status bar + Backlinks 자동). `@vscode/test-electron` 으로 headless VSCode 띄워 5 e2e (activation / commands / config / contributes) 자동 검증. CI 매 PR 마다 `xvfb-run npm run test:e2e`.

### 4-layer 자동 검증 (#53 #55)

| Layer | 검증 |
|---|---|
| 단위 logic | `node --test` × 27 case |
| MCP integration | spawn `mcp/src/index.js` × 3 case |
| VSCode integration | `@vscode/test-electron` × 5 case |
| Marketplace 준비 | `vsce package` (CI step) |

총 35+ case 자동 — plugin 깨지면 즉시 fail. 사용자가 vsix 직접 install 해 검증한 후 marketplace publish 결정.

### 4 surface 완성

- **CLI** — `init / list / validate / add / find` (v0.2.0, R12)
- **MCP** — 14 tools (v0.7.1, R11+R13)
- **웹 workbench** — `/topology / /docs / /ontology` 등 (R10 surface diet 후)
- **VSCode plugin** — 4 surface in v0.5.0 (R13)

> "개발자가 어디 있든 같은 vault, 같이 자라남" 미션의 모든 진입점이 처음으로 다 존재.

---

## 2026-05-04 — Round 12: developer-primary 방향 + CLI 5 명령 + dogfood graph 강화

R11 fire #25 의 사용자 명시 ("의미없는 작업은 하지말고, 그래서 우리 서비스의 핵심 기능이 뭔데? 이게 명확해야해") 후 *제품 본질* 영역으로 전환. 12 task close.

### Primary audience 결정 (#33)

> **One codebase, one ontology, that the developer and their AI agent grow together.**

PM-primary 결정 reverted. 이유: 비개발자 친화 surface 가 *bonus, not target*. developer 가 자기 codebase 의 *cost-low 작성자*, 그 AI agent 가 *진짜 매일 사용자*. 차별점 = "ontology 가 코드 옆에서, 같은 git repo 에서, 개발자+AI 가 같이 키운다."

PRODUCT-DIRECTION v3, README, AGENTS, FEATURES 모두 sync. Phase 4 PM polish dropped + replacement (VSCode plugin / CLI 확장 / AI dogfood).

### CLI 4 새 명령 (#32 #34 #35) — developer 매일 진입점

기존: `init` 하나만 (init 후 *터미널 진입점 0*). v0.1 → **v0.2.0**.

| 명령 | 동작 |
|---|---|
| `list [vault]` | 노드 표 (color + `--kind` filter + `--json`) |
| `validate [vault]` | frontmatter 5 issue codes (CI gate, exit 1 on errors) |
| `add <kind> <slug> --title=...` | 새 노드 scaffold (duplicate throw, `--domain --body --vault`) |
| `find <query> [vault]` | title/slug 부분매칭 + yellow highlight + `--kind` filter + `--json` |

`init` 의 next-steps 흐름도 5 단계로 갱신 — explore → add first node → edit project.md → wire AI agent → see graph (#36 walk-through audit fix).

### Cross-package contract 4-way / 3-way (#32 #27 후속)

cli 별도 npm package 라 cross-import 불가능 → contract test 가 effective 단일화. parser 4-way (src/shared · mcp · scripts/lib · cli) 12 fixture × 4 = 48 case. validator 3-way (src/shared · mcp · cli) 8 fixture × 3 = 24 case.

### AI agent dogfood walk + graph 완전화 (#38 #39)

`scripts/dogfood-mcp-walk.mjs` 신설 — spawn mcp + 5 read tool sequence (list_kinds / list_concepts / find_evidence / find_path / find_backlinks / find_orphans). *AI agent 입장* 정보 quality 측정.

🚨 **진짜 발견**: dogfood vault 21 노드 중 **8 (38%) orphan** — R11 신규 capability 3 모두 parent domain 의 frontmatter 에서 endorse 빠뜨림. *graph 가 아니라 list*.

조치 (2 fire):
- domains/ai-agent-partner.capabilities: + mcp-conflict-guard
- domains/vault-local-first.capabilities: + vault-validator + vault-migrator
- domains/{ai-agent-partner,views,vault-local-first}.elements: + slug 명시 (이전 path 매칭 안 됨)
- domains/views.relates: + onboarding-ux (양방향 endorse)

**결과**: orphans 8 → **1 (5%)**. 남은 1 = project (top-level meta, 의도적). dogfood graph 사실상 완전.

### 영구 가드 추가 (R11 8 → R12 10)

- 9. `dogfood-mcp-walk.mjs` — 미래 dogfood 추가 시 회귀 차단
- 10. `cli/src/integration.test.mjs` — 11 case spawn 기반 cli 회귀 가드 (#40)

### Tarball 정밀화

- mcp 28.5 → 28.5 KB / 9 files (R11 #29, R12 변경 0)
- cli 14.7 → 13.2 KB / 17 files — test 제외 (#42, mcp 패턴 reuse)

### 신규 file (R12)

- scripts/dogfood-mcp-walk.mjs (228 LOC)
- scripts/perf-vault.mjs (R11 #31, baseline)
- cli/src/commands/{list,validate,add,find}.mjs
- cli/src/lib/{parse-frontmatter,validate,walk-vault,write-vault}.mjs
- cli/src/integration.test.mjs (11 case)
- cli/CHANGELOG.md
- tests/contract/validate-vault-document.contract.test.ts (R11 #27, 3-way)

### Test count

- root: 759 (R11 R12 통틀어 +118 from 641)
- cli: 0 → **11**
- mcp: ~30+

### 다음 (R13 candidates, 신호 대기)

- VSCode plugin scaffold (developer-primary IDE 통합)
- xyflow ERD builder ROI 재평가 (PM drop 후)
- 모바일 / FS Access API lock-in
- AI agent 의 *진짜 답변 quality* 측정 (LLM 호출 시뮬)

---

## 2026-05-04 — Round 11: AI partnership 강화 (vault tooling + parser contract + MCP graph-level write)

분석 기반 1원칙 라운드. silent corruption / parser drift / schema 진화 부재 / AI agent
write 비대칭 4 갭을 한 번에 닫음.

### 신규 surface

- **`pnpm vault:validate`** — vault frontmatter silent corruption 가시화. unclosed-frontmatter / empty-kind / missing-kind / unknown-kind / parse-zero-keys 5 종 issue 검출. R9 changelog Scenario 3 (lenient parser, defer 됐던 것) 의 작업자 측 길.
- **`pnpm vault:migrate`** — schema 진화 마이그레이션 패턴. dry-run default, `--write` 명시 시 디스크 기록. 첫 reference: `2026-05-04-trim-frontmatter-values`. `scripts/migrations/README.md` 가 작성 가이드.
- **MCP v0.7.0 — 14 tools (8 read + 6 write)**: `rename_concept` + `merge_concepts` 추가. 한 번의 atomic 호출로 slug 변경/노드 합치기 + 모든 backlink (frontmatter array · inline string · body link `[[slug]]` · `(slug.md)`) 자동 redirect. 이전엔 AI agent 가 `find_backlinks` + N 회 `patch_concept` 으로 직접 짜야 했던 graph-level 변형이 1 콜.

### 코드 / 아키텍처

- **3-way frontmatter parser contract** (`tests/contract/parse-frontmatter.contract.test.ts`): `src/shared/lib` (런타임) · `mcp/src/parser.mjs` (별도 npm pkg) · `scripts/lib/parse-frontmatter.mjs` (빌드+CLI) — mcp 가 npm publish 의도라 물리적 단일 모듈 통합 불가능 → 12 fixture × 3 parser = 36 case contract test 가 effective 단일화. drift 즉시 차단.
- `scripts/lib/parse-frontmatter.mjs` 신설 — `scripts/build-docs-vault.mjs` 와 `scripts/validate-vault.mjs` 가 공유. 빌드 스크립트의 inline parser 105 LOC 제거.
- `mcp/src/vault.mjs` 의 `redirectBacklinks(rootPath, fromSlug, toSlug, { dryRun })` helper 추가. rename / merge 의 공통 핵심. tail-only 매칭도 새 tail 로 일관 갱신 + dedup. 7 단위 test (`mcp/src/redirect-backlinks.test.mjs`).
- `.githooks/pre-push` + `package.json` postinstall 자동 wire — `tsc --noEmit` 강제. R10 이후 `adc2abb` 부터 4 commit 연속 main direct push 로 CI failure 무시되던 패턴 방지.

### Bug fixes

- **TS 회귀** `src/entities/project/model/to-input.test.ts:15,20` — 최근 추가된 test 가 `ProjectLink.url` 을 `href` 로 잘못 적었고 `Date` 를 string 으로 줘서 4 commit 연속 CI failure. `--noEmit` clean 으로 정정.

### MCP conflict 감지 (#8 MVP + #19 closeout)

- `get_concept` 응답에 `mtime` (ms) 추가.
- 모든 write 도구에 `expected_mtime` consistency: `patch_concept` / `delete_concept` (#8) + `add_relation` / `rename_concept` / `merge_concepts` (#19 closeout). read 시점 mtime 과 다르면 `VaultConflictError` throw. 사람 GUI · 외부 에디터 · 다른 AI MCP 가 같은 .md 동시에 만질 때 silent overwrite 차단.
- 옵션 미지정 시 검증 skip — 기존 호출자 호환.
- `mcp/src/conflict-detection.test.mjs` 8 단위 케이스. 도구 핸들러 통합 test 는 #20 후속.
- UI 측 (docs-vault-local) save 흐름의 동일 가드는 #15 후속 task.

### Vault 가드 CI 통합

- `.github/workflows/ci.yml` 에 `pnpm vault:validate` step 추가. dogfood vault 의 frontmatter silent corruption 을 매 PR 마다 차단.

### Widgets/views audit (#10)

- 24K LOC widgets + 11K LOC views 분석. hotspot 식별: `views/docs-vault/ui/DocsVaultPage.tsx` 1712 LOC + 67 hooks (단일 파일 비대), `views/ontology-edit` 2233 LOC (3 파일 합), `widgets/project-drawer` 1058 LOC.
- 추출 후보 3 신규 task 등록: #16 DocsVaultPage 영역 분리 (P2, 1순위) · #17 ontology-builder feature 추출 (P3) · #18 project-drawer 의 impact/screenshots 분리 (P3).
- `widgets/topology-map-sigma` 4579 LOC 는 이미 25 파일로 잘 분리 — 추가 추출 가치 작음 (skip).

### Dogfood vault 갱신

- 새 capability 노드 3 개 추가 (R11 surface 반영):
  - `capabilities/vault-validator` (silent corruption 가시화 도구 — CLI + UI)
  - `capabilities/vault-migrator` (schema 진화 패턴)
  - `capabilities/mcp-conflict-guard` (mtime 기반 silent overwrite 차단)
- 18 → 21 노드. `pnpm vault:validate` clean. 매니페스트 43 → 46 docs.

### Sigma WebGL fallback (#9)

- R9 changelog 의 Scenario 10 (deferred — 사용자 보고 0, 이론적) 재평가 후 진행. 비용 작고 영구 가드. 모바일 / 저사양 / 장시간 사용에서 GPU context lost 가능성 cover.
- `shared/ui/error-boundary.tsx` 신설 — generic React class ErrorBoundary, fallback render-prop, `resetKey` prop 으로 자동 reset, `onError` 콜백. 5 단위 test.
- `widgets/topology-map-sigma/ui/SigmaErrorFallback.tsx` 신설 — SigmaTopology 전용 fallback UI: AlertTriangle + reset CTA + "트리 뷰로 전환" link + dev-mode error message.
- `SigmaTopology` 가 self-wrap (caller 영향 0). `resetKey` 는 `projects.length|selectedSlug|depthLimit` 조합 — props 큰 변화 시 자동 reset.
- i18n 키 `topology.errorFallback.{title,body,retry,switchToTree}` (en + ko).

### UI 측 mtime 충돌 감지 (#15 MVP)

- mcp #8 의 conflict guard 패턴을 사람 GUI 측에 적용. `VaultDoc` 에 `mtime?: number` 추가, `buildLocalManifest` 가 `file.lastModified` 캡처.
- `useLocalVault.saveDoc(slug, content, { expectedMtime })` 옵션 — write 직전 fs `file.lastModified` 와 비교, 다르면 `VaultConflictError` throw. 옵션 미지정 시 검증 skip (회귀 회피).
- `DocsVaultEditor.onSave` 가 `selectedDoc.mtime` 전달 + conflict 감지 시 toast.error "vault 가 외부에서 변경됐습니다" 알림. 사용자가 새로고침 → 재시도.
- `messages/{ko,en}.json` 의 `dialog.vaultConflict` 키 추가.
- TOC update / ZIP import 흐름은 후속 적용 (현재는 핵심 user 편집 경로 만 cover). dialog UI (reload/overwrite 선택) 도 후속 — 현재는 toast MVP.

### Audit 사이클 — onboarding docs sync (#21 후속)

- AGENTS.md 의 quick start (영문 + 한국어 양쪽) 에 `pnpm vault:validate` / `pnpm vault:migrate --list` 추가. R11 신규 명령들이 canonical contributor guide 에 등재.
- `.claude/hooks/block-npm-publish.sh` read-only audit — `(npm|pnpm|yarn) publish` 어디서든 패턴 매칭 차단 (mcp/ 안 cover), `npm pack --dry-run` 만 통과. python3 의존. 정상 작동 확인.
- 신규 P3 task 등록: dogfood elements/ 에 R11 신규 capability 의 코드 모듈 노드 추가 (#22).

### vault:migrate 의 git pre-write 안전망 (#21)

- `pnpm vault:migrate <id> --write` 가 vault 안의 uncommitted .md 를 감지하면 거부 (`--force` 명시 강행 가능). git 미설치 / non-repo / dry-run 모드 는 검사 skip 무해 통과.
- 마이그레이션 결과와 사용자 변경이 디스크에서 섞여 rollback 어려워지는 상황 방지. AGENTS.md 의 "rollback 은 git" 정책 강화.
- `scripts/migrations/README.md` 갱신.

### MCP 도구 핸들러 통합 test (#20)

- 단위 helper test (parser / vault / redirect / conflict-detection — 합 30+ case) 가 cover 안 했던 *도구 핸들러 자체* 의 input → routing → output 흐름 cover.
- `mcp/src/integration.test.mjs` 신설 — `spawn` + stdio JSON-RPC 라운드트립으로 server boot → `tools/call` → response 검증 → cleanup 패턴. verify.mjs 의 spawn 패턴을 test 로 옮김.
- 7 case: list_concepts 노드 수 / get_concept mtime / patch_concept stale → conflict error / rename_concept dry-run / rename_concept confirm / merge_concepts confirm / add_relation idempotent.
- 각 case 가 fresh tmp vault 만들고 server fork → SIGTERM cleanup. 총 ~10s.

### Vault validator UI surface (#14)

- LocalVaultPicker 에 frontmatter validation chip 추가. local 모드에서 manifest 의 parsed frontmatter 만 보고 missing-kind / empty-kind / unknown-kind 검출 (raw 다시 안 읽음 — fast UI path).
- error 1+ 시 빨강 chip (✗ N), warning 만일 때 amber chip (⚠ N). i18n: `validationChip` / `validationTooltip` (en + ko).
- docs-only 파일 (frontmatter 0 keys 또는 ontology 시그널 키 없음) 은 skip — noise 회피.
- `summarizeVaultValidation` collection helper + `validateVaultDocFrontmatter` 신설. 10 단위 test (parsed-only fast path + summarize counts + ok/error 분기).

### Test

- 641 → **695** unit pass (54 case 추가): validator 10 + parser contract 36 + migration 8.
- mcp/: 11 → **18 pass** (redirect-backlinks 7 추가).
- mcp/ verify: **14/14 도구** registered + 18 노드 vault 로드 OK.
- pnpm exec tsc: clean.

### Docs

- AGENTS.md / docs/FEATURES.md / docs/PRODUCT-DIRECTION.md / docs/ontology/README.md / docs/ontology/capabilities/mcp-server.md / docs/ontology/domains/ai-agent-partner.md / mcp/README.md / mcp/scripts/verify.mjs — 모든 도구 카운트 12 → 14 (read 8 + write 4 → 6) 동기화.
- launch/* (HN/Reddit/X 게시물 초안) 은 *publish 시점 snapshot* 이라 의도적으로 미갱신.

---

## 2026-05-03 — Round 9: robustness audit (3 ship · 2 defer · lint floor)

codex 의 10-시나리오 robustness audit 결과 — DEGRADED 4 + BROKEN 1.
회의주의 적용해 user-visible inconsistency 3 개만 ship.

### Bug fixes

- **`saveDoc` permission 거부 시 state sync (Scenario 1)** — 이전: throw
  만 하고 status 는 'loaded' 로 남아 사용자가 picker 가도 권한 문제
  모름. → `requireWritePermission` useCallback 으로 추출, 거부 시
  state→'permission-needed' 동기화 → LocalVaultPicker 의 reauth UI
  자동 노출.
- **Local source + vault error/permission-needed banner (Scenario 2)**
  — 이전: 폴더 rename / 권한 회수 시 silently server (sample) 매니페스트
  fallback → 사용자가 vault 죽음 모름. → /docs 헤더 아래 명시 banner +
  "Picker 열기" 버튼.
- **Local 토글 disabled 시 unsupported tooltip (Scenario 5)** —
  이전: Firefox / Safari < 18.2 사용자가 disabled opacity 만 보고 *왜*
  disabled 인지 모름. → Tooltip + sr-only description.

### Skip — defer

- **Scenario 9 — locale 전환 시 query state 손실** — 빈도 낮음 (locale
  전환 자주 안 함). DEFER.
- **Scenario 10 — WebGL context loss recovery** — theoretical, 보고 0.
  ErrorBoundary 설치 비용 vs 실제 영향 미정. 보고 들어오면 진행.

### Other Scenarios — verified HANDLED

- 4 (MCP 타이포 enum), 6 (빈 vault), 7 (cyclic deps), 8 (concurrent
  delete race) — codex 각각 verified.
- 3 (malformed YAML) — DEGRADED 이지만 parser 가 lenient by-design,
  사용자 영향 거의 없음. DEFER.

### Lint floor

이전 18 warnings → trivial 2 fix (`ManualSourceChip` `_props` targeted
disable + `DocsVaultPage:145` unused eslint-disable 제거) → 16 warnings
도달. 나머지 16 = categorical noise (15 set-state-in-effect localStorage
rehydrate, idiom 일치라 큰 architectural 결정 없이 fix 불가) + 1 lib
incompat (TanStack Virtual). 사실상 floor.

### 코드 / 아키텍처

- 2 commit · `chore: lint trivial 18→16` + `fix: Round 9 robustness`.
- `requireWritePermission` 신규 (~15 LOC) + 4 callsite + 4 useCallback
  dep array 갱신.
- 외부 `ensureReadWrite` 제거 (사용처 0).
- /docs 헤더 아래 신규 banner block (~25 LOC) — error / permission-needed
  branch.
- Local source 토글에 Tooltip wrap + sr-only description.
- 5 신규 i18n 키 (`vaultStatus.*`).

### Test

- pnpm exec tsc: clean.
- pnpm test:run: 579 pass.
- pnpm lint: 16 warnings (floor).
- pnpm build: green.

### Round 10 자연 후보 — 거의 없음 (wait-for-signal 강하게)

8 라운드 surface 다이어트 + 1 라운드 architectural 리팩터 + 1 라운드
robustness audit 후 codex / Plan / Explore 모두 큰 개선 영역 surface
안 함. 다음 라운드는 사용자 보고 (perf / WebGL crash / locale 전환
사용성) 또는 명시 product call 필요.

---

## 2026-05-03 — Round 8: useLocalVault provider 리팩터 (Round 7 deferred 항목)

Round 7 의 codex finding (8 callsite 독립 호출 → 한 페이지 mount 에 2-3
인스턴스) 를 perf 측정 없이도 architectural 가치가 명확한 well-scoped
리팩터로 ship. 코드 dedup + source-of-truth 명확화 + 큰 vault 의 cold-load
N× 감소.

### Architectural change

- 새 `LocalVaultProvider` (`src/features/docs-vault-local/model/LocalVaultProvider.tsx`)
  가 layout 에서 1 회 mount → 단일 state 인스턴스 보유.
- 기존 `useLocalVault` → `useLocalVaultInternal` rename (`@internal` 로
  마킹). 로직 변경 0.
- 새 `useLocalVault` 는 context consumer — 시그니처 이전과 동일이라 8
  callsite (RootEntryPage / OperationsNav / OntologyEditPage /
  DocsVaultPage / useDataSourceMode / useProjects / useProjectMutations /
  useVaultOntology) 코드 변경 0.
- Provider 외부 호출 시 explicit error (silent stub 위험 회피).

### User-visible change

없음. 순수 internal architectural — 사용자 시각엔 동일. 큰 vault (100+
파일) 사용자가 cold-load 가 빨라진 걸 느낄 수 있지만 18-node dogfood
에선 측정 한계.

### 코드 / 아키텍처

- 1 commit · 5 파일 · 신파일 1 (`LocalVaultProvider.tsx`, ~50 LOC).
- 기존 `use-local-vault.ts` 767 LOC 변경 = function rename + JSDoc 만
  (로직 0 줄 변경).
- `index.ts` barrel: `useLocalVault` export source 변경.
- `layout.tsx`: ToastProvider 바깥 (TaxonomyProvider 안) 에
  `<LocalVaultProvider>` mount.

### Test

- pnpm exec tsc: clean.
- pnpm test:run: 579 pass.
- pnpm build: green (static export).
- pnpm lint: 18 warnings (was 19, -1).

### Round 7 의 다른 deferred 후보들 — 여전히 wait-for-signal

- **`/ontology/edit` reconsideration** — UX persona walkthrough finding.
  cut vs re-design 결정은 사용자 사용 데이터 또는 명시 product call 후.
- **Phase 4 PM polish** — vocabulary 번역 spike. 별도 design 라운드.

---

## 2026-05-03 — Surface diet Round 7: 1원리 메타 검토 (1 ship · 3 defer)

3 에이전트 1원리 분석 — codex MVP audit · Plan 4 architectural axes
audit · general-purpose 3 personas walkthrough. 사용자 directive: "정말
하는게 좋다고 판단되는것만". 결과: 4 발견 중 1 ship, 3 개는 architectural
의미 있지만 user-signal 또는 design phase 필요로 명시적 DEFER.

### Bug fix #1 — MCP add_relation slug 존재 검증 (Cut Q)

Plan 발견: `mcp/src/index.js:497` `addRelation` 이 `from`/`to` slug 가
실재하는지 확인 안 함. AI agent typo / hallucinated slug 가 frontmatter
array 에 dangling reference 로 silently 추가됨. Round 5 (UI placeholder)
+ Round 6 (MCP blank title) 의 validation parity 확장.

→ `vault.mjs` 에 `vaultSlugExists(rootPath, slug)` helper 추가 — slug
형식 검사 + existsSync. throw 안 하고 boolean (caller-friendly). 6 단위
테스트 (top-level / subdir / 없음 / 빈/null/undefined / vault escape /
null byte injection). `addRelation` 가 양쪽 slug 검증, 친화적 에러.

### Architectural finding (defer to Round 8) — useLocalVault duplication

codex 발견: `useLocalVault()` 가 8 곳에서 독립 호출됨 — `RootEntryPage`,
`OperationsNav`, `OntologyEditPage`, `DocsVaultPage`, `useDataSourceMode`,
`useProjects`, `useProjectMutations`, `useVaultOntology`. 각 호출이 자체
`useState` + `useRef` + IDB rehydrate effect. 한 페이지 mount 에 2-3 개
인스턴스 동시 존재 → 같은 IDB 키에서 N 번 rehydrate, N 번
`buildLocalManifest` (FS 전체 walk), N 개의 fileHandles Map.

**왜 Round 7 에서 ship 안 함**: ~150 LOC 리팩터 + 8 파일 + provider
패턴 도입. 18-node dogfood 에선 perf 영향 측정 안 됨. 사용자 perf 보고
또는 큰 vault (100+ files) 데이터 driven 로 비용 정당화 후 Round 8.

**Round 8 구체 plan**:
1. 새 `LocalVaultProvider` 컴포넌트 (Context.Provider) — `app/[locale]/layout.tsx`
   에 mount. 내부에서 `useLocalVault` 의 현재 로직 1 회 실행.
2. 기존 `useLocalVault` 를 `useContext(LocalVaultContext)` consumer 로
   변경. throw if outside provider.
3. 8 callsite 변경 없음 (hook signature 동일).
4. cold-load perf benchmark (puppeteer / playwright trace) 로 검증 —
   build 횟수 N → 1 확인.

### Defer #2 — `/ontology/edit` 빌더 reconsideration

general-purpose persona walkthrough 발견: 3 personas (solo dev / PM /
AI agent) 모두 `/ontology/edit` 를 안 씀. dev 는 .md 직편, PM 은 모델
이해 못 함, AI agent 는 MCP. "most-built, least-justified" 평가. Round 4
의 ephemeral edge save chip 도 이 surface 만의 문제를 푼 것.

**왜 Round 7 에서 ship 안 함**: 빌더 자체 cut 은 product-direction 결정
. 시각적 inspection 가치는 분명 있고, dogfood 사용자 (Korean maintainer
본인) 가 어떻게 쓰는지 데이터 없음. 단순 cut 보단 "어떤 페르소나에게
어떻게 의미 있게 만들지" 별도 design 라운드 가치.

### Defer #3 — Phase 4 PM 친화 polish

PM persona walkthrough 발견: "frontmatter / slug / kind / ephemeral /
ego graph / ERD / MCP / vault" 같은 dev jargon 이 PM 진입 벽. PRODUCT-
DIRECTION 의 Phase 4 가 ⏳ 표시된 상태. dev+agent slice 는 v1.0
근접하지만 PM slice 는 vocabulary 번역/숨김 작업 필요.

**왜 Round 7 에서 ship 안 함**: 한 vocabulary 번역이 단일 page 변경이
아니라 시스템 wide 디자인. 별도 라운드 + 디자인 spike 필요.

### Codex 의 다른 발견들 — clean

- `next-themes` 는 `package.json` 에 없음 (custom impl 사용). codex 의
  잘못된 가정 정정.
- `/ontology/relations` 이미 제거 (Round 2). 추가 vestigial 없음.
- VaultDoc schema 에 dead field 없음 (Plan 검증).
- localStorage 에 vault data leakage 없음 (Plan 검증). Round 1 의
  radar-review-state 제거가 마지막 offender.
- 3 view 가 단일 projection root (`useOntologyInsight`) 공유 (Plan).
- Write 경로 `vault.{createDoc,updateFrontmatter,...}` 로 수렴 (Plan).

### 코드 / 아키텍처

- 1 commit · 4 파일 · `vault.mjs` (+22) · `index.js` (+15) · `vault.test.mjs` (+50 신파일) · `package.json` (+1).
- 새 helper 1 (`vaultSlugExists`) + 6 단위 테스트.
- mcp/ 테스트 5 → 11 pass.

### Test

- pnpm test:run: 579 pass · pnpm exec tsc: clean ·  mcp/ pnpm test: 11 pass · MCP verify.mjs: 12/12 도구 OK.

### Round 8 자연 후보 (우선순위)

1. **useLocalVault provider 리팩터** (codex finding) — perf 측정 후
   진행. ~150 LOC, 8 callsite, provider 패턴.
2. **`/ontology/edit` design review** (UX persona finding) — cut vs
   re-design 결정. 별도 spike.
3. **Phase 4 PM polish** (UX + PRODUCT-DIRECTION) — vocabulary 번역
   디자인 라운드.

---

## 2026-05-03 — Surface diet Round 6: MCP parity + vault drift (2 fix · 2 skip)

2 에이전트 좁은 회의 (Explore — dogfood vault drift · codex — validation
parity gap + MCP README drift). Round 5 의 회의주의 모드 유지: "정말
하는게 좋다고 판단되는것만". 4 발견 중 2 개 fix, 2 개 SKIP.

### Bug fix #1 — MCP patch_concept blank title 차단 (Cut O)

codex 발견: UI 의 `renameVaultDoc` 은 blank title 을 reject 하지만
`mcp/src/index.js:509` `patch_concept` 가 frontmatter 임의 patch 허용해
AI agent 가 `{ title: "" }` 또는 `{ title: "   " }` 를 보내면 vault
노드 title 이 silent 으로 비워짐. Round 5 의 ephemeral placeholder
pollution 과 같은 parity 문제 — 이번엔 entry point 가 MCP.

→ 새 helper `mcp/src/validate.mjs` 의 `isValidVaultTitle()` 로 단일
진실원. `addConcept` (필수 입력) + `patchConcept` (frontmatter 에 title
포함 시) 양쪽 가드. `null` 은 "title 키 삭제" 의도라 별도 에러 메시지
(frontmatter 깨짐 방지). 3 단위 테스트 (비-string / 빈 / trim 후 비 /
정상).

### Doc fix #2 — dogfood vault label drift (Cut P)

Explore 발견: `docs/ontology/domains/views.md` 의 title 이 "Views
(Topology · **Tree** · Builder)" 로 남음. Round 3 cut F 에서 sub-nav
"Tree" → "Browse" rename 했지만 vault 가 갱신 안 됨. body 도 검색 단축키
설명이 stale → 함께 갱신 (`⌘K` 프로젝트 / `⇧⌘K` 노드+프로젝트 통합).
docs-vault:build 재실행 → manifest sync.

### Skip decisions (codex 자체가 "maybe")

- **MCP add_concept project minimal 입력 허용** — codex 발견: `add_concept`
  가 project 를 slug/kind/title 만으로 허용하는데 UI `ProjectForm` 은
  category/status/description 필수. SKIP 근거: AI agent 가 incremental
  하게 stub 짓고 나중에 patch 하는 건 합리적 워크플로 (인간 폼 ≠ 에이전트
  API 같을 필요 없음). 진짜 데이터 무결성 문제 발견 시 Round 7 에서 재검.
- **/docs folder-topology project scaffold description 누락** — codex 발견:
  `DocsVaultPage:499` 의 quick scaffold 가 description 없이 작성. SKIP
  근거: scaffold 는 "빠른 stub 생성" 의도, `/project/new` 폼은 "canonical
  authoring". 다른 목적의 다른 contract — 사용자가 stub 후 폼에서 보강
  가능. UI 깨짐 보고되면 재검.

### Other findings — clean

- Explore: 잘못된 finding 1 개 (xyflow.md "F 키 fullscreen") — 검증
  결과 빌더의 F 키는 살아있음 (line 599-600). presentation mode 의 F
  키와 빌더 fullscreen 의 F 키를 conflate. 수정 안 함.
- codex: mcp/README 12 도구 vs 코드 (clean). verify.mjs 도 12/12 통과.
- 기타 vault 매니페스트 카운트 (domain 6 / capability 6 / element 4) 모두
  정확.

### 코드 / 아키텍처

- 2 commit (예정) · 6 파일.
- 새 파일 2: `mcp/src/validate.mjs` (~25 LOC) + 테스트 (~30 LOC).
- mcp package.json `test` 스크립트에 validate.test.mjs 추가.
- views.md frontmatter title 1 줄 + body 1 단락 갱신.
- manifest.json 자동 재생성.

### Test

- pnpm test:run: 579 pass · pnpm exec tsc: clean · pnpm build: green ·
  cd mcp && pnpm test: 5 pass · MCP verify.mjs: 12/12 도구 OK.

### Round 7 자연 후보 (만약 진행 시)

- **Codex 의 "maybe" 2 개 후속 검증** — 실제 사용자/에이전트가 minimal
  project 또는 description-less project scaffold 로 UI 깨짐 보고하는지.
  데이터 driven 결정.
- **그 외 = wait-for-signal** 유지. 6 라운드 surface 다이어트 + 2 라운드
  bug fix 후 codex / Explore 모두 큰 시그널 없음.

---

## 2026-05-03 — Surface diet Round 5: skeptic round (1 fix · 3 skip)

3 에이전트 회의주의 회의 (codex skeptic · Explore polish hunt · Plan
test design). 사용자 directive: "정말 하는게 좋다고 판단되는것만 해야
한다 + 검수도 하면서". 결과: 1 개 진짜 버그 fix, 나머지 후보들은 가치
< 비용 으로 SKIP.

### Bug fix (CRITICAL — Round 4 약속 위반)

- **Ephemeral 노드 placeholder title silent pollution 차단** —
  `addNode` 가 새 노드를 `defaultTitle: t('untitledPlaceholder')` 로
  채움 ("(enter a name)" / "(이름 입력)"). 사용자가 입력 안 하고 edge
  Save chip 누르면 `slugify("(enter a name)")` = `"enter-a-name"` →
  vault 에 `enter-a-name.md` 가 silent 생성되고 있었음. Inspector 의
  save 버튼은 같은 룰로 disabled 됐지만 chip 은 무방비.
  → `isUntitledTitle(title, placeholder)` helper 추출 + `saveEphemeral`
  과 `persistEphemeralEdge.resolveEndpoint` 양쪽에 가드. 8 단위 테스트
  (빈 문자열 / 공백 / 정확 매치 / trim / 실 입력 / substring / locale
  전환 / 빈 placeholder defensive) 로 회귀 lock. Round 4 가 약속한
  AGENTS.md self-approving frontmatter 원칙 진짜로 보장.

### SKIP decisions (codex skeptic 검증)

각 후보를 SKIP 한 근거:

- **K — Search palette 통합** SKIP. 두 팔레트는 *중복 아님* —
  `SearchPalette` = docs + projects + recent + project layer 패턴,
  `GlobalSearch` = ontology 노드 + 옵셔널 프로젝트 + kind/project 필터.
  합치려면 ranking · sections · filters · shortcuts · empty states · 선택
  semantics 전부 재설계 = 큰 비용. Round 4 H 가 두 버튼 나란히 노출
  → 발견성 문제는 이미 해결. VS Code 의 `⌘P` quick-open vs `⇧⌘P`
  command palette 처럼 scoped palette 둘이 *기능*.
- **L — LocalVaultPicker 헤더 hoist** SKIP. Round 4 J 가 dead-end 패치
  완료 (`?intent=local` URL + manual click 둘 다 dropdown 자동 펼침).
  1회성 picker 를 영구 header UI 로 hoist = 좁은 헤더 / 모바일 공간을
  vault loaded 후엔 secondary 가 되는 control 에 영구 점유 = 가치 ≪
  비용.
- **M — 10 단위 테스트 + 4 helper refactor** SKIP. codex 회의: 제안된
  10 시나리오 중 절반은 mock shape 검증 (orchestrator 가 결국 vault.
  createDoc / updateFrontmatter / toast 의 thin 래퍼). 더 중요한 product
  risk (placeholder 검증) 가 본 PR Cut N 으로 fix 되며 8 테스트로
  회귀 lock 됨. 추가 refactor 는 dedup 가치는 있으나 별도 PR 로 평가.

### Explore 결과 — codebase clean

Orphan i18n 0 · 죽은 export 0 · 죽은 localStorage 0 · stale comments 0 ·
inconsistencies 0 · untranslated copy 0. Round 1-4 가 깔끔하게 마무리됨
재확인.

### 코드 / 아키텍처

- 1 commit (`fix:`) · 4 파일 · +145 / -19 LOC.
- 새 파일 2: `is-untitled-title.ts` (~30 LOC) + 테스트 (~50 LOC).
- 8 새 단위 테스트.

### Test

- 580 (was 571) tests pass · build green · typecheck clean.

### Round 6 자연 후보 (만약 진행 시)

- **(없음 / wait-for-signal)** — 4 라운드 surface 다이어트 + 1 라운드
  bug fix 후 codex / Explore 모두 "더 손볼 곳 없음" 신호. 다음 라운드는
  사용자가 새 마찰점을 발견하거나 새 feature 요청을 받을 때 자연 발생.
  현재 페이스로 강행 시 over-engineering.

---

## 2026-05-03 — Surface diet Round 4: 검색 발견성 + 빌더 edge 영속

3 에이전트 병렬 회의 (codex pressure-test · general-purpose UX walkthrough
· Plan architect Builder edge persistence) 후 합의된 3 컷.

### User-visible changes

- **`/docs` Local 토글 첫 클릭이 picker 자동 노출** — Round 2 가 source
  토글을 헤더로 hoist 했지만 사용자가 헤더에서 직접 "Local" 클릭 시 picker
  UI 가 dropdown 안 깊숙이 묻혀 있어 next-step 모호. handleSourceChange
  에 한 줄 추가 — `?intent=local` URL 진입과 manual 클릭이 동일 동작
  (이미 vault loaded 면 펼침 안 함).
- **`/ontology` 글로벌 검색 (⇧⌘K) 가시화 버튼** — 이전엔 단축키만 있고
  visible button 없어 PM 이 ⇧⌘K 의 존재를 모름. ⌘K 옆에 "All" / "전체"
  버튼 추가 — 노드 + 프로젝트 통합 검색. 라벨은 정직 (codex 검증:
  GlobalSearch 가 ontology 노드 + 프로젝트만 cover, docs 미포함).
- **빌더 edge 에 "Save" 칩** — 가장 큰 Round 4 변경. 이전엔 사용자가
  endpoint 한쪽이 ephemeral 인 edge 를 그려도 in-memory 로만 남고
  새로고침 시 사라짐. 사용자는 어떤 edge 가 saved/unsaved 인지 모름.
  → ephemeral edge 가운데 amber chip "Save" 노출. 클릭 시 endpoint
  ephemeral 노드 (있으면) → vault 에 createDoc, 그 vault slug 들로
  source frontmatter array 자동 patch, ephemeral edge 정리.

### Critical discovery (codex + UX walkthrough)

vault↔vault edge 는 **이미 자동 persist** 되고 있었다 (`onVaultConnect`).
"ephemeral" 은 한쪽이라도 unsaved palette node 일 때만. 즉 빌더의 진짜
friction 은 자동/수동 구분 없는 시각 신호 + onboarding 카피의 misleading.

→ helpStepConnect / helpStepEphemeral / stepConnectStrong 등 onboarding
카피 4 곳 정정: "vault↔vault 자동 저장. 한쪽이 미저장 (amber) 이면 edge
의 Save 칩 클릭."

### 디자인 결정 — 4 design 비교 후 B 채택

Plan 에이전트가 4 가지 design 검토:
- A (auto-persist on edge drop): untitled.md silent pollution 위험
  (AGENTS.md self-approving 원칙 위반).
- B (per-edge save chip): 명시적 intent + 0 header 공간 + sandbox 보존.
- C (배치 banner): 3rd surface 추가 (palette + inspector + banner — clutter).
- D (solidify on inspector visit): 현재 friction + magic.

→ B 채택. codex 의 "DEFER" 우려 (slug mapping / failure recovery / 복잡도)
는 Plan 의 chip 단순화로 자연스럽게 해결됨.

### 코드 / 아키텍처

- 1 commit · 8 파일 · +322 / -47 LOC.
- 새 파일 1: `EphemeralEdge.tsx` (~85 LOC custom xyflow edge 컴포넌트).
- DocsVaultPage handleSourceChange 1-line 추가.
- OntologyViewPage 두 번째 search 버튼 (~30 LOC).
- OntologyEditPage persistEphemeralEdge orchestrator (~75 LOC) + 동적
  타입에 prop 추가.
- OntologyEditCanvas: edgeTypes 등록 + ephemeralFlow 매핑 단순화 (label /
  labelStyle / labelBgStyle 제거 — chip 이 흡수).
- 새 i18n 키 11 (`actions.globalSearch*` 3 + `toastEdgePersistNeedsTitle` 1
  + `ephemeralEdgeSave*` 3 + onboarding 4 정정).
- 제거 1 (`canvas.ephemeralEdgeLabel` — chip 이 흡수).

### Test

- 571 tests pass · build green.
- EphemeralEdge persist orchestrator 단위 테스트는 다음 PR 보류 — 로직
  검증은 우선 dogfood 수동 확인.

### Round 5 자연 후보

- **Search palette 통합** — UX walkthrough 권장 highest-effort: ⌘K /
  ⇧⌘K 두 개를 한 unified palette 로 합치고 섹션 구분 (Projects · Nodes
  · Docs). 현재 본 PR 은 두 버튼 노출로 발견성만 닫음. 통합은 ranking /
  section UX 별도 design 필요.
- **/docs LocalVaultPicker 헤더 hoist** — Round 4 의 J 는 dropdown 자동
  펼침으로 dead-end 만 닫음. picker 자체를 dropdown 밖 header-adjacent
  panel 로 옮기면 "Advanced" 가 아니라 first-run primary affordance 가
  됨.
- **EphemeralEdge persist 단위 테스트** — 본 PR 미포함. resolveEndpoint
  ephemeral / vault / 빈 title / static 모드 4 시나리오.

---

## 2026-05-03 — Surface diet Round 3: 첫 인상 + IA 정리

3 에이전트 병렬 회의 (user journey audit · inbound link 매핑 · IA 의견)
종합 결정. PM 입장 첫 인상 / IA 명확성에 집중한 4 컷 + 1 closure.

### User-visible changes

- **Landing primary CTA 재설계** — 이전엔 "Explore the ontology" (데모
  트리) 가 primary, "내 마크다운 폴더 열기" 가 secondary. 새 사용자가
  첫 클릭에서 데모로 빠져 자기 vault 활성화 경로를 못 찾는 dead-end.
  → 순서 swap: "내 마크다운 폴더 열기" 가 primary indigo solid,
  "데모 먼저 보기" 가 secondary outline.
- **Landing 카피 단순화 (PM 친화)** — "Markdown frontmatter is the graph"
  / "ERD" / "MCP" / "grep markdown" 같은 dev jargon 제거. "프로젝트의
  조각들 — 기능 / 모듈 / 누가 무엇에 의존하는지 — 를 마크다운 파일로
  정리합니다" 같은 행동 / 결과 중심 카피로.
- **`/ontology/insights` 패널 재배치** — Cut A 후속. 순서를 kind →
  edge types → projects → hubs → recent → orphans 로 (구조 진단을
  위로). 이전 "Cross-project relations" 별도 카드 (Cut A 에서 footer
  link 빠진 후 orphan card 됨) 를 edge types 패널 상단 inline caption
  으로 fold ("이 중 N 개 (X%) 가 cross-project").
- **Insights 의 "미연결 노드" 클릭 가능** — 이전엔 hubs / recent 만
  /ontology/?node= 로 연결되고 orphans 는 display-only dead-end.
  hover transition + Link 으로 정렬 — "정리 후보 발견 → 즉시 점프"
  가능.
- **Sub-nav 항상 노출 + "Tree" → "Browse" rename** — 이전엔 chevron
  토글 default-collapse 로 발견성 0 (사용자가 토글을 안 누름). 항상
  노출로 단순화 (localStorage / 토글 / chevron 모두 제거). 라벨도
  "Tree" 라고 했지만 실제 페이지가 트리 + ego 그래프 + 노드 detail 패널
  까지 보여주므로 "Browse" / "둘러보기" 로 rename.

### Decision recorded (no UI change)

- **`/` ↔ `/ontology` 라우트 dedupe — keep both 결정**. 둘 다
  `OntologyViewPage` 를 렌더하지만 codex 어드바이저 + 3 에이전트 inbound
  매핑 결과 *역할이 다름*: `/` = home / back-link / error fallback (10
  inbound), `/ontology` = explicit deep-link namespace (19 inbound).
  redirect 통합 시 한쪽 inbound 가 깨짐. RootEntryPage docstring 에
  의도 명시.

### 코드 / 아키텍처

- 5 commit (예정), 약 ~150 LOC 변경 (대부분 카피 / 순서 / 위치 재배치).
- OperationsNav: subNavOpen / SUBNAV_OPEN_KEY localStorage / chevron /
  toggle 함수 / 4 개 i18n 키 (subNav* family) 제거.
- 새 i18n 키 1 개 (`vaultWidgets.insights.edgeTypeCrossProjectInline`),
  제거 7 개 (subNav*, crossProjectPanelTitle/Subtitle, crossProjectFooter*).

### Test

- 571 tests pass (변동 없음).

### Deferred (Round 4 candidates)

- ⌘K vs ⇧⌘K 발견성 — 한 버튼이 둘 다 안내. 현재는 button 이 ⌘K
  hint 만 보여줌 (search 결과가 ontology 노드만일 거라 PM 이 글로벌
  검색 단축키를 모름).
- Builder edge 영속성 자동화. 현재 onboarding 이 "edge 그리고 inspector
  array 에 직접 추가" 라고 안내 — UX 마찰 큼.
- /docs 의 LocalVaultPicker 첫 진입 affordance — picker 가 advanced
  dropdown 안 깊숙이 묻혀 있음 (소스 토글이 헤더로 나와도 picker 자체는
  여전히 dropdown 안). landing CTA `?intent=local` 는 여전히 기어 자동
  펼침으로 보완 중.

---

## 2026-05-03 — Surface diet Round 2: 라우트 통합 + /docs 헤더 직접화

Round 1 컷 (5 곳) 직후 codex 어드바이저 재pressure-test 로 합의된 2 곳을
처리. 합의 안 된 1 건 (`/` ↔ `/ontology` 중복) 은 별도 사이클로 보류 —
nav / search / 노드 선택 URL 재작성 등 inbound 의존이 많아 careful pass
필요.

### User-visible changes

- **`/ontology/relations` 라우트 제거** — 122-줄 페이지가 단일 패널 (edge
  type 분포) 만 들고 있었고, `/ontology/insights` 가 같은 분포 패널 (top
  8 → 전체로 확장) 을 이미 보여줌. Sub-nav "Relations" 탭 / sitemap entry /
  insights 의 self-link footer 모두 제거. 동일 데이터를 두 라우트로
  분산시켜 인지 비용만 추가하던 구조.
- **`/docs` 상단 source 토글 직접 노출** — 이전에 우상단 gear 아이콘
  (Settings2) 뒤 dropdown 깊숙이 묻혀 있던 "샘플 vs 내 vault" 결정을
  헤더 인라인 2-button radio 로 노출. 비개발자에게 가장 중요한 결정이
  발견 비용 0 이 됨.
- **`/docs` advanced dropdown 은 local 모드 전용** — gear 버튼 자체가
  source === 'local' 일 때만 렌더. 안에는 folder-topology 토글 +
  LocalVaultPicker + ontology scaffold + new doc 버튼만 (server 모드에
선 dropdown 자체가 사라짐). tooltip "Advanced" → "Vault tools".
- **insights edge type 패널 = 전체 분포** — 이전 top 8 slice 제거.
  relations 페이지가 잘라내지 않고 모든 edge type 을 보여줬으므로 그
  capability 를 insights 가 흡수.

### Documentation cleanup (Round 1 leftovers)

- `docs/FEATURES.md` insights 섹션: stale "30-day timeline" / "10 most
  recent activities (relative time)" / "top 12 strongest relations"
  (이미 제거된 기능들) → 실제 구현된 Node preview / 전체 edge type 분포
  로 정정.
- `docs/ARCHITECTURE.md` 라우트 표 (2 곳) 갱신.
- `docs/DESIGN-SYSTEM.md` 의 stale `/settings/*` `/account` 라우트 언급
  제거 (R10 에서 진작 영구 제거됐는데 docs drift).
- `SigmaTopology.tsx` 의 stale `/diagnostics/insights` 주석 (2 곳, R10
  이전 audit 페이지 reference) 정리.
- `persistence.test.ts` 의 'graph' / 'stats' 명시 fallback assertion
  제거 (이미 unknown fallback 으로 커버됨).

### 코드 / 아키텍처

- 2 commit, 약 ~330 LOC 삭제.
- 라우트 1 개 (`/ontology/relations/`) + 페이지 컴포넌트 (`OntologyRelationsPage`)
  + barrel + sub-nav entry 제거.
- 13 개 i18n 번역 키 제거 + 3 개 신규 (sourceAriaLabel / vaultToolsTooltip /
  vaultToolsAriaLabel).
- DocsVaultPage advanced dropdown 안의 "View" / "Source" 섹션 헤더 +
  source picker 2-button grid 제거.

### Test

- 571 tests pass (변동 없음).

### Deferred

- `/` ↔ `/ontology` 라우트 중복 (vault-active 시 둘 다 OntologyViewPage
  렌더). codex 권고: `/ontology` canonical permalink, root → `/ontology/`
  redirect. 별도 PR 에서 inbound 의존 (OperationsNav active marker, search
  palette, 노드 선택 URL 재작성) 검토 후 처리.

---

## 2026-05-03 — Surface diet: 5 dead UI cuts

First-principles audit of every UI surface — does each toggle / mode /
widget serve the user's 3 jobs (그래프 본다 / 그래프 쓴다 / 개념 찾는다)?
어드바이저 (codex) second opinion 으로 합의된 5 곳을 컷.

### User-visible changes

- **`/` 홈** — 상단 우측의 "프레젠테이션 모드" (F 키) 진입 / fullscreen
  토글 + ESC 종료 버튼 제거. OSS local 도구에서 fullscreen 발표 use case 가
  검증된 적 없음.
- **`/docs` 헤더** — "전체 / 기획자 / 엔지니어" audience 토글 제거. dogfood
  vault 18 노드 어디에도 `mode: planner|engineer` frontmatter 가 없어 토글
  결과가 항상 동일했음 (사용자에게 무엇을 거른지 모호).
- **`/docs` 우측 advanced 메뉴** — view: graph (vault mini Sigma) /
  view: stats (단어수·태그·orphans 통계) 두 모드 제거. 그래프는 `/topology`,
  메트릭은 `/ontology/insights` 가 이미 전담.
- **`/docs` 문서 내부** — Relationship Radar 사이드 패널 제거 (확인 / 무시 /
  리셋 / 무시한 거 비우기 4-state). 이 위젯의 "확인" 액션이 vault 의 실제
  edge 를 만들지 않고 localStorage review state 만 남기던 검증 안 된 추천
  휴리스틱.
- **`/docs` 본문 위 메타바** — 문서마다 표시되던 "Planner / Engineer /
  Shared" 관점 chip 제거 (audience 토글이 사라졌으므로 의미 없음).

### 단축키 변경

- F 키 (presentation 토글) 사라짐. `?` (단축키 도움말) / `D` (문서 드로어)
  / `⌘K` (검색) / `⇧⌘K` (글로벌 검색) 는 그대로.

### 코드 / 아키텍처

- 5 commit, 약 ~2400 LOC 삭제.
- 위젯 4 개 파일 통째 삭제: `DocsVaultRelationshipRadar`, `DocsVaultGraph`,
  `DocsVaultStats`, `DocsVaultAudienceMismatchNotice`.
- 엔티티 `relationship-radar` 스코어러 + `radar-review-state` 라이브러리 +
  `classifyMode` (parse-frontmatter / scripts) 삭제.
- `VaultDoc.mode` 필드 + `VaultMode` 타입 제거 — vault 매니페스트 스키마
  단순화. `pnpm docs-vault:build` 재실행 → manifest.json 의 `mode` 필드
  43 → 0.
- 41 개 i18n 번역 키 제거 (audience\* / mode\* / radar\* / stats\* /
  graph.\* / presentation\*).
- `DocsVaultPage.tsx` 1950 → 1700 LOC.

### Test

- 593 → 571 tests pass. 22 test 가 함께 삭제됨 (deleted widget 들의 자체
  test).

### Deferred / kept (codex second opinion)

- `/topology` 라우트 — keep (permalink / SEO canonical 가치).
- `/project/[slug]/edit` 라우트 — keep (인라인 편집은 일부 필드만 커버,
  full editor 만 가지는 12 필드 — slug / category / status / dates / owner
  / icon / progress / isHub / nameEn / detail / 등).
- `/docs view: folder-topology` — keep (project 스캐폴드 + 포지션 저장
  capability 가 아직 다른 surface 에 없음).
- ~~`/ontology/insights` + `/ontology/relations` 통합~~ → 같은 사이클 내
  Round 2 cut A 로 처리. `/ontology/relations` 라우트 제거, edge type
  분포는 `/ontology/insights` 로 흡수.
- `/` (vault 있을 때) ↔ `/ontology` 중복 (둘 다 `OntologyViewPage` 렌더) →
  별도 결정.

---

## 2026-05-03 — Round 10: permanent removal of auth + cloud surface

`ontology-atlas` is now a pure local-first OSS. All optional Firebase /
Firestore / Auth / Cloud Functions / Storage code has been **permanently
removed**. The `.md` files in your vault are the single source of truth.

### User-visible changes

- **No login** — `/login`, `/signup`, `/account`, `/reset-password` routes
  are gone. The "Sign in" button in the landing header is gone. The
  "Sign out" button in the operations nav is gone.
- **No settings** — `/settings/categories`, `/settings/statuses`,
  `/settings/import` were cloud-only and are gone. Categories / statuses
  are now build-time defaults (vault-defined custom taxonomy is a future
  feature).
- **No cloud-mode badge** — the OperationsNav `cloud sync` chip can no
  longer appear. Vault and demo (static) badges remain.
- **No screenshot uploader** — was Firebase Storage-backed; gone. Markdown
  inline images are the path forward.
- **No manual node/edge cloud modal** — the "Add node" button on `/ontology`
  now links straight to the builder canvas (`/ontology/edit`), where new
  nodes are saved into the vault directory.
- **No `.env` setup needed** — `pnpm dev` and `pnpm build` work without
  any environment variables. `.env.example` is now a minimal placeholder.

### Code / architecture

- Net delete: ~20,000 lines (R10a 2225 + R10c 4634 + R10b 12227).
- `DataSourceMode` enum narrowed: `'static' | 'local' | 'cloud'` → `'static' | 'local'`.
- Deleted: `@/features/{user-auth,permissions,account-scope,docs-vault-access}`,
  `@/widgets/account-menu`, `@/entities/admin`, every `@/entities/*/api`,
  `@/shared/api/firebase.ts`, `firestore.rules`, `firebase.json`, mapper.ts
  (Firestore ↔ Date) and their tests, manual-node/edge-create-modal widgets,
  ScreenshotUploader.
- `package.json`: removed `firebase`, `firebase-admin`, `firebase-tools`
  dependencies. Removed `dev:firestore-emulator`, `dev:firebase-emulators`,
  `test:e2e:public-*` scripts.
- `pnpm bundle:check` now shows 0 firebase SDK chunks across all routes
  (down from 731KB on settings pages pre-R10).
- 5 e2e tests removed (auth/cloud-emulator-dependent). Remaining 14
  e2e specs run without firebase emulators.

### Future cloud collab

When sponsorship / collaboration features come back, auth and cloud sync
will be re-designed from scratch (the v0.x removal preserves git history
as a reference but does not stub anything). For now, the OSS is
single-user, single-machine, single-source.

---

## 2026-05-02 — OSS launch readiness: English-first docs + npm publish guard

### User-visible changes

- **All OSS-facing docs are now English-first** — global contributors can read the full project from README → AGENTS → docs/* without Korean. README.md and AGENTS.md keep a Korean sub-section (`한국어 가이드`) at the bottom for native readers.
- **Vault starter templates ship in English** — `npx ontology-atlas init` and the `/docs` "Create starter seed" button now write English `README.md` / `project.md` / `domains/example.md` / `capabilities/example.md` / `elements/example.md`, so non-Korean users get a coherent first experience.
- **`mcp/README.md` is the npm package face** — when published, https://www.npmjs.com/package/ontology-atlas-mcp will display polished English copy.
- **New `docs/TROUBLESHOOTING.md`** — a single English doc covering scaffold / MCP / build / publish issues for OSS users.

### Translated to English (in-place)

- `mcp/README.md` (npm publish face)
- `docs/PUBLISH-NPM.md` · `docs/PRODUCT-DIRECTION.md` · `docs/FEATURES.md` · `docs/ARCHITECTURE.md` · `docs/DATA-MODEL.md` · `docs/DESIGN-SYSTEM.md` · `docs/MODE-AWARE-CRUD.md` · `docs/DEPLOY-FIREBASE.md` · `docs/DEPLOYMENT.md` · `docs/CHANGELOG.md`
- `cli/templates/vault/*.md` (5 starter files) + the in-app `src/features/docs-vault-local/lib/ontology-starter.ts` mirror

### Kept Korean intentionally

- `docs/BACKLOG.md` · `docs/MISSION-CLEANUP-CANDIDATES.md` · `docs/launch/*` — internal trackers / draft material (the maintainer is the only reader)
- `README.md` · `AGENTS.md` · `CLAUDE.md` — bilingual sub-section for Korean contributors
- Seed data values in `docs/DATA-MODEL.md` and design-rule examples in `docs/DESIGN-SYSTEM.md` — these are literal data, not prose

### npm publish guard (3 layers)

`npm publish` / `pnpm publish` / `yarn publish` is now blocked from running unless the user explicitly authorizes it:

1. `.claude/rules/forbidden.md` — auto-loaded behavioral rule
2. `.claude/settings.json` PreToolUse hook + `.claude/hooks/block-npm-publish.sh` — intercepts Bash commands matching publish patterns and returns `permissionDecision: "deny"`
3. `CLAUDE.md` — high-level Claude-specific reminder; CLAUDE.md remains a thin wrapper, the rule lives in `forbidden.md`

Tested with 7 input shapes: `npm publish`, `cd mcp && npm publish`, `pnpm publish`, `npm pack --dry-run` (allowed), `npm whoami` (allowed), `npm pack` without `--dry-run` (blocked), `ls -la` (allowed).

### FEATURES.md drift sync

Brought `docs/FEATURES.md` back in line with the actual codebase:

- **Removed** stale references: `/knowledge` / `/knowledge/documents/*` routes (entity removed in commit `a906635`), `KnowledgeDocumentNewPage`, `node --check functions/index.js` (the `functions/` folder itself is gone), the outdated "Cumulative cleanup stats" block.
- **Updated** numbers: MCP tool table 7 → 11 (read 7 + write 4), dogfood vault 21 → 23 nodes, vitest counts 118/848 → 100/721.
- **Added** new sections: `/docs` scaffold button (`OntologyStarterCta`), CLI package, npm publish guard, "Removed by mission v2 cleanup" expanded entries, and a brand-new **Section 8 "OSS distribution surfaces"** documenting npm packages, Firebase Hosting, GitHub OSS surfaces, and the publish guard.
- `AGENTS.md` got the same drift fix (route list + test counts + cleanup note).

### Tooling

- `scripts/audit-data-model.mjs` — accept either Korean or English `## 5. Storage 구조|layout` heading so the data-model audit test passes after translation.

### Verification

- `pnpm exec tsc --noEmit` — 0 errors
- `pnpm lint` — 0 errors (62 pre-existing warnings)
- `pnpm test:run` — 100 files / 721 tests pass
- CLI smoke (`node cli/src/index.mjs init test-vault`) writes 5 English `.md` + `.mcp.json.example`
- Hook smoke — 7/7 input shapes behave as expected

---

## 2026-05-02 — local-first first paint firebase 0 (PR #99)

### User-visible changes

- **First page load is lighter** — user-facing entry points like `/`, `/topology`, `/docs`, `/ontology/edit`, `/projects`, `/knowledge`, `/login`, `/account` no longer statically load firebase JS (~773kb chunks). The lazy load only happens when explicitly entering cloud mode (signin / cloud entity mutation).
- **Better LCP on mobile / slow networks** — zero firebase SDK parse cost.
- **Hosting cost angle**: users who pick a vault never get a firebase account created. Origin server cost was already 0 (static export), and now firebase traffic is also 0 until cloud mode is entered.
- **Behavior is unchanged** — cloud-mode users get all features identically (the firebase chunk is downloaded at function-call time).

### Architecture changes (developer-visible)

- **entity barrel split pattern** — `@/entities/<x>` is now type / lib / pure helper only. firestore api lives at `@/entities/<x>/api` and must be imported directly. New contributors writing mode-aware features should `import('@/entities/<x>/api')` dynamically only on the cloud branch.
- **mapper Timestamp duck-typing** — instead of `instanceof Timestamp` checks, use the `coerceFirestoreDate(value)` helper (`@/shared/lib/firestore-timestamp-coerce`). entity model has zero firebase dependency.
- **`package.json sideEffects` allowlist** — only `*.css` + `firestore-noise-patch` are marked side-effectful. Everything else is webpack tree-shakeable.

### New modules

- `src/shared/lib/firestore-noise-patch.ts` — extracted the existing `FirebaseProvider`'s console noise patch into a firebase-deps-free module. Installed in layout via a side-effect import alone.
- `src/shared/lib/firestore-timestamp-coerce.ts` — Timestamp duck-typing helper + 8-case unit tests.
- `src/entities/knowledge-graph/api/index.ts` — knowledge-graph api barrel (previously mixed into the main barrel).

### Removed

- `src/app/providers/FirebaseProvider.tsx` (-91 lines) — its responsibilities were a console patch + an unnecessary `getFirebaseApp()` warmup. The patch moved to a pure module, and `<link rel="preconnect">` already handles warmup.

---

## 2026-05-01 (night) — UX first-principles batch + Phase 4 non-developer friendliness + V1.5 cardinality

In addition to the 7 PRs in the previous entry, 12 more PRs (#15-#23) merged. 19 PRs total this session.

### User-visible changes

- **`/`** empty-vault empty-state — in local mode, an inline `frontmatter snippet` was added so users can create a `.md` directly without entering the builder (copy-paste ready). Other modes keep the existing 3-step guidance.
- **`/docs/`** dogfood vault hint — the LocalVaultPicker idle state now suggests "First time? Try selecting `docs/ontology/` from this repo." The fastest path for vision validation.
- **OperationsNav mode badge** (UX-2 new) — the right side of both desktop and mobile nav now always shows the current mode chip (`vault · NN docs` / `cloud sync` / `demo`). Users see at a glance where data is going.
- **Builder (`/ontology/edit`) onboarding copy** — "more than ERD — a domain map", written for non-developers. Mission v2's *AI agent partner* is also called out.
- **Builder vault md write** (P1-1 / UX-4) — saving a node in the builder now branches by mode: in local mode it writes `vault/${kind}s/${slug}.md` directly; in cloud mode it upserts to Firestore. This closes the key missing piece in mission v2's *human + AI agent coexistence* promise.
- **lucide icons per kind** — Tree / Builder palette now uses intuitive metaphors (project=Folder, domain=Layers, capability=Cog, element=Box, …). Color stays single-indigo + neutral per the design charter.
- **PM-friendly search categories** (`⇧⌘K`) — group headings "Ontology / Documents / Projects" → "Concepts / Writing / Projects". Placeholder + aria-label translated to Korean too.
- **UI English-transliteration cleanup** — "edge type distribution" → "relation kind distribution", "evidence rich" → "documents with many citations", etc. Code identifiers (`kind` / `node` / `edge`) are kept as is.
- **Demo data aligned to mission v2** — the `Demo Knowledge` container's capabilities replaced mission v1 leftovers ("review queue", "frontmatter extraction") with mission v2 ("vault frontmatter as source of truth", "AI agent partner").

### New entities / features / modules

- `mcp/scripts/verify.mjs` — one-line verify CLI. Integrated check of parser smoke + server boot + tools/list + list_concepts. Diagnoses which step failed.
- `mcp/src` v0.2 → **v0.3** — added `find_path(from, to, maxHops?)` BFS + `list_kinds()` census. 7 → 9 tools.
- `src/entities/ontology-class/model/icons.ts` — `getOntologyKindIcon(kind)` shared helper.
- `ModeBadge` component in `src/widgets/operations-nav`.
- `docs/ATOMIC-AUDIT-2026-05-01.md` — first-principles audit results across 13 domains (438 lines).
- `docs/UX-FIRST-PRINCIPLES.md` — 7-step user journey friction analysis + P0/P1/P2 matrix.

### Removed

- All of `src/widgets/ontology-output-badges/` (-425 lines, 0 imports — leftover from extraction review-queue dependency).

### Ontology model evolution (V1.x)

- **V1.1** ✅ qualifiers + rank merged (recorded in the previous entry; this entry only covers follow-up dogfooding)
- **V1.5** ✅ Relation Cardinality merged — added `sourceCardinality?` + `targetCardinality?` optionals to `OntologyRelation` (additive, zero breakage). 5 new unit tests.

### Documentation

- `README.md` + `AGENTS.md` synced to mission v2 (previous entry).
- `docs/FEATURES.md` fully rewritten; `docs/ARCHITECTURE.md` / `docs/DATA-MODEL.md` / `docs/MODE-AWARE-CRUD.md` aligned to mission v2.
- `docs/BACKLOG.md` consolidated next-work after mission v2 phase (T28-T38 + UX-1/2/3/4).
- `docs/MISSION-CLEANUP-CANDIDATES.md` compressed (all 4 stages ✅, archived analysis).
- `docs/PRODUCT-DIRECTION.md` shows Phase 1-4 status (1 ✅ / 2 ⏸ / 3 ✅ / 4 ⏳).
- `docs/ONTOLOGY-MODEL-V2-DRAFT.md` progress table — V1.1 + V1.5 ✅, V1.2/V1.3/V1.4 pending.
- `mcp/README.md` updated to v0.3 (9 tools) + sample LLM prompt + verify CLI guide.
- `docs/ontology/` dogfood vault — added `capabilities/builder-vault-write` + `capabilities/v1-5-cardinality`, updated `capabilities/mcp-server` to 9 tools. 22 nodes.

### Verification status

- **117 test files / 839 tests passing** (V1.5 +5)
- tsc 0 errors
- lint 0 errors (79 pre-existing warnings)
- `node --check functions/index.js` syntax OK
- MCP `npm run verify` end-to-end: 9 tools + 22-node dogfood vault healthy
- Playwright MCP browser-level QA (15 routes) — mission v2 surfaces healthy, 0 console errors, mode badge "demo" visible, 0 stale "Demo" titles

### Open questions

- **Q1, Q2** — ✅ answered
- **Q3-Q8 (V2 spec)** — blocked by V1.2 (Q6+Q7), V1.3 (Q5), V1.4 (Q4)

### Cumulative stats (19 PRs this session)

- Roughly -5,833 lines from mission cleanup (PR #5-#11)
- +438 lines audit / +210 lines UX analysis / +245 lines BACKLOG · FEATURES sync
- +574 lines new features (MCP v0.3 / mode badge / vault md write / V1.5 / kind icons / frontmatter snippet / verify CLI)

---

## 2026-05-01 (evening) — Phase 3 (AI agent partner) + mission v2 cleanup

A large cleanup that aligns PRODUCT-DIRECTION v2's mission ("a codebase ontology authored together by humans and AI agents") across code + functions + dogfood vault. PR #5 / #6 / #7 merged cumulatively.

### User-visible changes

- **AI agent partner introduced** — `mcp/` MCP server (`@modelcontextprotocol/sdk@^1.0.0`). LLM agents like Claude Code can read/write the vault ontology over stdin/stdout JSON-RPC. v0.2.0 ships 7 tools: `list_concepts` / `get_concept` / `find_evidence` / `find_backlinks` / `add_concept` / `add_relation` / `patch_concept`. Register via `.mcp.json.example` or `mcp/README.md`.
- **`docs/ontology/` dogfood vault** — this project's own mental model expressed as frontmatter md. 1 project + 8 domains + 6 capabilities + 4 elements = 20 nodes.
- **`/` ontology hub is mode-aware** (Q1=(a)) — when a vault is active, `/` automatically surfaces the vault's frontmatter stub nodes in the tree, ego graph, and search (LOOP-TASK Open question #1 answered).
- **Empty-vault UX** — in local mode when a vault is active but has no ontology nodes, show a "vault is empty" guide + 2-step (frontmatter / builder) CTA. The "open vault" step is skipped in local mode.
- **"Start analysis" cloud LLM extraction flow removed** — mission v2's cost model shifted to *user-side AI agents (Claude Code)*. Affected surfaces:
  - `/knowledge/documents/[id]` detail — 4-step stepper → 2 steps (upload → publish); 4 sites of `ExtractorVersionToggle` / "start analysis" / "re-analyze" CTAs removed → "open vault" / "open builder" CTAs
  - `/review/knowledge` review queue — page + route deleted entirely. `OperationsNav` 'Document review' tab removed (5 tabs → 4 tabs). Review links removed from 6 views
  - `/ontology` toolbar's "review queue" pill removed; the "unresolved references" Stat's review-queue link → in-page stub list
  - `WorkspaceOntologyStrip`'s stub chip target → `/ontology` tree stub list
  - landing onboarding ValueChainRail "run extraction" → "frontmatter is self-approving"

### New entities / features / modules

- `mcp/` in its entirety — MCP server package (parser.mjs / vault.mjs / index.js / parser.test.mjs). v0.1.0 (5 tools) → v0.2.0 (7 tools).
- `src/features/vault-ontology/model/use-ontology-insight.ts` — mode-aware ontology insight. local: vault frontmatter stub conversion; cloud: knowledgePublic projection.
- `docs/ontology/` in its entirety — own ontology vault.
- `docs/MISSION-CLEANUP-CANDIDATES.md` — 4-stage cleanup staging plan (Stages 1+2+3+4 all complete).
- `.mcp.json.example` — Claude Code registration template.

### Removed / cleanup

- **functions/index.js: 2,012 → 543 lines (-73%)**
  - removed `enqueueExtractionJob` / `processExtractionJob` / `reclaimStaleExtractionJobs` (3 extraction-flow handlers)
  - removed `applyReviewAction` (review-queue callable)
  - cleaned up ~20 dependent core + helper functions
  - deleted `extract-gemini.js` (224 lines) + `ontology-extract.js` (1,295 lines) + `ontology-extract.test.mjs` (812 lines)
  - removed secrets `GEMINI_API_KEY` / `ANTHROPIC_API_KEY`. Removed `@google/generative-ai` dependency
- **`src/views/knowledge-review-workspace/` deleted entirely** (1,357-line view + barrel)
- **`app/review/` deleted entirely** (page + redirect + sub-route)
- **entity layer**: removed `enqueueKnowledgeExtractionJob` httpsCallable wrapper, `approveKnowledgeOutput` / `rejectKnowledgeOutput` callables + 6 types, `getKnowledgeReviewWorkspaceHref` helper. Each barrel export cleaned up.
- **6 view callers**: review-queue links cleaned up in KnowledgeDocumentDetailPage / (deleted KnowledgeReviewWorkspacePage) / KnowledgeDocumentsPage / KnowledgeDashboardPage / ProjectSelectorPage / ProjectEditorPage
- **Cumulative cleanup**: PR #5 -3,729 lines + PR #6 -2,096 lines + PR #7 -8 lines = **about -5,833 lines**

### Verification status

- **117 test files / 843 tests passing**
- tsc 0 errors
- lint 0 errors (79 pre-existing warnings)
- `node --check functions/index.js` syntax OK
- MCP server stdin/stdout JSON-RPC: initialize → tools/list (7 tools) → tools/call (`add_concept` / `patch_concept` / `find_backlinks` / `find_evidence` / `get_concept` / `list_concepts`) end-to-end healthy
- dev server (port 3210): core routes return 200, deleted `/review/knowledge/` returns 404, 0 Error markers in HTML

### Open questions

- **Q1** — ✅ answered ((a) chosen, useOntologyInsight introduced)
- **Q2 (share-doc removal)** — still pending
- **Q3-Q8 (V2 spec)** — still pending

### Operations notes

- The user does not run `firebase deploy --only functions` (no-firebase-deploy policy). Changes to functions/ are code-only cleanup, not deployed. Existing cloud functions are still alive but have 0 callers — dead.
- Existing `knowledgeExtractionJobs` / `knowledgeExtractionOutputs` / `knowledgeReviews` / `knowledgeApprovalEvents` Firestore collection data — cold storage (read-only); no callable remains, so archive-only.

---

## 2026-05-01 — Mode-aware CRUD + Builder rebrand

### User-visible changes

- `/` Landing — static mini topology SVG (14 nodes / 21 relations) + 3-step rail (markdown → extract → topology·tree·ERD) + Obsidian/Notion comparison copy + footer (MIT licensed · GitHub · tech stack). Marketing sections (Why / Coming-soon roadmap / Stats / framer-motion animation / Sigma drift background) all removed.
- `/projects/` — non-logged-in user redirect removed. List is shown immediately. Non-logged-in users with an active vault can use ProjectQuickCreatePanel to *create .md directly in the vault* (mode-aware).
- `/ontology/edit/` — 'Ontology Atlas' → **'Ontology Builder'** rebrand. Header trimmed from 5 lines → 1 line + ⓘ tooltip. Canvas widened from max-w 1400 → 1800. Non-logged-in users no longer see the raw 'Missing or insufficient permissions' error — the ephemeral canvas is fully usable.
- `/ontology/` — 'i' icon hover tooltip works + copy strengthened (hierarchy + builder entry guidance). 'Editor' button → **'Open Builder →'** prominent indigo fill. Footer at the bottom now shows nodes/relations + mode + projection version (surfacing V1.0 strengths).
- `/ontology/` vault mode — `VaultOntologyStubsPanel` is shown. Visualizes how frontmatter (`kind`, `capabilities`, `elements`, `relates`, `dependencies`, `domain`) immediately grows into stub nodes/edges.
- OperationsNav 'Documents' tab — branches to `/docs/` when a vault is active, otherwise `/knowledge/`.
- 'Demo' brand leftovers across landing / app → cleaned up to **`ontology-atlas`** (page title / OG / twitter / PWA manifest).

### New entities / features / shared modules

- `src/shared/lib/data-source-mode.ts` + `src/features/data-source-mode/` — hook that recognizes 4 operating modes (Static / Local / Cloud / Hybrid).
- `src/features/project-data-source/` — `useProjectMutations` mode-aware hook (local writes vault directly; cloud writes Firestore).
- `src/entities/docs-vault/lib/project-frontmatter.ts` — bidirectional Project ↔ frontmatter mapper + `buildProjectMarkdown`.
- `src/entities/docs-vault/lib/derive-ontology-from-vault.ts` — frontmatter → ontology stub conversion (fast path, bypasses AI extraction).
- `src/features/vault-ontology/` — useVaultOntology hook + VaultOntologyStubsPanel widget.
- `src/entities/local-fs-handle/` — entity-ization of File System Access handles (forward-compat for multi-vault).
- `src/entities/local-fs-handle/api/permission.ts` — generalized `verifyHandlePermission(handle, mode, {ask})` utility.
- `src/entities/docs-vault/lib/build-local-manifest.ts` — added `computeLocalVaultFingerprint` function (auto-refresh skip).

### Removed / cleanup

- `src/features/workspace-project-bridge/` — deleted entirely (771 lines / 9 files / 50 tests). Multi-account container adapter — dead after switching to single-user mode.
- `src/widgets/workspace-project-selector/ui/WorkspaceProjectSelector.tsx` — 230 lines of dead UI deleted.
- `src/shared/lib/account-scope.ts` — removed `appendWorkspaceProjectQuery` / `readRuntimeWorkspaceProjectId` stub functions.
- `src/shared/lib/use-workspace-project-query.ts` — deleted entirely + dead destructure cleanup in 3 consumers.
- removed `_accountId` parameter from `useScopedAccountAccess` (cleaned up 11 call sites at once).
- parts of `src/views/account-settings/` + parts of `src/widgets/account-menu/` — cleaned up no-longer-used code paths.
- 7 dead `/admin/*` URLs removed from 4 e2e audit specs.
- LocalVaultPicker's off-canon palette (peachy / muted-red / indigo variants) → unified to canonical warning(244,183,49) / danger(229,72,77) / indigo(94,106,210) + semantic tokens.
- LocalVaultPicker error state — added a one-line actionable hint.

### Bug fixes

- Removed the `accountId = null` hardcode in `OntologyEditPage` — restored manual node saving on the ERD canvas (previously always failed with the "account not confirmed" toast).
- `useApprovedGraphFlow` was attempting Firestore subscription when not logged in → raw permissions error — now skips subscription when accountId === null + returns empty graph + loaded:true.
- frontmatter parser didn't support multi-line YAML lists (`capabilities:\n  - x`) → support added.
- `useLocalVault`'s manual `refresh` now also applies the fingerprint skip (previously only auto-refresh did).

### New specs / docs (untracked, awaiting user review)

- `docs/ONTOLOGY-MODEL-V2-DRAFT.md` — V1.0 strengths + V1.1~V1.5 staged evolution (qualifiers / literals / rich-refs / ActionType / cardinality) + V2 unified statement model + 90+ checklist items + 2 Mermaid diagrams + 50+ Glossary terms + 8 Open questions + 13 sections.
- `docs/LOCAL-FIRST-SYNC.md` — 4 operating modes + 5 conflict-resolution principles + 4 open questions before introducing Hybrid.
- `docs/OFFLINE-FIRST-UX-FLOW.md` — 6 user states × 11 routes matrix + 5-step onboarding.
- `docs/ACTION-TYPE-SECURITY-DRAFT.md` — V1.4 ActionType's 8 security items, deeper.
- `docs/MODE-AWARE-CRUD.md` — contributor guide for the mode-aware pattern introduced today + 4 anti-patterns.

### Verification status

- 927 tests passing (131 test files)
- tsc 0 errors
- lint 0 errors (all warnings pre-existing)
- Playwright visual: `/`, `/projects/`, `/ontology/`, `/ontology/edit/`, `/docs/` and 8 routes audited — all 0 console errors.
- Cumulative commits: ~30+ (single session today). Cumulative diff: -3000+ / +1500+ lines (mostly cleanup).

### Open questions (awaiting user answers)

1. Should `/` topology auto-switch when an active vault exists? (a/b/c)
2. Can the share-doc system (`/share/[token]` + sharedDocs Firestore) be removed? (a/b)
3. V2 spec P0/P1 Open questions Q1~Q8 (multi-vault timing / ActionType auth / dual-read window / none vs unknown / extractionModelId validation / summary migration / literal naming scope / ActionInvocation retention)

---

## Before 2026-04-30

Earlier changes predate this CHANGELOG — see git log (`git log --oneline 7b16945..ba1e102`).
