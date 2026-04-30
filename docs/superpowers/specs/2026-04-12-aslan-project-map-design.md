# Aslan Project Map — 설계 문서

**작성일**: 2026-04-12
**작성자**: 진안 + Claude (협업 브레인스토밍)
**상태**: 갱신됨 (현재 구현 기준 반영)
**버전**: 2.0

---

## 1. 개요

> 2026-04-18 기준 이 문서는 초기 `공개 시스템 포트폴리오` 전제를 넘어, 현재 구현된 `작업 공간 + 문서 기반 온톨로지 + 공개 화면 owner 편집` 모델을 반영한다.

### 1.1 무엇을 만드는가

**Aslan Project Map**은 Markdown 문서를 바탕으로 프로젝트별 온톨로지를 키우고, 작업 공간 전체를 한 장의 인터랙티브 지도로 읽는 공개 웹 서비스다. 방문자는 누구나 공개 화면을 읽을 수 있고, owner/editor는 같은 공개 화면에서 바로 프로젝트와 문서를 수정할 수 있다.

### 1.2 왜 만드는가

- **문서에서 자라는 지도**: 기획자, PM, builder, 운영자가 이미 쓰는 Markdown 문서를 그대로 프로젝트 연결 근거로 사용한다.
- **작업 공간 단위 가시화**: 한 작업 공간 안의 모든 프로젝트를 전체 지도에서 묶어 보고, 각 프로젝트 내부는 문서·영역·노드로 더 깊게 읽을 수 있어야 한다.
- **공개와 편집의 거리 축소**: owner/editor는 공개 화면을 보다가 바로 수정하고, 결과를 같은 자리에서 확인할 수 있어야 한다.

### 1.3 성공 기준

1. 공개 URL에 접속하면 **3초 이내**에 전체 지도나 프로젝트 상세가 렌더되고 부드럽게 인터랙션 가능
2. 작업 공간 안에서 `전체 지도 → 프로젝트 목록 → 개별 프로젝트` 구분이 UI만 봐도 즉시 이해됨
3. owner/editor는 공개 화면에서 `프로젝트 정보 수정`과 `문서 추가`를 바로 시작할 수 있음
4. 문서 등록 뒤 `추출 → 연결 검토 → 공개 반영` 최소 루프가 실제로 동작함
5. 디자인이 **"AI가 찍어낸 느낌"을 주지 않음**
6. 구조·컨벤션·권한 모델이 `docs/`에 문서화되어 이후 변경 시 기준점 역할을 함

### 1.4 Non-Goals

- 실시간 다중 사용자 동시 편집
- 범용 문서 위키나 채팅 제품
- Slack/Discord/알림 중심의 외부 통합
- 다국어 지원
- 무제한 커스텀 데이터 스키마

### 1.5 핵심 도메인 모델

- **작업 공간(Account / Workspace)**: 데이터와 권한의 최상위 묶음
- **전체 지도**: 작업 공간 안의 모든 프로젝트를 묶어 보는 공개 화면
- **프로젝트 목록**: 프로젝트를 고르고 시작하는 허브
- **개별 프로젝트**: 특정 프로젝트를 문서와 연결 이유 중심으로 읽는 화면
- **프로젝트 내부**: 영역, 노드, 관련 문서가 프로젝트를 설명하는 층위
- **문서 운영**: 문서 등록, 버전 업로드, 추출, 연결 검토, 공개 반영

이 문서 이후의 모든 화면/버튼 용어는 위 모델을 따라야 한다. 예를 들어 프로젝트 안에서는 `새 프로젝트`가 아니라 `문서 추가`, `노드 추가`, `영역 추가`, `프로젝트 정보 수정`이 자연스러운 액션이다.

---

## 2. 아키텍처 개요

### 2.1 전체 구조

```
┌───────────────────────────────────────────────────────┐
│ Next.js 정적 빌드 (output: 'export')                 │
│ ├─ /                     전체 지도                    │
│ ├─ /projects             프로젝트 목록               │
│ ├─ /project/view         개별 프로젝트               │
│ ├─ /login, /signup       공개 사용자 인증            │
│ └─ /admin*               운영 도구                   │
└───────────────────────────────────────────────────────┘
                   ↓ Firebase Web SDK
┌───────────────────────────────────────────────────────┐
│ Firebase                                              │
│ ├─ Firestore  (global + account scoped data)          │
│ ├─ Storage    (스크린샷, knowledge markdown)          │
│ ├─ Auth       (이메일/비밀번호, Google, admin Google) │
│ └─ Hosting    (정적 사이트 배포)                      │
└───────────────────────────────────────────────────────┘
                   ↓ trusted backend
┌───────────────────────────────────────────────────────┐
│ Cloud Functions for Firebase                          │
│ ├─ extraction job 처리                                │
│ ├─ approved graph 반영                                │
│ └─ public projection publish                          │
└───────────────────────────────────────────────────────┘
```

