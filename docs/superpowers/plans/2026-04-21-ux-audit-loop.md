# UX 전면 감사 루프 — 페이지별 허들 제거

**시작일:** 2026-04-21
**현 상태 (2026-04-21 10:30):** 📍 종료 제안 — iteration 40 에서 P2 16페이지 순회 완결. 루프 해제 권고 대상.
**목적:** 모든 공개·어드민 페이지를 한 페이지씩 돌며 "5초 안에 뭐 하는지 알 수 있는가" · "막히는 곳이 있는가" 를 기준으로 사용성 결함을 뿌리 뽑는다. 내부 설계 (DB 스키마 · Firestore rules · 라우트) 는 **언제든 바꿀 수 있다**.

## 루프 종결 보고 (iteration 41 기준)

### ✅ 해결된 항목

| 트랙 | 항목 | 완료 iter |
|---|---|---|
| P0-0 | UI 용어 계층 rename (허브·서비스·워크스페이스 지도) | 5, 6, 11 |
| P0-1 | knowledge 문서 입력 editor-first 재구성 (템플릿 조건부, 제목 auto-fill, md 상단, 저장 세부 접이식) | 30–34 |
| P0-2 | 우측 "등록 전에 볼 것" 패널 단순화 | 31 |
| P0-A | 자기 공간 inline 편집 (이름·설명·의존·태그·스택·링크) | 12–19 |
| P0-C (부분) | 토폴로지 LOD + 10k 벤치 페이지 | 27, 28 |
| P0-D | 랜딩 대개조 (hero 토폴로지·카피·모션·로드맵 티저) | 7–10 |
| P1-1 | ProjectDrawer key 중복 | 0 |
| P1-2 | 첫 로딩 허브 centroid 자동 센터링 | 15 |
| P1-3 | 모바일 drawer peek 높이 | 16 |
| P1-4 | 키보드 nav 진입점 (Tab → 첫 허브) | 20 |
| P1-5 (부분) | keywords + og:siteName SEO 보강 | 21 |
| P2 | 16개 페이지 1회 순회 + a11y 표준화 (role="alert", --color-status-danger, aria-live) | 22–40 |

### ⏭ 미해결 · 다음 세션 과제

| 트랙 | 항목 | 이유 |
|---|---|---|
| **P0-B** | Project 컨테이너 entity 도입 (Workspace > Project > Hub > Node 4-layer) | Firestore 스키마 변경 + 마이그레이션 함수 + UI 대규모 재설계. 단일 iteration 범위 초과. 별도 설계 세션 필요. |
| **P0-C 4단계** | 10k 실측 병목 기반 추가 최적화 (physics alpha 가속 · edge cap · drag 중 simplified render) | 사용자가 `/dev/stress-topology` 에서 실제 벤치를 돌리고 병목 제보해야 대응 가능. |
| **P1-5 완결** | account-scoped 프로젝트의 dynamic metadata | `output: 'export'` 제약상 account 별 prerender 가 실무적으로 어려움. 별도 전략 (layout default 보강 · per-account route · runtime title patch 등) 논의 필요. |
| **P0-A 옵션** | owner / progress / icon 같은 잔여 필드 inline 편집 | 기존 Hero inline 편집 패널 3종 완성으로 Notion 모델 MVP 충족. 잔여 필드는 추가 가치보다 공간 부담이 커서 유예. |

### 루프 해제

- cron job `0c286b44` (매시 `:03,:13,:23,:33,:43,:53`). 사용자가 `CronDelete` 로 해제 권장.
- 세션 종료 시 자동 소멸 (durable:true 로 생성했지만 실제로는 session-only 로 기록됨).
- 추후 과제 재개 시 새 루프·새 md 로 시작 추천.

## 야심 (의사결정의 북극성)

**Obsidian · Notion 을 뛰어넘는 AI 시대 전용 개발·지식 하네스.**

### 최종 형태 (Endgame)

