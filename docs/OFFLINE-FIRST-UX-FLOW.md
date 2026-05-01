# Offline-first UX Flow

> **Status**: 활성 가이드 (Q1=(a) 답 + `useOntologyInsight` 머지 완료, PR #6). 진입점 분기 확정됨 — vault 활성 시 `/` ontology hub 가 자동 vault 모드, vault 미활성 시 cloud / static fallback.

이 문서는 *비로그인 사용자가 첫 화면에서 0 마찰로 사용 시작* 하도록 라우트별 진입 동작·권한 게이트·온보딩 단계를 명시한다. `.claude/rules/local-first.md` 의 헌장 ("Notion 처럼 폴더만 선택해도 사용") 을 UI 레이어에서 어떻게 구현하는지 정의.

관련:
- `.claude/rules/local-first.md` — 헌장 (이 문서가 따른다)
- `docs/LOCAL-FIRST-SYNC.md` — 4 운영 모드 (Static / Local / Cloud / Hybrid)
- `.claude/rules/auth.md` — Firebase Auth (email/password + Google) 만 허용

---

## 1. 사용자 상태 매트릭스

UX 분기는 다음 4 차원으로:

| 차원 | 가능 값 | 결정 근거 |
|---|---|---|
| 인증 | `anonymous` / `signed-in` | Firebase `onAuthStateChanged` |
| Local vault | `none` / `permission-needed` / `loaded` | `useLocalVault()` 의 `status` |
| Firebase 설정 | `not-configured` / `configured` | `.env.local` 의 `NEXT_PUBLIC_FIREBASE_*` 유무 (build-time 결정) |
| Network | `online` / `offline` | `navigator.onLine` (런타임) |

이 4 × 3 × 2 × 2 = 48 상태 중 *의미 있는 조합* 만 다룬다. 나머지는 "동일 분기" 로 단순화.

---

## 2. 6 가지 의미 있는 상태

| ID | 인증 | Local vault | Firebase | Network | 시나리오 |
|---|---|---|---|---|---|
| **S1** | anonymous | none | not-configured | online | *"개발자가 처음 clone 후 dev 서버"* — 정적 manifest 만 |
| **S2** | anonymous | none | configured | online | *"퍼블릭 토폴로지 viewer"* — 데모 / 마케팅 페이지 |
| **S3** | anonymous | loaded | * | * | *"Notion 처럼 진입한 라이트 사용자"* — 핵심 mission 시나리오 |
| **S4** | anonymous | permission-needed | * | * | *"이전에 폴더 골랐던 사용자 재방문"* — IDB 핸들 복원 |
| **S5** | signed-in | * | configured | online | *"공유 / 백업 의도의 사용자"* — Cloud 모드 |
| **S6** | * | * | * | offline | *"네트워크 끊김"* — 마지막 build 의 정적 manifest + 활성 vault |

---

## 3. 라우트별 첫 진입 동작

각 라우트는 위 6 상태에 따라 다른 진입 화면. **자동 redirect 는 hard-block 이 아닌 *제안* 으로** — 사용자가 무시하고 그대로 머물러도 동작해야 한다.

### 3.1 `/` (토폴로지 — primary entry)

| 상태 | 진입 동작 |
|---|---|
| S1 | 정적 manifest 토폴로지 (`data/manifest.json`) — *현재 동작* |
| S2 | 정적 manifest 토폴로지 + 우상단 "내 폴더 열기" CTA + "로그인" 옵션 |
| S3 | **분기 결정 필요 (Q1)**:<br>(a) 자동 vault 토폴로지 (mission ideal) — 활성 vault 의 projects/*.md 를 토폴로지로<br>(b) 정적 manifest + "로컬 vault 사용 중" 배지 + 토글로 전환 |
| S4 | "이전 폴더 다시 열기" 인라인 CTA + 정적 manifest fallback |
| S5 | Firestore subscribeProjects 결과 토폴로지 |
| S6 | offline 표시 + 정적 manifest 또는 캐시된 vault — *online 복귀 후* re-sync (Cloud 일 때) |

**Q1 답이 (a)** → S3 의 자동 vault 토폴로지. `useLocalVault().status === 'loaded'` 이면 그 manifest 를 source 로.
**Q1 답이 (b)** → S3 의 *명시 토글*. UX 변화 0, 사용자가 직접 토글.

### 3.2 `/docs/` (DocsVaultPage)

이미 `source` 토글 (server / local) 보유. *변경 없음*.

| 상태 | 진입 동작 (현재 + 그대로) |
|---|---|
| S1, S2 | server source — 정적 manifest |
| S3, S4 | local source 자동 활성화 (이미 동작) — `localVault.status === 'loaded'` 면 토글 자동 local |
| S5 | server source |
| S6 | local 우선, server 캐시 fallback |

### 3.3 `/projects` (프로젝트 목록)

S1~S5 모두 동작. S6 는 캐시된 list 만.

### 3.4 `/project/[slug]` (프로젝트 상세)

| 상태 | 진입 동작 |
|---|---|
| S1, S2 | 정적 manifest 의 해당 slug 로드 |
| S3 | 활성 vault 의 `projects/<slug>.md` 우선, 없으면 정적 fallback |
| S4 | "다시 권한 요청" 배너 + 정적 fallback |
| S5 | Firestore `projects/{slug}` 로드 |
| S6 | 캐시 / 정적 |

### 3.5 `/knowledge`, `/knowledge/*` (지식 등록 / 분석 / 목록)

**S1, S2, S6**: read-only 표시 또는 "폴더 / 로그인 필요" 안내. 등록 / 분석 / publish 버튼 비활성.
**S3, S4**: 비로그인이라도 *로컬 vault* 에 새 .md 작성 가능 (등록 흐름).
**S5**: Firebase 통한 풀 등록 / 분석 / publish.

### 3.6 `/review/*` (검수 큐)

비로그인은 view 만. *승인 / 거절* 같은 mutation 은 로그인 필요. 게이트 표시.

### 3.7 `/ontology/*` (온톨로지 view / edit / insights / relations)

view (`/ontology`, `/ontology/insights`, `/ontology/relations`): 비로그인 OK.
edit (`/ontology/edit`): TBox 변경은 로그인 + 권한 필요. 게이트.

### 3.8 `/settings/*`

| 라우트 | 비로그인 |
|---|---|
| `/settings/categories`, `/settings/statuses` | view 만 (read-only) |
| `/settings/api-keys` | 로그인 게이트 (API key 발급은 인증 필요) |
| `/settings/project-import` | S3, S4 면 로컬 vault 에 import 가능 |

### 3.9 `/diagnostics/*`, `/admin/*`

`/admin/*` 폐기됨 (`.claude/rules/forbidden.md`).
`/diagnostics/*` — 운영자 surface, 로그인 + 권한.

### 3.10 `/login`, `/signup`, `/reset-password`

S1 일 때 라우트 자체 비활성 (리다이렉트 필요). S2~S5 에서 진입 가능.

### 3.11 `/account`

비로그인 진입 시 `/login?next=/account` 리다이렉트.

---

## 4. 비로그인 사용자 보호 가이드 (강요 금지)

`.claude/rules/local-first.md` 의 "로그인은 옵션, 비로그인이 default" 헌장.

다음을 위반 금지:
- ❌ 비로그인 진입 시 *전체 화면* 로그인 modal
- ❌ 토폴로지 / 트리 view 에 *blur* 처리 후 "로그인하세요" 표시
- ❌ 폴더 선택 전에 *반드시* 로그인 강제

다음은 OK:
- ✅ 우상단 "로그인" 버튼 (작게)
- ✅ Firebase 가 필요한 액션 (예: publish) 클릭 시 *그 액션* 만 게이트
- ✅ 30+ 일 비로그인 사용 후 dismiss 가능한 *주간* 권유 배너

---

## 5. 권한 게이트 vs 진입 차단

PermissionGate 로 *액션 단계* 만 게이트. *페이지 진입* 자체를 차단하지 말 것.

| 액션 | 게이트 시점 |
|---|---|
| 토폴로지 view | 게이트 X (정적 / vault / Firestore 셋 다 가능) |
| 프로젝트 *추가* (Firebase) | 클릭 시 게이트 |
| 프로젝트 *추가* (로컬 vault) | 게이트 X — 로컬은 사용자 디스크 |
| 검수 *승인* | 클릭 시 게이트 (로그인 + permission) |
| Publish | 클릭 시 게이트 |
| API key 발급 | 페이지 진입 시 게이트 (예외 — 인증 surface 자체) |
| TBox 변경 | 클릭 시 게이트 |

---

## 6. 온보딩 단계 (S1, S2 → S3 의 자연스러운 흐름)

비로그인 사용자가 *처음 진입* 후 *로컬 vault 활성화* 까지 5 step:

```
[Step 1]  / 진입 → 정적 manifest 토폴로지 (즉시 보임)
   ↓
[Step 2]  우상단 또는 빈 상태 카드 "내 폴더 열기" CTA 노출
   ↓
[Step 3]  클릭 → showDirectoryPicker (브라우저 native)
   ↓
[Step 4]  buildLocalManifest 진행 (로딩 표시)
   ↓
[Step 5]  토폴로지가 vault 데이터로 갱신 (Q1 답에 따라)
          또는 /docs/ 에서 토글 후 사용
```

각 step 에 **돌아갈 길 보존** — Step 3 에서 cancel 하면 Step 1 상태 복귀. Step 5 에서 vault 닫으면 Step 1 복귀.

**volatility**: 각 step 의 한 번의 액션도 정적 manifest 동작에 영향을 주지 않아야. vault 이슈 (권한 거부, 빌드 실패) 가 사용자를 *안 보이는 dead screen* 으로 보내면 안 됨 — 항상 정적 fallback.

---

## 7. 핵심 컴포넌트 / hook 매핑

| 책임 | 컴포넌트 / hook |
|---|---|
| local vault picker UI | `LocalVaultPicker` (이미 존재) |
| local vault state | `useLocalVault` (이미 존재) |
| 정적 manifest | `vaultManifest` import (이미 존재) |
| Firestore subscribe | entity API (이미 존재) |
| 인증 상태 | `useFirebaseAuthUser` 또는 유사 (`@/features/user-auth`) |
| 권한 게이트 | `PermissionGate` (이미 존재) |
| 모드 통합 결정 hook (신설) | `useDataSourceMode` — Q1 답 후 도입 — `'static' | 'local' | 'cloud'` 반환 |

신설 후보 `useDataSourceMode` 는 Q1 답에 따라 §3.1 분기를 한 곳에서 결정. 라우트들은 그 결과 사용.

---

## 8. 회귀 차단 시나리오

이 UX flow 변경 시 다음이 깨지지 않게:

1. **S1 시나리오 — 첫 dev 서버** — 정적 manifest 토폴로지가 즉시 보인다. (`pnpm dev` 후 첫 GET `/`).
2. **S3 자동 전환 (Q1=a 답일 때)** — vault 활성화 후 `/` 가 자동으로 그 데이터를 보여주되 vault 빌드 실패 시 정적 fallback.
3. **vault 권한 거부** — Picker 의 error 상태 표시 후 정적 fallback (사용자가 다시 시도 가능).
4. **로그인 후 sync 의도** — Cloud 모드 (`S5`) 진입 시 vault 자동 disable 안 됨 — 두 모드 명시 토글로만 전환 (LOCAL-FIRST-SYNC.md §2.5).

---

## 9. Open questions

1. **(LOOP-TASK Q1 동일)** `/` 의 S3 분기 — 자동 vault 전환 vs 명시 토글? **이 답이 정해지기 전 §3.1 의 S3 분기는 미확정.**
2. 신설 `useDataSourceMode` hook 이 단일 active source 만 반환하는 게 맞나, 또는 *3 source 동시 보기* (예: vault + Firestore 합집합) 도 지원?
3. 정적 manifest fallback 의 cache 정책 — vault 활성화 후 정적 manifest 를 *완전히 무시* 가능, 또는 union 으로 유지?
4. offline 모드 (S6) 의 *Last-known-good* 캐시 위치 — Service Worker 의 Cache Storage? IndexedDB 별도 collection?

---

## 10. 코드 변경 가이드 (Q1 답 후)

Q1 답 = (a) 자동 전환:

1. `useDataSourceMode` hook 신설 (`src/features/data-source/`).
2. `HomePage` 가 `subscribeProjects` 대신 hook 결과 사용. local 이면 `useLocalVault().manifest` 의 `projects/*.md` 를 Project 로 변환 (이미 `buildTopologyFromVault` 가 함).
3. Picker 통합 — `/` 의 빈 상태 (S2) 에 `LocalVaultPicker` 인라인 노출.
4. Onboarding step 인디케이터 추가.

Q1 답 = (b) 명시 토글:

1. `/` 에 `source` state + 토글 UI 추가 (DocsVaultPage 패턴 차용).
2. 자동 진입 동작 변화 0.
3. 사용자가 토글하면 그 모드 유지 (`localStorage`).

---

> **결론**: 이 문서는 *Q1 답 후 즉시 구현 가능한* UX 사양. 라우트별 6 상태 매트릭스 + 게이트 시점 + 온보딩 + 회귀 차단까지 완비. v0.x 의 비로그인 첫 진입 0 마찰을 *디스크 폴더 하나로 보장* 한다.