### 2.2 핵심 원칙

- **공개 우선**: 읽기는 항상 공개 화면에서 시작하고, owner/editor만 같은 공개 화면에서 바로 수정 가능
- **작업 공간 분리**: 기본 공개 데이터와 account-scoped 데이터는 분리
- **정적 빌드**: Firebase Hosting에 HTML/JS 업로드, 서버 유지보수 없음
- **Firestore 실시간 구독**: 편집과 공개 반영이 즉시 보이게 유지
- **trusted backend 분리**: 문서 추출, 승인 그래프, 공개 projection은 Cloud Functions가 소유
- **권한 모델**: guest / viewer / editor / owner / global admin

### 2.3 기술 스택 (모두 MIT 또는 호환 라이선스)

| 영역          | 기술                                         | 라이선스    |
| ------------- | -------------------------------------------- | ----------- |
| 프레임워크    | Next.js 14+ (App Router, `output: 'export'`) | MIT         |
| 언어          | TypeScript                                   | Apache-2.0  |
| 스타일        | Tailwind CSS                                 | MIT         |
| 컴포넌트 기반 | shadcn/ui                                    | MIT         |
| 토폴로지      | Sigma.js + Graphology + ForceAtlas2 + d3-force | MIT/BSD/ISC |
| 모션          | Framer Motion                                | MIT         |
| 폼 검증       | zod                                          | MIT         |
| 마크다운      | react-markdown + remark-gfm                  | MIT         |
| 폰트          | Inter Variable (next/font)                   | OFL         |
| 상태관리      | Firestore onSnapshot + React local state / URL state | MIT         |
| Firebase      | Firestore / Storage / Auth / Hosting         | 서비스 사용 |
| Lint          | eslint-plugin-boundaries (FSD 경계 검증)     | MIT         |
| 패키지 매니저 | pnpm                                         | MIT         |

### 2.4 왜 Vercel이 아닌 Firebase Hosting인가

- 진안이 이미 Firebase 생태계 안에 있음 — 인증·DB·스토리지·호스팅이 단일 콘솔에서 관리됨
- 이 프로젝트의 요구사항(읽기 공개 + 쓰기 어드민 only)은 100% 클라이언트에서 처리 가능하므로 SSR/Server Actions 불필요
- Firebase Hosting 무료 티어(10GB 전송)가 포트폴리오 트래픽에 충분

---

## 3. 비주얼 디자인 시스템 (Linear 베이스)

### 3.1 선택 이유

토폴로지의 "별자리" 메타포와 Linear의 "어둠에서 떠오르는 별빛" 미학이 정확히 일치하며, Linear의 절제된 언어(흑백 + 단일 인디고 악센트, glassmorphism·glow·그라디언트 없음)가 **"AI 느낌"을 배제**하는 최상의 방어책이다. 허브 노드(IAM, Reactor)를 인디고로 표현하면 시스템에서 유일한 채색이 되어 자연스럽게 시각적 중심이 된다.

### 3.2 디자인 토큰

| 토큰                | 값                       | 용도                               |
| ------------------- | ------------------------ | ---------------------------------- |
| `--bg-canvas`       | `#08090a`                | 페이지 최외곽 배경                 |
| `--bg-panel`        | `#0f1011`                | 사이드 패널, 카드 배경             |
| `--bg-elevated`     | `#191a1b`                | 드로어, 모달, 호버                 |
| `--bg-secondary`    | `#28282c`                | 가장 밝은 다크 서피스 (호버)       |
| `--text-primary`    | `#f7f8f8`                | 제목, 강조 텍스트                  |
| `--text-secondary`  | `#d0d6e0`                | 본문, 설명                         |
| `--text-tertiary`   | `#8a8f98`                | 메타데이터, 플레이스홀더           |
| `--text-quaternary` | `#62666d`                | 타임스탬프, 비활성                 |
| `--accent-indigo`   | `#5e6ad2`                | 브랜드 인디고 (허브 노드·CTA 배경) |
| `--accent-violet`   | `#7170ff`                | 인터랙션 악센트 (링크·활성)        |
| `--accent-hover`    | `#828fff`                | 악센트 호버                        |
| `--border-subtle`   | `rgba(255,255,255,0.05)` | 카드 기본 보더                     |
| `--border-default`  | `rgba(255,255,255,0.08)` | 강조 보더                          |
| `--border-strong`   | `rgba(255,255,255,0.12)` | 포커스, 선택                       |
| `--success`         | `#27a644` / `#10b981`    | 상태 표시 전용                     |

### 3.3 타이포그래피

- **Primary**: `Inter Variable`, OpenType `"cv01", "ss03"` 전역 활성
- **Signature weight**: `510` (Linear 고유 — regular와 medium 사이)
- **Letter-spacing**: 디스플레이 사이즈에 강한 음수 (`-1.584px @ 72px`, `-1.056px @ 48px`)
- **Mono**: `JetBrains Mono` (태그·코드)