개발자가 IDE 에서 작업 중인 프로젝트의 `docs/` 를 수정·push 하면 (또는 Claude/Cursor MCP 가 업데이트 요청을 보내면) **실시간으로** 우리 서비스의 토폴로지에 반영되고, 그 노드에 "개발 진행 중 · 작업자 A" 표시가 뜬다. 팀원 전체가 **한 지도를 보면서 "누가 어디서 일하는지" 를 동시에** 본다.

이 세 축이 동시에 굴러가야 실현:

1. **수집 (ingestion)** — 3가지 경로
   - 사용자가 web UI 에서 문서 등록 (현재 이미)
   - 외부 클라이언트가 **HTTP API** 로 md 를 쏘면 자동 등록
   - IDE agent(Claude Code · Cursor) 가 **MCP** 로 연결해 양방향 read/write
2. **추출 & 연결 (extraction)** — Gemini adapter 가 이미 1차 구현. docs → nodes/edges 로 자동 변환.
3. **실시간 presence (live canvas)** — "이 노드를 지금 누가 작업 중" 상태를 토폴로지에 overlay. push 감지 시 그 경로가 흘러가는 애니메이션. 팀 채널 수준의 협업감.

### 경쟁 도구와의 차이

| 차원 | Obsidian | Notion | 우리 |
|---|---|---|---|
| 그래프 | 파일 기반, 로컬 | 페이지 트리 (그래프 X) | WebGL 물리, 10k+ 노드, 다층(Workspace > Project > Hub > Node) |
| 협업 | 플러그인 수준 | 블록 편집 동시성 | 실시간 presence + 코드 push 흘림 |
| AI 통합 | 보조 플러그인 | Notion AI (요약 정도) | 추출·연결·리뷰가 파이프라인의 1급 시민 |
| 개발 도구 연동 | X | API 일부 | MCP + API + webhook (엔드게임) |
| 가격 이점 | 로컬 | 요금 비쌈 | Firestore + Functions 스케일, Gemini 비용 효율 |

> 모든 결정은 "Obsidian/Notion 이라면 이 마찰을 용납했을까?" + "엔드게임 (실시간 코드→지도) 로 가는 경로에서 이 변경은 가속인가 감속인가?" 를 물어 기각·채택한다.

### 로드맵 마일스톤

| 단계 | 목표 | 상태 |
|---|---|---|
| **M0** | 정적 토폴로지 + 수동 편집 + 기본 권한 | 거의 완료 (유저=owner 모델 완성) |
| **M1** | UX 허들 전면 제거 + 용어 계층화 + 10k 성능 + inline 편집 | **현재 진행 (이 루프)** |
| **M2** | 외부 HTTP API (`POST /api/v1/docs`) 로 md 수신 → 자동 extraction → 토폴로지 반영 | 설계 착수 대기 |
| **M3** | MCP 서버 (`project-narnia-mcp`) — Claude Code · Cursor 에서 tool 로 호출 가능 | M2 이후 |
| **M4** | 실시간 presence — "작업 중" 상태 필드 + 팀 현재 위치 overlay | M3 이후 |
| **M5** | GitHub/GitLab webhook — push 이벤트로 해당 경로의 노드가 "방금 업데이트" 펄스 | M4 이후 |

M0–M1 은 제품 쓸 만하게 만드는 토대. M2 부터가 **"AI 시대 전용 하네스"** 진짜 차별점.

---

## 핵심 철학 (최우선 — 모든 결정의 기준)

### 0. UI/UX 가 가장 중요하다 (철학)

> **"사용하기 쉬워야 한다. 어려운 제품을 만들어서는 안 된다."**

- 기능 추가·기술 선택·문구 한 줄까지 **"이게 쉬워졌나"** 를 1차 기준.
- 사용자가 "이게 뭐지?" 하는 순간이 발생하면 그 자체가 버그다.
- 설명이 필요하면 **설명을 없애는 방향** 으로 재설계. 툴팁·긴 가이드는 실패의 증거.
- 힘든 제품 < 쉬운 제품. 단순 < 복잡 (같은 효과라면).
- 이 철학은 야심·엔드게임보다 **우선** 한다. 화려한 기능도 쉽지 않으면 보류.


