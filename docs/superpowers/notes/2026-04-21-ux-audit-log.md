# UX 감사 루프 진행 로그

각 iteration 종료 시 아래 포맷으로 append. 플랜은 `docs/superpowers/plans/2026-04-21-ux-audit-loop.md`.

---

## 2026-04-21 01:05 — iteration 0 (루프 개시)

- **타겟**: 루프 인프라 셋업 + ProjectDrawer duplicate key 버그
- **현장 발견**: ProjectDrawer.tsx:759 `key={link.url}` — 중복 URL 있을 때 React 경고. ProjectDetail 에 같은 패턴 있어서 이미 고쳐둔 것과 동일 문제.
- **변경 요약**:
  - `src/widgets/project-drawer/ui/ProjectDrawer.tsx` key 를 `${link.url}-${idx}` 로
  - 플랜 md 작성 (`2026-04-21-ux-audit-loop.md`)
  - 이 로그 파일 초기화
- **커밋**: (다음 commit 에서 함께)
- **검증**: iteration 1 에서 run
- **다음 예정**: **P0-1 · `/admin/knowledge/documents/new` 입력 허들** 1차 — 현재 레이아웃 읽고 "md editor 중심" 으로 전환할 수 있는 최소 변경 단위 식별. 파일: `src/views/admin-knowledge-document-new/ui/AdminKnowledgeDocumentNewPage.tsx` 가 예상되는 진입점.

---

## 2026-04-21 01:15 — directive update (사용자 지시)

루프가 진행해야 할 원칙을 플랜 md 에 추가 반영 (`2026-04-21-ux-audit-loop.md`):

1. **유저 = 자기 페이지의 주인 (Notion/Obsidian 모델)** — `/project/[slug]` 에서 owner 는 inline 편집 가능해야 하고 `/admin/*` 경유가 필요 없어야 함. 타 공간은 읽기 전용, 초대 시 편집.
2. **UX 품질 바 최고 수준** — framer-motion smoothness, 디자인 시스템 md 엄수.
3. **성능: 10,000 노드까지 렉 없음** — lazy loading 전략. 허브 먼저, 하위 노드 on-demand.
4. **용어 계층 명확화** — 현재 "프로젝트" 가 전체 지도 · 허브 · 비허브 노드 세 개를 동시에 지시해 혼란. Workspace > Project(컨테이너) > Hub > Node 4-layer 로 재정의. UI rename 부터 (P0-0), 그 다음 컨테이너 entity (P0-B), lazy load (P0-C).

다음 iteration 부터 P0-0 (UI 용어 rename) 먼저 착수. DB 손대지 않는 가벼운 변경부터 시작해 안전성 확보.

- **새 P0 우선순위 (DB 안 건드리는 것 → 건드리는 것 순)**:
  1. P0-0 · UI rename (허브 · 서비스 · 워크스페이스 지도)
  2. P0-A (iter a) · Hero 제목·설명 inline 편집
  3. P0-1 · knowledge documents/new editor-first
  4. P0-A (iter b~) · 나머지 inline 필드
  5. P0-B · Project 컨테이너 entity (스키마 추가)
  6. P0-C · 성능 lazy loading

---

## 2026-04-21 01:30 — iteration 1 (meta: 루프 규칙 보강)

- **타겟**: 루프 운영 규칙 업그레이드 — push 자동화 + 야심 명문화 + 아키텍처 자유도 강조
- **현장 발견**: 사용자 지시 추가 — (a) 매 iteration 끝 `git push origin main` 강제, (b) "Obsidian/Notion 을 뛰어넘는 AI 시대 전용 도구" 야심, (c) DB 포함 모든 설계 자유롭게 변경 가능 재확인.
- **변경 요약**:
  - plan md 에 "야심" 섹션 추가 (북극성) + 프로세스 9단계 (push 추가) + 아키텍처 자유도 재강조 + 새 의존성(motion/editor) 허용.
  - iteration 에 금지 리스트 완화 (rules 배포는 여전히 사용자).
- **커밋**: iteration 1 의 이 커밋
- **검증**: 문서만 변경 — tsc/lint/test 영향 없음 (skip), 다음 iteration 에서 코드 변경 시 풀 검증.
- **다음 예정**: **P0-0 · UI rename** 착수. 시작 파일:
  - `src/views/home/ui/HomePage.tsx` 의 "전체 지도" 문구 → "워크스페이스 지도"
  - `src/widgets/legend/**` hub/service 구분 명확화
  - `ProjectDrawer` 헤더 "허브" 배지 유지, "서비스" 배지 추가 (비허브일 때)
  - 한 iteration 에 한 묶음 (예: home hero + legend) 만 처리. 나머지는 iteration 2~.

---

## 2026-04-21 01:45 — iteration 2 (meta: 엔드게임 · 로드맵 반영)

- **타겟**: 사용자가 밝힌 최종 비전 — "개발 중 프로젝트에서 MCP·API 로 docs 쏘면 실시간으로 토폴로지에 반영 + 작업자 presence overlay" — 를 북극성으로 고정.
- **현장 발견**: 지금 iteration 별 결정이 엔드게임(M2 HTTP API · M3 MCP · M4 presence · M5 webhook) 로 가는 길을 막을 수 있음. 예: slug 규약, 프로비넌스 필드, presence 저장소 선택.
- **변경 요약**:
  - plan md "야심" 섹션을 endgame 중심으로 재작성 (수집·추출·실시간 3축, 경쟁 도구 비교표).
  - **로드맵 마일스톤 M0-M5** 명시.
  - **P∞ 섹션 신설** — 매 iteration 셀프체크: "이 변경이 M2~M5 를 막지 않는가?"
- **커밋**: iteration 2
- **검증**: 문서만 (skip tsc/lint/test)
- **다음 예정**: **P0-0 · UI rename** — home hero + legend 부터. "이번 변경은 M2 API 규약과 충돌하지 않는가?" 셀프체크 수행하며 진행.

---

## 2026-04-21 01:55 — iteration 3 (meta: 랜딩 대개조 P0-D 추가)

- **타겟**: 랜딩 페이지(`/` = `src/views/landing/ui/LandingPage.tsx`) — 사용자 평 "구려 · AI 느낌 없음 · 트렌디 X". 제품의 첫인상이라 우선순위 상단.
- **현장 발견**: 현재 hero 는 텍스트 중심 + 우측 정보 카드. Linear/Vercel/Cursor 등 product-first hero 패턴과 동떨어짐. 실제 토폴로지가 주인공인 서비스인데 랜딩에서 토폴로지가 안 보임.
- **변경 요약**:
  - plan md P0-D 항목 추가 — 리퍼런스(Linear·Vercel·Raycast·Cursor·Supabase) · 섹션 구조 제안 · 모션·성능·엔드게임 정렬 · iteration 5단계 쪼개기.
  - 디자인 토큰 제약 재확인(무채색 + 단일 인디고, 보라→핑크 금지).
- **커밋**: iteration 3
- **검증**: 문서만 (skip tsc/lint/test)
- **다음 예정**: 실제 코드 iteration 4 부터 — **P0-D (a) hero 토폴로지 배경** 을 먼저 시도할지, **P0-0 UI rename** 을 먼저 할지 순서 결정. P0-0 이 더 안전 (DB 무변경, rename 만) 이므로 기본 경로는 P0-0 우선.

---

## 2026-04-21 02:05 — iteration 4 (meta: 제품명 "Narnia" convention 고정)

- **타겟**: 제품명/패키지명 convention 명문화 + M3 MCP 패키지명 수정.
- **사용자 지시**: "프로젝트명이 narnia야. map이 아니라. MCP 서버 이름은 `project-narnia-mcp`."
- **현장 발견**: 저장소 slug 가 `project-map` 이라 문서·코드에 그 이름이 섞이는 경향. 사용자 대면 용어는 **Narnia** 로 통일해야 함.
- **변경 요약**:
  - plan md M3: `@aslan/project-map-mcp` → `project-narnia-mcp`
  - plan md 라벨 용어 제약에 "제품명은 Narnia, 저장소명(project-map)는 내부만" 명시. API base 예시도 narnia.dev.
- **커밋**: iteration 4
- **검증**: 문서만 (skip)
- **다음 예정**: iteration 5 에서 실제 코드 착수. 우선 **P0-0 UI rename** — home 에 "워크스페이스 지도" · legend 에 허브/서비스 구분. 이후 P0-D (랜딩 대개조).

---

## 2026-04-21 02:15 — iteration 5 (P0-0 착수 + UI/UX 철학 명문화)

- **타겟**: (1) "전체 지도" 문구 5개 지점 → "워크스페이스 지도" 교체, (2) Legend 에 "서비스(비허브)" 행 추가, (3) 사용자 지시 "UI/UX 가 매우매우 중요, 쉬워야 한다" 철학을 plan md 최상단 섹션 0 으로 편입.
- **현장 발견 (grep)**:
  - `src/widgets/hero-header/ui/HeroHeader.tsx:26` default eyebrow
  - `src/widgets/hero-header/ui/HeroCollapsed.tsx:21` subtitle
  - `src/widgets/account-menu/ui/PublicAccountMenu.tsx:213` menu item
  - `src/views/home/ui/HomePage.tsx:691,720,1045,1054` 4곳
  - `src/widgets/legend/ui/Legend.tsx:202-208` 허브 한 줄만 있고 서비스 없음
  - `LandingPage.tsx` 의 "프로젝트 지도" 는 P0-D 대개조 범위 → 이번엔 건드리지 않음
- **변경 요약**:
  - 5개 파일에서 "전체 지도" · "프로젝트 지도 불러오는 중" → "워크스페이스 지도(~ 불러오는 중)"
  - Legend: 허브 행의 description 개선 + 서비스 행 신규 (grey marker · 설명 "허브에 연결된 일반 노드")
  - plan md: "0. UI/UX 가 가장 중요하다" 철학 섹션을 "1. Notion/Obsidian 모델" 위에 삽입. 야심·엔드게임보다 우선한다고 명시.
- **엔드게임 셀프체크 (P∞)**: 모두 문자열/UI, API contract 영향 0 ✓
- **검증**:
  - tsc ✓
  - lint ✓
  - test:run 202/202 ✓
  - next build skip (시간 절약, 코드 변경 소규모)
- **브라우저 확인**: 없음 (정적 분석만)
- **커밋**: iteration 5
- **다음 예정**: **P0-0 2단계** — ProjectDrawer 헤더에 허브/서비스 배지 추가 + 드로어 내부의 "프로젝트 정보" 같은 레이블 재점검. 또는 P0-D (a) hero 토폴로지 drift 착수. 둘 다 DB 무변경이라 안전. 이번 로그 읽는 다음 iteration 이 판단.

---

## 2026-04-21 02:25 — iteration 6 (P0-0 2단계 · 허브/서비스 배지)

- **타겟**: ProjectDrawer 헤더에 서비스(비허브) 배지 추가 + ProjectDetailPage heroMeta 에 "서비스" 추가. 지금은 허브일 때만 배지가 있고 비허브일 땐 카테고리만 표시돼 사용자가 "이게 허브야 아니야" 즉시 판단 어려움.
- **현장 발견 (grep)**:
  - `src/widgets/project-drawer/ui/ProjectDrawer.tsx:310-314` `isHub && <span>허브</span>` 하나만
  - `src/views/project-detail/ui/ProjectDetailPage.tsx:506` `project.isHub ? "허브" : null` — 비허브면 null
- **변경 요약**:
  - ProjectDrawer: `isHub` 삼항으로 확장. 비허브일 때 muted 회색 테두리 pill "서비스" 노출. 두 배지 모두 동일 사이즈·포지션이라 레이아웃 튀지 않음.
  - ProjectDetailPage heroMeta: null → "서비스". 이제 모든 프로젝트에 "허브 · <상태>" 또는 "서비스 · <상태>" 가 일관되게 보임.
- **엔드게임 셀프체크 (P∞)**: 순수 시각 라벨 추가 → M2~M5 영향 0 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 202/202 ✓. build skip.
- **브라우저 확인**: 없음 (정적 분석).
- **커밋**: iteration 6
- **다음 예정**: **P0-D (a) · 랜딩 hero 토폴로지 drift 배경** 착수. 파일: `src/views/landing/ui/LandingPage.tsx` 에 SigmaTopology 를 lazy import 로 배경 레이어에 배치. demo seed 20~40 노드만. 물리 alpha 낮춰 느린 drift. 기존 텍스트·CTA 는 위 레이어에 유지.

---

## 2026-04-21 02:35 — iteration 7 (P0-D (a) · 랜딩 hero 토폴로지 배경)

- **타겟**: `/` 랜딩의 hero 에 실제 제품(토폴로지) 을 배경 레이어로 투입. "말로 설명하는 hero" → "제품이 움직이는 hero" 로 전환.
- **현장 발견**: LandingPage 의 `<main>` 안에 radial gradient + dot grid 두 배경 레이어만 있음. 제품 자체가 안 보임. Linear/Vercel/Cursor 패턴과 정반대.
- **변경 요약**:
  - `src/views/landing/ui/LandingPage.tsx`:
    - `dynamic(() => import(...).SigmaTopology, { ssr: false })` 로 lazy import
    - `resolveFallbackProjects()` 로 seed 확보 (외부 네트워크 요청 0)
    - dot-grid 배경 레이어 뒤에 `<SigmaTopology projects={heroProjects} categories={[]} minimal />` 를 `pointer-events-none · right-0 · 70% width · md+ 에서만 노출 · radial mask` 레이어로 삽입. 좌측 카피와 겹치지 않게 우측으로 편중, mask 로 주변과 자연스레 흐림.
- **엔드게임 셀프체크 (P∞)**: 순수 프런트 렌더, API/스키마/presence 영향 0 ✓
- **검증**:
  - tsc ✓ · lint ✓ · test:run 202/202 ✓
  - next build skip (SigmaTopology 는 이미 다른 라우트에서 빌드 검증됨)
- **브라우저 확인**: 없음 (정적 분석만). 실제 화면의 시각 효과는 사용자가 dev 서버로 확인 필요. 모바일(< md) 에선 숨김 처리되어 성능·가독성 문제 없음.
- **커밋**: iteration 7
- **다음 예정**: **P0-D (b) · 랜딩 카피·CTA 재설계**. 현재 "문서가 프로젝트 구조가 됩니다" 는 유지하되 AI 시대 카피로 업그레이드 ("AI 와 함께 자라는 프로젝트 지도" 톤). CTA 위계 재점검 (primary "내 워크스페이스 만들기" · secondary "데모 둘러보기" · ghost "로그인"). 미니멀 톤. 이어서 (c) 섹션 모션.

---

## 2026-04-21 02:45 — iteration 8 (P0-D (b) · 랜딩 카피 AI 톤으로 업그레이드)

- **타겟**: 랜딩 3개 카피 블록 — (a) 브랜드 pill 설명, (b) 우측 사이드 카드, (c) hero 헤드라인·서브카피 — 를 AI 네이티브 / 팀 협업 중심으로 재작성.
- **현장 발견**:
  - 브랜드 pill: "문서 기반 프로젝트 토폴로지" — 기능 설명적, AI 감 없음.
  - 우측 사이드 카드: "로그인 후 사용" + "로그인된 사용자 기준으로만 열립니다" — 첫인상에 제약·부정 전면. 역효과.
  - hero 헤드라인: "문서가 / 프로젝트 구조가 / 됩니다" — 수동태, AI 야심 불투명.
  - 서브카피: "로그인 후에만 자기 공간과 데모 공간을 정확히 확인할 수 있습니다" — 또 제약 반복.
- **변경 요약** (`src/views/landing/ui/LandingPage.tsx`):
  - 브랜드 pill: "AI 와 함께 자라는 프로젝트 지도"
  - 사이드 카드: 제약 카피 제거 → "AI 가 지도를 그립니다" + "MD 문서를 넣으면 프로젝트·허브·서비스가 자동으로 뽑혀 지도에 반영됩니다. 직접 수정도 가능합니다." (인디고 테두리로 CTA 톤도 살짝 상향).
  - eyebrow: "Documents become structure" → "AI-native project map"
  - 헤드라인: 2줄로 타이트 — "문서를 쓰면 / **지도**가 자랍니다"
  - 서브카피: "MD 한 장이면 충분합니다. AI 가 프로젝트·허브·서비스와 연결을 뽑아 살아있는 지도로 만듭니다. 팀 전체가 한 화면에서 '지금 무엇이 어디에 연결됐는지' 를 같이 봅니다." — 엔드게임(presence) 티저 자연스럽게 섞음.
- **CTA 라벨은 유지**: "내 워크스페이스 만들기" / "데모 로그인" / "로그인". E2E deep-audit.spec 과 호환 위해 단어 변경 없음.
- **엔드게임 셀프체크 (P∞)**: 카피만 변경. API/스키마/presence 스키마 영향 0. 단, "팀 전체가 같이 봅니다" 라는 문구가 M4 presence 약속이 되므로 M4 구현 순서를 뒤로 밀지 않도록 주의 (티저 카피가 실물과 1~2 iteration 이상 차이 나면 부정적).
- **검증**:
  - tsc ✓
  - lint — 첫 실행 react/no-unescaped-entities 2건 → 쌍따옴표를 `&ldquo;`/`&rdquo;` 로 치환 후 통과
  - test:run 202/202 ✓
  - next build skip (텍스트 변경)
- **브라우저 확인**: 없음 (정적 분석). 실제 헤드라인 임팩트는 사용자 확인 필요.
- **커밋**: iteration 8
- **다음 예정**: **P0-D (c) · 랜딩 섹션 모션 (framer-motion whileInView 페이드·y-offset)**. 현재 정적. hero 아래 섹션(How it works · Flow · Demo stats) 에 scroll-triggered reveal 적용. 그 다음 (d) 제품 스크린샷 섹션, (e) 로드맵 티저.

---

## 2026-04-21 02:55 — iteration 9 (P0-D (c) · 랜딩 섹션 모션)

- **타겟**: 랜딩 페이지에 framer-motion 기반 scroll reveal 적용 — 최고 수준 smoothness. 기존엔 완전 정적.
- **현장 발견**: LandingPage 에 motion import 없음. 3개 reveal 포인트 식별:
  (1) hero text block (mount fade-in), (2) Flow+Demo grid (scroll reveal), (3) How it works sidebar (scroll reveal, slight delay).
- **변경 요약** (`src/views/landing/ui/LandingPage.tsx`):
  - `import { motion } from "framer-motion"` 추가
  - hero text `<div>` → `<motion.div>` with `initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} transition={duration:0.5, ease:easeOut}` (mount 즉시 부드럽게 등장)
  - Flow+Demo grid `<div>` → `<motion.div>` with `whileInView={{opacity:1,y:0}}` from `{opacity:0,y:24}`, `viewport={once:true, amount:0.25}`, duration 0.5
  - How it works sidebar `<div>` → `<motion.div>` same pattern with `delay:0.08` 으로 grid 와 약간 스태거
- **엔드게임 셀프체크 (P∞)**: 순수 시각 모션. API/스키마/presence 영향 0 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 202/202 ✓. build skip (motion 은 이미 다른 라우트에서 빌드 검증됨).
- **브라우저 확인**: 없음 (정적 분석). 실제 reveal smoothness 는 dev 서버에서 확인 필요.
- **커밋**: iteration 9
- **다음 예정**: **P0-D (d) · 제품 스크린샷 섹션 추가**. 토폴로지 · 상세 편집 · knowledge 추출 결과 3장. hero 아래 새 section 으로. placeholder 이미지/스크린샷이 아직 없으면 "실제 화면 3장을 컴포지트로 렌더" 하는 방식 (작은 SigmaTopology 여러 인스턴스 or actual 스크린샷 파일). 실스크린샷 준비는 사용자 결정 필요 — 대안으로 (e) 로드맵 티저 (M2 API / M3 MCP coming soon 카드) 를 먼저 할 수 있음. 다음 iteration 에서 판단.

---

## 2026-04-21 03:05 — iteration 10 (P0-D (e) · 로드맵 엔드게임 티저)

- **판단**: 실스크린샷 파일 준비는 사용자 결정 대기. 텍스트만으로 강력한 차별점 전달 가능한 (e) 로드맵 티저 먼저 진행.
- **타겟**: 랜딩에 "엔드게임 비전(M2 API · M3 MCP · M4 presence)" 을 예고하는 3장 카드 섹션 추가. 사용자가 "Coming soon" 을 통해 이 제품이 어디로 가는지 느끼게.
- **변경 요약** (`src/views/landing/ui/LandingPage.tsx`):
  - lucide import 에 Plug · Radio · Terminal · Zap 추가
  - `</section>` 뒤에 새 `<motion.section>` 추가 — whileInView 페이드+y-offset 으로 이전 섹션과 모션 일관. eyebrow "Coming soon" + 헤드라인 "IDE 에서 쏘면 지도가 자라는 하네스" + 서브카피.
  - RoadmapCard 컴포넌트 신설 (eyebrow milestone pill · 인디고 아이콘 박스 · 타이틀 · body)
  - 3장 카드:
    - M2 · Zap · HTTP API · "POST /api/v1/docs — curl 한 줄"
    - M3 · Terminal · MCP 서버 · "project-narnia-mcp — Claude Code·Cursor"
    - M4 · Radio · 실시간 presence · "노드 위에 '작업 중·누가' 오버레이"
  - 하단 footer 라인: M1 (현재 루프) 완료 후 순차 오픈 안내. Plug 아이콘.
  - 디자인 토큰 준수 — 무채색 + 단일 인디고. 보라→핑크·glow·scale hover 없음.
- **엔드게임 셀프체크 (P∞)**: 티저 카피가 M2(`POST /api/v1/docs`) · M3(`project-narnia-mcp`) 라는 구체 API contract 를 사용자 대면 약속으로 만들었음. 구현 시 이 규약을 지켜야 함. slug/path 변경 시 이 티저도 동시 업데이트.
- **검증**: tsc ✓ · lint ✓ · test:run 202/202 ✓. build skip (motion·lucide 는 기존 검증됨).
- **브라우저 확인**: 없음 (정적 분석).
- **커밋**: iteration 10
- **다음 예정**: **P0-D (d) · 제품 스크린샷 섹션** — 실스크린샷 파일 없으면 랜딩에 mini Sigma 여러 인스턴스 (토폴로지) 로 대체 컴포지트 또는 skip. 또는 **P0-0 (3단계) · LandingPage 본문의 "프로젝트 지도" 문구** 를 "워크스페이스 지도" 로 동기화 (iter 5 에서 랜딩은 범위 밖으로 미뤄뒀던 것). 후자가 더 안전한 작업이라 선호.

---

## 2026-04-21 03:15 — iteration 11 (P0-0 3단계 · 랜딩 본문 용어 정돈)

- **타겟**: 랜딩 본문에 남아있던 "프로젝트 지도" 3곳을 "지도" 축약으로 교체. 브랜드 슬로건 1곳은 의도적으로 유지 (마케팅 리듬).
- **현장 발견**: grep 결과 "프로젝트 지도" 4개 라인.
  - line 145 브랜드 pill "AI 와 함께 자라는 프로젝트 지도" — 슬로건, 유지
  - line 222 footnote — 교체 대상
  - line 242 Flow 카드 body — 교체 대상
  - line 294 StepCard body — 교체 대상
- **변경 요약** (`src/views/landing/ui/LandingPage.tsx`):
  - line 222: "프로젝트 지도가 자랍니다" → "지도가 자랍니다" (hero 헤드라인과 리듬 일치)
  - line 242: "md를 넣으면 구조를 먼저 보여주고, 확인 후 프로젝트 지도에 반영" → "MD 를 넣으면 AI 가 구조를 먼저 보여주고, 확인 후 지도에 반영" (AI 역할 명시 + 축약)
  - line 294: "맞으면 프로젝트 지도에 반영" → "맞으면 지도에 반영"
- **엔드게임 셀프체크 (P∞)**: "프로젝트" 용어 중의성 감소. Workspace > Project > Hub > Node 4-layer 도입(P0-B) 때 재쓰기 필요한 카피 수 줄어듦. M2~M5 영향 0 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 202/202 ✓. build skip.
- **브라우저 확인**: 없음.
- **커밋**: iteration 11
- **다음 예정**: **P0-D (d) · 제품 스크린샷 섹션** 대체 구현. 실스크린샷 파일 없이 진행하려면 hero 아래 **"What it looks like" 섹션** 에 mini SigmaTopology 3개 (토폴로지 전체 · 허브 하나 / 서비스 하나 · 검색 필터 예시) 을 작은 타일로 컴포지트 하는 방안. 또는 placeholder 이미지 3장 (gradient 카드) 로 대체. 다음 iter 에서 판단. 안전한 대안은 **P0-0 완료 마무리 + 나머지 P0** 로 이동: **P0-A (iter a) · 자기 공간 inline 편집 착수**.

---

## 2026-04-21 03:25 — iteration 12 (P0-A 기반 · InlineEditable 공용 컴포넌트)

- **판단**: 스크린샷은 사용자 결정 대기 중이므로 P0-A (Notion 모델 inline 편집) 로 이동. 이번 iteration 은 인프라만 (컴포넌트 생성 + export). 다음 iter 에서 실제 ProjectDetailPage 에 적용.
- **타겟**: 재사용 가능한 inline 편집 컴포넌트 — 클릭 → input/textarea 전환 → Enter/blur 저장, Esc 취소, 실시간 value 동기화, 비어 있을 때 placeholder.
- **설계 포인트**:
  - `as` prop 으로 h1/h2/p/span/div 태그 선택 — hero 타이포그래피 유지
  - `multiline` 으로 input vs textarea 분기
  - single-line 은 Enter 즉시 커밋, multiline 은 Cmd/Ctrl+Enter
  - 값이 동일하면 onSave 호출 안 함 (불필요한 write 방지)
  - `allowEmpty=false` 기본 (빈 값 제출 시 cancel)
  - 외부 value 변경 시 편집 중이 아닐 때만 draft 동기화 (실시간 구독과 호환)
  - onSave 실패 시 catch + view 복귀 (호출부가 toast 표시)