| 역할       | 사이즈 | 무게 | letter-spacing |
| ---------- | ------ | ---- | -------------- |
| Hero       | 72px   | 510  | -1.584px       |
| Display    | 48px   | 510  | -1.056px       |
| Section    | 32px   | 510  | -0.64px        |
| Card Title | 20px   | 510  | -0.3px         |
| Body       | 15px   | 400  | normal         |
| Label      | 13px   | 510  | normal         |
| Caption    | 12px   | 400  | normal         |

### 3.4 카테고리 구분 전략 (색 최소화)

Linear의 "유일한 채색" 철학을 지키기 위해 **카테고리는 색이 아닌 시각적 표식으로 구분**:

- **작업중 (in-progress)**: 기본 카드 + 얇은 인디고 언더라인 (`border-bottom: 1px solid var(--accent-indigo)`)
- **예정 (planned)**: 기본 카드 + **dashed** 보더 (실체화 안 된 느낌)

**허브 노드(IAM, Reactor)** 만 인디고 배경·보더로 표시되어 시스템의 유일한 채색 요소가 된다.

### 3.5 모션 원칙

- **초기 로드**: 노드가 `opacity 0 → 1` + `translateY 8px → 0`으로 스프링 등장. 0.04초 간격 stagger. `scale` 애니메이션 금지.
- **호버**: 보더 opacity 상승 (`0.05 → 0.12`) + 연결된 엣지 밝기 증가. `scale`·`glow` 금지.
- **드로어 등장**: 우측에서 `x: 100% → 0` 스프링 (stiffness 280, damping 30).
- **필터 토글**: 비선택 카테고리 노드는 `opacity 1 → 0.15` 페이드.
- **배경**: 완전 정적. 파티클·오로라·애니메이션 배경 금지.
- **`prefers-reduced-motion` 존중**: 감지 시 모든 모션을 `duration 0`으로 대체.

### 3.6 Don'ts (이 프로젝트에서 절대 사용 금지)

- 보라→핑크 그라디언트
- glassmorphism (`backdrop-blur`로 흐린 반투명 배경)
- glow pulse / neon 효과
- 오로라 배경 / 움직이는 그라디언트 배경
- `scale` 기반 호버 효과
- 둘 이상의 채색 시스템 (단일 인디고 원칙)

### 3.7 레퍼런스

원본 Linear 디자인 시스템 전체 사양은 `docs/design-references/DESIGN-linear.md`에 보관. MIT 라이선스 (VoltAgent/awesome-design-md). 컴포넌트 구현 시 이 파일을 1차 레퍼런스로 참조한다.

---

## 4. 데이터 모델 & Firestore 구조

### 4.1 컬렉션 구조

```
firestore/
├── projects/                          ← 기본 공개 데이터
│   └── {slug}/
├── accounts/                          ← 작업 공간 메타
│   └── {accountId}/
│       ├── projects/{slug}/           ← account-scoped 프로젝트
│       ├── knowledgeDocuments/{id}/   ← account-scoped 문서
│       └── knowledgeDocumentVersions/{id}/
├── accountMemberships/                ← owner / editor / viewer
│   └── {membershipId}/
├── meta/
│   └── site/
└── admins/                            ← global admin 화이트리스트
    └── {email}/
```

기본 공개 데이터와 작업 공간 데이터는 같은 스키마를 공유하지만 저장 경계가 다르다. 기본 공개 사이트는 전역 `projects`를 사용하고, 작업 공간 검증/개인 운영은 `accounts/{accountId}/projects/*`를 사용한다.

### 4.2 `projects/{slug}` 스키마