### 1. 유저 = 자기 페이지의 주인 (Notion / Obsidian 모델)

| 시나리오 | 기대 동작 |
|---|---|
| 로그인 유저가 **자기 공간** 을 봄 | 모든 화면에서 즉시 inline 편집 · 추가 · 삭제. `/admin/*` 경유 불필요. |
| 로그인 유저가 **타 공간** 을 봄 | 읽기 전용. 초대·멤버십 있을 때만 편집 가능. |
| 비로그인 게스트가 **공개 공간** 을 봄 | 읽기 전용. |

현재 분리 (`/project/[slug]` read-only vs `/admin/project/edit` edit) 를 **하나의 화면, 권한에 따른 inline 편집** 으로 통합한다.

### 2. UX 품질 바 — 최고 수준

- 모든 액션에 부드러운 motion (framer-motion, easing `cubicInOut`, 180–360ms)
- 키보드 흐름이 어디서도 끊기지 않음 (Tab · Enter · Esc · Cmd+K 항상 동작)
- hover · focus · loading · empty · error 마이크로 인터랙션 세심
- **`docs/DESIGN-SYSTEM.md` 를 매 iteration 시작 시 훑고 위반하지 않는지 확인**

### 3. 성능 바 — 10,000 노드까지 렉 없음

Sigma WebGL 은 5k+ 에서 이미 느려짐. Lazy loading 전략 필수:
- 초기 로드: 허브만 (hundreds → tens)
- 허브 클릭 시 해당 허브의 하위 노드를 onSnapshot 으로 lazy load
- 검색/필터는 Firestore 인덱스 기반 서버 쿼리
- 비허브 노드는 zoom 기반 LOD (level of detail) — 멀리선 점, 가까이선 라벨
- physics · tick 은 visible viewport 안의 노드만

### 4. 용어 계층 (현재 혼란의 근본 원인)

```
Workspace  (= Account)
  └── Project  (container, 워크스페이스 당 수백 개)
       └── Hub  (major system, 프로젝트 당 수백 개)
            └── Node  (구성 요소, 허브에 연결)
```

현재 코드: 모든 것이 `projects` 컬렉션의 row, `isHub` flag 로 허브 구분. "프로젝트" 라는 단일 단어가 **전체 지도 · 허브 노드 · 일반 노드** 세 개의 서로 다른 개념을 가리켜 혼란 극심.

**재정의 순서 (iteration 여러 번에 쪼갬):**
1. **용어만 먼저 분리** (UI rename): 현재 `isHub=true` → "허브", `isHub=false` → "서비스". 전체 지도는 "워크스페이스 지도"
2. **`Project` 컨테이너 entity 추가**: 기본 "General" Project 1개에 기존 데이터 이관. 스키마: `accounts/{accountId}/projects/{projectId}` (진짜 프로젝트 컨테이너)
3. **Project 별 토폴로지 화면**: 워크스페이스 홈 → 프로젝트 리스트 → 프로젝트 선택 → 그 안의 허브·노드 지도
4. **Lazy loading 성능 튜닝**: 3단계 hierarchy 에 맞춰 단계별 로드

---

---

## 0. 매 iteration 시작 전 체크리스트

1. **진행 로그 읽기:** `docs/superpowers/notes/2026-04-21-ux-audit-log.md`
   - 직전 iteration 무엇을 했고 어디까지 왔는지.
   - "다음 예정" 섹션이 있으면 그걸 이어감.
2. **git 상태 확인:** `git status` clean, 브랜치 main 위. 직전 커밋 로그 1~3개 훑어서 맥락 동기화.
3. **서버 기동 가정:** dev 서버는 사용자가 돌리는 중. 필요하면 `pnpm dev` 배경 실행 (이미 돌고 있으면 중복 금지).
4. **이번 iteration 범위 선언:** 1 iteration = **1~2개 작은 개선**. 대규모 리팩토는 여러 iteration 에 쪼갠다.