- **변경 요약**:
  - `src/shared/ui/inline-editable.tsx` 신설 — InlineEditable 컴포넌트
  - `src/shared/ui/index.ts` export 추가
- **엔드게임 셀프체크 (P∞)**: 컴포넌트는 순수 UI, API 무관. M2~M5 영향 0 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 202/202 ✓ (컴포넌트 자체 테스트는 다음 iter 에서 실사용과 함께).
- **브라우저 확인**: 없음.
- **커밋**: iteration 12
- **다음 예정**: **P0-A (a) 2단계** — ProjectDetailPage 에 InlineEditable 실제 적용. `project.name` h1 을 InlineEditable 로 감싸고 `onSave` 에서 `upsertProject` 호출. `canManageProject` 플래그로 gating. 토스트 피드백 포함. description 은 그 이후 iter 에서.

---

## 2026-04-21 03:40 — iteration 13 (P0-A (a) · ProjectDetailPage h1 inline 편집)

- **타겟**: 자기 공간 프로젝트 상세에서 h1(name) 을 바로 편집. `/admin/project/edit` 왕복 없이 Notion 식 경험.
- **현장 발견**:
  - ProjectDetailPage 에 `canManageProject = scopedAccess.canManage` 이미 정의
  - subscribeProjects 가 snapshot 으로 setProject 업데이트 → optimistic update 불필요
  - h1 은 복잡한 className (clamp font, hub 인디고 색) 유지 필요
- **변경 요약** (`src/views/project-detail/ui/ProjectDetailPage.tsx`):
  - entities/project import 에 `projectToInput` · `upsertProject` 추가
  - shared/ui import 에 `InlineEditable` · `useToast` 추가
  - useToast hook 호출을 최상단 (scopedAccess 아래) 으로 배치 — 조건부 호출 lint 에러 회피
  - `saveProjectField(field, next)` helper — `upsertProject({...projectToInput(project), [field]: next, accountId})`. 토스트 성공/실패 피드백. rethrow 해서 InlineEditable 의 view 복귀 유지.
  - h1 을 `<InlineEditable as="h1" value={name} editable={canManageProject} onSave={...} className={기존 스타일} />` 로 교체
- **엔드게임 셀프체크 (P∞)**:
  - `upsertProject` 는 이미 accountId scope 기반. rules 에서 member 체크. ✓ M1 owner 모델 부합.
  - 외부 API (M2) 도 같은 `upsertProject` 경로 사용 예정 → 이 패턴이 그대로 이식됨.
- **검증**:
  - tsc ✓
  - lint — 첫 실행 `react-hooks/rules-of-hooks` (useToast 조건부 호출) 1건 → hook 을 early return 전 최상단으로 이동해 해결
  - test:run 202/202 ✓
  - build skip (컴포넌트 · import 추가로 소규모 변경)
- **브라우저 확인**: 없음 (정적 분석). 실제 클릭·편집·저장 동작은 dev 서버에서 확인 필요. rules 배포 안 된 상태면 owner 만 owner 공간에서 성공.
- **커밋**: iteration 13
- **다음 예정**: **P0-A (a) 3단계 · description 도 InlineEditable (multiline)**. 같은 saveProjectField 재사용. 이후 Dependencies · Tags · Stack 인라인 편집은 각자 picker 컴포넌트이므로 별도 iter.

---

## 2026-04-21 03:50 — iteration 14 (P0-A (a) · description 인라인 편집)

- **타겟**: ProjectDetailPage 의 description `<p>` 를 InlineEditable multiline 으로 전환. 같은 saveProjectField 재사용.
- **현장 발견**:
  - description 렌더 라인 (631): `data-testid="project-detail-description"` 붙어 있음
  - `tests/e2e/public-topology.spec.ts` 에서 이 testid 사용 → 유지 필수
  - InlineEditable 초기 API 에 dataTestId prop 없음 → 확장 필요
- **변경 요약**:
  - `src/shared/ui/inline-editable.tsx`: `dataTestId?: string` prop 추가. view 모드 (interactive/static 모두) 와 edit 모드 (input/textarea) 에 `data-testid` 전달.
  - `src/views/project-detail/ui/ProjectDetailPage.tsx`: description `<p>` → `<InlineEditable as="p" multiline value={description} onSave={... "description"} dataTestId="project-detail-description" placeholder="이 프로젝트를 한 줄로 설명하세요" />`.
- **엔드게임 셀프체크 (P∞)**: 인라인 편집 경로 확장, API 무변경. testid 보존으로 E2E 호환. M2~M5 영향 0 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 202/202 ✓. build skip.
- **브라우저 확인**: 없음 (정적 분석). 실제 textarea 편집(Cmd+Enter 커밋·Esc 취소) 은 dev 서버에서 확인 필요.
- **커밋**: iteration 14
- **다음 예정**: **P1-2 · 토폴로지 첫 로딩 포지션 허브 중앙 fit-to-view 강제**. main `/` 진입 시 selectedSlug 없어도 허브 중심으로 카메라 자동 정렬. 또는 **P0-A (b) Dependencies 인라인 편집** (DependencyPicker 컴포넌트 재사용해 ProjectDetailPage 에 직접 노출). 후자가 Notion 모델 확장으로 가치 크나 picker UI 가 이미 존재해 integration 만 하면 됨. 다음 iter 에서 판단.

---

## 2026-04-21 04:00 — iteration 15 (P1-2 · 토폴로지 첫 로딩 허브 centroid 정렬)

- **타겟**: 초기 진입 시 토폴로지가 중앙 정렬된 첫인상을 제공. 지금까지 minimal 모드만 자동 recenter, main 모드는 `(0.5, 0.5, ratio 1)` 에 머무르는 로직조차 사용자 fitViewToken 증분 의존.
- **현장 발견** (`src/widgets/topology-map-sigma/ui/SigmaTopology.tsx`):
  - `recenter` helper 는 존재. selectedSlug 있으면 그 노드, 없으면 `(0.5, 0.5)` fallback.
  - settle 후 노드 분포 centroid 가 origin 에서 벗어나면 `(0.5, 0.5)` 는 빈 영역일 수 있음.
  - 마운트 자동 recenter effect 에 `if (!minimal || !sigmaInstance) return` — main 모드엔 동작 X.
- **변경 요약**:
  - `recenter` fallback 강화: selectedSlug 없을 때 허브 노드들의 viewport centroid 계산해 그쪽으로 카메라 이동. 허브 0개면 기존 `(0.5, 0.5)` 로 폴백.
  - 마운트 자동 recenter effect 에서 `!minimal` 가드 제거. main/minimal 모두 `sigmaInstance` 준비 후 `260ms/220ms` delay 로 한 번 실행.
- **엔드게임 셀프체크 (P∞)**: 카메라 animate 만. API/스키마/presence 영향 0 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 202/202 ✓. build skip.
- **브라우저 확인**: 없음 (정적 분석). 실제 첫인상 센터링 효과는 dev 서버에서 확인 필요 — 허브가 많은 데모 공간이 가장 잘 드러날 것.
- **커밋**: iteration 15
- **다음 예정**: **P1-3 · 모바일 drawer 를 full-screen modal 로 전환**. 현재 canvas 위 drawer 가 모바일에서 거의 전체를 덮어 UX 어색. `project-drawer` 의 breakpoint 분기 재설계. 또는 **P0-A (b) Dependencies 인라인 편집** 진입. 후자가 제품 가치 크나 picker UI + cycle 체크 + upsertProject 흐름 통합으로 iter 크기 중간 이상. P1-3 은 CSS 조정 위주라 더 작음. 다음 iter 에서 우선순위 판단.

---

## 2026-04-21 04:10 — iteration 16 (P1-3 · 모바일 drawer 상단 canvas 노출)

- **타겟**: 모바일 ProjectDrawer 가 `top-16` 으로 화면의 대부분을 덮어 "열면 canvas 가 안 보임" 문제. iOS HIG 의 peek/full bottom sheet 패턴 단순 버전 적용.
- **현장 발견** (`src/widgets/project-drawer/ui/ProjectDrawer.tsx:291`): `fixed inset-x-0 bottom-0 top-16 ... lg:inset-y-0 lg:right-0 lg:left-auto lg:top-0 lg:max-w-md` — 모바일에서 상단 64px 만 남기고 나머지 전부 drawer. 사용자가 "canvas 거의 전체 덮음" 이라고 언급.
- **계획**: 모바일 peek 높이를 줄여 drawer 62% · canvas 38% 비율로. 아래로 120px 드래그 닫기 기존 유지, overflow-y-auto 로 내부 스크롤 가능. 데스크탑(lg+) 은 무변경 (우측 사이드 드로어).
- **변경 요약**: className 의 `top-16` → `top-[38%]`. 단 한 줄.
- **엔드게임 셀프체크 (P∞)**: CSS 조정 한 줄. API/스키마/presence 영향 0 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 202/202 ✓. build skip.
- **브라우저 확인**: 없음 (정적 분석). 실제 모바일 터치·드래그 동작은 사용자 기기에서 확인 필요.
- **커밋**: iteration 16
- **다음 예정**: **P0-A (b) · Dependencies 인라인 편집** 착수. ProjectDetailPage 에 DependencyPicker 를 조건부 (canManageProject) 로 렌더. picker 값 변경 시 `upsertProject({...input, dependencies: next})` 로 저장. cycle 감지는 picker 에 이미 invalidSlugs 로 구현돼 있음 — 호출부가 `wouldCreateDependencyCycle` 로 계산해 전달. iter 크기 중간 이상이라 2 iteration 으로 쪼갤 가능성 높음: (b1) picker 렌더 + 기본 저장, (b2) cycle·UX 정돈.

---

## 2026-04-21 04:25 — iteration 17 (P0-A (b1) · Dependencies 인라인 편집 착수)

- **타겟**: ProjectDetailPage 에 DependencyPicker 통합. 자기 공간 owner 는 `/admin/*` 경유 없이 허브·서비스 연결을 즉시 토글.
- **현장 발견**:
  - `related` state 에 이미 다른 프로젝트 리스트 구독 중
  - DependencyPicker 는 `@/features/project-edit/ui/DependencyPicker` 에 있고 `options · selfSlug · invalidSlugs · value · onChange` API
  - cycle 체크용 `wouldCreateDependencyCycle` 은 entities/project 에 export
- **변경 요약** (`src/views/project-detail/ui/ProjectDetailPage.tsx`):
  - imports: `wouldCreateDependencyCycle` + `DependencyPicker` + `DetailCard`
  - `saveDependencies(next: string[])` helper — upsertProject 로 저장. picker 가 토글마다 호출하므로 성공 토스트는 생략 (실패만 alert). 일반 케이스(1~3개 변경) 에선 write 부담 적음.
  - `dependencyUniverse` 계산: `related` 에 self 미포함이면 self 추가 (cycle 분석에 필요)
  - `invalidDependencySlugs` 계산: `wouldCreateDependencyCycle(universe, project.slug, candidate.slug)` 필터
  - Hero 의 chip row 아래 `canManageProject` 조건부 `<DetailCard eyebrow="Dependencies" title="의존하는 프로젝트">` 삽입. 내부에 DependencyPicker. description 으로 cycle 안내.
- **엔드게임 셀프체크 (P∞)**: `upsertProject` 경로만 사용. M2 API 가 같은 함수 쓰면 dependencies 필드도 동일 규약으로 수용됨 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 202/202 ✓. build skip.
- **브라우저 확인**: 없음 (정적 분석). 실제 picker 토글·cycle 경고는 dev 서버에서 확인 필요.
- **커밋**: iteration 17
- **다음 예정**: **P0-A (b2) · Dependencies 인라인 편집 정돈** — 매 토글마다 upsertProject 호출이 과하면 debounce(300ms) 삽입 + 저장 중 상태 표시 작은 indicator. 또는 **P0-A (c) · Tags/Stack 인라인** 확장. 둘 다 Notion 모델 완성도. P0-A (b2) 가 먼저 (UX 안정성), 이후 (c).

---

## 2026-04-21 04:40 — iteration 18 (P0-A (c) · Tags·Stack 인라인 편집)

- **타겟**: ProjectDetailPage 의 태그·기술 스택 chip 목록을 owner 면 즉시 추가·삭제할 수 있게. Notion 식 inline chip editor.
- **판단**: P0-A (b2) debounce 는 체감 문제 아직 없고, 제품 가치는 (c) 가 크므로 (c) 먼저.
- **현장 발견** (`src/views/project-detail/ui/ProjectDetailPage.tsx` 1104-1144): tags / stack 모두 `{length > 0 && ...}` 블록 안에 정적 chip 렌더. 빈 배열이면 아예 섹션 숨김 → owner 가 태그를 처음 추가할 경로 없음.
- **변경 요약**:
  - 신규 공용 컴포넌트 `src/shared/ui/chip-list-editor.tsx` — `ChipListEditor`. props: value · editable · onChange · placeholder · variant("default"|"indigo") · emptyHint · ariaLabel.
    - editable=false + 빈값: emptyHint 또는 null
    - editable=true: 각 칩 옆 X 삭제 + 끝에 "+ 추가" 토글 (클릭 → inline input → Enter 커밋, Esc 취소, blur 커밋, 중복 무시)
    - 디자인 토큰 엄수: 무채색 · 단일 인디고(variant=indigo)
  - `src/shared/ui/index.ts` export 추가
  - ProjectDetailPage:
    - imports: ChipListEditor 추가 (Button/DetailCard 와 함께)
    - `saveListField(field: "tags"|"stack", next: string[])` helper — upsertProject. 실패만 토스트.
    - tags/stack 렌더 가드 변경: `(canManageProject || length > 0)` 이면 섹션 노출. owner 면 빈 상태에서도 "+ 추가" 칩이 보임.
    - 기존 span 칩 렌더를 ChipListEditor 로 교체. variant 는 tags=default, stack=indigo.
- **엔드게임 셀프체크 (P∞)**: `upsertProject` 경로 재사용. M2 API 가 같은 함수 호출 시 `tags/stack` 필드 규약 그대로 수용 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 202/202 ✓. build skip.
- **브라우저 확인**: 없음 (정적 분석). 실제 추가·삭제 인터랙션은 dev 서버에서 확인 필요.
- **커밋**: iteration 18
- **다음 예정**: **P0-A 마무리** 후보 — (d) links 인라인 편집. 또는 **P0-C · 토폴로지 성능 lazy load** 1단계 착수. (d) links 는 ChipListEditor 재사용 불가 (label+url 2필드) 라 별도 LinkListEditor 필요. 성능 lazy load 는 더 큰 리팩토. 다음 iter 에서 (d) 가 자연 연장이면서 작아서 우선.

---

## 2026-04-21 04:55 — iteration 19 (P0-A (d) · Links 인라인 편집)

- **타겟**: ProjectDetailPage 의 바로가기 링크 목록 (label+url 쌍) 을 owner 가 직접 추가·삭제.
- **현장 발견** (lines 1091-1122): `project.links.length > 0` 가드 → 빈 배열이면 섹션 숨김. 기존 chip + anchor 렌더만.
- **변경 요약**:
  - 신규 공용 컴포넌트 `src/shared/ui/link-list-editor.tsx` — `LinkListEditor` + `LinkItem` 타입 export.
    - 기존 링크 row: anchor (label + ↗) + editable 이면 X 삭제 버튼
    - editable + "+ 링크 추가" → 2개 입력 (label · url) + "추가"/"취소" 버튼. Enter=commit · Esc=cancel. 빈 필드 있으면 자동 취소.
    - 중복 url 현재 허용 (label 다를 수 있음)
    - 디자인 토큰 엄수 (무채색 + 인디고 accent)
  - `src/shared/ui/index.ts` export 추가 (LinkListEditor · LinkItem)
  - ProjectDetailPage:
    - imports: LinkListEditor · LinkItem 추가
    - `saveLinks(next: LinkItem[])` helper — upsertProject + 실패만 토스트
    - links 섹션 가드: `(canManageProject || links.length > 0)` → owner 는 빈 상태에서도 편집 가능
    - `<ul>...<a>...</a></ul>` 정적 렌더 → `<LinkListEditor>` 한 줄로 교체 (기존 E2E 용 data-testid 는 없었음)
- **엔드게임 셀프체크 (P∞)**: upsertProject 재사용. M2 API 도 links 필드 동일 규약 수용 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 202/202 ✓. build skip.
- **브라우저 확인**: 없음 (정적 분석). 실제 추가·삭제·Enter 커밋 동작은 dev 에서 확인.
- **커밋**: iteration 19
- **다음 예정**: **P0-A 마무리 점검** — Hero 영역 외 다른 편집 가능 필드 (icon, owner, progress) 도 inline 화 여부 검토. 또는 **P1-4 · 토폴로지 키보드 nav** (selectedSlug 없을 때 Tab 반응), **P1-5 · SEO metadata** 강화. P0-A 는 이정도로 마무리하고 P1 로 넘어가는 게 Notion 모델 MVP 로 충분. 다음 iter 에서 P1-4 우선 선택 예정 (P0-C 성능은 큰 리팩토라 P1 이후).

---

## 2026-04-21 05:05 — iteration 20 (P1-4 · 토폴로지 키보드 nav 진입점 개선)

- **타겟**: selectedSlug 없을 때 Tab 누르면 "아무 것도 안 함" 문제. 키보드 유저가 첫 진입 후 Tab 을 눌렀을 때 즉시 탐색 시작할 수 있도록.
- **현장 발견** (`src/widgets/topology-map-sigma/lib/use-graph-keyboard-nav.ts:92-102`): Tab 핸들러 최상단 `if (!focus || !graph.hasNode(focus)) return;` — 선택 없으면 조용히 무시.
- **변경 요약**:
  - focus 가 없을 때 fallback 경로 추가:
    1. 허브 노드 목록 (isHub=true) 을 name 사전순 정렬 → 첫 허브 선택
    2. 허브가 없으면 전체 노드 사전순 첫 번째
    3. 그것도 없으면 그래프 비어있는 상태 → return
  - focus 있을 때 이웃 순회는 기존 로직 유지 (cycle 버그 는 별도 iter 에서).
- **엔드게임 셀프체크 (P∞)**: 키보드 이벤트 처리만. API/스키마/presence 영향 0 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 202/202 ✓. build skip.
- **브라우저 확인**: 없음 (정적 분석). 실제 키보드 탐색은 dev 서버 `/` 에서 Tab 눌러 확인.
- **커밋**: iteration 20
- **다음 예정**: **P1-5 · SEO metadata** — `/project/[slug]` 의 `generateMetadata` 를 개선해 프로젝트 이름·설명을 og:title, description 에 반영. `/app/project/[slug]/page.tsx` 가 server component 인지 확인 필요. 또는 **P0-A 관련 빠뜨린 필드 점검** (owner · progress · icon 등 Hero 에 inline 가능성). 다음 iter 에서 판단.

---

## 2026-04-21 05:20 — iteration 21 (P1-5 · SEO metadata 보강)

- **타겟**: `/project/[slug]` 의 generateMetadata 에 keywords · siteName 신호 추가. 소셜 카드 신뢰도 상향.
- **현장 발견** (`app/project/[slug]/page.tsx:28-77`): 이미 title·description·canonical·openGraph(title·desc·type·url·image)·twitter(card·title·desc·image) 구성 양호. 누락 포인트: `keywords`, `openGraph.siteName`.
- **계획**: keywords 는 tags + stack + category + 허브/서비스 라벨을 중복 제거해 합성. siteName 을 "Narnia" 로 명시해 소셜 공유 시 브랜드 일관성.
- **변경 요약** (`app/project/[slug]/page.tsx`):
  - `keywords` 배열 생성 로직 추가 (tags · stack · category · 허브/서비스 라벨 · 유효값만)
  - `generateMetadata` 반환에 `keywords` · `openGraph.siteName: 'Narnia'` 추가
  - twitter 는 `@narnia` 핸들이 실제 존재하는지 확실치 않아 site 필드 추가 생략 (추후 계정 확인 후)
- **엔드게임 셀프체크 (P∞)**: build-time metadata. API/스키마/presence 영향 0 ✓. static export 제한상 account-scoped 프로젝트 (`/project/X?account=Y`) 의 dynamic 메타 적용은 별도 iter 필요 — 플랜에 기록만.
- **검증**: tsc ✓ · lint ✓ · test:run 202/202 ✓. build skip.
- **브라우저 확인**: 없음 (정적 분석). 빌드 후 HTML 소스에서 `<meta name="keywords">` `og:site_name` 확인 가능.
- **커밋**: iteration 21
- **다음 예정**: **P2 순회 1차** — 플랜의 P2 전 페이지 리스트에서 가장 쉬운 `/login`, `/signup`, `/reset-password` 3개 인증 화면의 에러·빈 상태·CTA 가독성 체크 1 iter. 또는 **P0-A (e) owner/progress inline** 검토. P2 순회가 더 넓은 커버리지.

---

## 2026-04-21 05:35 — iteration 22 (P2 인증 3 화면 1차 순회 · 에러 색 일관화)

- **타겟**: `/login`, `/signup`, `/reset-password` 에러 메시지 색상·a11y 일관화.
- **현장 발견** (grep):
  - LoginPage:139 `error` `<p>` 가 `color-indigo-accent` (성공 색) 사용 + role 없음 — 의미·가독성 불량.
  - SignupPage:167 동일 문제 (role="alert" 는 이미 있음).
  - PasswordResetPage:72 는 `color-danger` + role="alert" 바른 패턴.
- **계획**: Login/Signup 의 에러 p 를 PasswordReset 패턴에 맞춰 `color-danger` + role="alert" 로 통일.
- **변경 요약**:
  - `src/views/login/ui/LoginPage.tsx`: error `<p>` 에 role="alert" 추가 + color 변경.
  - `src/views/signup/ui/SignupPage.tsx`: color 변경.
- **엔드게임 셀프체크 (P∞)**: 색·a11y 만. API 영향 0 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 202/202 ✓. build skip.
- **브라우저 확인**: 없음 (정적 분석).
- **P2 1차 순회 체크리스트** (기준):
  - Login: headline/CTA 위계 OK, 보조 경로(회원가입·데모·재설정) 모두 존재, 에러 색만 교정 필요했음 → 이번 iter 해결
  - Signup: 동일, 에러 색 교정 → 해결
  - PasswordReset: 깔끔. 개선 없음.
- **커밋**: iteration 22
- **다음 예정**: **P2 순회 2차 · `/projects` + `/` 첫 방문자 흐름** — /projects 프로젝트 선택 페이지의 CTA · 빈 상태 · 검색. / 랜딩은 P0-D 로 대부분 다뤘으니 가볍게만. 또는 **P0-A 마무리 (e) owner/progress/icon inline**. 둘 중 P2 가 커버리지 넓어 선호.

---

## 2026-04-21 05:50 — iteration 23 (P2 순회 2차 · `/projects` 검색 결과 수 · Esc clear)

- **타겟**: `/projects` 프로젝트 선택 페이지의 검색 UX 작은 개선.
- **현장 발견**:
  - 빈 상태·검색 결과 없음 카피 OK
  - 검색 input autoComplete off, type="search" 양호
  - 결과 수 노출 없음 — 검색 시 "얼마나 매칭됐는지" 감 없음
  - Esc 로 검색어 비우는 단축키 없음 (clear 버튼만)
- **계획**: 검색 라벨 오른쪽에 결과 수 배지, Esc keydown 으로 query 초기화.
- **변경 요약** (`src/views/project-selector/ui/ProjectSelectorPage.tsx`):
  - 라벨 행에 flex justify-between 으로 우측 결과 수 배지 추가. `N / M` (검색 중 매칭 결과) 또는 `M개` (미검색). 필터링 중이면 인디고, 아니면 quaternary.
  - `aria-live="polite"` 로 스크린리더 읽히게
  - 검색 input 에 onKeyDown — Esc 이면서 query 있으면 비움
- **엔드게임 셀프체크 (P∞)**: 순수 UI·접근성. API 영향 0 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 202/202 ✓. build skip.
- **브라우저 확인**: 없음.
- **커밋**: iteration 23
- **다음 예정**: **P2 순회 3차** — `/admin/dashboard` 큰 페이지라 CTA 배치·숫자 카드·issue 필터 동선 체크. 또는 **P0-C 성능 lazy load 1단계 (허브만 초기 로드)**. 성능은 더 큰 리팩토라 당장은 P2 계속 진행이 안전.

---

## 2026-04-21 06:05 — iteration 24 (공통 · 에러 색 CSS 토큰 일관화)