| 필드                  | 타입                                                                                   | 필수 | 설명                                              |
| --------------------- | -------------------------------------------------------------------------------------- | ---- | ------------------------------------------------- |
| `slug`                | string                                                                                 | ✅   | URL용, kebab-case (예: `aslan-maps`)              |
| `name`                | string                                                                                 | ✅   | 한글 이름                                         |
| `nameEn`              | string                                                                                 |      | 영문 이름 (선택)                                  |
| `category`            | `"in-progress"` \| `"planned"`                                                         | ✅   | 대분류                                            |
| `status`              | `"idea"` \| `"planning"` \| `"developing"` \| `"deploy-ready"` \| `"completed"` \| `"live"` \| `"paused"` \| `"deprecated"` | ✅   | 세부 상태                                         |
| `description`         | string                                                                                 | ✅   | 1~2줄 요약 (드로어·노드 부제)                     |
| `detail`              | string (markdown)                                                                      |      | 상세 페이지용 본문                                |
| `tags`                | string[]                                                                               |      | 예: `["AI", "MCP"]`                               |
| `stack`               | string[]                                                                               |      | 예: `["Next.js", "Firestore"]`                    |
| `links`               | `Array<{label: string, url: string}>`                                                  |      | GitHub·문서·라이브 링크                           |
| `dependencies`        | string[]                                                                               |      | 다른 프로젝트의 `slug` 배열 (의존·연결 관계)      |
| `owner`               | string                                                                                 |      | 담당자 이름                                       |
| `icon`                | string                                                                                 |      | 이모지 또는 이미지 URL                            |
| `screenshots`         | string[]                                                                               |      | Firebase Storage URL 배열                         |
| `timeline.startedAt`  | Timestamp                                                                              |      | 시작일                                            |
| `timeline.launchedAt` | Timestamp                                                                              |      | 출시일                                            |
| `progress`            | number (0-100)                                                                         |      | 진행도                                            |
| `isHub`               | boolean                                                                                |      | `true`이면 허브 노드 (IAM, Reactor) — 인디고 강조 |
| `position.x`          | number                                                                                 | ✅   | 토폴로지 레이아웃 좌표                            |
| `position.y`          | number                                                                                 | ✅   | 토폴로지 레이아웃 좌표                            |
| `createdAt`           | Timestamp                                                                              | ✅   | 생성일 (서버 타임스탬프)                          |
| `updatedAt`           | Timestamp                                                                              | ✅   | 마지막 수정일 (서버 타임스탬프)                   |

### 4.3 `meta/site` 스키마

| 필드          | 타입      | 설명                     |
| ------------- | --------- | ------------------------ |
| `title`       | string    | 사이트 타이틀            |
| `description` | string    | 사이트 설명              |
| `lastUpdated` | Timestamp | 마지막 데이터 변경 시점  |
| `viewCount`   | number    | 방문 카운트 (선택, 공개) |

### 4.4 `accounts/{accountId}` / `accountMemberships/{id}`

| 문서 | 설명 |
| --- | --- |
| `accounts/{accountId}` | 작업 공간 메타데이터 (`name`, `description`, `isPublic`) |
| `accountMemberships/{id}` | 특정 사용자와 작업 공간의 관계 (`owner`, `editor`, `viewer`) |

작업 공간 협업 권한은 `admins`가 아니라 `accountMemberships`를 기준으로 해석한다.

### 4.5 `admins/{email}` 스키마

| 필드      | 타입      | 설명                   |
| --------- | --------- | ---------------------- |
| `addedAt` | Timestamp | 화이트리스트 추가 시점 |
| `note`    | string    | 메모 (선택)            |

> **중요**: `admins` 컬렉션은 전역 운영용이다. 기본 공개 데이터나 전역 관리 작업에만 필요하고, 일반 작업 공간 편집 권한은 `accountMemberships`가 담당한다.

### 4.6 Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // projects: 공개 읽기, 쓰기는 admin만
    match /projects/{projectId} {
      allow read: if true;
      allow write: if isAdmin();
    }

    // meta: 공개 읽기, 쓰기는 admin만
    match /meta/{document} {
      allow read: if true;
      allow write: if isAdmin();
    }

    // admins: 본인 이메일만 조회, 쓰기 완전 금지 (Console로만 관리)
    match /admins/{email} {
      allow read: if request.auth != null
        && request.auth.token.email == email;
      allow write: if false;
    }

    function isAdmin() {
      return request.auth != null
        && exists(/databases/$(database)/documents/admins/$(request.auth.token.email));
    }
  }
}
```

### 4.7 Storage 구조

```
storage/
└── screenshots/
    └── {projectSlug}/
        ├── cover.webp
        └── {timestamp}-{safeName}
```

### 4.8 Storage Security Rules

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /screenshots/{projectSlug}/{file} {
      allow read: if true;
      allow write: if request.auth != null
        && firestore.exists(/databases/(default)/documents/admins/$(request.auth.token.email));
    }
  }
}
```

### 4.8 초기 시드 데이터 (진안 제공)

**작업중 (in-progress)**

- Aslan maps (지금 만드는 이 프로젝트, 메타)
- 뉴스 클리핑 (Lantern)
- 커뮤니티 (Paravel)
- Aslan Verse — AI끼리 소통하는 플랫폼
- 현장강의 플랫폼 (Pick)
- Reactor — AI Agent (**허브, `isHub: true`**)
- Reactor Web — Arc Reactor 웹 채팅 UI
- atlassian mcp, swagger mcp
- IAM — 통합 인증 (**허브, `isHub: true`**)
- 각종 Admin 페이지들

**예정 (planned)**

- cronos mcp
- groupware mcp
- 도메인 지식 mcp
- Aslan Scale

> Reactor·IAM은 나머지 작업중 프로젝트들과 `dependencies` 관계로 연결되며, 이 연결선이 토폴로지의 "허브-앤-스포크" 구조를 만든다.