---

## 1. 프로세스 (엄격 준수)

순서대로:

1. **타겟 선택** (아래 우선순위 리스트 최상단 + 사용자가 지적한 새 이슈)
2. **현장 확인** — 가능하면 Playwright MCP 로 브라우저 열어 실제 화면 스냅샷. 불가능하면 소스만 읽고 추론은 *최소화*
3. **구체화** — 문제를 한 문장으로 요약, 원인 파일·라인 특정
4. **계획** — 3줄 내외. "무엇을 → 어디서 → 왜"
5. **구현** — 최소 변경. 관련 없는 리팩토 금지.
6. **검증** — `pnpm exec tsc --noEmit && pnpm lint && pnpm test:run && pnpm build` 전부 통과. 하나라도 실패면 같은 iteration 안에서 수정.
7. **진행 로그 업데이트** — 아래 템플릿으로
8. **커밋** — `feat|fix|refactor: <한글 제목>` + 상세 본문. 1 iteration = 1 커밋 (예외: 여러 작은 수정이 한 목적이면 묶음 OK).
9. **푸시** — `git push origin main`. iteration 끝에 항상 실행해 백업·공유. push 실패 시 원인 기록하고 사용자에게 보고 (예: 인증 만료, non-fast-forward).

---

## 2. 우선순위 리스트 (감가상각하는 todo)

### P0 — 사용성이 붕괴된 곳 (즉각)

- [ ] **P0-D · 랜딩(`/`) 대개조 — 제품을 보여주는 hero**
  - 현재 상태: `src/views/landing/ui/LandingPage.tsx` 에 "big text + info cards" 전통 구조. 사용자 평: "구려 · AI 느낌 안 남 · 트렌디 아님".
  - 목표: **토폴로지가 주인공인 hero**. 접속 즉시 살아있는 지도(demo seed 기반 수십개 노드가 천천히 drift) 가 배경처럼 흐르고 그 위에 bold 카피 + CTA. Linear/Vercel/Raycast/Cursor 의 product-first 랜딩 패턴.
  - 리퍼런스 (코드 읽기 전 1~2개 브라우저 탐방 권장):
    - linear.app — 절제된 다크, subtle indigo grain, smooth reveal
    - vercel.com — 두꺼운 display 타이포 + dark mesh
    - cursor.sh — hero 에 실제 IDE 스크린 인라인
    - resend.com / supabase.com — 제품 dashboard 를 히어로에
    - raycast.com — 어두운 배경 · 소프트 그라디언트 · 키보드 데모
  - 금지: 보라→핑크 gradient, scale hover, 컬러 pulse. 우리 토큰(무채색 + 단일 인디고) 유지. 다크 배경 + 아주 미세한 indigo radial + dot grid 정도까지.
  - 섹션 구조 (제안):
    1. **Hero** — 좌측 bold 카피 "AI 시대의 프로젝트 지도" + primary CTA "내 워크스페이스 만들기", 우측 (또는 배경) 에 SigmaTopology minimal mode 로 30~50개 샘플 노드 자동 drift. 클릭 불필요, 시선만 끌게.
    2. **What (2~3 screenshot + caption)** — 실제 제품 미니 컷. 허브 지도, 상세 편집, knowledge 추출 결과.
    3. **How it works** — 3~4 단계 (지금 있는 섹션 유지·업그레이드).
    4. **Why now (AI-native)** — "MD 를 쓰면 지도가 자란다" 는 약속을 1줄로 재강조 + Gemini · MCP 로드맵 티저.
    5. **CTA 바닥** — "지금 내 공간 만들기" primary, "데모 둘러보기" secondary.
  - 모션:
    - framer-motion `whileInView` 로 섹션별 페이드/약간의 y-offset (30px) ease-out.
    - hero 토폴로지는 기존 SigmaTopology minimal + 아주 느린 physics alpha 로 자연 drift.
    - 스크롤 기반 parallax 는 1~2 레이어만 (과하게 X).
  - 성능:
    - hero 토폴로지는 demo_seed.json (20~40 노드) 로 고정. 유저 데이터 로드하지 않음.
    - SSR 시 정적 placeholder, hydrate 후 Sigma 켜짐.
  - 엔드게임 정렬(P∞): 랜딩에서 M2(API)·M3(MCP) 티저를 "Coming soon · 개발 중 프로젝트에서 MCP 로 바로 쏴 올리기" 카드로 미리 심어두면 좋음.
  - iteration 쪼개기:
    - **(a) hero 토폴로지 배경 교체** — SigmaTopology 를 landing 에 import, demo seed 로 drift. 텍스트 레이어는 기존 유지.
    - **(b) 카피·CTA 재설계** — "AI 시대의 프로젝트 지도" · 미니멀 톤 카피.
    - **(c) 섹션 모션** — whileInView 페이드·y-offset.
    - **(d) 실제 제품 스크린샷 섹션** — 토폴로지 / 상세 / knowledge 3장.
    - **(e) 로드맵 티저** — M2/M3 carousel.
  - 성공 기준: 랜딩만 봐도 "뭐 하는 서비스인지" 5초 안 알 수 있고, Linear 수준의 "깔끔·세련" 인상.