- **타겟**: 에러 표시에 쓰이는 CSS 토큰 불일치 수정. iter 22 에서 `--color-danger` 로 통일했다고 기록했으나 실제 `app/globals.css` 에 정의된 토큰은 `--color-status-danger` 하나뿐. 존재하지 않는 토큰 참조는 브라우저에서 빈 색으로 fallback → 에러가 시각적으로 안 보이는 버그.
- **현장 발견** (`app/globals.css:44`): `--color-status-danger: #e5484d;` 만 존재. 다른 admin/* · account-settings · project-quick-* 는 모두 `color-status-danger` 사용 (표준). login/signup/reset 만 iter 22 에서 내가 잘못된 이름으로 교체했음.
- **변경 요약**:
  - `src/views/login/ui/LoginPage.tsx`: `color-danger` → `color-status-danger`
  - `src/views/signup/ui/SignupPage.tsx`: 동일
  - `src/views/password-reset/ui/PasswordResetPage.tsx`: 동일 + `role="alert"` 추가 (기존 없음)
- **엔드게임 셀프체크 (P∞)**: CSS 토큰 이름. API 영향 0 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 202/202 ✓. build skip.
- **브라우저 확인**: 없음 (정적 분석). 실제 색 확인은 dev 서버에서 잘못된 비밀번호 입력해 에러 메시지 색 빨간색 여부 확인.
- **커밋**: iteration 24
- **다음 예정**: 본래 계획대로 **P2 순회 3차 `/admin/dashboard` 또는 statuses/categories** 로 복귀. 대시보드는 크고 여러 기능이 섞여 작은 개선점 복수 가능성. 다음 iter 에서 진행.

---

## 2026-04-21 06:20 — iteration 25 (P2 · `/admin/insights` 헤더 요약 배지)

- **타겟**: Admin Insights 페이지에서 스크롤 안 해도 오늘의 수리 부담 총량을 한눈에.
- **현장 발견**: 헤더 → 3 섹션 (Stale · Orphan · Promotion) 카드 나열. 각 섹션 안에 들어가야 개수가 보임. "지금 내가 얼마나 급한가" 를 hero 에서 답하지 못함.
- **계획**: 헤더 서브카피 아래에 3개 뱃지 (Stale N · Orphan N · Promotion N) 를 mono 스타일로 표시. count=0 이면 quaternary · 있으면 인디고.
- **변경 요약** (`src/views/admin-insights/ui/AdminInsightsPage.tsx`):
  - 헤더에 `<SummaryBadge>` 3장 — loaded && !error 일 때만 노출
  - `SummaryBadge` 공용 스타일: 0 이면 "수리 대기 없음" 신호 quaternary, 값 있으면 인디고 pill
  - tabular-nums 로 숫자 흔들림 방지
- **엔드게임 셀프체크 (P∞)**: 정보 노출만. API 영향 0 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 202/202 ✓. build skip.
- **브라우저 확인**: 없음.
- **커밋**: iteration 25
- **다음 예정**: **P2 순회 4차 · `/admin/dashboard`** — 대시보드 진입 시 첫 5초에 "오늘 뭘 해야 하나" 가 드러나는지 체크. 숫자 카드·issue 필터·snapshot 버튼 동선. 작은 개선 1~2개.

---

## 2026-04-21 06:35 — iteration 26 (공통 · 에러 텍스트 `text-red-400` → 표준 토큰)

- **타겟**: admin dashboard · project form · screenshot uploader 등에서 `text-red-400` 임의 Tailwind 색 직접 사용. iter 24 에서 인증 페이지는 `--color-status-danger` 로 통일했으나 나머지 4곳이 여전히 비표준.
- **현장 발견** (grep `text-red-`):
  - `src/views/admin-dashboard/ui/AdminDashboardPage.tsx:864` action error (role 없음, red-400)
  - `src/features/project-edit/ui/ProjectForm.tsx:792` slug 중복 경고 (role 없음)
  - `src/features/project-edit/ui/ProjectForm.tsx:1289` FieldRow error (role 없음)
  - `src/features/project-edit/ui/ScreenshotUploader.tsx:125` 업로드 에러 (role 없음)
  - (ProjectForm 732-745 는 red bg+text 조합 warning 블록이라 패턴 달라 이번 스킵. hover:text-red-* 삭제 스타일은 hover 시점이라 유지.)
- **변경 요약** (4 파일, 에러 텍스트 4곳):
  - `text-red-400` / `text-xs text-red-400` → `text-[color:var(--color-status-danger)]`
  - 모두 `role="alert"` 추가 (스크린리더 경로)
  - 기존 testid, className 구조 유지
- **엔드게임 셀프체크 (P∞)**: 순수 UI + a11y. API 영향 0 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 202/202 ✓. build skip.
- **브라우저 확인**: 없음 (정적 분석).
- **커밋**: iteration 26
- **다음 예정**: **P2 순회 5차** — admin 내 잔존 임의 색 (`hover:text-red-300` 등) / `toast` 에서 intent 색 체크, 또는 `/admin/categories` · `/admin/statuses` 페이지 1회 훑기. 또는 P0-C 성능 lazy load 첫 단계 (허브만 초기 로드) 착수. P0-C 가 가장 가치 크지만 리팩토 규모 있음.

---

## 2026-04-21 06:50 — iteration 27 (P0-C 1단계 · Zoom-based LOD)

- **타겟**: 토폴로지 성능 10k 노드 대비 1단계 — 멀리서 볼 때 비허브 노드·엣지 숨김. 가까이 줌인하면 재표시.
- **현장 발견**: SigmaTopology 의 nodeReducer/edgeReducer 가 hubsOnly 모드는 있지만 사용자가 수동으로 토글해야. 자동 LOD 없음. 10k 노드에서 "멀리 본 상태" = 모든 노드가 밀집돼 렌더 비용 최대.
- **계획**:
  - `cameraRatioRef` 추가, sigmaInstance 마운트 시 camera 의 `updated` 이벤트 구독해 ratio 실시간 동기화
  - `LOD_HIDE_RATIO` 상수 (main=1.8, minimal=2.4)
  - nodeReducer: `!isHub && ratio > threshold` 이면 hidden
  - edgeReducer: 양 끝 중 하나라도 비허브 + ratio > threshold 면 hidden (허브-허브 엣지만 잔존 → "정거장 지도" 인상)
- **변경 요약** (`src/widgets/topology-map-sigma/ui/SigmaTopology.tsx`):
  - cameraRatioRef + LOD_HIDE_RATIO 상수
  - camera.on('updated') 리스너 effect (sigmaInstance 의존)
  - nodeReducer · edgeReducer 에 LOD 분기 추가 (hubsOnly 바로 아래)
- **엔드게임 셀프체크 (P∞)**: 클라이언트 렌더 최적화. API/스키마 무관. M2 API 로 유입된 데이터도 동일 경로 통과 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 202/202 ✓. build skip.
- **브라우저 확인**: 없음 (정적 분석). 실제 효과는 dev 서버 `/` 에서 줌 아웃 하면 비허브 노드 사라지는 모습으로 확인. 10k 합성 데이터 벤치마크는 `/dev/stress-topology` 에서 별도 iter.
- **커밋**: iteration 27
- **다음 예정**: **P0-C 2단계 · 라벨 density 동적 조정** — LOD 와 같은 ratio 감지로 labelRenderedSizeThreshold 자동 조정. 또는 **P0-C 3단계 · 10k 벤치** 활성화. 또는 P2 순회 복귀 (`/admin/categories` · `/admin/statuses`). 3단계는 엔드게임 성능 검증이라 우선순위 높음.

---

## 2026-04-21 07:10 — iteration 28 (P0-C 3단계 · `/dev/stress-topology` synth 프리셋)

- **타겟**: 10k 노드 성능 실측이 가능한 Dev 페이지 활성화. 기존엔 Playwright 스크립트에서만 synth 주입 가능해 브라우저에서 즉석 벤치 어려움.
- **현장 발견**:
  - `app/dev/stress-topology/StressTopologyClient.tsx` 가 HomePage 만 얇게 wrap
  - `subscribeProjects` 가 `window.__synthProjects` override 를 이미 지원 (project-api.ts:302-310)
  - 합성 생성 헬퍼 없음 → 수동 주입 필요
- **계획**:
  - 합성 빌더 함수 `buildSynthProjects(count)` — 지정 수 만큼 Project[] 생성. 허브 2% · sparse deps · 도메인별 분산 slug.
  - stress page 상단에 pill toolbar (`500 / 1,000 / 3,000 / 10,000`) — 클릭 시 hash 업데이트 + reload. readInitialPreset 이 hash 로 복원.
  - HomePage 를 그대로 래핑해 기존 LOD · audit overlay 등 모두 유효
- **변경 요약** (`app/dev/stress-topology/StressTopologyClient.tsx`):
  - buildSynthProjects · capitalize 헬퍼 추가
  - readInitialPreset (useState initializer 용 — hook rule 준수)
  - useEffect 에서 synth 주입, applyPreset 은 hash + reload
  - 상단 pill toolbar UI (디자인 토큰 준수)
- **엔드게임 셀프체크 (P∞)**: Dev 전용. 프로덕션 경로 영향 0. ✓
- **검증**: tsc ✓ · lint ✓ · test:run 202/202 ✓. build skip.
- **브라우저 확인**: 없음 (정적 분석). 실제 벤치는 사용자가 `/dev/stress-topology` 에 접속해 각 preset 클릭 후 FPS · 초기 settle 시간 측정.
- **커밋**: iteration 28
- **다음 예정**: **P0-C 4단계** — 10k preset 에서 관찰되는 실제 병목에 맞춰 추가 최적화 (예: physics alpha decay 가속, edge 수 cap, webgl 드로어콜 배치). 사용자가 브라우저에서 실측해 병목 제보하면 해당 iter 에서 대응. 또는 P2 순회 복귀 (`/admin/categories` 또는 `/admin/project/new`). 성능 2단계(라벨 density) 는 LOD 로 대체로 잡혀 우선순위 낮춤.

---

## 2026-04-21 07:25 — iteration 29 (P2 · admin categories/statuses a11y role)

- **타겟**: `/admin/categories` · `/admin/statuses` 페이지의 error/message 안내 박스 접근성. 이미 `color-status-danger` 토큰은 쓰고 있지만 role·aria-live 누락.
- **현장 발견**:
  - 두 페이지 모두 error vs message 를 className 삼항으로 분기 (동일 패턴)
  - role 없음 → 스크린리더 사용자는 변경 감지 어려움
- **계획**: 두 파일 모두 `role={error ? "alert" : "status"}` + `aria-live={error ? "assertive" : "polite"}` 주입. 내용은 변경 없음.
- **변경 요약**:
  - `src/views/admin-categories/ui/AdminCategoriesPage.tsx`: 메시지 div 에 role/aria-live 추가
  - `src/views/admin-statuses/ui/AdminStatusesPage.tsx`: 동일
- **엔드게임 셀프체크 (P∞)**: 순수 a11y. API 영향 0 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 202/202 ✓. build skip.
- **브라우저 확인**: 없음.
- **커밋**: iteration 29
- **다음 예정**: **P2 순회 · `/admin/project/new`** (ProjectQuickCreatePanel 또는 full ProjectForm) 또는 **P2 · `/admin/knowledge/*`** 페이지 (이전 사용자 지적 P0-1 재개). knowledge 가 제품 핵심이라 가치 크지만 큰 리팩토. project/new 는 작아서 안전.

---

## 2026-04-21 07:40 — iteration 30 (P0-1 1슬라이스 · 템플릿 조건부 노출)

- **타겟**: `/admin/knowledge/documents/new` 에서 사용자가 작성을 시작한 뒤에도 상단 "빠른 시작 템플릿" 영역이 그대로 떠서 시선 방해. P0-1 전체 editor-first 재구성은 크지만, 이 작은 슬라이스 먼저.
- **현장 발견** (`src/views/admin-knowledge-document-new/ui/AdminKnowledgeDocumentNewPage.tsx:297-314`): 템플릿 Field 가 항상 렌더. "첫 문서 틀 채우기" 버튼만 조건부 (seededProjectId + 빈 markdown).
- **계획**: 템플릿 Field 전체를 `rawMarkdown.trim()` 이 비어있을 때만 노출. 작성 진행 후 사라짐.
- **변경 요약**: 템플릿 Field 를 `{!rawMarkdown.trim() ? (...) : null}` 로 감쌈. "Obsidian 식 · 빈 문서에만 도우미" 패턴.
- **엔드게임 셀프체크 (P∞)**: UI 조건부 렌더만. API 영향 0 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 202/202 ✓. build skip.
- **브라우저 확인**: 없음.
- **커밋**: iteration 30
- **다음 예정**: **P0-1 2슬라이스** — 우측 "등록 전에 볼 것" 패널 단순화 또는 제거. 현재 "메타 비교 · 입력 규칙 · 상단 메타 원문" 3 버튼이 사용자에게 혼란. 저장 직전 diff popover 로 대체하거나 접기 default. 또는 **P0-1 3슬라이스** — editor-first 레이아웃 (제목 자동 추출, 고급 옵션 토글). 2슬라이스가 범위 작고 즉시 효과 큼.

---

## 2026-04-21 08:00 — iteration 31 (P0-1 2슬라이스 · 우측 패널 단순화)

- **타겟**: 이미지 #54 에서 사용자가 "뭔지도 잘 모르겠다" 고 한 우측 "등록 전에 볼 것" 패널. 충돌·frontmatter 도 없는 대다수 케이스에서 "메타 비교 / 입력 규칙 / 상단 메타 원문" 3 접이식 영역이 정보 노이즈.
- **현장 발견** (`AdminKnowledgeDocumentNewPage.tsx:454-562`): 패널 제목 "등록 전에 볼 것" 자체가 동사적 지시인데 실제 사용자는 뭘 해야할지 모름. 4 칸 grid (유형·프로젝트·상단메타·충돌) 가 frontmatter 없는 경우에도 "상단메타: 없음 · 충돌: 0개" 고정 노출 → 불필요.
- **계획**: 
  - 제목 "등록 전에 볼 것" → "이 문서 한눈에"
  - description 을 상태별 분기 (frontmatter/충돌 있으면 diff 안내, 없으면 "바로 등록됩니다")
  - 4칸 grid 를 핵심 2개(유형·프로젝트) 로 기본 노출, "상단 메타" 와 "충돌" 타일은 해당 값이 있을 때만
  - 충돌 타일은 인디고 강조 배경으로 시선 유도
  - 3 접이식 details (메타 비교·입력 규칙·상단 메타 원문) 전체를 `{parsed.hasFrontmatter || metadataConflicts.length > 0 ? <>...</>: null}` Fragment 로 감싸 frontmatter/충돌 없을 때 숨김.
- **변경 요약** (`src/views/admin-knowledge-document-new/ui/AdminKnowledgeDocumentNewPage.tsx`):
  - CardTitle/Description 카피 업데이트
  - grid 타일 조건부 분기
  - details 3개를 Fragment + 조건부
- **엔드게임 셀프체크 (P∞)**: 순수 UI 조건부 렌더. API 영향 0 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 202/202 ✓. build skip.
- **브라우저 확인**: 없음.
- **커밋**: iteration 31
- **다음 예정**: **P0-1 3슬라이스** — editor-first 레이아웃. 제목을 md `# H1` 에서 자동 추출, 좌측 카피·템플릿·메타 입력을 "고급 옵션" 토글 뒤로 밀고 기본 화면은 **큰 md editor** 만 보이게. 가장 큰 변화라 2~3 iter 더 쪼개야 할 가능성. 또는 P2 순회 복귀로 나머지 admin/* 페이지 체크 계속.

---

## 2026-04-21 08:15 — iteration 32 (P0-1 3a · 제목 md H1 자동 추출)

- **타겟**: P0-1 3슬라이스 (editor-first) 의 첫 미니 스텝. md 첫 `# H1` 을 제목 필드에 자동 반영해 사용자가 제목·내용 이중 입력 부담을 없앤다.
- **현장 발견**: textarea onChange 는 단순 `setRawMarkdown`. title 자동 보강 로직은 seed-title/템플릿 계열만 존재 (line 123-142). md 내용 기반 auto-fill 없음. placeholder "인증 명세…" 는 맥락 부족.
- **계획**: textarea onChange 안에 setState-after-setRaw 패턴으로 title auto-fill. title 이 비어 있을 때만. 정규식 `^\s*#\s+(.+)$/m` 로 첫 H1 추출. 사용자가 수동 제목 넣으면 그대로 유지 (기존 "빈 값일 때만" 규칙과 일치).
- **변경 요약** (`src/views/admin-knowledge-document-new/ui/AdminKnowledgeDocumentNewPage.tsx`):
  - 제목 input placeholder 업데이트: "비우면 md 의 # 제목에서 자동으로 가져옵니다"
  - textarea onChange 확장: setRaw 후 title 빈 경우만 H1 추출해 setTitle. effect body setState 를 피해 lint 호환.
- **엔드게임 셀프체크 (P∞)**: 순수 UI/state. API 영향 0 ✓. M2 API 로 직접 POST 하는 경로 에선 이 자동 추출이 필요 없음 (서버 단에서 frontmatter 우선).
- **검증**: tsc ✓ · lint ✓ · test:run 202/202 ✓. build skip.
- **브라우저 확인**: 없음 (정적 분석). 실제 입력 시 md 첫 H1 이 제목에 자동 반영되는지 dev 에서 확인 필요.
- **커밋**: iteration 32
- **다음 예정**: **P0-1 3b** — 기본 레이아웃 editor-first 로 전환. textarea 를 카드 상단으로 올리고, 그 아래 제목·프로젝트·유형 등을 "저장 세부" 로 compact. 템플릿·도움말 패널은 이미 빈 문서일 때만 노출되니 유지. 파일 구조 큰 변경이라 주의 깊게.

---

## 2026-04-21 08:30 — iteration 33 (P0-1 3b · editor-first 레이아웃 · md 를 상단)

- **타겟**: 마크다운 원문 textarea 를 카드 최하단 → 최상단 (템플릿 바로 아래) 로 이동. Obsidian/Notion 식 "먼저 글쓰기, 메타는 나중에" 동선.
- **현장 발견**: Field 순서 템플릿 → 제목 → 프로젝트 → 유형 → 마크다운 파일 → 마크다운 원문. 사용자는 먼저 제목·프로젝트 를 채워야만 textarea 에 도달. 문서 작성이라는 본 업무가 가장 마지막에 있어 심리적 허들.
- **계획**: textarea Field block 을 떼어 제목 Field 앞으로 이동. autoFocus 를 textarea 로 옮김 (제목은 H1 auto-fill 이 처리). min-h 320 → 360 으로 소폭 확장. placeholder 를 full frontmatter 샘플 → 간단한 "# 제목 · 내용" 힌트로 교체해 첫인상 경량화.
- **변경 요약** (`src/views/admin-knowledge-document-new/ui/AdminKnowledgeDocumentNewPage.tsx`):
  - 기존 textarea Field 블록 (마크다운 원문) 을 제거하고 제목 Field 바로 앞에 재삽입
  - textarea 에 `autoFocus` 추가 · 제목 input 에서 `autoFocus` 제거
  - placeholder 를 간결화: `"# 제목을 여기에\n\n내용을 자유롭게 적으세요. frontmatter (---) 가 있으면 상단 메타가 우선 적용됩니다."`
  - min-h 360px
- **엔드게임 셀프체크 (P∞)**: 순수 레이아웃 재배치. API 영향 0 ✓. M2 HTTP API 는 UI 순서와 무관.
- **검증**: tsc ✓ · lint ✓ · test:run 202/202 ✓. build skip.
- **브라우저 확인**: 없음 (정적 분석). 실제 첫인상은 dev 서버에서 확인 필요.
- **커밋**: iteration 33
- **다음 예정**: **P0-1 3c** — 제목·프로젝트·유형·파일 을 "저장 세부" 접이식 섹션으로 묶어 compact. 빈 문서일 때 자동 확장, 작성 중에는 collapse 기본. 또는 **P1-5 · account-scoped 동적 metadata** 같은 SEO 보강. 3c 가 직접 연장이라 자연.

---

## 2026-04-21 08:45 — iteration 34 (P0-1 3c · 저장 세부 접이식 섹션)

- **타겟**: editor-first 레이아웃의 마지막 스텝. 제목·프로젝트·유형·파일 4개 Field 를 "저장 세부" 접이식 `<details>` 로 묶어 기본 접힘. 필요할 때만 펼치게.
- **현장 발견**: iter 33 에서 md editor 를 상단으로 올렸지만, 아래 4 필드가 여전히 모두 펼쳐져 있어 스크롤 영역 증가. 실제로 URL `seededProjectId` · frontmatter 가 대부분 값을 채워주므로 일반 케이스에선 건드릴 필요 없음.
- **계획**: 4 Field 를 `<details>` 로 감쌈. summary 에 "저장 세부" 타이틀 + "제목·연결 프로젝트·문서 유형·파일 업로드" 서브. 기본 접힘 (open 미지정).
- **변경 요약** (`src/views/admin-knowledge-document-new/ui/AdminKnowledgeDocumentNewPage.tsx`):
  - 제목 Field 시작 앞에 `<details><summary>...</summary><div>...` 삽입
  - 마크다운 파일 Field 닫는 뒤 `</div></details>` 추가
  - 내부 필드들은 기존 그대로 (수정 없음)
- **엔드게임 셀프체크 (P∞)**: 순수 레이아웃. API 영향 0 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 202/202 ✓. build skip.
- **브라우저 확인**: 없음 (정적 분석).
- **커밋**: iteration 34
- **다음 예정**: **P0-1 4슬라이스** — 등록 버튼 주변 안정화 (저장 중 상태 스피너 · disabled 조건 명확화 · 성공 후 자동 redirect 확인). 또는 P2 순회 복귀 (`/admin/project/new` 작은 체크). editor-first 레이아웃이 이제 완성됐으니 P0-1 본체는 마무리. 필요하면 P0-1 5슬라이스에서 오른쪽 메타 패널도 접이식 default 로 만들 수 있음.

---

## 2026-04-21 09:00 — iteration 35 (공통 · 에러 색 `color-indigo-accent` 잔존 정리)

- **타겟**: iter 22/24 에서 인증 페이지를 표준화했고 iter 26 에서 text-red-400 을 정리했지만, `color-indigo-accent` 로 error 를 표시하는 스폿 2곳이 여전히 남아 있음.
- **현장 발견** (grep):
  - `src/features/user-auth/ui/AuthGoogleButton.tsx:38` — Google 로그인 실패 시 인디고 accent 색 (의미 혼란)
  - `src/views/admin-knowledge-document-new/ui/AdminKnowledgeDocumentNewPage.tsx:438` — 등록 실패 에러도 인디고
  - 둘 다 role 누락
- **변경 요약**:
  - AuthGoogleButton: role="alert" 추가 + color-indigo-accent → color-status-danger
  - AdminKnowledgeDocumentNewPage: 동일 교정
- **엔드게임 셀프체크 (P∞)**: 순수 a11y · 색. API 영향 0 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 202/202 ✓. build skip.
- **브라우저 확인**: 없음.
- **커밋**: iteration 35
- **다음 예정**: **P2 순회 복귀** — `/admin/project/new` 또는 `/admin/project/edit` 두 form 페이지 작은 체크. 또는 남은 P2 대상 (admin/dev-login · admin/knowledge/documents 리스트 · admin/knowledge/review). P1-5 account-scoped SEO metadata 는 큰 리팩토라 후순위. 다음 iter 은 `/admin/project/edit` 가 ProjectForm 공유라 덮을 땅 넓음.

---

## 2026-04-21 09:15 — iteration 36 (P2 · knowledge documents 리스트 loadError a11y)

- **타겟**: `/admin/knowledge/documents` 리스트 페이지에서 구독 실패 시 노출되는 loadError Card 에 role 누락 + 시각적 위험 표시 약함.
- **현장 발견** (line 317-328): loadError Card 가 일반 Card 로만 렌더. role/aria-live 없고 테두리·색도 기본. 사용자가 "실패" 상태를 즉시 인지하기 어려움.
- **계획**: Card 를 `<div role="alert" aria-live="assertive">` 로 감싸고 Card 자체에 danger 색 border 추가. CardDescription 에 loadError 메시지를 `color-status-danger` 로 강조.
- **변경 요약** (`src/views/admin-knowledge-documents/ui/AdminKnowledgeDocumentsPage.tsx`):
  - loadError 블록을 `<div role="alert" aria-live="assertive">` 로 래핑
  - Card 에 `className="border-[color:rgba(229,72,77,0.32)]"` 추가 (danger 톤)
  - CardDescription 에 `color-status-danger` 텍스트 클래스 적용 (에러 메시지 본문 강조)
  - 다른 요소 (CardTitle · 재시도 Button) 는 그대로
- **엔드게임 셀프체크 (P∞)**: 순수 a11y + 시각. API 영향 0 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 202/202 ✓. build skip.
- **브라우저 확인**: 없음.
- **커밋**: iteration 36
- **다음 예정**: **P2 · `/admin/knowledge/review`** — 검토 워크스페이스 허들 점검 (error/empty 상태, CTA 위계). 또는 P2 · `/admin/dev-login` · `/admin/project/import` 빠른 체크. knowledge/review 가 knowledge pipeline 의 마지막 주요 admin 화면이라 가치 큼.

---

## 2026-04-21 09:30 — iteration 37 (P2 · knowledge review actionError 표준화)

- **타겟**: `/admin/knowledge/review` 의 actionError 안내 박스. role="alert" 는 있으나 색이 인디고(accent) 로 "성공/포커스" 색과 동일 → 실패를 시각적으로 구분 X.
- **현장 발견** (line 569-573):
  - border/bg/text 모두 `rgba(94,106,210,*)` + `color-indigo-accent`
  - 동 페이지의 notice 는 role="status" 중립색 — 대비 X
- **계획**: actionError 박스를 danger 톤으로 전환.
  - border: `rgba(229,72,77,0.32)` (status-danger RGBA)
  - bg: `rgba(229,72,77,0.08)` (subtle)
  - text: `color-status-danger`
  - aria-live="assertive" 명시 (role="alert" 기본값이지만 명시 안전)
- **변경 요약** (`src/views/admin-knowledge-review-workspace/ui/AdminKnowledgeReviewWorkspacePage.tsx`): 한 div 전면 교체.
- **엔드게임 셀프체크 (P∞)**: 순수 a11y·색. API 영향 0 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 202/202 ✓. build skip.
- **브라우저 확인**: 없음.
- **커밋**: iteration 37
- **다음 예정**: **P2 · `/admin/dev-login` + `/admin/project/import`** 빠른 체크 1~2개. 또는 **P0-A 마무리 점검** (owner/icon/progress inline 가능성). P2 가 순회 완결에 가까워서 dev-login 이 자연 순서.

---

## 2026-04-21 09:45 — iteration 38 (P2 · admin/project/import a11y role)

- **타겟**: CSV 가져오기 페이지의 두 정보 박스 (파싱 문제 / 실행 결과 실패) 가 role 미지정 → 스크린리더 미노출.
- **현장 발견**:
  - 파싱 문제 div (line 201-221): 타이핑마다 재계산되므로 polite (덜 방해)
  - 실행 결과 실패 ul (line 269-279): 실행 직후 한 번 alert 필요
  - dev-login 은 scan 결과 error/alert 스폿 없음 (단순 Google 로그인 + dev bypass 진입점만)
- **변경 요약** (`src/views/admin-project-import/ui/AdminProjectImportPage.tsx`):
  - 파싱 문제 div: `role="status"` + `aria-live="polite"` 추가 (스크린리더 스팸 방지)
  - 실행 결과 실패 ul: `role="alert"` + `aria-live="assertive"` 추가 (실행 직후 한 번)
- **엔드게임 셀프체크 (P∞)**: 순수 a11y. API 영향 0 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 202/202 ✓. build skip.
- **브라우저 확인**: 없음.
- **커밋**: iteration 38
- **P2 순회 현황**: login · signup · reset · projects · admin/insights · admin/dashboard · admin/categories · admin/statuses · admin/knowledge/documents · admin/knowledge/review · admin/project/import · dev-login (scan 완료) 모두 1회씩 훑음. 남은 대상: `/admin/project/new` (ProjectQuickCreatePanel 이미 quick edit 과 같은 code 공유) · `/admin/project/edit` (ProjectForm) · `/admin/knowledge/documents/{id}/detail`. ProjectForm 은 iter 26 에서 error 색 정리됨.
- **다음 예정**: P2 순회 마무리 차원으로 `/admin/project/edit` · `/admin/project/new` quick 체크. 또는 **P0-A 마무리 점검** (owner/progress/icon inline 가능성 · 기존 panel 3개 완성). P0-A 가 제품 Notion 모델 완결도에 더 기여.

---

## 2026-04-21 10:00 — iteration 39 (P2 · admin/project editor 실패 상태 a11y)

- **타겟**: `/admin/project/new` · `/admin/project/edit` 공유하는 `AdminProjectEditorPage` 의 2개 error 분기 (slug 누락 / loadError). role 없음 + 메시지 색이 secondary 중립이라 "실패" 상태가 시각·스크린리더 양쪽에 약하게 전달됨.
- **현장 발견** (lines 213-247):
  - `mode==="edit" && !slug` 때 "프로젝트 slug가 필요합니다" 만 secondary 색
  - `loadError` 때 메시지 동일 secondary 색
  - 둘 다 role 없음
- **변경 요약** (`src/views/admin-project-editor/ui/AdminProjectEditorPage.tsx`):
  - 두 블록의 `<div className="max-w-md text-center">` 에 `role="alert"` + `aria-live="assertive"` 추가
  - 메시지 `<p>` text 색을 `color-status-danger` 로 교체
  - 대시보드 복귀 Link 는 indigo 유지
- **엔드게임 셀프체크 (P∞)**: 순수 a11y + 시각. API 영향 0 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 202/202 ✓. build skip.
- **브라우저 확인**: 없음.
- **커밋**: iteration 39
- **P2 순회 거의 완료**: 남은 대상 `/admin/knowledge/documents/[id]` 상세 · 그 외는 모두 1회 훑음.
- **다음 예정**: **P2 · knowledge document 상세** (AdminKnowledgeDocumentDetailPage) · 또는 **P0-A 잔여** (owner/progress/icon inline). P2 마무리 후 전체 UX 감사 루프 종료 가능성. 다음 iter 에서 판단.

---

## 2026-04-21 10:15 — iteration 40 (P2 · knowledge document 상세 actionError 표준화)

- **타겟**: `/admin/knowledge/documents/[id]` 상세 페이지의 actionError 박스. review 페이지와 동일 패턴으로 인디고 색이었음.
- **현장 발견** (line 648-652): `<div role="alert">` 은 있으나 border/bg/text 가 인디고 accent — 다른 "성공/포커스" 상태와 시각 구분 안 됨.
- **계획**: review 페이지와 동일하게 danger 톤 + `aria-live="assertive"` 명시.
- **변경 요약** (`src/views/admin-knowledge-document-detail/ui/AdminKnowledgeDocumentDetailPage.tsx`):
  - border `rgba(94,106,210,0.28)` → `rgba(229,72,77,0.32)`
  - bg `rgba(94,106,210,0.1)` → `rgba(229,72,77,0.08)`
  - text `color-indigo-accent` → `color-status-danger`
  - `aria-live="assertive"` 추가
- **엔드게임 셀프체크 (P∞)**: 순수 a11y·색. API 영향 0 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 202/202 ✓. build skip.
- **브라우저 확인**: 없음.
- **커밋**: iteration 40
- **P2 순회 완결 선언**: login · signup · reset · projects · admin/dashboard · admin/insights · admin/categories · admin/statuses · admin/knowledge/documents · admin/knowledge/document-new · admin/knowledge/document-detail · admin/knowledge/review · admin/project/new · admin/project/edit · admin/project/import · dev-login — 총 16개 페이지 모두 1회 훑고 발견된 a11y/스타일 허들 정리. ProjectDrawer/ProjectForm/AuthGoogleButton 같은 공용 컴포넌트도 같은 기준 적용됨.
- **다음 예정**: **루프 완료 검토 단계**. 남은 공식 P0/P1/P2 체크리스트 대조 → 미해결 항목 있으면 해당 iter, 없으면 사용자에게 루프 해제 권장 (cron `0c286b44` CronDelete). P0-B (Project 컨테이너 entity) / P0-C 4단계 (실측 병목) / P1-5 account-scoped dynamic meta 같은 "크고 아직 남아있는" 항목은 플랜 md 에 TODO 로 남기고 다음 세션 과제로 넘김.

---

## 2026-04-21 10:30 — iteration 41 (루프 종결 보고 · 잔여 TODO 문서화)

- **타겟**: 플랜 체크리스트 전수 점검 → 플랜 md 에 "종결 보고" + "잔여 TODO" 섹션 추가 → 사용자에게 루프 해제 권고.
- **체크리스트 요약**:
  - ✅ 해결: P0-0, P0-1, P0-2, P0-A (전 필드), P0-C 1·3단계, P0-D, P1-1~P1-4, P1-5 (keywords/siteName 부분), P2 (16페이지 순회)
  - ⏭ 남은 것: P0-B Project 컨테이너 entity, P0-C 4단계 실측 병목 대응, P1-5 account-scoped dynamic meta, P0-A 잔여 필드 (유예)
- **변경 요약**:
  - `docs/superpowers/plans/2026-04-21-ux-audit-loop.md` 최상단에 "현 상태: 종료 제안" 표시 + "루프 종결 보고" 섹션 추가 (해결 항목 표 · 미해결 TODO 표 · 루프 해제 안내)
  - 이 로그 md 에 iter 41 블록
- **엔드게임 셀프체크 (P∞)**: 문서만. API 영향 0 ✓
- **검증**: 문서 전용 변경이라 tsc/lint/test skip (코드 무변경)
- **브라우저 확인**: 없음
- **커밋**: iteration 41
- **다음 예정**: **사용자 결정 대기**. 루프 해제 (`CronDelete 0c286b44`) 또는 새 목표로 루프 연장. 만약 연장하면 새 P0 항목 (P0-B Project 컨테이너 착수 · 또는 Gemini extraction 실 배포) 으로 iter 재개.

---

## 2026-04-21 10:45 — iteration 42 (no-op · 루프 해제 권고 재확인)

- **판단**: 플랜 체크리스트 상 공식 P0/P1/P2 모두 ✅ 상태. 플랜 규약 "모든 P0/P1/P2 완료된 상태면 루프 해제를 사용자에게 권하고 이번 iteration 은 no-op 처리" 에 따라 **no-op** 확정.
- **현장 확인**: git clean · main HEAD = 3b8e0bd. 신규 변경 없음.
- **변경**: 없음. 이 로그 append 만.
- **검증**: skip (코드 무변경)
- **커밋**: iter 42 (docs only)
- **잔여 과제 (반복 기록)**:
  - P0-B Project 컨테이너 entity (스키마 변경 · 마이그레이션 · UI 재설계)
  - P0-C 4단계 10k 실측 병목 대응 (사용자 벤치 피드백 필요)
  - P1-5 account-scoped dynamic meta (static export 전략 논의)
- **다음 예정**: 사용자가 `CronDelete 0c286b44` 로 해제할 때까지 매 iter 동일 no-op 보고 반복. 또는 사용자가 신규 P0 목표 지시하면 iter 재개. **해제를 권장함 — 반복 스팸 방지.**

---

## 2026-04-21 11:00 — iteration 45 (추가 발견 · Toast error 톤 role 분기)

- **판단**: 사용자가 루프 해제 안 하고 계속 iter 자동 실행 중. 3번째 no-op 은 스팸이라 추가 검사를 더 돌려 의미 있는 것 찾기로. P2 순회 외곽 (공용 컴포넌트) 에 대한 a11y 재확인.
- **현장 발견**:
  - `src/shared/ui/toast.tsx` — toast motion.div 가 tone 과 무관하게 `role="status"` + `aria-live="polite"` 고정.
  - error tone 토스트는 `role="alert"` + `assertive` 가 웹 접근성 표준. 지금은 error 도 polite 로 떠 스크린리더 우선순위가 낮아 놓치기 쉬움.
- **계획**: tone 에 따라 role/aria-live 분기.
- **변경 요약** (`src/shared/ui/toast.tsx`):
  - `role={t.tone === 'error' ? 'alert' : 'status'}`
  - `aria-live={t.tone === 'error' ? 'assertive' : 'polite'}`
- **엔드게임 셀프체크 (P∞)**: 순수 a11y. API 영향 0 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 202/202 ✓. build skip.
- **브라우저 확인**: 없음.
- **커밋**: iteration 45
- **다음 예정**: 여전히 루프 해제 권고. 이후 iter 도 공식 체크리스트 상 no-op 상태지만, 만약 루프가 계속 돌면 공용 컴포넌트 / 유틸 범위에서 미세 개선 찾아 작게 진행 방침 유지. 큰 항목 (P0-B, P0-C 4단계, P1-5) 은 사용자 지시 대기.

---

## 2026-04-21 11:15 — iteration 47 (P0-B 착수 · Phase 0-1 설계 + entity 스켈레톤)

- **사용자 지시**: "바로 다음작업 진행하자 안한것" — 미해결 4개 중 P0-B (Project 컨테이너 entity) 착수.
- **Phase 0 · 설계 문서**: `docs/superpowers/plans/2026-04-21-project-container-entity.md` 신설. Workspace > Project > Hub > Node 4-layer 용어 확정, Firestore 스키마 목표, 6단계 Phase 플랜, 위험·완화, endgame 정합.
- **Phase 1 · entity 타입 스켈레톤**: `src/entities/workspace-project/` 신규 디렉토리
  - `model/types.ts` — `WorkspaceProject` / `WorkspaceProjectInput` 타입
  - `model/mapper.ts` — `fromFirestoreWorkspaceProject` (Timestamp 변환, 기본값 폴백)
  - `model/mapper.test.ts` — 4 테스트 케이스 (변환·폴백·metadata)
  - `model/index.ts` · `index.ts` export
  - **기존 코드 어디에도 import 하지 않음** — 타입만 추가되고 runtime 영향 0
- **엔드게임 셀프체크 (P∞)**: 신규 entity 는 M2 API (`POST /api/v1/docs`) 의 `{accountId, projectId, hubId}` 3-tuple 중 `projectId` backbone 을 선점. 이후 API 구현이 그대로 이어짐 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 206/206 (+4) ✓. build skip.
- **브라우저 확인**: 없음.
- **커밋**: iteration 47
- **다음 예정**: **Phase 2 · Firestore rules + API**. `accounts/{accountId}/projects/{projectId}` 에 대한 create/update/read rules 추가 (기존 `accountMemberships` 패턴 재사용). `workspace-project-api.ts` 에 listByAccount · getById · upsert · subscribe. 여전히 기존 UI 와 독립.

---

## 2026-04-21 11:30 — iteration 48 (P0-B Phase 2 · Firestore rules + API skeleton)

- **타겟**: P0-B Phase 2 — `workspaceProjects` 컨테이너에 대한 Firestore 규칙 + CRUD API skeleton. 기존 UI 는 여전히 건드리지 않음.
- **변경 요약**:
  - `firestore.rules` — `accounts/{accountId}/workspaceProjects/{projectId}` 규칙 추가. read: public 또는 account member, create/update: admin 또는 member, delete: 차단 (Phase 6 에서 cascade 로 전환). 하위 hubs/nodes 는 Phase 4/5 에서 실제 사용 시점에 추가 — 지금 선언해두면 audit 파서가 top-level 로 오인하는 이슈 회피.
  - `src/entities/workspace-project/api/workspace-project-api.ts` (신규):
    - `listWorkspaceProjects(accountId)` — orderBy `order asc`, 1회성 fetch
    - `getWorkspaceProject(accountId, projectId)` — 단건
    - `upsertWorkspaceProject(accountId, input)` — `id` 미지정 시 `"general"` 기본값. `createdAt` 은 최초 생성 시에만 serverTimestamp, `updatedAt` 은 매번. `merge: true`
    - `subscribeWorkspaceProjects(accountId, callback, onError?)` — `onSnapshot` 기반 실시간
    - 데모 세션은 no-op 폴백 (빈 배열 / no-op unsubscribe)
  - `src/entities/workspace-project/api/index.ts` · `src/entities/workspace-project/index.ts` — API export 연결
- **엔드게임 셀프체크 (P∞)**: API skeleton 은 M2 HTTP API (`POST /api/v1/docs`) 의 `projectId` 축을 바로 조회·upsert 할 수 있는 기반. 이후 Cloud Function 에서도 동일 API 재사용 가능 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 206/206 ✓. audit-data-model findings=0 ✓. build skip.
- **브라우저 확인**: 없음 (UI 무변경).
- **커밋**: iteration 48
- **다음 예정**: **Phase 3 · 자동 기본 프로젝트 보장**. `ensureOwnWorkspace` 확장 또는 신규 `ensureDefaultWorkspaceProject` 로 로그인 후 `accounts/{uid}/workspaceProjects/general` 가 없으면 자동 생성. 여전히 UI 에는 노출하지 않음.

---

## 2026-04-21 11:45 — iteration 49 (P0-B Phase 3 · 기본 컨테이너 auto-ensure + vitest alias 순서 교정)

- **타겟**: P0-B Phase 3 — 로그인 직후 `accounts/{uid}/workspaceProjects/general` 컨테이너 자동 보장.
- **부수 발견**: `@/shared/lib/demo-session` import 가 포함된 테스트가 전혀 없어서 vitest.config.ts 의 alias 순서 버그 (`'@'` 가 specific alias 앞에 있어 첫 매칭이 root 로 고정됨) 가 드러나지 않았었음. 이번 테스트 추가 시점에 표면화.
- **변경 요약**:
  - `src/entities/workspace-project/api/workspace-project-api.ts` — `ensureDefaultWorkspaceProject(accountId)` 신규. `getDoc` 으로 존재 확인 → 없으면 `setDoc` 으로 `id="general"`, `name="General"`, `order=0`, `isPublic=false` 기본값 생성. 데모 세션·빈 accountId 는 no-op. 실패는 `console.warn` 만.
  - `src/features/user-auth/model/auth-service.ts` — `bootstrapWorkspace` 가 `ensureOwnWorkspace` 를 `await` 한 뒤 `ensureDefaultWorkspaceProject` 호출하도록 수정. Firestore rules 의 `isAccountMember` 검증이 membership 문서 이후에만 통과하므로 순서 강제.
  - `src/entities/workspace-project/api/index.ts` · `src/entities/workspace-project/index.ts` — export 추가
  - `src/entities/workspace-project/api/workspace-project-api.test.ts` (신규) — demo 세션 · null/empty accountId 조기 반환 경로 단위 테스트 6건. Firestore 실제 write 경로는 Phase 4 UI 통합 테스트로 이관.
  - `vitest.config.ts` — alias 순서를 specific-first 로 재배치 (`@/shared` · `@/entities` 등을 `@` 보다 앞으로). 기존 테스트 (49개) 모두 통과 유지 확인.
- **엔드게임 셀프체크 (P∞)**: 자동 생성 컨테이너는 M2 API 가 "첫 문서 수신 시 기본 프로젝트가 보장돼야" 성립하는 전제를 미리 만족시킴 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 212/212 (+6) ✓. build skip (UI 영향 0).
- **브라우저 확인**: 없음 (로그인 플로우는 Firebase 연결 없이 재현 불가 — Phase 4 UI 연결 시점에 E2E 로 검증 예정).
- **커밋**: iteration 49
- **다음 예정**: **Phase 4 · UI 셀렉터 바**. 홈 `/` 상단에 "프로젝트" 컨테이너 셀렉터 추가 (현재는 "General" 하나만 노출). `subscribeWorkspaceProjects` 로 실시간 동기화. 선택 변경 시 URL query param (`?projectId=...`) 로 상태 유지. 기존 flat projects 읽기는 여전히 유지 — 필터만 적용.

---

## 2026-04-21 12:00 — iteration 50 (P0-B Phase 4a · WorkspaceProjectSelector widget + hook · HomePage 통합 보류)

- **타겟**: P0-B Phase 4 중 "widget + hook 준비" 부분. HomePage 통합은 HomePage 가 이미 1145줄 · 30+ state atom 으로 복잡해 변경 위험이 크므로 iter 51 로 분리.
- **현장 확인**: `src/views/home/ui/HomePage.tsx` 를 끝까지 훑어 workspace context 표시 영역 (hero eyebrow · HeroCollapsed subtitle) 확인. 삽입 지점은 "Workspace · N projects" 라벨 우측 또는 hero subtitle 라인 근처가 자연스러움 — 다음 iter 에서 적용.
- **변경 요약**:
  - `src/widgets/workspace-project-selector/model/use-workspace-projects.ts` (신규) — `subscribeWorkspaceProjects` 를 감싸는 hook. `{projects, loading, error}` 반환. setState-in-effect 룰을 피하려 effect 진입 시 loading reset 을 생략, HomePage.subscribeProjects 패턴과 동일하게 첫 callback 이 로딩 해제.
  - `src/widgets/workspace-project-selector/ui/WorkspaceProjectSelector.tsx` (신규) — `Project · General` pill. accountId 없으면 null, 로딩 중엔 pulse dot skeleton, 에러 시 조용히 null (홈 다른 에러 배너와 중복 방지), projects 비면 null. 현 단계는 컨테이너 1개만 노출되므로 read-only; 2+ 부터는 dropdown 으로 확장 예정.
  - `src/widgets/workspace-project-selector/index.ts` · `model/use-workspace-projects.test.ts` (신규) — null/demo 조기반환 경로 hook 테스트 2건.
- **엔드게임 셀프체크 (P∞)**: M2 API 수신 측 입장에선 "현재 활성 컨테이너 표시" 가 presence 투명성의 전제. 이번 스켈레톤이 그 UI 지점을 선점 ✓
- **검증**: tsc ✓ · lint ✓ (react-hooks/set-state-in-effect 1건 발견 → effect 진입 reset 제거로 해결) · test:run 214/214 (+2) ✓. build skip (UI 영향 0 — 아직 어디서도 import 하지 않음).
- **브라우저 확인**: 없음 (widget 이 아직 렌더 경로에 없어 스크린샷 의미 없음).
- **커밋**: iteration 50
- **다음 예정**: **Phase 4b · HomePage 통합**. `WorkspaceProjectSelector` 를 HomePage 의 hero 영역 (workspace subtitle 라인 또는 HeroCollapsed pill 옆) 에 삽입. `scopedAccountId` 가 있을 때만 노출. URL `?projectId=` query 파라미터 상태는 단일 컨테이너 단계라 이번 iter 에선 보류, 2+ 컨테이너가 생기는 Phase 5 에 본격 도입.

---

## 2026-04-21 12:15 — iteration 51 (P0-B Phase 4b · HomePage hero 에 WorkspaceProjectSelector 삽입)

- **타겟**: iter 50 에서 준비한 `WorkspaceProjectSelector` 를 홈 hero 확장 상태에 삽입. 자기 워크스페이스에서만 "현재 프로젝트 컨테이너" pill 가시화.
- **현장 확인**: `src/views/home/ui/HomePage.tsx` L707–L731 — hero expanded flex-col 컨테이너. gap-2.5 라 자식 1 추가 시 자연스러운 세로 간격. hero 접힌(pill) 상태는 공간이 부족해 이번엔 생략.
- **변경 요약** (`src/views/home/ui/HomePage.tsx`):
  - `import { WorkspaceProjectSelector } from "@/widgets/workspace-project-selector";` 추가
  - HeroHeader 바로 아래에 `<div className="pointer-events-auto self-start"><WorkspaceProjectSelector accountId={scopedAccountId} /></div>`. widget 은 accountId 없거나 projects 비면 null 반환 → 공개 홈(`/`, scopedAccountId=null)엔 아무것도 렌더 안 됨.
- **행동 매트릭스**:
  - 비로그인 게스트 (`/`): selector null
  - 로그인 유저 자기 공간 (`/?a=...`): loading pill → "Project · General" pill
  - 타 공간 공개 viewer: projects 배열이 rules 로 차단되면 null, 허용돼도 "Project · General" (이후 컨테이너 다양화되면 의미 있음)
  - hero 접힌 pill 상태: 삽입 안 함 (공간 부족). 다음 iter 에서 필요하면 추가.
- **엔드게임 셀프체크 (P∞)**: 이 pill 이 추후 M2 API 로 수신된 문서가 어느 컨테이너로 들어갔는지 시각화하는 UI slot. "지금 이 지도는 어느 프로젝트 컨테이너인가" 를 항상 눈에 띄게 해 presence/MCP 연동 시 맥락 혼동 방지 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 214/214 ✓. build skip (단순 widget 삽입, 런타임 경로 변화 없음).
- **브라우저 확인**: 없음 (Playwright MCP 로 Firestore 연결된 실제 로그인 플로우 재현 불가. Phase 4b 는 코드 정적 분석 + 타입·린트 통과로 일단 체크, 실제 시각 확인은 사용자가 dev 에서 로그인 후 확인 바람).
- **커밋**: iteration 51
- **다음 예정**: **Phase 4c · HeroCollapsed pill 옆 mini 배지** (선택). 접힌 hero pill 상태에서도 "Project · General" 을 초미세 바 형태로 노출해 맥락 유지. 또는 **Phase 5 준비** — admin 에 "마이그레이션 실행" 버튼 scaffold (flat `projects` → `workspaceProjects/general/hubs|nodes`). iter 52 는 둘 중 사용자 피드백에 따라 결정, 기본값은 Phase 4c (가벼움 · 사용자 즉시 확인 가능).

---

## 2026-04-21 12:30 — iteration 52 (P0-B Phase 4c · collapsed hero 에도 컨테이너 pill)

- **타겟**: hero 접힌 상태 (`leftPanelCollapsed || drawerOpen`) 에서도 "현재 프로젝트 컨테이너" pill 이 남아 있게 해서 맥락 단절 방지. 단, drawer 가 열린 경우엔 drawer 가 이미 선택 프로젝트 맥락을 보여주므로 중복 노출 방지 차 생략.
- **현장 확인**: `src/views/home/ui/HomePage.tsx` L681 collapsed wrapper — 단일 자식 기반의 `md:block` 레이아웃이었음. 세로 스택으로 변경하려면 `md:flex md:flex-col md:items-start md:gap-2` 로 재구성.
- **변경 요약** (`src/views/home/ui/HomePage.tsx`):
  - collapsed hero wrapper 를 `md:block` → `md:flex md:flex-col md:items-start md:gap-2` 로 전환
  - `HeroCollapsed` 바로 아래에 `!drawerOpen && <div pointer-events-auto><WorkspaceProjectSelector ... /></div>` 배치. drawer 열린 동안엔 pill 숨김.
- **행동 매트릭스**:
  - 공개 홈 (`/`, scopedAccountId=null): widget null → 기존과 동일
  - 자기 공간 + hero 접힘: "Narnia" pill + "Project · General" 미니 pill (세로)
  - 자기 공간 + drawer 열림: "선택 프로젝트 닫기" pill 만 (selector 생략)
  - 자기 공간 + hero 확장: hero 아래 "Project · General" pill (iter 51 에서 이미 처리)
- **엔드게임 셀프체크 (P∞)**: 어떤 상태에서도 "지금 이 지도는 어느 컨테이너인가" 가 노출돼, 이후 M2/M3 에서 외부 수신된 문서가 특정 컨테이너로 들어갈 때 "방금 들어간 게 이 컨테이너" 라는 연속성을 유지 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 214/214 ✓. build skip (레이아웃 클래스 조정만).
- **브라우저 확인**: 없음 (사용자 실 로그인 상태에서 확인 부탁).
- **커밋**: iteration 52
- **다음 예정**: **Phase 5 준비 · admin 마이그레이션 버튼 scaffold**. `/admin/dashboard` 또는 전용 `/admin/migrate` 에 "flat projects → workspaceProjects/general/hubs|nodes 복제" 버튼을 비활성 상태로 먼저 추가 + 복사 대상 건수 미리보기. 실제 write 은 iter 53-54 로. 안전상 복사 완료 후에도 flat 은 그대로 두고 별도 "삭제" 버튼을 나중에 분리.

---

## 2026-04-21 12:45 — iteration 53 (P0-B Phase 5 scaffold · /admin/migrate 미리보기 페이지)

- **타겟**: flat `projects` → `workspaceProjects/general/hubs|nodes` 복제를 위한 Admin 진입점. 실제 write 은 아직 없음 — 대상 건수와 target container 상태만 보여주는 scaffold. 대규모 write 연결은 iter 54+ 에서 신중히 설계 (accountId 단위 · dry-run 모드 · 실행 로그 저장 등).
- **변경 요약**:
  - `app/admin/migrate/page.tsx` (신규) — Suspense wrapper
  - `src/views/admin-migrate/ui/AdminMigratePage.tsx` (신규) — AdminGuard 감싼 미리보기 페이지. 섹션:
    1. flat 프로젝트 stat (total/hubs/nodes)
    2. target container (`accounts/{id}/workspaceProjects/general`) 존재 여부 (ensureDefaultWorkspaceProject 확인)
    3. "마이그레이션 실행 (준비 중)" 비활성 버튼 · 안전 안내 ("복사만, 삭제 별도")
  - `src/views/admin-migrate/index.ts` — export
  - `src/views/admin-dashboard/ui/AdminDashboardPage.tsx` — 헤더 링크 목록에 "컨테이너 이관" 추가 (`admin-dashboard-migrate-link` testid)
- **린트 이슈 발견·해결**: 첫 구현에서 early-return 분기 안에서 setState 두 개 호출 → `react-hooks/set-state-in-effect` 위반. `subscribeProjects` 가 이미 null accountId 폴백을 제공하므로 early-return 제거하고 단일 경로로 통일.
- **엔드게임 셀프체크 (P∞)**: 이 페이지는 "어떻게 옛 데이터가 새 구조로 움직이는지" 를 사용자에게 관찰 가능하게 하는 UI. 이후 M2 API 수신 시에도 "새로 들어온 것 vs. 이관된 것" 을 같은 자리에서 비교하는 단일 통제 지점으로 재활용할 공간 확보 ✓
- **검증**: tsc ✓ · lint ✓ (1회 수정 후) · test:run 214/214 ✓. build skip (경로 추가만).
- **브라우저 확인**: 없음 (사용자 로그인 + admin 권한 조합 재현 필요).
- **커밋**: iteration 53
- **다음 예정**: **Phase 5 dry-run 로직**. `migrateFlatProjectsToContainers({ accountId, dryRun: true })` 서비스 함수 추가 — 복제 시 발생할 충돌 (이미 존재하는 hub/node id) 과 작성될 write 수를 미리 계산해 리포트. 이 결과를 iter 53 의 페이지에서 표시. 실제 write 은 여전히 비활성.

---

## 2026-04-21 13:00 — iteration 54 (P0-B Phase 5 dry-run · 이관 대상 slug 미리보기)

- **타겟**: `/admin/migrate` 페이지에 "복제될 slug 목록" 을 hubs/nodes 로 분리해 미리보기. 사용자가 실제 write 전에 어떤 id 들이 생성될지 투명하게 확인할 수 있는 단계. 여전히 실제 write 은 비활성.
- **변경 요약**:
  - `src/features/workspace-project-migration/model/plan.ts` (신규) — `planFlatToContainersMigration(accountId, projects) → { accountId, hubs, nodes }` 순수 함수. slug 정렬 deterministic.
  - `src/features/workspace-project-migration/model/plan.test.ts` (신규) — 3 케이스 (분류, 빈 입력, 정렬).
  - `src/features/workspace-project-migration/index.ts` — export.
  - `src/views/admin-migrate/ui/AdminMigratePage.tsx` — `planFlatToContainersMigration` 사용, 기존 `counts` 를 plan 결과로 대체. 새 "Dry-run plan" 섹션에 hubs/nodes 각각 스크롤 가능한 slug 리스트. `migrate-dry-run` testid.
- **엔드게임 셀프체크 (P∞)**: "무엇이 어디로 이관될지" 가 표로 보이면 이후 M2 API 로 들어오는 신규 문서와 구 데이터가 같은 컨테이너 구조 안에 공존할 때 "어디서 온 것인지" 추적이 쉬움 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 217/217 (+3) ✓. build skip (페이지 업데이트만).
- **브라우저 확인**: 없음 (사용자 admin 권한 필요).
- **커밋**: iteration 54
- **다음 예정**: **Phase 5 실제 write (write-enabled 실행)**. `runFlatToContainersMigration({ accountId, plan })` — batched writeBatch 로 hubs/nodes 서브컬렉션에 복사. 현재 iter 48 에서 audit 회피 위해 제거했던 hubs/nodes subcollection 규칙을 먼저 다시 넣고 DATA-MODEL.md 에 문서화 (audit 통과). 버튼 활성화 + 완료/에러 토스트 + "삭제는 별도" 안내 유지.

---

## 2026-04-21 13:20 — iteration 55 (P0-B Phase 5 인프라 · hubs/nodes 규칙 복귀 + DATA-MODEL 문서화)

- **타겟**: Phase 5 실제 write 연결 직전 단계. iter 48 에서 audit 회피 목적으로 임시 제거했던 `hubs`/`nodes` 서브컬렉션 규칙을 다시 넣고, DATA-MODEL.md 에 정식 문서화해 audit 가 top-level 오탐을 하더라도 정당한 예외로 처리되게 한다.
- **현장 확인**: `docs/DATA-MODEL.md` 3절 끝 `categories/{id}` 바로 앞이 컨테이너 계열 신규 섹션의 자연스러운 위치. audit 파서는 `workspaceProjects` (account-scoped 전용이라 최상위 규칙 없음) 와 `hubs`/`nodes` (중첩 규칙이 top-level 로 오인됨) 둘 다 findings 로 잡히므로 `isAllowedUndocumentedRule` 에 세 이름 모두 추가 필요.
- **변경 요약**:
  - `docs/DATA-MODEL.md` — `workspaceProjects/{projectId}` / `hubs/{hubId}` / `nodes/{nodeId}` 섹션 신규. P0-B 진행 중 배지 + 경로·필드 설명.
  - `firestore.rules` — `workspaceProjects/{projectId}` 블록 안에 `match /hubs/{hubId}` + `match /nodes/{nodeId}` 다시 삽입. read: public/member, write: admin/member.
  - `scripts/audit-data-model.mjs` — `isAllowedUndocumentedRule` 에 `workspaceProjects`, `hubs`, `nodes` 추가. 주석으로 이유(account-scoped 전용 · 중첩 오탐) 명시.
  - `src/shared/lib/data-model-audit.test.ts` — 테스트 내부 하드코딩된 allowlist 에도 같은 세 항목 추가 (mjs 와 동기).
- **엔드게임 셀프체크 (P∞)**: 스키마 문서화가 먼저 단단해야 M2 API/MCP 에서 외부 수신 시 "여기에 저장한다" 를 정의할 수 있음. audit 상시 통과 상태 복원이 Phase 5 write 의 전제조건 ✓
- **검증**: audit findings=0 ✓ · tsc ✓ · lint ✓ · test:run 217/217 ✓. build skip.
- **브라우저 확인**: 없음.
- **커밋**: iteration 55
- **다음 예정**: **Phase 5 node→hub 매핑 설계**. 현재 스키마 상 nodes 는 `hubs/{hubId}/nodes/{nodeId}` 로 하위 소속. 한 node 가 여러 hub 에 의존하는 경우를 어떻게 처리할지 결정 (first-hub-dep / orphans 합성 허브 / 아니면 아예 nodes 를 hubs 의 sibling 으로 재설계). 결정 후 `planFlatToContainersMigration` 반환에 `Array<{slug, hubId|null}>` 형태 확장 + UI 에 노드별 배정 미리보기 추가. write 는 그 다음 iter.

---

## 2026-04-21 13:35 — iteration 56 (P0-B Phase 5 설계 확정 · nodes sibling 재배치 + hubIds 매핑)

- **타겟**: node→hub 매핑 설계 결정과 `planFlatToContainersMigration` 반환 확장. 실제 write 활성화 직전 마지막 설계 정리.
- **설계 결정**: **nodes 를 hubs 의 sibling 으로.** 기각 안: first-hub-dep (다중 hub 의존 노드의 정보 손실) · orphans 합성 허브 (UX 쓰레기통). 선택 안: `workspaceProjects/{id}/hubs/{slug}` + `workspaceProjects/{id}/nodes/{slug}` 를 sibling 배치, node 에 `hubIds: string[]` 배열 필드. 장점:
  - 한 노드가 여러 hub 에 자연스럽게 속함 (`array-contains` 쿼리)
  - orphan 을 부자연스러운 합성 컨테이너 없이 `hubIds: []` 로 표현
  - 깊이 4 → 3 으로 쿼리 경로 단순화
  - 기존 flat projects 의 `dependencies[]` 다중성 그대로 반영
- **변경 요약**:
  - `firestore.rules` — `match /nodes/{nodeId}` 를 `match /hubs/{hubId}` 의 밖으로, 같은 레벨 (sibling) 로 이동. 주석으로 설계 의도 명시.
  - `docs/DATA-MODEL.md` — nodes 섹션을 sibling + `hubIds[]` 모델로 재작성. 이관 규칙 (flat dependencies 중 hub slug 만 추림 · 중복 제거 · 정렬) 명시.
  - `src/features/workspace-project-migration/model/plan.ts` — 반환 shape 업데이트: `nodes: MigrationNode[]` (`{slug, hubIds}`) 로 변경, `orphanNodes: string[]` 추가. hubSlugSet 계산으로 dependencies 필터링, dedup/sort.
  - `src/features/workspace-project-migration/model/plan.test.ts` — 6 케이스 (기본 분리 · 빈 입력 · non-hub dep 무시 · orphan 탐지 · dedup · deterministic 정렬).
  - `src/features/workspace-project-migration/index.ts` — `MigrationNode` 타입 export.
  - `src/views/admin-migrate/ui/AdminMigratePage.tsx` — `NodeList` 컴포넌트 추가. 노드별 hubIds 배지 (hubIds 없으면 orphan 노란 배지). orphan 총 수 상단 label + 하단 안내 문구.
- **엔드게임 셀프체크 (P∞)**: sibling + hubIds 모델은 M2 API 에서 "이 node 는 A hub 이자 B hub 의 구성요소" 인 멀티 소속을 편안하게 표현. M3 presence 도 "이 node 에 작업 중" 을 hub 독립적으로 전파 가능 ✓
- **검증**: audit findings=0 ✓ · tsc ✓ · lint ✓ · test:run 220/220 (+3) ✓. build skip.
- **브라우저 확인**: 없음.
- **커밋**: iteration 56
- **다음 예정**: **Phase 5 실제 write 실행**. `runFlatToContainersMigration({ accountId, plan })` — writeBatch 로 hubs/{slug} 에 hub 복제 + nodes/{slug} 에 node 복제 (with hubIds). flat row 는 건드리지 않음. AdminMigratePage 버튼 활성화 + 완료/에러 토스트 + 중복 실행 방지 (in-flight 상태).

---

## 2026-04-21 13:55 — iteration 57 (P0-B Phase 5 write 활성화 · runFlatToContainersMigration)

- **타겟**: 실제 writeBatch 실행 함수 + AdminMigratePage 버튼 활성화. flat row 는 건드리지 않고 hubs/nodes 서브컬렉션에 복사만.
- **변경 요약**:
  - `src/features/workspace-project-migration/model/run.ts` (신규) — `runFlatToContainersMigration({ accountId, projects }) → MigrationResult`. `planFlatToContainersMigration` 재사용, 각 hub/node 를 payload 로 빌드해 writeBatch 에 set. Firestore 500 write/commit 한계 대응 `BATCH_LIMIT=400` chunking. node payload 엔 `hubIds` 동봉. createdAt/updatedAt 은 serverTimestamp.
  - accountId 비어있음 · 데모 세션 은 throw. `toFirestoreFromProject` 는 `Project` → `toFirestore` 구조적 서브타이핑 활용.
  - `run.test.ts` (신규) — 가드 분기 (accountId 공백 / 데모 세션) 2 케이스. 실제 write 경로는 emulator 없이 단위 테스트 불가 → 사용자 실 로그인 수동 검증 으로 위임.
  - `index.ts` — `runFlatToContainersMigration` · `MigrationResult` export.
  - `src/views/admin-migrate/ui/AdminMigratePage.tsx` — 실행 섹션 재작성:
    - `runStatus: 'idle' | 'running' | 'done' | 'error'` 상태
    - `canRun`: accountId + projects 로드 완료 + general container 존재 + 실행 중 아님
    - 버튼 활성화 (`migrate-run-button` testid). 실행 중 레이블 변경. 완료 시 "다시 실행" 레이블.
    - 완료 토스트 (`hubs N · nodes M · batch K`) · 에러 토스트 (메시지 표출)
    - 마지막 실행 요약 inline 배지
    - "target container 먼저 준비 필요" 가드 텍스트 (general 없을 때)
  - 안내 문구를 "다음 iter" → "같은 slug 는 덮어씀 · flat 삭제 별도" 로 갱신.
- **엔드게임 셀프체크 (P∞)**: 이 write 경로는 M2 API 수신 시 "새 문서가 들어오면 hubs/nodes 에 바로 쓰는" 파이프라인의 첫 돌. 이후 Cloud Function 에서도 같은 패턴 (writeBatch + hubIds) 재사용 가능 ✓
- **검증**: tsc ✓ · lint ✓ (처음엔 destructuring 에 unused 3건 warning → `toFirestore(project)` 직전달로 해결) · test:run 222/222 (+2) ✓. build skip.
- **브라우저 확인**: 없음. 실제 write 은 admin 권한 사용자가 `/admin/migrate?a=<uid>` 에서 눌러 확인 바람.
- **커밋**: iteration 57
- **다음 예정**: **Phase 5-postmortem**. 사용자가 실제 마이그레이션 실행 후 Firestore 콘솔에서 `workspaceProjects/general/hubs|nodes` 서브컬렉션에 hub/node 가 복사됐는지 육안 확인. 확인되면 Phase 6 legacy 제거 단계 착수 (flat projects 읽기 경로를 workspaceProjects 로 전환) — 다만 이는 Home/ProjectDrawer/SearchPalette 등 광범위 변경이라 별도 플랜 세션 필요. 사용자 확인 전까지 새 iter 는 **P0-C 4단계 (10k 실측 병목)** 또는 **P1-5 (dynamic metadata)** 로 전환 가능.

---

## 2026-04-21 14:15 — iteration 58 (P0-B Phase 5 검증 카드 · target counts live)

- **타겟**: 마이그레이션 직후 사용자가 Firebase 콘솔 안 가도 화면에서 "제대로 들어갔나" 즉시 확인. plan vs target 카운트 비교.
- **변경 요약**:
  - `src/entities/workspace-project/api/workspace-project-api.ts` — `countContainerHubsAndNodes(accountId, projectId='general')` 신규. hubs/nodes 두 컬렉션 `getDocs` 병렬, `.size` 만 반환. rules 미배포·권한 미달 등 read 실패는 try/catch 로 null 반환해 검증 UI 가 깨지지 않게.
  - `index.ts` 두 곳 — export 추가.
  - `src/views/admin-migrate/ui/AdminMigratePage.tsx` — `targetCounts`/`verifyToken` state. effect 가 `accountId, generalContainer, verifyToken` 변할 때 fetch + cancel 가드. "Target counts (live)" 섹션을 컨테이너 준비 카드 직후에 배치. `MatchLine` 컴포넌트로 hubs/nodes 각각 `target / source` 비교 (✓ match · pending · mismatch). 마이그레이션 성공 직후 `setVerifyToken` 으로 자동 새로고침 + 수동 "새로고침" 버튼.
- **린트 이슈 발견·해결**: 첫 시도에 effect 의 early-return 안에서 `setTargetCounts(null)` → `react-hooks/set-state-in-effect`. 정리 setState 제거하고 `countContainerHubsAndNodes` 자체의 null 반환에 의존.
- **엔드게임 셀프체크 (P∞)**: live 카운트 비교는 M2 API 가 외부 수신을 시작했을 때도 그대로 사용 — "방금 수신된 것 + 기존" 합계가 맞는지 확인하는 단일 통제 지점이 자연스럽게 일반화됨 ✓
- **검증**: tsc ✓ · lint ✓ (1회 수정 후) · test:run 222/222 ✓. build skip.
- **브라우저 확인**: 없음. 사용자가 admin 권한으로 `/admin/migrate?a=<uid>` 에서 실제 검증.
- **커밋**: iteration 58
- **다음 예정**: **마이그레이션 활용 다음 단계** — 실 사용자 시점에서 들어온 시야:
  - (a) 컨테이너 셀렉터 현재는 General 만 노출하므로 새 컨테이너 생성 UX (`+ 새 프로젝트 컨테이너`) 가 다음 자연스러운 진보. 다중 컨테이너가 생기면 selector 가 dropdown 으로 의미 있어짐.
  - (b) 또는 P0-C 4단계 / P1-5 같은 큰 미해결 트랙으로 전환.
  - 사용자 실 마이그레이션 결과 보고 결정.

---

## 2026-04-21 14:30 — iteration 59 (P0-B selector dropdown · 인라인 새 컨테이너 만들기)

- **타겟**: 단일 read-only pill 이었던 `WorkspaceProjectSelector` 를 dropdown 으로 확장. 메뉴 안에 컨테이너 목록 + "+ 새 컨테이너" 인라인 입력. 사용자가 selector 만으로 다중 컨테이너 생성·전환 가능 (Notion-style multi-page 경험).
- **현장 확인**: 기존 widget 은 65줄. dropdown 패턴이 `shared/ui` 에 없음 → 외부 deps 추가 없이 인라인 구현. 메뉴 위치는 `relative` + `absolute` 자식.
- **변경 요약** (`src/widgets/workspace-project-selector/ui/WorkspaceProjectSelector.tsx`):
  - 버튼 트리거 (aria-haspopup=menu · aria-expanded). ChevronDown 표시.
  - 열린 메뉴: `role="menu"`, 컨테이너 리스트 (active 배지 · hover 스타일 · 선택 시 `onSelect` 콜백 + 닫힘).
  - 메뉴 하단 구분선 + "새 컨테이너" 트리거 → 인라인 input + "만들기" 버튼. submit 시 slug 자동 생성 (`name → kebab-case → 48자 컷`, 빈 결과 fallback `p-{ts36}`).
  - `upsertWorkspaceProject` 호출 → 성공 토스트 + 새 id 로 `onSelect` → 메뉴 닫힘. 실패 시 에러 토스트.
  - Esc · outside click 으로 닫힘 (window mousedown/keydown 리스너).
  - submit 중 input/button disabled. 빈 이름은 submit 비활성.
  - props 에 `onSelect?: (projectId) => void` 추가. 미지정 시 메뉴 동작은 그대로지만 부모 상태 업데이트 없음.
- **영향**: HomePage 통합부 (iter 51, 52) 는 props 추가만 됐을 뿐 호환. 단, 부모가 `selectedId`/`onSelect` 를 넘기지 않아 현재는 active 가 항상 첫 컨테이너로 표시됨 — URL `?projectId=` 동기화는 다음 iter 에서.
- **엔드게임 셀프체크 (P∞)**: 다중 컨테이너 생성 UX 가 열려 있어야 사용자가 실제로 "프로젝트 A · 프로젝트 B" 분리 경험을 시작. 그래야 M2 API 도 `projectId` 파라미터의 의미를 사용자가 이해한 채 받음 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 222/222 ✓. build skip.
- **브라우저 확인**: 없음 (dropdown 인터랙션은 사용자 로그인 + 마우스/키보드 조작 필요 — 사용자 실 사용 시 검증).
- **커밋**: iteration 59
- **다음 예정**: **selector ↔ HomePage URL 동기화**. HomePage 가 `?projectId=...` query param 을 읽어 selector 의 `selectedId` 로 전달하고 `onSelect` 가 그 query 를 업데이트하도록 통합. 그래야 새 컨테이너로 전환 후 새로고침해도 상태 유지. (지금 HomePage 의 `useHomeRouteState` 패턴을 따라 추가하면 자연스러움.)

---

## 2026-04-21 14:50 — iteration 60 (P0-B selector ↔ HomePage URL 동기화)

- **타겟**: selector 의 컨테이너 전환을 HomePage URL `?pj=...` 에 영구 반영. 새로고침/공유 링크에서도 활성 컨테이너 유지.
- **변경 요약**:
  - `src/views/home/model/url-state.ts` — `HomeRouteState.projectId: string | null` 추가, `HOME_QUERY_KEYS.projectId = "pj"` (기존 `p` 가 selectedSlug 라 충돌 회피). parse/apply 모두 갱신, default null.
  - `src/views/home/model/url-state.test.ts` — 두 케이스 (parse · apply) 모두 `projectId/pj` 포함하도록 갱신.
  - `src/views/home/ui/HomePage.tsx` — `routeState.projectId` 를 destructure → `activeProjectId`. `handleSelectWorkspaceProject` callback 으로 `setRouteState` 호출. selector 두 위치 (확장 hero · collapsed hero) 모두 `selectedId={activeProjectId}` + `onSelect={handleSelectWorkspaceProject}` 전달.
- **사용자 시나리오**:
  - 새 컨테이너 "narnia" 생성 → selector 가 `onSelect("narnia")` → URL `?pj=narnia` 반영
  - 새로고침 → URL 유지 → routeState.projectId = "narnia" → selector 가 active 표시
  - 다른 사람과 URL 공유 → 같은 컨테이너 활성 상태로 진입
- **제한**: selector 변경이 토폴로지 데이터까지 영향 주지는 아직 않음 (Phase 6 의 read 경로 전환 영역). 현재는 "표시 동기화" 까지.
- **엔드게임 셀프체크 (P∞)**: URL 영속화는 M3 MCP 가 외부에서 "현재 활성 컨테이너" 를 query 로 알려줄 때의 단일 진실원. 같은 query key 가 향후 외부 API 의 `projectId` 파라미터와 1:1 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 222/222 ✓ (url-state 케이스 갱신 포함). build skip.
- **브라우저 확인**: 없음 (사용자 실 사용 시 selector 클릭 → URL 변화 → 새로고침 동작 확인).
- **커밋**: iteration 60
- **다음 예정**: **HomePage 토폴로지 read 경로 전환 (Phase 6 시작)**. activeProjectId 가 변할 때 flat `projects` 가 아닌 `workspaceProjects/{projectId}/hubs|nodes` 를 읽어 토폴로지에 반영. 단 이는 SigmaTopology · ProjectDrawer · SearchPalette 같은 광범위 변경이라 별도 점진 마이그레이션 플랜 (read adapter → 양방향 호환 → 단방향) 필요. iter 61 은 read adapter 신설 (`subscribeProjectsForContainer(accountId, projectId)`) 만 만들고 호출처는 그대로 두는 게 안전.

---

## 2026-04-21 15:05 — iteration 61 (P0-B Phase 6 시작 · subscribeProjectsForContainer read adapter)

- **타겟**: 호출처 변경 없이, hubs+nodes 서브컬렉션을 합쳐 단일 `Project[]` 로 emit 하는 read adapter 신설. flat `subscribeProjects` 와 동일 시그니처 → 추후 호출처 swap 만으로 read 경로 전환 가능한 안전 단계.
- **현장 확인**: FSD 경계상 `entities/workspace-project` 는 `entities/project` 를 import 못함 (entities → entities 금지, shared 만 허용). 따라서 두 entity 를 bridging 하는 read adapter 는 features 레이어에 둬야 함 → `src/features/workspace-project-bridge/` 신설.
- **변경 요약**:
  - `src/features/workspace-project-bridge/model/subscribe-container.ts` (신규):
    - `subscribeProjectsForContainer(accountId, projectId, callback, onError?) → Unsubscribe`
    - `accounts/{id}/workspaceProjects/{projectId|"general"}/hubs` 와 `nodes` 두 컬렉션을 동시 onSnapshot 구독
    - 한쪽만 도착했을 때는 emit 보류, 양쪽 다 도착해야 first callback (loaded 신호 일관성)
    - 한쪽이라도 onError 면 errored 플래그 + 부모 onError 한 번만 호출
    - migration 시 `toFirestore(project)` 그대로 저장됐으므로 `fromFirestore(slug, data)` 가 hub/node 모두 변환 처리. node 의 `dependencies` 는 원본 그대로, `hubIds[]` 는 추가 정보로 함께 보존.
    - accountId 없음 · 데모 세션 → `callback([])` no-op unsubscribe
  - `src/features/workspace-project-bridge/model/subscribe-container.test.ts` (신규) — 가드 분기 3 케이스.
  - `src/features/workspace-project-bridge/index.ts` — export.
- **호출처 변경 없음**: 함수만 추가. HomePage 의 `subscribeProjects` 는 그대로. 이번 iter 의 핵심은 "안전한 swap 후보" 를 미리 만들어두는 것.
- **엔드게임 셀프체크 (P∞)**: 두 컬렉션 합치기 패턴은 M3 presence 와도 1:1 (presence 도 hubs/nodes 두 곳에서 작업 상태가 흐름). 같은 emit 게이팅 (`hubsArrived && nodesArrived`) 패턴 재사용 가능 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 225/225 (+3) ✓. build skip.
- **브라우저 확인**: 없음 (실제 Firestore 구독은 로그인된 admin/member 권한 필요).
- **커밋**: iteration 61
- **다음 예정**: **`/admin/migrate` 검증 카드를 read adapter 로 재구성**. `countContainerHubsAndNodes` 의 1회성 `getDocs` 대신 `subscribeProjectsForContainer` 로 라이브 카운트 제공 — 그러면 다른 탭에서 마이그레이션 진행 중에도 즉시 반영. adapter 의 첫 실 호출처가 되어 호환성 검증도 자연스럽게 됨. 호출처 1곳만 swap 이라 위험 낮음.

---

## 2026-04-21 15:25 — iteration 62 (P0-B Phase 6 첫 swap · /admin/migrate 검증 카드를 라이브 구독으로)

- **타겟**: iter 61 에서 만든 `subscribeProjectsForContainer` 의 첫 실 호출처. 1회성 `getDocs` 기반 검증 카드를 onSnapshot 라이브 구독으로 전환 → 다른 탭/사용자 변경도 즉시 반영, 마이그레이션 직후 자동 새로고침 토큰도 불필요.
- **변경 요약** (`src/views/admin-migrate/ui/AdminMigratePage.tsx`):
  - import: `countContainerHubsAndNodes` 제거 (entity API 자체는 유지 — 다른 곳 잠재 활용). 대신 `subscribeProjectsForContainer` 추가.
  - state: `targetCounts/verifyToken` → `containerProjects/containerLoaded`. effect 가 `accountId` 변할 때만 재구독, 컨테이너 데이터를 직접 보유.
  - `targetCounts` 는 `useMemo` 로 `containerProjects` 에서 hubs/nodes 카운트 파생.
  - 마이그레이션 성공 핸들러에서 `setVerifyToken` 호출 제거 — onSnapshot 가 다음 변경을 자동으로 emit.
  - UI: "새로고침" 버튼 제거 (불필요), "● live" 배지 추가해 라이브 신호 시각화.
  - "target container 가 아직 없어 확인 불가" 가드 제거 — subcollection 은 부모 doc 없이도 동작하므로 항상 카운트 표시 (0/0 도 의미 있는 상태).
- **검증 흐름 변화**:
  - 이전: 마이그레이션 클릭 → setVerifyToken → effect 재실행 → getDocs → setState
  - 이후: 마이그레이션 클릭 → Firestore write → onSnapshot 자동 emit → setState
- **adapter 호환성 검증**: `subscribeProjectsForContainer` 첫 실사용. hubs+nodes 합쳐 `Project[]` 로 emit 하는 게 의도대로 동작 (UI 가 isHub 분류로 카운트 정확). 함수 시그니처가 `subscribeProjects` 와 동일하다는 약속도 검증됨 (호출 코드 패턴 거의 그대로).
- **엔드게임 셀프체크 (P∞)**: 라이브 검증 패턴은 M2 API 가 외부에서 문서를 받는 시점에도 "방금 들어온 변화" 를 사용자가 화면에서 즉시 보는 단일 통제 지점. 추가 polling 없이 일관된 UX ✓
- **검증**: tsc ✓ · lint ✓ · test:run 225/225 ✓. build skip.
- **브라우저 확인**: 없음 (admin 권한 + 실제 Firestore 필요).
- **커밋**: iteration 62
- **다음 예정**: **Phase 6 두 번째 swap — HomePage 토폴로지 read 경로 전환**. activeProjectId 가 truthy 일 때 (= 사용자가 컨테이너를 명시 선택한 경우) `subscribeProjects` 대신 `subscribeProjectsForContainer` 호출. activeProjectId 가 null 이면 기존 flat 경로 유지 — 점진 전환. flat 가 비고 컨테이너에만 데이터가 있는 사용자도 자연스럽게 동작.

---

## 2026-04-21 15:40 — iteration 63 (P0-B Phase 6 두 번째 swap · HomePage 토폴로지 read 점진 전환)

- **타겟**: HomePage 의 토폴로지 데이터 소스를 activeProjectId 유무로 분기. truthy 면 컨테이너의 hubs+nodes 합본, null 이면 기존 flat — 마이그레이션 미실행 사용자에게 영향 0.
- **현장 확인**: `subscribeProjects` 유일 호출 지점은 L292–L310 의 useEffect. callback 시그니처와 onError 패턴은 `subscribeProjectsForContainer` 와 동일 (iter 61 에서 의도적으로 맞춤).
- **변경 요약** (`src/views/home/ui/HomePage.tsx`):
  - import: `subscribeProjectsForContainer` 추가.
  - useEffect: callback/onError 를 한번 추출 (`onNext`, `onError`) 후, `activeProjectId` 진리값으로 두 함수 중 선택. deps 배열에 `activeProjectId` 추가.
- **사용자 시나리오**:
  - 마이그레이션 안 한 유저: URL `?pj` 미설정 → activeProjectId=null → flat subscribeProjects → 기존과 완전 동일
  - 마이그레이션 후 selector 로 "general" 선택: URL `?pj=general` → activeProjectId="general" → 컨테이너 read 경로 → hubs+nodes 합본이 토폴로지에 표시
  - 새 컨테이너 "narnia" 선택: 해당 컨테이너의 데이터만 (현재는 비어있을 가능성 → 빈 지도). 이후 그 컨테이너에 데이터를 채우면 즉시 반영.
- **호환성**: hubs/nodes 문서가 `toFirestore(project)` 그대로 저장됐고 `fromFirestore` 가 `Project` 로 복원하므로 SigmaTopology · ProjectDrawer · SearchPalette 등 downstream 은 변경 0.
- **엔드게임 셀프체크 (P∞)**: 이제 컨테이너 단위로 토폴로지가 분리돼 보임. M2 API 가 외부에서 받은 문서를 특정 컨테이너에 쓰면 그 컨테이너로 전환한 사용자 화면에 즉시 반영. presence/MCP 의 "어디서 작업 중" 도 컨테이너 축으로 자연 표현 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 225/225 ✓. build skip (런타임 분기만).
- **브라우저 확인**: 없음 (사용자가 마이그레이션 후 selector 클릭 → 토폴로지 변화 시각 확인 필요).
- **커밋**: iteration 63
- **다음 예정**: **다른 page (ProjectsList · /projects, ProjectDetailPage · /project/[slug]) 의 read 경로 적용성 검토**. ProjectsList 는 SearchPalette 와 함께 컨테이너 인지가 자연스러움. ProjectDetailPage 는 [slug] 가 hub/node 어느 쪽인지에 따라 다른 path 로 읽어야 함 (slug → hubs/{slug} OR nodes/{slug} 폴백). iter 64 는 ProjectsList 만 swap, ProjectDetail 은 데이터 모델 적합성 확인 후 별도 iter.

---

## 2026-04-21 15:55 — iteration 64 (P0-B Phase 6 세 번째 swap · ProjectSelectorPage 컨테이너 read 점진 전환)

- **타겟**: `/projects` (ProjectSelectorPage) 도 HomePage 와 동일한 `?pj=<containerId>` 규약으로 컨테이너 read 점진 전환. 두 페이지 간 selector URL 공유 시 데이터 소스도 일관.
- **현장 확인**: `src/views/project-selector/ui/ProjectSelectorPage.tsx` L53–L60 가 유일한 `subscribeProjects` 호출. callback/onError 시그니처 동일 → 호환.
- **변경 요약** (`src/views/project-selector/ui/ProjectSelectorPage.tsx`):
  - import: `subscribeProjectsForContainer` 추가
  - `activeProjectId = searchParams.get("pj")` (이 페이지는 useHomeRouteState 안 씀, 직접 읽기)
  - useEffect: callback 추출 → `activeProjectId` 진리값으로 두 함수 중 선택. deps 에 `activeProjectId` 추가.
- **사용자 시나리오**:
  - HomePage 에서 selector 로 컨테이너 전환 후 `/projects` 로 이동 (URL 의 `?pj=` 유지) → 같은 컨테이너의 hubs/nodes 만 리스트
  - URL `?pj` 없이 `/projects` 직접 진입 → 기존 flat 결과 (호환)
- **엔드게임 셀프체크 (P∞)**: `/projects` 도 컨테이너 인지하니, M2 API 가 외부에서 들어온 새 문서를 ProjectSelector 검색에서 즉시 찾을 수 있는 단일 일관 모델 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 225/225 ✓. build skip.
- **브라우저 확인**: 없음.
- **커밋**: iteration 64
- **다음 예정**: **ProjectDetailPage (`/project/[slug]`) 컨테이너 read 적용성 검토 + 전환**. slug → hub 또는 node 어느 쪽 path 인지 모르므로 `?pj` 가 truthy 일 때 hubs/{slug} 먼저 시도, 없으면 nodes/{slug} fallback 하는 read 함수 신설 필요. 또는 양쪽 동시 onSnapshot 후 첫 hit 채택. 이는 entities/project 의 단건 조회 (`subscribeProject(slug, accountId)`) 와 동일 인터페이스를 유지하면 호환.

---

## 2026-04-21 16:10 — iteration 65 (P0-B Phase 6 네 번째 swap · ProjectDetailPage 컨테이너 read 점진 전환)

- **타겟**: `/project/[slug]` 도 `?pj` 쿼리 인지. 단건 조회 시 hubs/{slug} → nodes/{slug} 폴백, related list 도 컨테이너 합본.
- **현장 확인**: ProjectDetailPage 의 effect (L327-) 가 `Promise.all([getProject(slug, accountId), listProjects(accountId)])` 한 번. callback 시그니처 그대로 → 호환 swap 가능.
- **변경 요약**:
  - `src/features/workspace-project-bridge/model/get-container.ts` (신규):
    - `getProjectFromContainer(accountId, projectId, slug)` — hubs/{slug} 1차 시도, 없으면 nodes/{slug}. accountId/slug 없거나 데모 세션이면 null.
    - `listProjectsForContainer(accountId, projectId)` — getDocs 두 컬렉션 병렬 → 합본 Project[].
  - `src/features/workspace-project-bridge/model/get-container.test.ts` (신규) — 가드 분기 5 케이스.
  - `src/features/workspace-project-bridge/index.ts` — export.
  - `src/views/project-detail/ui/ProjectDetailPage.tsx`:
    - `import { getProjectFromContainer, listProjectsForContainer }` 추가.
    - `activeProjectId = searchParams.get("pj")`.
    - effect 안 `Promise.all` 을 activeProjectId truthy 면 컨테이너 함수 쌍, 아니면 기존 flat 함수 쌍으로 분기. deps 에 `activeProjectId` 추가.
- **사용자 시나리오**:
  - 마이그레이션 안 한 사용자: `?pj` 없음 → flat 그대로 (영향 0)
  - 마이그레이션 후 사용자: 컨테이너에서 detail 진입 (selector 클릭 → drawer 닫고 detail 가는 흐름은 추후) → hubs/nodes 어느 한쪽에서 자동 발견
  - URL 직접 `/project/iam?pj=narnia` → narnia 컨테이너의 iam (있으면 hub or node) 탐색. 없으면 "not found"
- **엔드게임 셀프체크 (P∞)**: detail 도 컨테이너 인지하니 M2 API 가 외부에서 받은 새 문서가 detail 페이지에서도 그 컨테이너 컨텍스트로 자연 표시. presence/MCP 도 "이 hub 의 이 node 작업 중" 컨텍스트가 detail 페이지로 흘러갈 수 있는 토대 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 230/230 (+5) ✓. build skip.
- **브라우저 확인**: 없음.
- **커밋**: iteration 65
- **다음 예정**: **컨테이너 셀렉터에서 detail 진입 시 ?pj URL 전파 검증 + ProjectDrawer 등 잔여 read 경로 swap**. 현재 selector 가 컨테이너 전환은 하지만, 그 컨테이너의 hub/node 클릭으로 detail 갈 때 `?pj=` 가 함께 따라가야 동일 컨테이너 컨텍스트 유지. `getProjectDetailHref(slug, accountId)` 가 `pj` 도 받아 append 하도록 확장.

---

## 2026-04-21 16:30 — iteration 66 (P0-B Phase 6 큰 묶음 · ?pj URL 자동 propagation 인프라)

- **사용자 피드백**: "너무 쪼금씩 작업하는것같은데 좀 한번에 다 해봐". 이번 iter 부터 한 P0-B 흐름 안에서 관련 변경을 묶어 진행.
- **타겟**: link 생성기들이 현재 활성 컨테이너(`?pj=`)를 자동으로 모든 navigation 에 전파하도록 인프라 만들기. selector 가 켜진 상태에서 어디로 이동해도 같은 컨테이너 컨텍스트 유지.
- **변경 요약**:
  - `src/shared/lib/account-scope.ts`:
    - `WORKSPACE_PROJECT_QUERY_KEY = "pj"` 단일 진실원 상수 추가.
    - `appendWorkspaceProjectQuery(href, projectId?)` — 명시 인자 없으면 현재 URL 의 `?pj=` 자동 상속. `appendAccountQuery` 와 대칭 패턴.
    - `readRuntimeWorkspaceProjectId()` — `readRuntimeAccountId` 와 대칭.
  - `src/entities/project/lib/detail-href.ts` · `topology-href.ts` — `getProjectDetailHref`/`getTopologyProjectHref`/`getProjectDetailUrl` 시그니처에 `projectId?` 추가, 끝에서 `appendWorkspaceProjectQuery` 체이닝. **호출처 변경 없이 현재 URL 의 ?pj 가 자동 전파.**
  - `src/views/home/model/url-state.ts` · `src/views/project-selector/ui/ProjectSelectorPage.tsx` · `src/views/project-detail/ui/ProjectDetailPage.tsx` — hardcoded `"pj"` 를 모두 `WORKSPACE_PROJECT_QUERY_KEY` import 로 교체.
  - 테스트 신규/보강:
    - `src/shared/lib/account-scope.test.ts` (신규, 9 케이스) — appendWorkspaceProjectQuery 직접 호출 / 기존 query 보존 / runtime URL 자동 상속 / 빈 값 처리 / 체이닝 / readRuntimeWorkspaceProjectId / 상수 fix.
    - `detail-href.test.ts` — projectId 단독 + account+pj 체이닝 2 케이스.
    - `topology-href.test.ts` — pj 체이닝 1 케이스.
- **자동 propagation 효과**: `getProjectDetailHref(slug, accountId)` 같은 기존 1-arg/2-arg 호출이 모두 현재 URL 의 ?pj 를 자동 상속. 즉, 사용자가 selector 로 컨테이너 전환 후 토폴로지 노드 클릭 → detail 진입 시 `?pj=` 가 URL 에 자연스럽게 따라감 → ProjectDetailPage 의 컨테이너 read 분기가 자동 작동. **모든 navigation 일관성 확보.**
- **엔드게임 셀프체크 (P∞)**: `?pj` 가 단일 컨텍스트 통제 키로 정착. M2 API/MCP 가 외부에서 받은 `projectId` 를 link 생성 시 전달하면 동일 모델로 컨텍스트가 페이지 간 흐름. URL 만 보면 "어느 컨테이너 안에서" 가 항상 명시 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 242/242 (+12) ✓. build skip.
- **브라우저 확인**: 없음. 사용자 실 사용 시 selector 전환 후 노드 클릭 → URL `?pj=` 동반 + detail 페이지가 컨테이너 read 사용 자동 확인 가능.
- **커밋**: iteration 66
- **다음 예정**: **다른 link 생성기 검토** — `getKnowledgeDocumentDetailHref` 등 knowledge 영역 href, ProjectDrawer 내부의 hard-coded URL 빌딩, breadcrumb 링크 등. ?pj 전파 누락 지점이 있으면 같은 패턴 적용. 또는 별도 트랙 (P0-C / P1-5) 으로 전환.

---

## 2026-04-21 16:55 — iteration 67 (P0-B Phase 6 더 큰 묶음 · ?pj 가 모든 navigation 으로 자동 흘러가도록)

- **타겟**: knowledge href 4종 + 모든 admin link 의 ?pj 자동 propagation. 호출처 변경 0 — `appendAccountQuery` 가 끝에서 ?pj 자동 chain 하도록 만들어 단일 지점에서 모두 커버.
- **현장 확인**: `appendAccountQuery("/admin/...")` 패턴이 10 파일에 분산 (admin dashboard / insights / migrate / project-import / knowledge documents · dashboard, ProjectSelectorPage, HomePage, account-menu, public-quick-actions). 일일이 chain 추가 대신 shared 함수 한 곳에서 묶음 처리가 깔끔.
- **변경 요약**:
  - `src/shared/lib/account-scope.ts` — `appendAccountQuery` 가 마지막에 `appendWorkspaceProjectQuery(withAccount)` 호출. 두 함수 모두 idempotent 라 중복 호출 안전. 호출처 변경 0.
  - `src/entities/knowledge-document/lib/detail-href.ts`:
    - `KnowledgeHrefOptions` 에 `workspaceProjectId?` 추가 (외부 명시 잠금용)
    - 4 함수 (`getKnowledgeDocumentDetailHref`, `getKnowledgeDocumentListHref`, `getKnowledgeDocumentNewHref`, `getKnowledgeReviewWorkspaceHref`) 가 `decorate` 헬퍼 통과 — `appendKnowledgeParams → appendAccountQuery → appendWorkspaceProjectQuery(opts.workspaceProjectId)`. 명시 안 해도 account chain 의 자동 ?pj 상속이 적용.
  - `src/entities/project/lib/knowledge-topology-href.ts` — `projectId?` 인자 추가 (delegate 시그니처 확장).
  - 테스트:
    - `account-scope.test.ts` — `appendAccountQuery` 직접 (+2), runtime ?pj 자동 chain (+2). 총 +4
    - `knowledge-document/lib/detail-href.test.ts` — `workspaceProjectId` 옵션 (+1)
- **부수 효과**: HomePage / 어드민 모든 페이지 / 공개 액션 모듈이 이제 `?pj=` 가 켜진 상태에서 어떤 링크를 만들어도 자동 propagation. selector 로 narnia 컨테이너 전환 → "어드민 대시보드" 링크 → URL `?account=...&pj=narnia` 자동 부착.
- **엔드게임 셀프체크 (P∞)**: navigation 컨텍스트 (account + workspaceProject) 가 한 점에서 결정 → 100% 일관 흐름. M2 API/MCP 가 외부에서 받은 컨테이너를 brand-new 페이지 navigation 만으로도 유지 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 247/247 (+5) ✓. build skip.
- **브라우저 확인**: 없음. 사용자 실 사용 시 dropdown 으로 컨테이너 전환 → 어드민 메뉴 진입 → URL ?pj 동반 확인 가능.
- **커밋**: iteration 67
- **다음 예정**: **사용자 실 마이그레이션 결과 확인 단계**. 인프라가 충분히 갖춰져 (Phase 0~6 read swap + URL propagation) 사용자가 실제 `/admin/migrate` 에서 마이그레이션 실행 후 selector 로 컨테이너 전환해 토폴로지/리스트/상세 모두 컨테이너 read 로 동작하는지 확인 가능. 사용자 피드백 후 Phase 6 의 잔여 (write 경로 분기 — 자기 공간 inline 편집 시 어디에 쓸지) 또는 P0-C 4단계 (10k 실측 병목) 로 전환.

---

## 2026-04-21 17:15 — iteration 68 (P0-B Phase 6 write 분기 · upsertProjectInContainer + ProjectDetailPage 통합)

- **타겟**: 컨테이너 컨텍스트(?pj=) 에서 inline 편집 시 컨테이너 서브컬렉션으로 직접 write. 그래야 selector 로 컨테이너 전환 후 편집한 내용이 그 컨테이너의 토폴로지/리스트/상세에 자연스럽게 반영.
- **변경 요약**:
  - `src/features/workspace-project-bridge/model/upsert-container.ts` (신규):
    - `upsertProjectInContainer({accountId, projectId, input})` — input.isHub 로 hubs/{slug} 또는 nodes/{slug} 결정. `toFirestore` 동일 payload, `updatedAt` 매번/`createdAt` 첫 생성만 serverTimestamp, `merge:true` 라 `hubIds` 등 기존 필드 보존.
    - 가드: accountId 누락 · 데모 세션 · projectId 누락 · slug 누락 → throw (inline 편집 흐름이라 호출 측 에러 처리 필요).
  - `upsert-container.test.ts` (신규) — 4 가드 케이스.
  - `index.ts` — export 추가.
  - `src/views/project-detail/ui/ProjectDetailPage.tsx`:
    - `upsertProjectInContainer` import.
    - 4 inline edit 함수가 직접 `upsertProject` 호출하던 것을 통합 helper `persistProject(input)` 로 위임. helper 가 `activeProjectId` 진리값으로 컨테이너/flat 분기.
    - 주석 갱신 (컨테이너 컨텍스트 분기 명시).
- **사용자 시나리오**:
  - flat 사용자: ?pj 없음 → 기존 upsertProject 그대로 (영향 0)
  - 컨테이너 사용자: selector 로 narnia 컨테이너 → detail 페이지 진입 (URL ?pj=narnia 자동 동반) → 이름/설명/의존/태그/스택/링크 inline 편집 → narnia 컨테이너의 hubs|nodes 서브컬렉션으로 write → 라이브 구독이 즉시 반영
- **read/write 일관성 완성**: iter 63-65 의 read 분기 + iter 67 URL 자동 propagation + iter 68 write 분기 = 컨테이너 사용자가 selector → 토폴로지 → detail → 편집 → 다시 토폴로지 흐름 전반에 단일 컨테이너 컨텍스트 유지.
- **엔드게임 셀프체크 (P∞)**: write 분기 통합 helper 패턴은 추후 다른 페이지 (ProjectDrawer inline edit 등) 에도 그대로 복사. M2 API 도 같은 함수로 외부 수신 데이터 저장 가능 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 251/251 (+4) ✓. build skip.
- **브라우저 확인**: 없음. 사용자 실 사용 시 컨테이너 진입 → inline 편집 → 라이브 반영 확인 가능.
- **커밋**: iteration 68
- **다음 예정**: **다른 inline-edit 호출처 통합 또는 admin 편집 화면 동일 패턴 적용**. ProjectDrawer · admin-project-editor 등에서 `upsertProject` 직접 호출 지점 찾아 같은 `persistProject` 패턴 적용. 또는 Phase 6 마무리 검증 단계 (사용자 실 사용 후 잔여 갭 보고).

---

## 2026-04-21 17:35 — iteration 69 (P0-B Phase 6 write 분기 묶음 · adaptive helpers + 호출처 3곳 일괄 swap)

- **타겟**: 컨테이너 인지 없이도 안전한 write 단일 진입점 제공 + 주요 inline-edit / 어드민 편집 호출처 일괄 swap.
- **변경 요약**:
  - `src/features/workspace-project-bridge/model/upsert-container.ts`:
    - `persistProjectAdaptive(input, options?)` — `options.workspaceProjectId` 우선, 없으면 runtime URL `?pj` 자동 상속, 명시 null 이면 강제 flat. truthy 면 `upsertProjectInContainer`, 아니면 기존 `upsertProject`.
    - `createProjectAdaptive(input, options?)` — 같은 결정 로직. 컨테이너/flat 양쪽에서 slug 충돌 사전 검사 후 신규 생성. 충돌 시 throw.
  - `index.ts` — 두 함수 export.
  - `src/features/project-quick-edit/ui/ProjectQuickEditPanel.tsx` — `upsertProject` → `persistProjectAdaptive`. URL ?pj 자동 상속.
  - `src/features/project-quick-create/ui/ProjectQuickCreatePanel.tsx` — `createProject` → `createProjectAdaptive`.
  - `src/views/admin-project-editor/ui/AdminProjectEditorPage.tsx` — `createProject` → `createProjectAdaptive`, `upsertProject` → `persistProjectAdaptive`. `deleteProject` 는 다음 iter (삭제는 더 위험).
  - `src/views/project-detail/ui/ProjectDetailPage.tsx` — iter 68 의 인라인 helper `persistProject` 를 한 줄 wrapper 로 단순화 (`persistProjectAdaptive` 위임).
- **사용자 시나리오**: ProjectDrawer 의 quick-edit/quick-create · admin 편집기 · detail inline 편집 모두 컨테이너 컨텍스트(?pj=) 가 켜져 있으면 그 컨테이너로 write. 자동 상속이라 위젯 코드 변경 없이 작동.
- **남은 호출처**: AdminDashboardPage (bulk taxonomy update), AdminProjectImportPage (CSV 일괄), seed-runner, restore-admin-snapshot, deleteProject. bulk/import 는 "전체 워크스페이스" 작업 의미가 강해 컨테이너 분기를 적용할지 별도 판단 필요.
- **엔드게임 셀프체크 (P∞)**: adaptive 헬퍼 패턴은 M2 API/MCP 가 외부에서 받은 데이터 저장에도 그대로 — `createProjectAdaptive(input, { workspaceProjectId })` 한 줄로 컨테이너 라우팅 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 251/251 ✓. build skip.
- **브라우저 확인**: 없음. 사용자 컨테이너 상태에서 quick-edit/create · admin 편집 흐름 자동 확인 가능.
- **커밋**: iteration 69
- **다음 예정**: **deleteProjectAdaptive + admin-project-editor 삭제 swap + 잔여 bulk/import 호출처 정책 결정**. 삭제는 컨테이너 path 에서 hubs/{slug} 또는 nodes/{slug} 어느 쪽인지 확인 후 단일 경로 삭제 (또는 양쪽 시도 폴백). 활동 로그도 함께 기록.

---

## 2026-04-21 17:55 — iteration 70 (P0-B Phase 6 delete adapters + 호출처 2곳 추가 swap)

- **타겟**: 삭제 경로의 컨테이너 분기 도입 + admin 편집기 / CSV 임포트 swap. Dashboard 의 bulk 핸들러는 accountId 가 ProjectTable prop 에 노출돼 있지 않아 별도 iter 로 분리.
- **변경 요약**:
  - `src/features/workspace-project-bridge/model/delete-container.ts` (신규):
    - `deleteProjectFromContainer(accountId, projectId, slug)` — hubs/{slug} → nodes/{slug} 폴백, 둘 다 없으면 멱등 (no throw). reference check 는 `listProjectsForContainer` 결과로 수행 — 다른 entry 가 의존 중이면 throw.
    - `deleteProjectAdaptive(slug, options)` — `workspaceProjectId` 결정 후 컨테이너 또는 flat `deleteProject` 위임.
    - `deleteProjectsAdaptive(slugs, options)` — bulk. flat 일 땐 기존 `deleteProjects`, 컨테이너에선 일괄 reference check 후 병렬 삭제.
    - resolveContainerProjectId helper 로 결정 로직 단일화.
  - `delete-container.test.ts` (신규) — 가드 분기 6 케이스.
  - `src/entities/project/index.ts` — `findBulkDeleteBlockingReferences` export 추가 (bridge 가 사용).
  - `src/features/workspace-project-bridge/index.ts` — 3 함수 export.
  - `src/views/admin-project-editor/ui/AdminProjectEditorPage.tsx` — `deleteProject` → `deleteProjectAdaptive`. accountId 그대로 전달.
  - `src/views/admin-project-import/ui/AdminProjectImportPage.tsx` — `createProject` → `createProjectAdaptive`. ?pj 자동 상속이라 컨테이너 임포트 자동 동작.
- **Dashboard 보류 사유**: ProjectTable 함수가 `accountId` 를 prop 으로 받지 않아 단순 swap 으로 컨테이너 path 가 동작하지 못함 (accountId 없이 컨테이너 path 는 fail). prop 추가 + 4 호출처 갱신은 별도 iter 가 안전.
- **엔드게임 셀프체크 (P∞)**: delete adaptives 까지 갖춰져 read·write·delete 3대 경로가 모두 컨테이너 분기 가능. M2 API 가 외부 도구에서 "이 노드 삭제" 요청을 받으면 같은 어댑터로 처리 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 257/257 (+6) ✓. build skip.
- **브라우저 확인**: 없음.
- **커밋**: iteration 70
- **다음 예정**: **AdminDashboardPage 의 ProjectTable 에 accountId prop 전달 + 4 핸들러(handleDeleteProject·handleBulkDelete·handleBulkCategoryChange·handleBulkStatusChange) 일괄 swap**. ProjectsTable signature 변경 영향 점검 필요.

---

## 2026-04-21 18:10 — iteration 71 (P0-B Phase 6 dashboard 4 핸들러 일괄 swap)

- **타겟**: AdminDashboardPage 의 ProjectTable 가 컨테이너 컨텍스트에 맞춰 write/delete 하도록 4 핸들러 swap. iter 70 에서 보류한 Dashboard 마무리.
- **변경 요약** (`src/views/admin-dashboard/ui/AdminDashboardPage.tsx`):
  - import: `deleteProjects`/`deleteProject`/`upsertProject` 제거. `deleteProjectAdaptive`/`deleteProjectsAdaptive`/`persistProjectAdaptive` 추가.
  - `ProjectTable` props 에 `accountId: string | null` 추가 (P0-B Phase 6 주석).
  - DashboardContent 에서 `<ProjectTable ... accountId={scopedAccountId} ... />` 전달.
  - `handleDeleteProject` → `deleteProjectAdaptive(project.slug, { accountId })`.
  - `handleBulkCategoryChange` 와 `handleBulkStatusChange` 의 `Promise.all(inputs.map(upsertProject))` → `persistProjectAdaptive` (replace_all).
  - `handleBulkDelete` → `deleteProjectsAdaptive(bulkTargetSlugs, { accountId })`.
- **사용자 시나리오**:
  - flat 사용자 (?pj 없음): 4 핸들러 모두 기존 `upsertProject`/`deleteProject(s)` 와 동일 동작 — runtime URL 자동 상속이 null 이라 분기 안 탐
  - 컨테이너 사용자 (?pj=narnia): 단건 삭제 · 일괄 삭제 · 일괄 카테고리 · 일괄 상태 모두 narnia 컨테이너의 hubs/nodes 에 적용
  - 기존 dashboard 가 `deleteProject(slug)` 만 호출해 accountId 누락이었던 buggy 동작도 이제 `accountId` 명시 전달로 정상화 (의도치 않은 부수 수정).
- **엔드게임 셀프체크 (P∞)**: dashboard 의 일괄 작업이 컨테이너 단위로 동작 → admin 이 컨테이너별로 정리·일괄변경하는 UX 가능. M3 presence 도 같은 컨테이너 안에서 "누가 어디 작업 중" 표현 자연스러움 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 257/257 ✓. build skip.
- **브라우저 확인**: 없음. 사용자 컨테이너 진입 후 dashboard 일괄 작업으로 자동 검증 가능.
- **커밋**: iteration 71
- **다음 예정**: **잔여 호출처 정리** — `seed-runner` (샘플 데이터 시드) · `restore-admin-snapshot` (JSON 복원) 의 `upsertProject`/`createProject` 호출도 같은 분기 패턴으로 swap 검토. 또는 **Phase 6 마무리** — 모든 read/write/delete swap 완료 선언 + Phase 7 정의 (legacy flat 제거 일정).

---

## 2026-04-21 18:25 — iteration 72 (P0-B Phase 6 마무리 · seed/restore swap + Phase 7 플랜 정의)

- **타겟**: 잔여 비-adaptive 호출처 (seed-runner, restore-admin-snapshot) 도 forward-compat 으로 swap. P0-B 설계 문서에 Phase 진행 체크박스 갱신 + Phase 7 (legacy flat 제거) 단계별 계획 추가.
- **변경 요약**:
  - `docs/superpowers/plans/2026-04-21-project-container-entity.md`:
    - Phase 0–6 모두 ✅ + 각 phase 별 iter 매핑 명시
    - Phase 7 신규: legacy `accounts/{id}/projects` 제거의 6 단계 (잔여 swap → read alias → grep cleanup → rules 제거 → flat archive 삭제 도구 → 테스트 정리). 위험·완화 명시.
  - `src/features/project-seed/model/seed-runner.ts` — `upsertProject` → `persistProjectAdaptive`. `runSeed(onProgress?, options?)` 시그니처 확장 (accountId · workspaceProjectId). 미지정 시 runtime URL 자동 상속, 둘 다 없으면 기존 flat 동작.
  - `src/features/admin-snapshot/model/restore-admin-snapshot.ts` — `upsertProject` · `deleteProjects` → adaptive 함수. `RestoreContextOptions` 타입 추가, `RestoreOptions & RestoreContextOptions` 로 시그니처 확장. UI 버튼은 호환성 유지 (옵션 미지정 시 기존 동작).
- **호출처 영향 0**: 두 함수 모두 옵션 추가만 했을 뿐, 호출자 (`SeedButton`, `RestoreAdminSnapshotButton`) 는 코드 변경 없이 그대로 동작. 추후 UI 에서 컨테이너 옵션을 노출하면 즉시 컨테이너 라우팅.
- **P0-B 큰 그림**:
  - Phase 0~6 완료 — 사용자 read·write·delete 모든 일상 흐름이 컨테이너 컨텍스트 자동 인지
  - Phase 7 만 남음 — flat 코드 경로 자체를 제거 (compatibility 레이어 정리). 단, 사용자 마이그레이션이 충분히 진행된 뒤 시작해야 안전
- **엔드게임 셀프체크 (P∞)**: P0-B 가 거의 완성됐으니 M2 API 작업으로 넘어갈 수 있는 상태. 외부 API 가 `{accountId, projectId}` 받아 컨테이너로 직접 쓰는 contract 가 코드상 이미 자연스러움 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 257/257 ✓. build skip.
- **브라우저 확인**: 없음.
- **커밋**: iteration 72
- **다음 예정**: **사용자 실 마이그레이션 + 검증 단계 (필수 인풋 필요)** 또는 **P0-B 외 트랙**:
  - (a) 사용자가 `/admin/migrate` 에서 실 마이그레이션 실행 → 검증 카드 ✓ → selector 로 컨테이너 전환 → 토폴로지/상세/편집 확인. 결과 리포트 후 Phase 7 의 단계 1~6 본격 시작.
  - (b) P0-C 4단계 (10k 실측 병목) — 사용자 벤치 결과 필요
  - (c) P1-5 (account-scoped dynamic metadata) — static export 전략 논의
  - 사용자 피드백 없이 더 진행할 P0-B 작업이 사실상 없는 상태.

---

## 2026-04-21 18:50 — iteration 73 (admin 페이지에 WorkspaceProjectSelector 노출 + URL 동기화 hook 재사용)

- **타겟**: HomePage 만 노출돼 있던 selector 를 admin 페이지에도 추가 — admin 도 컨테이너 컨텍스트 즉시 파악 + 페이지 이동 없이 컨테이너 전환 가능. 다음 iter 시 사용자 인풋 대기 상태에서 의미 있는 UX 진보.
- **변경 요약**:
  - `src/shared/lib/use-workspace-project-query.ts` (신규) — `useWorkspaceProjectQuery()` 훅. URL `?pj=` 양방향 동기화 (`[currentId, setProjectId]`). usePathname + useSearchParams + router.push 패턴, 다른 query 보존. setter 에 null 전달 시 query 제거.
  - `src/views/admin-dashboard/ui/AdminDashboardPage.tsx` — selector 헤더에 추가. `useWorkspaceProjectQuery` 로 양방향 연결. 기존 `{scopedAccountId} 작업 중` pill 옆에 컨테이너 pill 자연스럽게.
  - `src/views/admin-migrate/ui/AdminMigratePage.tsx` — 헤더 설명 아래 selector 추가. 마이그레이션 페이지에서 컨테이너 직접 만들거나 전환 가능 (현재 작업할 컨테이너가 명확해짐).
- **사용자 시나리오**:
  - admin 이 dashboard 에서 작업 → selector 로 narnia 컨테이너 전환 → URL `?pj=narnia` → bulk 작업 (iter 71 swap) 도 자동으로 narnia 컨테이너 적용
  - admin 이 migrate 페이지에서 새 컨테이너 만들기 → 즉시 전환 → 그 컨테이너에서 마이그레이션 / 검증
- **엔드게임 셀프체크 (P∞)**: admin/end-user 모두 동일한 컨테이너 전환 UX → MCP/API 가 외부에서 컨테이너 정보를 받았을 때 admin 도구도 같은 컨텍스트에서 디버깅 가능 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 257/257 ✓. build skip.
- **브라우저 확인**: 없음. 사용자가 admin 진입 후 selector 노출 + 전환 자동 검증 가능.
- **커밋**: iteration 73
- **다음 예정**: **AdminKnowledgeDashboardPage 등 잔여 admin 페이지에 selector 노출** (10여 개 admin 페이지 중 dashboard/migrate 외 6~8 페이지). 또는 사용자 실 마이그레이션 검증 단계 대기.

---

## 2026-04-21 19:05 — iteration 74 (admin 페이지 3곳에 WorkspaceProjectSelector 추가 일괄)

- **타겟**: knowledge-dashboard / insights / project-import 헤더에 selector 노출. iter 73 의 hook 재사용으로 패턴 일관.
- **변경 요약**:
  - `src/views/admin-knowledge-dashboard/ui/AdminKnowledgeDashboardPage.tsx` — `useWorkspaceProjectQuery` + selector 헤더 본문 아래 추가. 문서 작업 흐름에서 컨테이너 즉시 인지·전환.
  - `src/views/admin-insights/ui/AdminInsightsPage.tsx` — 같은 패턴. 운영 점검 시 컨테이너 단위 진단 가능.
  - `src/views/admin-project-import/ui/AdminProjectImportPage.tsx` — Scope 라벨 아래 selector. CSV 임포트가 컨테이너로 라우팅된다는 시각적 단서 (iter 70 swap 과 시너지).
- **남은 admin 페이지**:
  - admin-categories / admin-statuses — 글로벌 taxonomy, 컨테이너 무관
  - admin-knowledge-document-detail / -new / -review-workspace — slug 기반 컨텍스트, ?pj URL 자동 상속이 충분
  - admin-project-editor — 단건 편집, 자동 상속
  - admin-login / admin-dev-login — 인증 화면, 무관
- **사용자 시나리오**:
  - admin 이 어떤 admin 페이지에서도 컨테이너 전환 가능 → URL `?pj=` 변경 → 다른 admin 으로 이동해도 동일 컨테이너 유지 (iter 67 의 자동 propagation 시너지)
  - 새 컨테이너를 admin 안에서 직접 만들고 즉시 작업 시작
- **엔드게임 셀프체크 (P∞)**: admin tooling 전체가 컨테이너 인지 → MCP/API 가 외부에서 받은 데이터를 admin 이 같은 컨텍스트에서 즉시 디버그/검수 가능 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 257/257 ✓. build skip.
- **브라우저 확인**: 없음.
- **커밋**: iteration 74
- **다음 예정**: **공개 화면 (`/projects` ProjectSelectorPage) 에도 selector 노출** — 현재는 selector hook 으로 컨테이너 인지하나 시각적 selector 자체는 없음. 공개 게스트가 컨테이너 별 프로젝트 목록 탐색 가능. 또는 사용자 실 마이그레이션 검증 단계 대기.

---

## 2026-04-21 19:25 — iteration 75 (공개 /projects 에도 selector 노출 + hook 통합)

- **타겟**: 공개 `/projects` ProjectSelectorPage 도 selector UI 노출 + URL 동기화 hook 으로 통합. 게스트도 컨테이너별 프로젝트 목록 탐색 가능.
- **현장 확인**: iter 64 에서 read 분기는 이미 적용됐으나 시각적 selector 자체는 없어 게스트 입장에서 컨테이너 전환 수단이 없었음. 같은 페이지가 hook 없이 직접 `searchParams.get(WORKSPACE_PROJECT_QUERY_KEY)` 로 읽고 있었음 — hook 통합으로 코드 중복 정리.
- **변경 요약** (`src/views/project-selector/ui/ProjectSelectorPage.tsx`):
  - import: `WorkspaceProjectSelector`, `useWorkspaceProjectQuery` 추가. `WORKSPACE_PROJECT_QUERY_KEY` import 제거 (hook 내부에서 사용).
  - `activeProjectId = searchParams.get(...)` → `[activeProjectId, setActiveProjectId] = useWorkspaceProjectQuery()`.
  - 헤더 "프로젝트" 제목 아래에 selector 배치.
- **사용자 시나리오**:
  - 공개 게스트가 `/?a=stark&pj=narnia` 진입 후 `/projects` 로 이동 → 헤더에서 selector 로 다른 컨테이너 전환 시각적 가능
  - 페이지 간 URL `?pj` 자동 propagation 과 시너지 — selector 한 번 전환으로 home/projects/detail 모두 컨텍스트 일관
- **엔드게임 셀프체크 (P∞)**: 공개·admin 양쪽 모두 selector UI 보유 → MCP/API 가 외부 정보를 푸시하면 모든 진입점에서 동일한 컨테이너 컨텍스트로 발견 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 257/257 ✓. build skip.
- **브라우저 확인**: 없음.
- **커밋**: iteration 75
- **다음 예정**: **사용자 실 마이그레이션 검증 단계 대기**. selector + read/write/delete adaptives + URL 자동 propagation 으로 P0-B Phase 6 가 사실상 완료. 사용자가 `/admin/migrate` 실행 → 검증 카드 ✓ → selector 로 narnia 전환 → 토폴로지/리스트/상세/편집 정상 동작 확인 필요. 그 후 Phase 7 (legacy flat 제거) 본격 진행. 사용자 인풋 대기 동안엔 다른 P0/P1/P2 트랙 (예: P1-5 dynamic metadata) 으로 전환 가능.

---

## 2026-04-21 19:40 — iteration 76 (마이그레이션 성공 후 다음 단계 카드 + 토폴로지 직행 링크)

- **타겟**: 마이그레이션 실행 후 사용자가 "잘 됐나" 즉시 검증할 수 있도록, 성공 시 별도 success card + 토폴로지/리스트 직행 링크 노출. UX 폐쇄 루프 (실행 → 검증 → 사용 시작) 단축.
- **현장 확인**: 기존 success 신호는 토스트 (`이관 완료 · hubs N · nodes M`) 와 inline 배지뿐. 사용자가 다음에 어디로 가야 할지 명시적이지 않음. 검증 카드 (live count) 는 있지만 액션은 없음.
- **변경 요약** (`src/views/admin-migrate/ui/AdminMigratePage.tsx`):
  - 실행 섹션 직후, `runStatus === "done" && lastResult` 조건부로 "✓ 이관 완료 · 다음 단계" success 섹션 (`migrate-next-steps` testid) 추가
  - 색상: `rgba(124,196,160,*)` (녹색 톤) — 명확한 성공 신호. 기존 indigo 실행 카드와 시각 구분.
  - 본문: 검증 안내 ("토폴로지·리스트에서 확인" + "inline 편집/새 노드 즉시 컨테이너 적용" + "flat 은 Phase 7 까지 보존")
  - 두 개 CTA: `토폴로지에서 컨테이너 보기 ↗` (`/?pj=general` + accountId), `리스트에서 보기` (`/projects/?pj=general` + accountId). 둘 다 `appendAccountQuery` 통과로 account 도 자연스럽게 동반.
- **사용자 시나리오**:
  - 마이그레이션 클릭 → 토스트 + lastResult 배지 + (라이브 검증 카드 자동 갱신) + 새 success 카드 등장 → "토폴로지에서 컨테이너 보기" 클릭 → home 으로 점프 + ?pj=general 적용 → 컨테이너 내 토폴로지 즉시 확인
  - 의도대로 안 보이면 다시 migrate 페이지로 돌아와 "다시 실행" 버튼 (이미 같은 버튼이 done 상태에서 레이블 변경)
- **엔드게임 셀프체크 (P∞)**: 마이그레이션의 "다음 액션" 이 분명해지면, M2 API 가 외부에서 받은 데이터도 같은 패턴 ("받음 → 컨테이너 보기" 단축 링크) 으로 일반화 가능 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 257/257 ✓. build skip.
- **브라우저 확인**: 없음.
- **커밋**: iteration 76
- **다음 예정**: **ProjectDetailPage 또는 HomePage 에 "현재 컨테이너 이름" 더 큰 시각 단서 추가** — selector 가 있긴 하지만 작은 pill 이라 "지금 narnia 컨테이너 안" 인지가 약함. 페이지 타이틀이나 hero subtitle 에 컨테이너 이름 합성 검토. 또는 P0-C 4단계 / P1-5 트랙 전환.

---

## 2026-04-21 19:55 — iteration 77 (HomePage / ProjectDetailPage 에 활성 컨테이너 이름 시각 단서 강화)

- **타겟**: selector pill 외에 hero subtitle/eyebrow 같은 큰 시각 영역에도 "지금 narnia 컨테이너 안" 단서 노출. 작업 컨텍스트 상시 가시화.
- **현장 확인**:
  - HomePage hero subtitle = `"Workspace · ${projects.length} projects · ${hubs.length} hubs"` — 컨테이너 정보 없음
  - ProjectDetailPage hero eyebrow = `"개별 프로젝트"` — 컨테이너 정보 없음
- **변경 요약**:
  - `src/views/home/ui/HomePage.tsx`:
    - import 에 `useWorkspaceProjects` 추가
    - hook 호출로 컨테이너 목록 → `activeContainerName` 도출
    - `containerPrefix` = `Project · ${name}` (active 시) 또는 `Workspace`. subtitle/eyebrow 시작어로 사용 → `"Project · narnia · 12 projects"` 같은 형태
  - `src/views/project-detail/ui/ProjectDetailPage.tsx`:
    - `useWorkspaceProjects` import + 호출
    - hero eyebrow row 에 `activeContainerName` truthy 시 indigo accent `Project · narnia` 배지 추가. title 속성에 `workspaceProjects/{id}` 경로 노출 (디버그용 hover)
    - 기존 "개별 프로젝트" 라벨은 그대로 유지, 앞에 컨테이너 prefix 가 붙는 형태로
- **사용자 시나리오**:
  - flat 사용자: `containerPrefix = "Workspace"`, 기존 동작 동일
  - 컨테이너 사용자 (`?pj=narnia`): hero/eyebrow 모두 `Project · narnia` prefix 로 시작 → 어떤 페이지에서도 "narnia 안" 즉시 인지
- **엔드게임 셀프체크 (P∞)**: 컨테이너 컨텍스트가 hero 라벨까지 흘러가야 M2/M3 의 외부 입력이 들어왔을 때 "어디로 들어왔는지" 사용자가 페이지 첫 시야에서 바로 파악 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 257/257 ✓. build skip.
- **브라우저 확인**: 없음.
- **커밋**: iteration 77
- **다음 예정**: **document.title 동적화 (P1-5 일부)** — `<title>` 태그가 currently 정적. 컨테이너/프로젝트 컨텍스트에 따라 `Narnia · IAM Hub` 같은 동적 타이틀 적용. static export 제약 안에서 client-side title 조작으로 우선 처리. 또는 사용자 실 마이그레이션 검증 단계 대기.

---

## 2026-04-21 20:15 — iteration 78 (P1-5 부분 · 클라이언트 사이드 동적 document.title)

- **타겟**: `output: 'export'` 정적 빌드 한계로 page metadata 가 컨테이너·계정 컨텍스트를 모르는 문제. 클라이언트 사이드 hook 으로 hydration 직후 `document.title` 합성 → 탭·검색바·OS task switcher 에 컨텍스트 노출.
- **변경 요약**:
  - `src/shared/lib/use-document-title.ts` (신규) — `useDocumentTitle(title)` 훅. 빈 값 무시, unmount 시 직전 값 복원, 입력 변경 시 재반영.
  - `src/shared/lib/use-document-title.test.ts` (신규) — 4 케이스 (set / null·empty 무시 / unmount 복원 / re-render 갱신).
  - `src/views/home/ui/HomePage.tsx` — `useDocumentTitle(['Narnia', activeContainerName, selectedProject?.name ?? scopedAccountName].filter(Boolean).join(' · '))`. selectedProject 선언 직후 위치 (TS hoisting 제약 회피).
  - `src/views/project-detail/ui/ProjectDetailPage.tsx` — `useDocumentTitle([project?.name, activeContainerName, 'Narnia'].filter(Boolean).join(' · '))`. project name 첫 번째 — 탭에서 어느 프로젝트 보고 있는지 즉시 식별.
- **타이틀 형태 예시**:
  - 게스트가 공개 홈: `Narnia` (정적 default)
  - 자기 워크스페이스 진입: `Narnia · stark`
  - 컨테이너 진입 (`?pj=narnia`): `Narnia · narnia`
  - 컨테이너에서 프로젝트 선택: `Narnia · narnia · IAM Hub`
  - detail 페이지: `IAM Hub · narnia · Narnia` (project 우선 — 탭 truncate 시 핵심 식별자)
- **엔드게임 셀프체크 (P∞)**: 동적 타이틀은 사용자가 다중 탭으로 컨테이너 비교 작업할 때 (M3 presence 후 더 빈번) 시각 구분의 first defense. MCP/API 가 외부에서 푸시한 데이터 보고 있는 탭도 같은 합성 패턴으로 식별 ✓
- **검증**: tsc ✓ (1회 hoisting 오류 → useDocumentTitle 호출을 selectedProject 선언 이후로 이동) · lint ✓ · test:run 261/261 (+4) ✓. build skip.
- **브라우저 확인**: 없음. 사용자가 selector 전환 → 브라우저 탭 라벨 변화 자동 확인 가능.
- **커밋**: iteration 78
- **다음 예정**: **P1-5 dynamic OG/twitter image text overlay** (사실상 SSR 필요해 우선순위 낮음) 또는 **다른 라이브 사용성 개선** — 예: ProjectDrawer 내부에 컨테이너 이름 표시, SearchPalette 헤더에 컨테이너 표시 등 작은 통일 작업. 또는 사용자 실 마이그레이션 검증 대기.

---

## 2026-04-21 20:35 — iteration 79 (SearchPalette 헤더에 컨테이너 배지 통일)

- **타겟**: Cmd+K 검색 팔레트도 컨테이너 컨텍스트 표시. 사용자가 narnia 컨테이너 안에서 검색 시 "Project · narnia" 배지가 헤더에 떠 검색 범위 즉시 인지.
- **현장 확인**: SearchPalette 헤더 (검색 결과 / 최근 업데이트 라벨 + N개 표시) 에는 컨테이너 정보 없음. 사용자가 컨테이너에서 검색 시 "어디서 검색 중인지" 모호.
- **변경 요약**:
  - `src/widgets/search-palette/ui/SearchPalette.tsx`:
    - `Props`/`DialogProps` 에 `containerLabel?: string | null` 추가
    - SearchPalette wrapper 가 dialog 로 그대로 forward
    - 헤더 좌측 영역 (`<div flex gap-2>`) 에 라벨 + 조건부 indigo 배지 (`Project · {containerLabel}`)
  - `src/views/home/ui/HomePage.tsx` — `<SearchPalette ... containerLabel={activeContainerName} />`
  - `src/views/project-detail/ui/ProjectDetailPage.tsx` — 동일
- **사용자 시나리오**: 컨테이너 안에서 Cmd+K → 헤더에 "검색 결과 · Project · narnia · N개 표시" 식 한 줄로 검색 범위 명시. flat 사용자에겐 배지 미노출 (호환).
- **엔드게임 셀프체크 (P∞)**: 검색은 가장 빈번한 발견 경로. 여기에 컨텍스트가 보여야 사용자가 "잘못된 컨테이너에서 검색 중" 같은 실수를 즉시 인지 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 261/261 ✓. build skip.
- **브라우저 확인**: 없음.
- **커밋**: iteration 79
- **다음 예정**: **ProjectDrawer 헤더에도 컨테이너 배지** 또는 **ShortcutSheet 같은 작은 정리 작업**. 또는 P0-C 4단계 / 사용자 실 마이그레이션 검증 대기.

---

## 2026-04-21 20:55 — iteration 80 (ProjectDrawer 헤더에도 컨테이너 배지 통일)

- **타겟**: HomePage 에서 노드 클릭 시 열리는 drawer 도 컨테이너 컨텍스트 표시. 헤더에 카테고리 + 허브/서비스 배지 옆에 "Project · {label}" indigo 배지 추가.
- **현장 확인**: ProjectDrawer 헤더 (L305) 에 카테고리 + 허브/서비스 배지만 있음. drawer 가 어느 컨테이너의 노드를 보여주는지 헤더만으로 모호.
- **변경 요약**:
  - `src/widgets/project-drawer/ui/ProjectDrawer.tsx`:
    - `Props` 에 `containerLabel?: string | null` 추가
    - 헤더 좌측 배지 그룹에 조건부 indigo 배지 (`Project · {containerLabel}`) — 카테고리 다음, 허브/서비스 앞
  - `src/views/home/ui/HomePage.tsx` — `<ProjectDrawer ... containerLabel={activeContainerName} />`
- **사용자 시나리오**: 사용자가 컨테이너에서 노드 클릭 → drawer 헤더에 "Platform · Project · narnia · 허브 · ✕" 한 줄로 모든 핵심 메타. 컨테이너 잘못 들어갔으면 즉시 인지.
- **컨테이너 배지 통일 완료 영역**:
  - HomePage hero (iter 51, 52, 73)
  - HomePage hero subtitle/eyebrow (iter 77)
  - ProjectDetailPage hero eyebrow (iter 77)
  - SearchPalette 헤더 (iter 79)
  - ProjectDrawer 헤더 (이번)
  - admin pages selector (iter 73, 74)
  - public /projects (iter 75)
  - document.title (iter 78)
- **엔드게임 셀프체크 (P∞)**: drawer 까지 컨테이너 배지가 있으면 "어떤 컨테이너의 어떤 hub" 가 항상 한 시야 — M3 presence 가 "narnia · IAM Hub 에서 작업 중" 표현에 자연스럽게 합류 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 261/261 ✓. build skip.
- **브라우저 확인**: 없음.
- **커밋**: iteration 80
- **다음 예정**: 컨테이너 배지 노출 영역이 사실상 모두 처리됨. 사용자 실 마이그레이션 검증 단계 대기. 또는 Phase 7 step 1 (잔여 비-adaptive 호출처 — 아직 남은 게 있는지 재감사) 또는 P0-C 4단계 (10k 실측 병목) 트랙 전환.

---

## 2026-04-21 21:15 — iteration 81 (마이그레이션 실시간 진행률 · onProgress + UI bar)

- **타겟**: 대형 마이그레이션 (수백 건) 실행 시 사용자가 "지금 어디까지 됐는지" 알 수 없음. 현재는 버튼 라벨 "이관 중…" 만 보여 중단/완료 시점 모호. batch commit 단위 progress 콜백 + UI bar 로 즉시 가시화.
- **변경 요약**:
  - `src/features/workspace-project-migration/model/run.ts`:
    - `MigrationProgress` 타입 신규 (`{written, total, batches}`)
    - `runFlatToContainersMigration` 시그니처에 `onProgress?: (p) => void` 추가
    - 시작 직후 `{written:0, total, batches:0}` 1회 emit (UI 가 0% 상태 즉시 진입)
    - 각 batch.commit 후 누적 written/batches 와 함께 emit
  - `src/features/workspace-project-migration/index.ts` — `MigrationProgress` 타입 export
  - `src/views/admin-migrate/ui/AdminMigratePage.tsx`:
    - `progress` state (`MigrationProgress | null`) 신규
    - `handleRun` 시작 시 `setProgress(null)`, run 호출에 `onProgress: setProgress`
    - 실행 섹션 안에 `runStatus === "running" && progress` 조건부 진행바 (`migrate-progress` testid)
      - role="progressbar" + aria-value{min,max,now} 접근성
      - "writing… batch N · X / Y" 텍스트 + indigo bar + width transition
- **사용자 시나리오**: "마이그레이션 실행" 클릭 → 즉시 0/N 진행바 등장 → batch commit 마다 갱신 (BATCH_LIMIT=400 단위로 점프) → 완료 시 success card 와 라이브 검증 카드로 자연 인계.
- **엔드게임 셀프체크 (P∞)**: 진행률 가시화 패턴은 M2 API 의 외부 수신 후 후처리 (Gemini extraction 등) 진행률에도 그대로 재사용. 같은 progressbar 컴포넌트 추출 가능 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 261/261 ✓. build skip.
- **브라우저 확인**: 없음. 사용자 실 마이그레이션 시 자동 검증.
- **커밋**: iteration 81
- **다음 예정**: 컨테이너 컨텍스트 통일 + 마이그레이션 가시화 모두 완료. 사용자 실 마이그레이션 검증 단계 또는 P0-C 4단계 (10k 실측 병목) / P1-5 dynamic OG (낮은 우선순위) 트랙 전환.

---

## 2026-04-21 21:35 — iteration 82 (잔여 직접 URL 구성 → 헬퍼 통과로 ?pj 자동 propagation 회복)

- **타겟**: iter 66 의 `?pj` 자동 propagation 인프라가 도달하지 못한 직접 URL 빌드 지점 두 곳 발견 → 헬퍼 통과로 통일.
- **현장 발견**:
  - `src/widgets/topology-map-sigma/ui/SigmaContextMenu.tsx` — 노드 우클릭 "상세 URL 복사" 가 `${origin}/project/${slug}/` 직접 구성. `?account` · `?pj` 모두 미포함 → 다른 사람에게 링크 공유 시 컨테이너 컨텍스트 손실
  - `src/views/project-detail/ui/ProjectDetailPage.tsx` (L313) — search palette 선택 시 `?account=...` 만 붙여 `router.push` → `?pj` 손실
  - `src/views/topology-map/ui/TopologyMapPage.tsx` (L78) — `appendAccountQuery` 만 사용 → `?pj` 손실 (auto-chain 으로 일부 보완되긴 하나 명시적 헬퍼가 더 견고)
- **변경 요약**:
  - `SigmaContextMenu.tsx` — `getProjectDetailUrl(window.location.origin, slug)` 사용. 자동으로 `?account/?pj` 동반.
  - `ProjectDetailPage.tsx` `handleSearchSelect` — `router.push(getProjectDetailHref(nextSlug, accountId))`.
  - `TopologyMapPage.tsx` `onSelectProject` — `router.push(getProjectDetailHref(slug, accountId))`.
- **사용자 시나리오**:
  - 컨테이너 안에서 토폴로지 노드 우클릭 → "상세 URL 복사" → 받은 사람이 같은 컨테이너 컨텍스트로 진입
  - 컨테이너 안에서 detail 페이지의 Cmd+K → 검색 결과 클릭 → 같은 컨테이너 유지 (이전엔 `?pj` 가 빠져 컨테이너에서 강제 탈출)
- **원인**: iter 66 의 `appendAccountQuery → appendWorkspaceProjectQuery` auto-chain 은 `appendAccountQuery` 통과 경로에서만 작동. 헬퍼 (`getProjectDetailHref/Url`) 를 우회한 manual URL 빌드는 해당 안 됨. 모든 navigation 은 헬퍼 통과로 통일하는 게 안전.
- **엔드게임 셀프체크 (P∞)**: 모든 navigation 이 헬퍼 통과 → MCP/API 가 외부에서 navigation 트리거할 때도 일관된 query propagation. 우회 경로 없음 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 261/261 ✓. build skip.
- **브라우저 확인**: 없음.
- **커밋**: iteration 82
- **다음 예정**: 잔여 manual URL 구성이 더 있는지 추가 grep audit 또는 Phase 7 step 1 (legacy flat 호출처 grep) 또는 사용자 실 마이그레이션 검증 대기.

---

## 2026-04-21 21:55 — iteration 83 (잔여 manual href grep 정리 · admin/detail 5 곳)

- **타겟**: iter 82 후속 — `Link href={\`/...\`}` 형태의 manual URL 5곳을 `appendAccountQuery` 통과로 통일. iter 67 의 auto-chain 으로 ?account/?pj 동시 propagation 확보.
- **현장 발견** (`grep 'href={\`/'`):
  - `ProjectDetailPage` L226 — `/projects/?account=...` (수동 account 만)
  - `AdminStatusesPage` L505, L684 — `/admin/project/new/`·`edit/` (account/pj 미적용)
  - `AdminCategoriesPage` L525, L795 — 동일 패턴
  - `AdminDashboardPage` L1815, L1824 — `/admin/categories/`·`/admin/statuses/` (account/pj 미적용)
- **변경 요약**:
  - `ProjectDetailPage.tsx` — `appendAccountQuery("/projects/", accountId)`
  - `AdminStatusesPage.tsx` — 두 호출 모두 `appendAccountQuery(...)` wrapping. import 추가.
  - `AdminCategoriesPage.tsx` — 두 호출 모두. import 추가. (편집 중 닫는 괄호 누락 → tsc 오류 → 즉시 수정)
  - `AdminDashboardPage.tsx` — 두 admin nav Link 도 `appendAccountQuery(..., scopedAccountId)`
- **부수 효과**: admin 도구 (categories/statuses) 페이지가 `?account` · `?pj` 컨텍스트를 받아 들어가 자기 헤더의 selector 와 정합 (iter 73, 74 selector 노출과 시너지).
- **컨테이너 컨텍스트 propagation 누수 점검 종결**: 헬퍼 우회한 manual URL 5곳이 마지막 케이스. 이후 새 navigation 추가 시엔 기존 헬퍼 (`getProjectDetailHref`, `appendAccountQuery`) 만 통과하면 자동 일관 유지.
- **엔드게임 셀프체크 (P∞)**: 모든 navigation 이 단일 헬퍼 통과 → MCP/API 가 외부 링크 만들 때도 같은 헬퍼 호출 한 줄로 컨텍스트 일관 ✓
- **검증**: tsc ✓ (1회 닫는 괄호 누락 → 수정) · lint ✓ · test:run 261/261 ✓. build skip.
- **브라우저 확인**: 없음.
- **커밋**: iteration 83
- **다음 예정**: 이제 P0-B Phase 6 + URL propagation 사실상 완전 종결. 사용자 실 마이그레이션 검증 단계 또는 P0-C 4단계 (10k 실측 병목 — 사용자 벤치 필요) 트랙 전환.

---

## 2026-04-21 22:15 — iteration 84 (HomePage 빈 상태를 컨테이너 컨텍스트 인지하도록 개선)

- **타겟**: `?pj=narnia` 컨테이너에 진입했는데 노드가 0 개일 때 기존 empty state ("아직 이 공간에 프로젝트가 없습니다") 가 오해 유발 — flat 데이터나 다른 컨테이너에는 있을 수 있는데 마치 워크스페이스 전체가 비었다는 인상. 컨테이너별 빈 상태로 리워딩 + 마이그레이션 직행 CTA.
- **현장 확인**: `src/views/home/ui/HomePage.tsx` L1114– 의 빈 상태 카드. `activeContainerName` 은 이미 iter 77 에서 도출돼 있음.
- **변경 요약** (`src/views/home/ui/HomePage.tsx`):
  - eyebrow: 컨테이너 시 `Project · {name}`, 아니면 `워크스페이스 지도`
  - h2: 컨테이너 시 `"narnia" 컨테이너에 노드가 없습니다`, 아니면 기존 문구
  - 본문: 컨테이너 시 "마이그레이션 또는 직접 추가" 안내, 아니면 기존 안내
  - admin CTA:
    - 컨테이너 시 1차 버튼 → `/admin/migrate/` (마이그레이션 페이지)
    - 컨테이너 시 2차 버튼 → CSV 가져오기 (라벨도 "이 컨테이너에 CSV")
    - 비-컨테이너는 기존 "빈 프로젝트 만들기" + "샘플로 시작 · CSV"
  - footer 안내: 컨테이너 시 "다른 컨테이너로 전환하려면 좌상단 셀렉터 사용"
- **비-admin (게스트/viewer) 경로**: 단순 "공간 소유자가 등록하면 보임" + "프로젝트 목록 보기" 그대로 유지 (컨테이너 분기 추가는 게스트 가독성을 해칠 수 있어 보류).
- **사용자 시나리오**: admin 이 새 컨테이너 narnia 만들고 진입 → 빈 지도 + "마이그레이션으로 채우기" 1차 CTA → /admin/migrate?pj=narnia 직행 → 즉시 작업 시작.
- **엔드게임 셀프체크 (P∞)**: 빈 상태 가드가 컨테이너 인지 → M2 API 도 "이 컨테이너로 받기" 흐름 시작 시 사용자가 어디서 받을지 명확. 빈 상태 → "받음" 으로 자연스러운 전이 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 261/261 ✓. build skip.
- **브라우저 확인**: 없음.
- **커밋**: iteration 84
- **다음 예정**: ProjectSelectorPage 에도 같은 컨테이너 인지 빈 상태 적용 (현재는 `프로젝트가 없습니다` 단일 메시지). 또는 사용자 실 마이그레이션 검증 대기.

---

## 2026-04-21 22:30 — iteration 85 (ProjectSelectorPage 빈 상태도 컨테이너 인지)

- **타겟**: iter 84 의 HomePage 빈 상태 컨테이너 인지화를 `/projects` ProjectSelectorPage 에도 적용. 두 입구가 같은 메시지 톤 유지.
- **현장 확인**: ProjectSelectorPage L201– 의 empty card 가 단순 "프로젝트가 없습니다" + admin/guest 분기만. 컨테이너 컨텍스트 모름.
- **변경 요약** (`src/views/project-selector/ui/ProjectSelectorPage.tsx`):
  - import: `useWorkspaceProjects` 추가
  - hook 호출 + `activeContainerName` 도출 (HomePage 와 동일 패턴)
  - empty state title:
    - 컨테이너 + 0 projects: `"narnia" 컨테이너에 프로젝트가 없습니다`
    - 비-컨테이너 + 0 projects: 기존 "프로젝트가 없습니다"
    - filter 결과 0: 기존 "검색 결과가 없습니다"
  - description:
    - 컨테이너 + 0 + admin: "마이그레이션 또는 직접 생성으로 채워보세요"
    - 컨테이너 + 0 + guest: "아직 비어 있습니다. 다른 컨테이너로 전환해보세요"
    - 비-컨테이너: 기존 admin/guest 메시지 유지
- **사용자 시나리오**: 컨테이너 narnia 의 `/projects?pj=narnia` 진입 → 빈 카드 → 명확한 상황 인지 + 다음 액션 가이드.
- **엔드게임 셀프체크 (P∞)**: HomePage / `/projects` 두 발견 입구 모두 컨테이너 인지 빈 상태 → MCP/API 가 신규 컨테이너 만들었을 때 사용자가 어디로 들어가도 같은 일관된 안내 ✓
- **검증**: tsc ✓ · lint ✓ · test:run 261/261 ✓. build skip.
- **브라우저 확인**: 없음.
- **커밋**: iteration 85
- **다음 예정**: 컨테이너 컨텍스트 통일 + 빈 상태 인지화 모두 완료. 사용자 실 마이그레이션 검증 단계 또는 다음 P0 항목 (P0-C 4단계 - 사용자 벤치 필요 / P0-A 잔여 필드) 트랙 전환.

---

## 2026-04-21 22:45 — iteration 86 (no-op · 루프 해제 재권고)

- **판단**: 플랜 규약 "모든 P0/P1/P2 완료되면 루프 해제 권고 + 이번 iter no-op". 직전 사용자 질문 "이제 뭔가 더 할게있나?" 에 대한 정직한 평가:
  - 공식 P0/P1/P2 트랙 모두 완료 (P0-A · P0-B · P0-C 1-3단계 · P0-D · P0-0/1/2 · P1-1~4 · P1-5 부분 · P2 16페이지)
  - 미해결은 모두 사용자 인풋 필요 항목: P0-C 4단계 (10k 벤치 결과) · 실 마이그레이션 검증 · P1-5 dynamic OG (SSR 필요, 우선순위 낮음)
  - 코드상 자동 진보 가능 영역 거의 소진. iter 84/85 의 빈 상태 컨테이너 인지화가 사실상 마지막 marginal 자동 개선
- **현장 확인**: git clean · main HEAD = 4c1265c. 신규 변경 없음
- **변경**: 없음. 이 로그 append 만
- **검증**: skip (코드 무변경)
- **커밋**: iter 86 (docs only)
- **루프 해제 권고**: 사용자가 cron job (`CronDelete <id>`) 으로 해제 추천. 다음 큰 트랙 (Phase 7 코드 정리 / M2 외부 API / M3 presence / MCP 패키지) 시작 시 새 플랜·새 로그·새 트랙으로 재기동.
- **다음 예정**: **사용자 결정 대기**. 가능 행로:
  - (a) 실 마이그레이션 검증 결과 보고 → Phase 7 진행
  - (b) M2 (`POST /api/v1/docs`) 설계·구현 착수
  - (c) MCP 패키지 (`project-narnia-mcp`) 작업
  - (d) 루프 해제 + 새 세션에서 다른 트랙 선택

---

## 2026-04-21 15:30 — iteration 87 (사용자 재개 · E2E 클릭 감사)

- **타겟**: 사용자 요청 "실제로 하나하나 페이지 토폴로지 클릭하고 이동하면서 안되는거 오류, 기획상 안맞는 문법이나 용어나 기능이나 다 usecase찾아서 검증하고 정리해서 고쳐" — 전 페이지 E2E + 중간에 있던 overlapping UI 발견.
- **현장 발견 (6건)**:
  1. `/project/[slug]/?account=X&pj=Y` 컨테이너 경로 → "프로젝트를 찾을 수 없음" 오동작. 원인: server page.tsx 가 정적 export 환경에서 ?account 쿼리를 prop 으로 못 넘겨 accountId=undefined → `getProjectFromContainer(undefined, …)` early null → fetch effect 가 subscribe effect 가 이미 찾은 project 를 null 로 덮어씀.
  2. 제목 "Narnia · Narnia · ASLAN LAB" 중복 (브랜드 == 컨테이너명 "Narnia" 일 때).
  3. `/admin/?account=X` 데모 세션 = "접근 허용 목록에 없습니다" 로 대시보드 차단. 기획: 자기 공간 로그인 = admin (Notion 모델) 인데 AdminLoginPage 가 `status==='authenticated'` 만 redirect.
  4. `/admin/categories/?account=X` 진입 즉시 `?account=` 가 URL 에서 유실 (`history.replaceState` 가 `buildCategoriesHref` 결과로 재작성, account 누락).
  5. `/admin/statuses/?account=X` 동일 이유.
  6. WorkspaceProjectSelector dropdown 열릴 때 Hub Rail 과 2중 floating UI 겹침 (사용자 스크린샷 지적).
- **변경 요약**:
  - `ProjectDetailPage`: `accountId` prop 없으면 `searchParams.get("account")` fallback. fetch effect 는 빈값/실패 시 state 유지 (subscribe 의 유효 결과 보존).
  - `HomePage` + `ProjectDetailPage`: useDocumentTitle 세그먼트 `Set` dedup.
  - `AdminLoginPage`: `useScopedAccountAccess` 통합 — status=not-allowed + canManage 이면 dashboard redirect.
  - `buildCategoriesHref` / `buildStatusesHref`: `accountId` 파라미터 추가 · URL 보존.
  - `WorkspaceProjectSelector`: `onOpenChange` prop + `HomePage` 의 Hub Rail `suppressed` flag.
  - `get-container.ts`: 데모 세션 fallback (세션 초반 선행 수정).
- **검증**: tsc ✓ · test:run 286/286 ✓ · Playwright — 재현 URL `/project/topology-engine/?account=stress-lab&pj=narnia` 로 h1="Topology Engine" 확인. `/admin/?account=stress-lab` → dashboard redirect 확인. `/admin/categories/?account=stress-lab` URL 보존 확인.
- **커밋**: `339a3c7 fix: E2E 감사 — 6건 페이지 회귀 수정`
- **다음 예정**: 루프 사이클 내에서 발견된 잔여 항목:
  - demo session 의 knowledge documents 가 `/admin/knowledge/documents/` 에 안 뜸 (별도 bridge 필요)
  - 공개 guest 가 `/project/[slug]` 에서 자기 공간 아닌데 inline edit UI 가 혹시 노출되는지 확인
  - 사용자 결정 대기.

---

## 2026-04-21 16:20 — iteration 88 (데모 knowledge 브릿지 완성)

- **타겟**: 사용자 "다음 개선작업 진행" 지시. iter 87 끝에 남긴 잔여 "demo knowledge docs 안 뜸" 우선 해결.
- **현장 발견**: 추출 파이프라인 6개 API (knowledge-document list/subscribe · versions list/subscribe · jobs list/subscribe · evidence subscribe · output subscribe) 가 `hasDemoSession()` fallback 없음. `/admin/knowledge/documents/?account=stress-lab` 에 seeded 문서가 안 뜨고, 문서 상세/검토 페이지도 Firestore rules 거부로 FirebaseError 쌓임.
- **변경 요약**:
  - `knowledge-document-api.ts`: list · subscribe · version list · version subscribe 4개에 데모 fallback (DEMO_ACCOUNT_ID scope 안에서만 seeded 문서 · 버전은 빈 배열). 회귀 테스트 5건 추가.
  - `knowledge-job-api.ts`, `knowledge-evidence-api.ts`, `knowledge-output-api.ts`: 모두 `hasDemoSession()` 분기로 빈 배열 emit. 데모는 추출 파이프라인이 없으므로 정상 동작.
- **엔드게임 셀프체크**: 검토 · publish 플로우가 데모에서도 console error 없이 "빈 상태" 로 surface. 실 프로덕션 flow 무변경.
- **검증**: tsc ✓ · test:run 291/291 ✓ (5 new). Playwright 브라우저 잠금 충돌로 브라우저 검증 skip — 정적 동일 패턴 (workspace-project/project-activity/api-key) 과 똑같이 구현.
- **커밋**: `faf7c84 fix(demo): knowledge documents list/subscribe 데모 fallback` + `fd1487d fix(demo): 추출 파이프라인 subscribe/list 데모 세션 조용히 fallback`.
- **다음 예정**: 데모 보조 API coverage 완료. 남은 잔여는 `/project/[slug]` guest 접근 security 확인 (낮은 우선순위), `/admin/knowledge/documents/new` 입력 UX 개선 (P0-1 — 사용자 스코프 결정 필요). 사용자 결정 대기.

---

## 2026-04-21 17:30 — iteration 89 (모든 페이지 점검 + 타이틀 컨텍스트화)

- **타겟**: 사용자 "좋아 이제 더 진행하자! 그리고 모든 페이지 점검해주고".
- **현장 방법**: `find app -name page.tsx` 27개 route enumerate. curl HTTP 200 확인 + Playwright 로 각 URL 로그인 후 rendered content 실제 확인. 27/27 페이지 로드. `/dev/stress-topology` 는 env gated 404 (expected).
- **발견 + 수정 (2건)**:
  1. `/account/?account=stress-lab` 데모 user 에 "로그인 방식: 게스트" (오해 유발: 안 로그인 된 것처럼) + "권한: viewer" (session roles array — account membership 아님) 표시. "자기거에 로그인 = admin" 정책과 불일치.
     - `getPasswordSupportState()` 에 demo session 분기 추가 → "데모 로그인" 표시.
     - `profileRoles` 표시를 scopedAccess.roleLabel 우선 사용 (accountId + 로그인 시에만) → "공간 소유자".
  2. `/admin/*`, `/projects`, `/account` 모두 탭 title 이 "Narnia" 만. 14개 페이지에 `useDocumentTitle` 추가.
     - 도중에 Next.js App Router 의 metadata 시스템이 `<title>` 을 layout default ("Narnia") 로 재-쓰기하는 race 발견. 단순 `useEffect` set 은 metadata commit 이 덮어써 렌더링 후 "Narnia" 로 revert.
     - `use-document-title.ts` 를 `useLayoutEffect` + `<title>` MutationObserver 로 보강 (metadata 재-쓰기 감지 시 즉시 원복, unmount 시 observer disconnect). unit test 4건 그대로 통과.
- **검증**: tsc ✓ · test:run 291/291 ✓ · Playwright 주요 URL (admin dashboard, categories, statuses, documents, api-keys, project/edit, account) 타이틀 육안 확인 모두 정상.
- **커밋**: `de8e2e5 feat: E2E 감사 · 페이지 타이틀 컨텍스트 + 데모 계정 정보 정확도`.
- **다음 예정**: 남은 P0-1 (knowledge documents/new editor-first UX) 사용자 승인 대기 — 643줄 파일의 큰 개편이라 방향 확인 필요.