---

## 5. 페이지 & 컴포넌트 구조

### 5.1 라우트 맵

| 경로                    | 역할                      | 접근                  |
| ----------------------- | ------------------------- | --------------------- |
| `/`                     | 전체 지도                 | 전체 공개             |
| `/projects`             | 프로젝트 목록             | 전체 공개             |
| `/project/view`         | 개별 프로젝트             | 전체 공개             |
| `/project/[slug]`       | 정적 메타/공유용 상세     | 전체 공개             |
| `/login`                | 공개 로그인               | 전체 공개             |
| `/signup`               | 공개 회원가입             | 전체 공개             |
| `/admin`                | 관리자 로그인             | 전체 공개             |
| `/admin/dashboard`      | 운영 보드                 | owner/editor/admin    |
| `/admin/project/new`    | 새 프로젝트               | owner/editor/admin    |
| `/admin/project/[slug]` | 프로젝트 편집             | owner/editor/admin    |
| `/admin/layout`         | 토폴로지 위치 편집        | owner/editor/admin    |
| `/admin/knowledge`      | 문서 운영 홈              | owner/editor/admin    |
| `/admin/knowledge/documents` | 문서 목록           | owner/editor/admin    |
| `/admin/knowledge/documents/new` | 새 문서 등록    | owner/editor/admin    |
| `/admin/knowledge/documents/view` | 문서 상세       | owner/editor/admin    |
| `/admin/knowledge/reviews` | 연결 검토함            | owner/editor/admin    |

### 5.2 주요 위젯 & 컴포넌트

#### 공개 영역

- **`SigmaTopology`** (widget): Sigma/WebGL 기반 전체 지도. 줌/팬, 노드 드래그, 이웃 강조, 경로 탐색, 미니맵, depth/search/overlay 컨트롤.
- **`buildGraph` / `startPhysics`** (lib): Graphology 그래프 구성, ForceAtlas2 초기 배치, d3-force 기반 런타임 스프링·충돌 물리.
- **`RegionNavigator`** (widget): 카테고리 필터와 허브 빠른 선택. 선택 카테고리 밖의 노드는 Sigma reducer에서 dim 처리.
- **`HeroHeader`** (widget): 전체 지도 제목, 짧은 설명, 검색 진입
- **`SigmaMinimap`** (widget): 우하단 SVG 미니맵. Sigma 카메라 상태와 그래프 좌표를 구독해 현재 뷰포트를 표시.
- **`Legend`** (widget): 우상단 범례 (접기 가능).
- **`ProjectDrawer`** (widget): 우측 슬라이드 패널. 프로젝트 클릭 시 열림. `이 프로젝트가 중요한 이유`, `먼저 읽을 문서`, `다음에 볼 프로젝트`를 우선 노출.

#### 상세 페이지

- **`views/project-detail`**: 개별 프로젝트 페이지. 제목, 핵심 설명, 문서에서 드러난 연결, 다음에 볼 프로젝트, owner용 빠른 수정 진입을 제공.

#### 어드민 영역

- **`AdminGuard`** (feature): 라우트 가드. global admin 또는 account-scoped owner/editor 허용.
- **`LoginPage`**: `/admin` — global admin용 Google 로그인.
- **`AdminDashboard`**: 프로젝트 보드 + 문서 운영 진입.
- **`ProjectEditor`**: 프로젝트 정보 편집. 공개 화면에서 바로 들어올 수 있음.
- **`LayoutEditor`**: 공개 뷰와 동일 렌더, 드래그 가능 모드. debounce 500ms로 `position` 자동 저장.

### 5.3 상태 관리

- **데이터**: Firestore `onSnapshot` 실시간 구독 — 별도 스토어 불필요
- **UI 상태**: `useState` + URL `searchParams` (드로어 열림·필터·어드민 검색어)
- **전역 상태 저장소 없음**: 현재 범위는 React local state와 URL state로 충분

### 5.4 SSG + 실시간 하이브리드 전략

- 빌드 시점: Firestore REST API로 모든 프로젝트 fetch → `/project/[slug]` 페이지를 `generateStaticParams`로 프리렌더 (SEO·초기 로드 속도)
- 클라이언트 마운트 후: `onSnapshot`으로 실시간 데이터 재구독 → 어드민 수정이 즉시 반영
- 새 프로젝트 추가 시엔 **빌드 불필요**, 클라이언트에서 즉시 목록에 등장
- SEO 크리티컬한 신규 프로젝트만 별도로 재빌드 트리거 (선택적, GitHub Actions)

---

## 6. FSD 아키텍처

### 6.1 디렉토리 구조