- [ ] **P0-0 · 용어 계층 1단계 (UI rename)** — 현재 "프로젝트" 중의적 사용 해소
  - 코드: `isHub=true` 읽는 지점 전부 "허브" 라벨 사용. `isHub=false` 는 "서비스" (또는 "구성 요소").
  - 전체 지도 = "워크스페이스 지도". 상세 detail 헤더에 "허브" / "서비스" 배지 확실히 표시.
  - DB 는 손대지 않음. 터미놀로지만.
  - 파일: `src/widgets/project-drawer/**`, `src/views/home/**`, `src/views/project-detail/**`, `src/entities/project/ui/**`.

- [ ] **P0-A · 자기 공간 inline 편집 (Notion 모델)** — `/project/[slug]` 에서 owner 는 바로 편집
  - 현재: public `/project/[slug]` read-only, admin `/admin/project/edit?slug=...` edit. 분리된 경험.
  - 목표: 로그인 유저가 자기 accountId 의 프로젝트를 보면 제목/설명/의존성/태그 등 inline-editable. 저장 버튼 대신 blur 시 auto-save 또는 debounce save. 타 공간 보면 기존 read-only 유지.
  - 구현: `useScopedAccountAccess` 로 role 확인 → `canEditProject` 이면 컴포넌트를 EditableField 로 swap. contenteditable 또는 input 전환.
  - iteration 쪼개기: (a) Hero 영역 제목·설명 inline → (b) Dependencies picker inline → (c) Tags · stack · links inline → (d) Delete 버튼.

- [ ] **P0-B · Project 컨테이너 entity 도입** (DB 스키마 추가)
  - 새 entity `src/entities/workspace-project/` — 진짜 "프로젝트 컨테이너". 현재 `project` 는 "허브/서비스" 레벨로 격하.
  - Firestore: `accounts/{accountId}/projects/{projectId}` 는 유지하되 의미를 "컨테이너" 로. 하위에 `accounts/{accountId}/projects/{projectId}/hubs/{hubId}` 컬렉션 추가.
  - 마이그레이션: 기존 projects 전체를 기본 "General" 컨테이너 1개 아래로 묶는 함수 (admin 전용 one-shot).
  - rules 갱신 필요 (deploy 는 사용자가 직접).
  - **iteration 여러 번 필수.** 선행 조건으로 P0-0 완료.