```
project-map/
├── app/                          ← Next.js 라우팅 전용 (얇게)
│   ├── layout.tsx                → src/app/Providers 래퍼 import
│   ├── page.tsx                  → src/views/home
│   ├── project/[slug]/page.tsx
│   ├── admin/
│   └── globals.css
│
├── src/                          ← FSD 레이어
│   ├── app/                       ← providers, 전역 초기화
│   ├── views/                     ← 페이지 레벨 컴포넌트 (FSD "pages" 레이어)
│   │   ├── home/
│   │   ├── project-detail/
│   │   ├── admin-dashboard/
│   │   ├── admin-editor/
│   │   └── admin-layout/
│   ├── widgets/                   ← 복합 UI 블록
│   │   ├── topology-map-sigma/
│   │   ├── region-navigator/
│   │   ├── hero-header/
│   │   ├── project-drawer/
│   │   └── legend/
│   ├── features/                  ← 사용자 인터랙션 단위
│   │   ├── topology-layout/
│   │   ├── project-edit/
│   │   ├── layout-drag-save/
│   │   ├── admin-auth/
│   │   └── image-upload/
│   ├── entities/                  ← 비즈니스 엔티티
│   │   ├── project/
│   │   │   ├── model/            (타입, Firestore 매퍼)
│   │   │   ├── api/              (CRUD)
│   │   │   └── ui/               (ProjectCard 같은 전용 UI)
│   │   └── admin/
│   └── shared/                    ← 재사용 기반
│       ├── ui/                   (Button, Card, Badge — shadcn/ui 래핑)
│       ├── lib/                  (cn, slugify, formatDate)
│       ├── api/                  (firebase 초기화)
│       ├── config/               (환경변수 로더)
│       └── types/
│
└── docs/
    ├── rules/                    ← 규율 패키지
    ├── ...
    └── design-references/
```

### 6.2 FSD 규칙 요약

1. **Import 방향**: `app → views → widgets → features → entities → shared` (역방향 금지)
2. **같은 레이어 직접 import 금지**: `features/a`가 `features/b`를 직접 참조 X, 상위(widget)에서 조립
3. **Public API 원칙**: 각 슬라이스는 `index.ts`로만 공개, 내부 경로 import 금지
4. **판단 기준** (실무):
   - 사용자 행동 단위 → `feature`
   - 여러 feature를 조립한 블록 → `widget`
   - 비즈니스 개념 자체 → `entity`
   - 도메인과 무관한 공통 자원 → `shared`

자동 검증: `eslint-plugin-boundaries` (Phase 1에서 설정).

### 6.3 `app/` vs `src/app/` 네이밍 충돌

Next.js는 `app/`을 라우팅에 강제하고, FSD는 `app/`을 "앱 초기화" 레이어로 쓴다. 해결:

- 루트 `app/`: Next.js 라우팅 전용. 페이지 파일은 단지 `src/views/*`에서 import하는 얇은 래퍼.
- `src/app/`: FSD의 app 레이어. providers, 전역 초기화.

이 충돌은 `CLAUDE.md`와 `docs/rules/architecture-fsd.md`에 명시해 혼란 방지.

---

## 7. 문서화 & Git 워크플로우

### 7.1 문서 구조

```
├── README.md                     ← 사람용 진입점
├── CLAUDE.md                     ← AI용 프로젝트 가이드 (rules 링크)
└── docs/
    ├── ARCHITECTURE.md
    ├── DATA-MODEL.md
    ├── DESIGN-SYSTEM.md
    ├── DEPLOYMENT.md
    ├── ADMIN-GUIDE.md
    ├── SEED-DATA.md
    ├── CHANGELOG.md
    ├── rules/
    │   ├── README.md              (규율 인덱스)
    │   ├── architecture-fsd.md
    │   ├── git-workflow.md
    │   ├── naming.md
    │   ├── firestore-schema.md
    │   └── documentation.md
    ├── design-references/
    │   └── DESIGN-linear.md
    └── superpowers/
        └── specs/
            └── 2026-04-12-aslan-project-map-design.md  (이 문서)
```

### 7.2 문서 유지 규칙

1. 모든 구조적 결정은 **코드보다 문서 먼저 또는 동시에**
2. 컬렉션 스키마 변경 → `docs/DATA-MODEL.md` 필수 업데이트
3. 환경변수 추가 → `docs/DEPLOYMENT.md` + `.env.example` 같이 수정
4. 주요 변경 → `docs/CHANGELOG.md`에 날짜별 기록
5. `README.md`는 "30초 안에 뭘 해야 하는지" 알 수 있게 유지

### 7.3 Git 워크플로우

- **브랜치명**: `feature/{english-kebab-case}` 로 통일. 타입 구분 prefix 없음. 한글 금지.
- **커밋 메시지**: `타입: 한글 설명` 형식. 타입은 영어(`feat`, `fix`, `docs`, `refactor`, `chore`, `style`, `test`).
  - 예: `docs: 초기 설계 문서 작성`, `feat: 프로젝트 노드 컴포넌트 추가`