- [ ] **P0-C · 토폴로지 성능 — 10k 노드 지원**
  - 현재: `SigmaTopology` 가 모든 projects 를 한 번에 graph 에 투입. 500+ 에서 settle 느림.
  - 단계 1: 초기 graph 에 `isHub=true` 만 포함. 비허브는 허브 hover/click 시 onSnapshot 으로 lazy 로드해 graph 에 추가.
  - 단계 2: Sigma 의 LOD — ratio > X 에서 비허브 노드·엣지 hidden.
  - 단계 3: Firestore 쿼리 pagination · where(isHub == true) 인덱스 활용.
  - **성능 benchmark**: synthProjects=1k, 3k, 10k 단계로 `/dev/stress-topology` 에 toggle 추가해 FPS 측정.

- [ ] **P0-1 · `/admin/knowledge/documents/new/`** 입력 허들
  - 현재: 템플릿(3종) · 제목 · 연결 프로젝트(검색+칩) · 유형 select · md 파일 업로드/붙여넣기 + 우측 패널 "등록 전에 볼 것"(충돌 n개 · 메타 비교 / 입력 규칙 / 원문) — 한 화면 밀도 과다.
  - 목표: **Obsidian 같은 단일 큰 md editor** 가 기본. 제목도 md 첫 줄 (`# Title`) 에서 추출. 연결 프로젝트는 URL 의 `?project=` 또는 frontmatter 에서 자동 주입. "고급 옵션" 토글로만 프로젝트 재지정 · 템플릿 · 수동 메타 입력 열리도록.
  - 저장 흐름: frontmatter 없으면 저장 시 자동 생성 (title / projectIds / kind 기본 "note"). 저장 버튼 1개.
  - 스키마: 현재 `knowledgeDocuments` 에 저장되는 필드 유지. 다만 입력 UX 만 단순화.
  - 1 iteration 에 못 끝나면 "edit-first layout" → "frontmatter 자동 보정" → "고급 토글" → "기존 필드 제거" 로 쪼갠다.

- [ ] **P0-2 · `/admin/knowledge/documents/new/` 우측 "등록 전에 볼 것" 패널**
  - 현재: "문서 유형 spec / 연결 프로젝트 1개 / 상단 메타 포함됨 / 충돌 1개" + "메타 비교 보기 / 입력 규칙 보기 / 상단 메타 원문 보기" 버튼 3개 → 뭘 하라는 패널인지 첫 방문자 못 알아봄.
  - 목표: P0-1 통합 과정에서 흡수. 저장 직전에만 "이 내용으로 저장해도 될까요?" diff 팝오버로 제시. 상시 노출 X.

### P1 — 버그 · 경고 · 끊김

- [x] **P1-1 · ProjectDrawer links duplicate key** — 2026-04-21 해결됨 (commit 직전). 루프 시작.
- [ ] **P1-2 · 토폴로지 스크롤/줌 첫 로딩 포지션** — main `/` 첫 진입 시 허브가 화면 밖으로 치우치는 케이스. 로딩 후 자동 fit-to-view 강제.
- [ ] **P1-3 · 모바일(≤640px) 가로 사이즈 회귀** — 현재 canvas 영역에 drawer 열리면 거의 전체 덮음. drawer 를 full-screen modal 로.
- [ ] **P1-4 · 토폴로지 키보드 nav** — selectedSlug 없을 때 Tab 이 아무 것도 안 함. 안내 또는 첫 허브 자동 포커스.
- [ ] **P1-5 · SEO metadata** — 상세 페이지 `generateMetadata` 가 account-scoped 에선 기본값만 뜸. 프로젝트 이름/설명을 메타로.

### P∞ — 엔드게임 정렬 체크 (매 iteration 1번 물어봄)

루프 iteration 마다 변경 직전에 **한 문장** 으로 셀프체크:

> "이 변경이 M2(HTTP API) · M3(MCP) · M4(presence) · M5(webhook) 로 가는 길을 막지 않는가?"

예시 충돌 케이스:
- `projectSlug` 를 URL-escape 전제로 쓰면 API POST body 규약이 꼬일 수 있음 → slug 는 항상 canonical 규칙.
- `accounts/{accountId}/projects/{slug}` 에 client-side 만 쓰는 필드 누적하면 API contract 가 불명확해짐 → 프로젝트 스키마에 `source: "web" | "api" | "mcp"` 같은 프로비넌스 필드 미리 예약.
- 실시간 presence 를 Firestore 로 할지 Realtime DB 로 할지 — 지금 Firestore 에 `activeEdits/{docId}_{uid}` 같은 경량 컬렉션 자리만 예약해두면 migration 비용 줄어듦.

충돌 발견 시: 해당 iteration 에서는 "지금 건드리는 범위 안에서만" 수정하고, 엔드게임용 수정은 다음 마일스톤 전 스프린트에 계획.

### P2 — 전체 페이지 순회 (한 번씩 훑기)

각 페이지 방문 → 3개 미만의 개선 포인트 도출 → 그 중 당장 할 것만 이번 iteration 처리.

- [ ] `/login`, `/signup`, `/reset-password` — "에러 시 다음 단계 명확?"
- [ ] `/` (공개 홈) — 첫 방문자 "여기서 뭐 하지?"
- [ ] `/projects` — 로그인 후 프로젝트 선택
- [ ] `/project/[slug]` — 상세 + 미니 토폴로지
- [ ] `/admin/dashboard` — 랜딩 숫자 카드 · issue 필터 흐름
- [ ] `/admin/project/new`, `/admin/project/edit` — form 섹션 순서 · 필수/선택 구분
- [ ] `/admin/project/import` — 샘플 / CSV 라우트
- [ ] `/admin/insights` — stale/orphan/promotion + activity
- [ ] `/admin/categories`, `/admin/statuses` — 선택/편집 흐름
- [ ] `/admin/knowledge/documents` 리스트 → detail
- [ ] `/admin/knowledge/review` — 검토 워크스페이스
- [ ] `/admin/dev-login` — dev 전용 안내

각 페이지마다 체크 기준:

1. 첫 5초에 "무엇을 하라는 화면인지" 헤더만 보고 알 수 있나?
2. 첫 행동이 무엇인지 시각적으로 분명하나 (primary CTA)?
3. 필수 vs 선택 입력이 시각적으로 구분되나?
4. 에러/빈 상태가 "왜, 다음엔 뭘" 을 답하나?
5. 모바일(사이드/가로 500px) 에서도 조작 가능한가?
6. 뒤로가기 / Esc / Cmd+K 가 제자리에서 동작하나?

---

## 3. 제약 (위반하면 안 됨)