- **작업 단위마다 커밋** — 큰 덩어리 금지. 논리적으로 독립된 단위마다 커밋.
- **완료 시 main으로 merge** — 기본 merge commit, squash는 요청 시만.
- **파괴적 작업**(`reset --hard`, `force push`, 브랜치 삭제 등)은 **반드시 사전 확인**.

---

## 8. 구현 Roadmap

각 Phase는 초기 구현 기준이다. 현재 제품은 이 roadmap보다 더 앞선 상태이며, 여기서는 구조를 이해하는 참고 기록으로만 본다.

### MVP 경계

**Phase 0 + 1 + 2 + 3 + 4 + 6 + 7 = MVP** (공개 토폴로지 + 상세 드로어/페이지 + 시드 + 배포 — 방문자가 실제로 "쓸 수 있는" 최소 단위)
**Phase 5 = 정식 버전** (어드민 편집기 — 이전까지는 시드 스크립트 재실행으로 데이터 갱신)
**Phase 8 = 릴리즈 품질** (접근성·폴리싱)

### Phase 0 — 문서 스켈레톤 & 프로젝트 초기화

- Next.js 프로젝트 생성 (TypeScript, Tailwind, App Router)
- `docs/` 전체 스켈레톤 생성
- `docs/rules/` 규율 문서 초안
- `CLAUDE.md`, `README.md`, `.env.example`, `.gitignore`

### Phase 1 — FSD 골격 & shared 레이어

- `src/` FSD 디렉토리 생성
- `eslint-plugin-boundaries` 설정
- `shared/ui`·`lib`·`config`·`api` 기초
- Linear 디자인 토큰을 Tailwind theme에 매핑
- Inter Variable 폰트 설정

### Phase 2 — Entities (Project, Admin)

- `entities/project` 모델·API·매퍼
- `entities/admin` global admin 화이트리스트 체크
- `entities/account` / `accountMemberships` 기반 작업 공간 권한
- `features/admin-auth` 로그인/가드
- `firestore.rules` 작성 + 배포
- Firebase Emulator로 Rules 테스트

### Phase 3 — 공개 토폴로지 뷰

- `widgets/topology-map-sigma` Sigma/WebGL 토폴로지
- `features/project-node-render` 커스텀 노드
- `widgets/category-filter`, `hero-header`, `legend`
- `views/home` 페이지
- Framer Motion 진입 애니메이션
- 반응형 대응

### Phase 4 — 드로어 & 상세 페이지

- `widgets/project-drawer`
- `views/project-detail` + `/project/[slug]` 페이지
- 마크다운 렌더링, 이미지 캐러셀
- 의존성 네비게이션
- `generateStaticParams` 프리렌더

### Phase 5 — 어드민 대시보드 & 편집기

- `views/admin-dashboard` 목록·검색·통계
- `views/admin-editor` 폼 + 라이브 프리뷰
- `features/project-edit` zod 검증
- `features/image-upload` Storage 업로드
- `views/admin-layout` 드래그 저장

### Phase 6 — 시드 데이터

- `scripts/seed.ts` Firebase Admin SDK로 초기 데이터 주입
- `docs/SEED-DATA.md`

### Phase 7 — Firebase Hosting 배포

- `next.config.mjs` `output: 'export'`
- `firebase.json` Hosting 설정
- `docs/DEPLOYMENT.md` 완성
- (선택) GitHub Actions 자동 배포

### Phase 8 — 폴리싱 & 접근성

- 키보드 네비게이션, 스크린 리더
- `prefers-reduced-motion` 대응
- Lighthouse 점검 (목표: Perf 90+, A11y 100, SEO 100)
- 에러 바운더리 (`error.tsx`, `not-found.tsx`)

---

## 9. 보안 & 개인정보

### 9.1 Firebase 웹 apiKey

Firebase 웹 SDK의 `apiKey`는 설계상 **공개 값**이다. 클라이언트 번들에 포함되며, 노출돼도 보안 위험이 아니다. 실제 보안은 **Firestore Security Rules + Storage Security Rules**로 강제한다.

### 9.2 서비스 계정 키

- 시드 스크립트(`scripts/seed.ts`)는 Firebase Admin SDK를 사용하므로 서비스 계정 키(JSON)가 필요하다.
- 이 키는 **로컬에만 존재**해야 하며 절대 Git에 커밋 금지.
- `.gitignore`에 `serviceAccountKey.json`, `*-firebase-adminsdk-*.json` 포함.
- 실수로 커밋되면 즉시 **Firebase Console에서 revoke**하고 새 키 발급.

### 9.3 admin 화이트리스트

- `admins` 컬렉션 쓰기는 Firestore Rules에서 완전 금지.
- 최초 admin 등록은 **Firebase Console → Firestore → 수동 문서 생성**.
- 방식: `admins/{이메일}` 문서 생성, `addedAt: 현재 시각`.
- 이 컬렉션은 전역 운영 권한용이며, 일반 작업 공간 협업 권한은 `accountMemberships`가 담당한다.

### 9.4 이미지 업로드 검증

- 클라이언트에서 MIME 타입 화이트리스트 (`image/png`, `image/jpeg`, `image/webp`)
- 용량 제한 (예: 5MB)
- Storage Rules에서 `request.resource.size < 5 * 1024 * 1024` 같은 검증도 가능

---

## 10. 테스트 전략

- **단위 테스트** (Vitest + @testing-library/react): `entities/project/model` 매퍼, `shared/lib` 유틸
- **통합 테스트** (Firebase Emulator Suite): Security Rules 검증 (공개 읽기 허용 / 비로그인 쓰기 거부 / owner/editor 허용 / global admin 허용)
- **E2E** (Playwright): 회원가입 → 로그인 → 전체 지도 → 프로젝트 → 문서 등록 → 추출 → 연결 검토 → 공개 반영
- **수동 QA 체크리스트**: 배포 전에 실제 브라우저에서 모바일/데스크톱 확인

---

## 11. 리스크 & 미결 사항

### 11.1 알려진 리스크

| 리스크                                                      | 완화책                                                                                                         |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Linear 미학이 너무 차가워 "아트워크 느낌"에 못 미칠 수 있음 | 초안 배포 후 진안 확인. 필요시 배경 star-field·히어로 타이포 아트워크 추가 (단, glow·그라디언트는 여전히 금지) |
| 프로젝트 25개 이상 되면 단일 캔버스가 복잡                  | 초기 하이브리드 유지, 임계치 도달 시 탭 분리 재검토 (`docs/ARCHITECTURE.md`에 트리거 기록)                     |
| Storage US-EAST1 리전 업로드 지연                           | 어드민 업로드는 드물므로 허용. 심해지면 Blaze 업그레이드 후 `asia-northeast3` 이전                             |
| FSD 러닝커브 (진안이 직접 수정 시 혼동)                     | `docs/rules/architecture-fsd.md`에 판단 기준 예시와 "이건 feature, 이건 widget" 스냅샷 명시                    |
| 서비스 계정 키 실수 커밋                                    | `.gitignore` 패턴 강화 + `git-secrets` 도입 고려                                                               |

### 11.2 미결 사항

- **폰트 라이선스**: Inter Variable은 OFL로 사용 가능. Pretendard도 후보였으나 Inter로 통일 (Linear 정체성 유지).
- **`viewCount` 추적 방식**: 공개 페이지 로드 시 Firestore 카운트 증가 vs Google Analytics 연동. 일단 필드만 스키마에 두고 구현은 Phase 8 이후.
- **카테고리 외 "기타" 분류 필요성**: 현재 3개로 충분하다고 판단. 추후 스키마 확장 시 `category`를 `string`으로 완화 가능.

---

## 12. 성공 판단 체크리스트 (출시 전)

- [ ] 공개 URL에서 초기 로드 3초 이내
- [ ] IAM·Reactor 허브가 시각적으로 즉시 인지됨
- [ ] 어드민 수정 → 공개 페이지 실시간 반영
- [ ] 모바일에서도 정상 렌더 (fitView 재계산)
- [ ] `prefers-reduced-motion` 환경에서 모션 비활성
- [ ] Lighthouse Perf 90+, A11y 100, SEO 100
- [ ] Firestore Rules 공격 시나리오(비로그인 쓰기·비인가 이메일 쓰기) emulator 통과
- [ ] 모든 `docs/*.md` 파일이 현재 코드·스키마와 일치
- [ ] `CHANGELOG.md`에 배포 버전 기록

---

## 13. 부록

### 13.1 참고 레퍼런스 (모두 MIT 또는 호환)

- **VoltAgent/awesome-design-md** (MIT): Linear 디자인 시스템 원본 사양
- **sigma / graphology / graphology-layout-forceatlas2** (MIT): WebGL 그래프 렌더링·그래프 모델·초기 배치
- **d3-force / d3-force-reuse** (ISC/BSD-3-Clause): 런타임 물리·충돌 최적화
- **shadcn/ui** (MIT): 컴포넌트 레시피
- **Firebase 공식 문서**: 클라이언트 SDK 사용법

### 13.2 용어 정의

- **허브 노드**: `isHub: true`인 프로젝트. IAM·Reactor가 해당. 다수 프로젝트가 의존하는 "중심" 역할.
- **FSD**: Feature-Sliced Design. 아키텍처 방법론.
- **슬라이스**: FSD에서 각 레이어 내부의 한 단위 (예: `features/project-edit`).
- **MVP**: Minimum Viable Product. 이 프로젝트에선 Phase 0+1+2+3+6+7.