- **디자인 시스템 엄수**: 매 iteration 시작 시 `docs/DESIGN-SYSTEM.md` 를 훑는다. 위반 시 기술부채.
  - 무채색 + 단일 인디고(#5e6ad2). glow pulse · scale hover · 움직이는 gradient · 쉐도우 과잉 전부 금지 (CLAUDE.md §11).
  - Linear 베이스 톤. shadcn/radix 느낌 X.
- **모션 품질**: framer-motion 이미 dependency. easing `cubicInOut`, duration 180–360ms. 최고 수준 smoothness 목표.
- **정적 export 유지**: `output: 'export'` 는 그대로. 서버 런타임 전제 금지. 새 라우트는 Suspense wrap.
- **공개/비공개 경계**: 공개 페이지는 `knowledgeDocuments`/`reviews`/extraction 후보 건드리지 않음. 공개는 `knowledgePublicNodes`/`knowledgePublicEdges` 만.
- **라벨 용어**:
  - "관리자" 사용 금지 ("소유자", "내 공간", "편집").
  - "프로젝트" 중의적 사용 금지. 워크스페이스 지도 / 컨테이너 프로젝트 / 허브 / 서비스 로 분리.
  - **제품명은 "Narnia"**. 사용자 대면 문구·패키지·도메인은 narnia 로 통일.
    (저장소명 `project-map` 는 내부 코드 레퍼런스로만 유지. 외부 노출 X.)
    예: MCP 패키지 = `project-narnia-mcp`, API base = `narnia.dev` 또는 `api.narnia.dev`.
- **리팩토 자제**: 루프 외부에서 요청된 내용이 아닌 "코드가 지저분해 보여서" 는 건드리지 않음.
- **성능 회귀 금지**: topology 관련 변경은 노드 500 기준 initial render 2s 이내 유지. 더 느려지면 revert 또는 fix 포함.

---

## 4. 아키텍처 자유도 (사용자 명시 허가)

> "내부 설계는 언제든지 변경해도 되니까 db구조도 말야"
> 루프 에이전트는 최고의 UX 를 위해 **스키마·rules·라우트·엔티티 모두 자유롭게 교체** 가능.

- **Firestore 스키마 변경 가능.** 필요 시 마이그레이션 경로 기록 (로그 md 에). one-shot admin 함수 작성 OK.
- **Rules 변경 가능.** 수정 시 `firestore.rules` + 로그에 "사용자가 `firebase deploy --only firestore:rules` 실행 필요" 명시.
- **라우트 URL 변경 가능.** 구 URL 은 Suspense client redirect 로 유지 (`/map → /`, `/project/view → /project/[slug]` 패턴).
- **엔티티 재구성 가능.** 단, export 인터페이스 바꿀 때 호출처 전부 업데이트.
- **새 의존성 도입 허용 (motion/editor 계열)** — framer-motion, tiptap, @codemirror, lexical 등 Obsidian/Notion 급 편집기 구현에 필요한 라이브러리는 도입 OK. 단 repo 철학(무채색 · 인디고) 에 맞게 스타일 override.

---

## 5. 이번 iteration 종료 조건

- P0 전체 (P0-0 / P0-A / P0-B / P0-C / P0-1 / P0-2) 모두 해결.
  - P0-A · P0-B · P0-C 는 각각 여러 iteration 으로 쪼갬.
  - P0-B 의 마이그레이션은 사용자 승인 필요 (rules 배포 요청 포함).
- P1 5개 모두 해결
- P2 12개 페이지 모두 한 번씩 순회 (각 페이지에서 최소 1개 개선 또는 "현재 OK" 확정)

전부 끝나면 이 md 에 "✅ 2026-MM-DD 완료" 만 표기하고 루프 해제 요청.

---

## 6. 진행 로그 템플릿

매 iteration 끝에 `docs/superpowers/notes/2026-04-21-ux-audit-log.md` 하단에 append:

```markdown
## 2026-04-21 HH:MM — iteration N

- **타겟**: [페이지·기능]
- **현장 발견**: ...
- **변경 요약**: ...
- **커밋**: <sha short>
- **검증**: tsc ✓ · lint ✓ · test N/N · build ✓
- **다음 예정**: ...
```

이 로그를 다음 iteration 의 context 로 재사용.

---

## 7. 한 iteration 에 하면 안 되는 것

- 여러 P0 를 동시에 건드리기
- 검증 전 커밋
- "김에" 하는 리팩토
- 디자인 토큰 밖의 색 추가
- 사용자에게 "확인해달라" 없이 rules 배포·프로덕션 환경 조작 (`firebase deploy` 는 사용자 직접)
- push 실패 시 `--force` 로 덮어쓰기 (사용자 확인 필수)

---

## 8. 현재까지 완료된 선행 작업 (맥락)

- Phase A 온보딩 (빈 워크스페이스 CTA · CSV · 샘플)
- Phase B 활동 로그 (accounts/{id}/projectActivity)
- 유저 = 자기 공간 owner 재설계 (ensureOwnWorkspace · rules · AdminGuard 확장)
- Gemini extraction adapter (functions/extract-gemini.js)
- 토폴로지 focus·hover 인디고 pill · 허브 크기 · audit overlay
- 상세 페이지 미니 토폴로지 정렬 버튼 · 라벨 · 클릭 이동

이 위에서 "실사용자 여정 허들" 을 뽑는 감사 루프가 시작된다.
