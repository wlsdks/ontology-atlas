# Plan: `/admin/*` 네임스페이스 폐기

> 작성일: 2026-04-25
> 상태: **Phase 1-9 코드 완료 (2026-04-30)** — `app/admin/` 디렉토리 부재, 모든 URL 이 `/settings/*`, `/review/*`, `/diagnostics/*`, `/knowledge/*`, `/login`, `/dev/login` 으로 이전 완료. `useAdminAuth` → `usePermissions` 리네임 완료. 잔존 코드 (`src/entities/admin/api/admin-api.ts` 의 `isAdmin` 글로벌 권한 체크, `src/features/admin-snapshot/*` 운영 export 도구) 는 URL 계약과 무관한 기능. Phase 10 (문서 정합) 만 후속.
> 관련 문서: `docs/ARCHITECTURE.md`, `docs/ADMIN-GUIDE.md`, `firestore.rules`

## 1. 문제 정의

현재 `/admin/*`는 18개 라우트를 가진 별도 URL 공간이다. 그 안에 다음이 섞여 있다.

- 사용자(viewer)가 보는 것과 동일한 surface의 **편집 모드** (project/new, project/edit, project/[slug])
- 시스템 **설정** (categories, statuses, api-keys)
- **운영 도구** (migrate, insights, project-import)
- **검토 큐** (knowledge review, knowledge documents)
- **운영 허브** (dashboard) — 위 모든 것의 진입점

부작용:

1. viewer가 admin URL을 만나면 "내가 뭘 봐야 하지?" 상태가 된다 (실제 사례: demo-viewer 계정이 `/admin/dashboard`를 봄).
2. 같은 도메인 객체(프로젝트, 문서)에 대해 **공개 surface와 편집 surface가 URL 공간으로 분리**되어 mental model이 두 개가 된다.
3. Notion / Obsidian 식의 "권한 따라 같은 화면에서 인라인 편집" 모델과 어긋난다.
4. admin route 진입 자체가 사실상의 권한 게이트로 쓰여 와서, 진짜 권한 게이트인 Firestore rules가 약해질 위험이 있다.

## 2. 목표

- `/admin/*` 네임스페이스를 **완전히 제거**한다.
- "admin / 운영자 / 관리자"라는 단어를 제품 surface와 사용자 노출 텍스트에서 제거한다. 자기 계정의 주인이 곧 자기 계정의 사용자이고 동시에 그 계정의 모든 작업을 직접 한다 (Notion / Obsidian 모델).
- 같은 도메인 객체는 같은 URL에서 **권한에 따라 인라인 편집**이 노출되도록 한다.
- 시스템 도구는 **기능별 영역**(`/settings`, `/review`, `/diagnostics`)으로 분리하되, 모드/네임스페이스가 아니라 작업 영역으로 다룬다. 이 영역도 "운영자만 가는 곳"으로 부르지 않고 "내 계정의 설정 / 검토 큐 / 진단" 처럼 자기 자산 기준으로 표현한다.
- 프로젝트 상세 페이지를 **모든 관련 작업의 허브**로 만든다 — 같은 페이지에서 토폴로지로 이동, 연관 문서 보기, 문서 수정, 프로젝트 자체 수정까지 가능해야 한다.

## 3. 비목표

- 권한 모델 자체의 재설계는 아님 (Firestore rules는 별도 작업으로 강화).
- knowledge subsystem v2의 데이터 계약 변경 아님 (URL 이동만).
- 공개 디자인 시스템(Linear 베이스) 변경 없음.

## 4. URL 매핑 표

| 현재 라우트 | 새 위치 | 처리 방식 |
|---|---|---|
| `/admin` (redirect 허브) | — | 삭제 |
| `/admin/dashboard` | — | **삭제**. "오늘 할 일" 류는 `/review`로 흡수 |
| `/admin/login` | `/login` | 통합. admin 전용 로그인 폐기 |
| `/admin/dev-login` | `/dev/login` (dev 빌드 한정) | 이동 |
| `/admin/project/new` | `/projects` (인라인 "새 프로젝트" 버튼) | **인라인 흡수**. 권한 있는 사용자에게만 노출 |
| `/admin/project/[slug]` | `/project/[slug]` | **합치기**. 권한 있을 때 수정/삭제 액션 노출 |
| `/admin/project/edit?id=...` | `/project/[slug]?edit=1` 또는 인라인 토글 | 폐기, 같은 페이지에서 편집 |
| `/admin/project/import` | `/settings/import` | 이동 |
| `/admin/categories` | `/settings/categories` | 이동 |
| `/admin/statuses` | `/settings/statuses` | 이동 |
| `/admin/api-keys` | `/settings/api-keys` | 이동 |
| `/admin/docs` | `/project/[slug]` 의 문서 섹션 | **인라인 흡수**. viewer는 이미 docs vault 보고 있음 |
| `/admin/insights` | `/diagnostics/insights` | 이동 (운영자 전용) |
| `/admin/migrate` | `/diagnostics/migrate` | 이동 (운영자 전용) |
| `/admin/knowledge` | `/review` (메인 검토 허브) | 흡수 |
| `/admin/knowledge/documents` | `/knowledge/documents` | 이동, 단 검토 워크플로우는 `/review` |
| `/admin/knowledge/documents/new` | `/knowledge/documents/new` | 이동 |
| `/admin/knowledge/documents/view?id=...` | `/knowledge/documents/[id]` | 이동 + slug 기반 라우팅 |
| `/admin/knowledge/reviews` | `/review/knowledge` | 이동, 검토 큐의 본진 |

새 URL 공간 요약:

```
/                        # 토폴로지 지도 (공개)
/projects                # 프로젝트 목록 (공개)
/project/[slug]          # 프로젝트 상세 (공개, 권한 시 인라인 편집)
/knowledge/documents/*   # 지식 문서 (권한 모델은 Firestore rules)
/review                  # 검토 큐 (운영 권한자만)
/settings/*              # 시스템 설정 (운영 권한자만)
/diagnostics/*           # 운영 도구 (운영 권한자만)
/login                   # 단일 로그인
/account                 # 사용자 자기 계정 설정 (이미 있음)
```

## 5. 권한 모델 보강 (필수 선행)

지금까지 `/admin/*` 라우트 진입 자체가 사실상 게이트로 쓰여 왔다. 라우트 폐기 후엔 게이트가 사라지므로 다음을 **선행**해야 한다.

1. **Firestore rules 점검**: 현재 viewer 계정이 직접 client SDK로 write를 시도하면 막히는지 확인. 막히지 않는 케이스는 모두 rules에서 차단.
2. **클라이언트 권한 훅 일원화**: `useAdminAuth` → `usePermissions` (또는 `useCapabilities`) 로 이름 변경. "admin"이라는 단어를 권한 변수에서도 제거.
3. **인라인 편집 가드 패턴 합의**: 권한 검사 끝나기 전엔 read-only 스켈레톤. 권한 확정 후에만 편집 액션 렌더 (깜빡임 방지).

## 6. 단계별 실행 계획

각 단계는 **독립 PR**, 한글 커밋, 작업 단위로 잘게 쪼갠다.

### Phase 0 — 설계 정합 (코드 변경 없음)

- 이 plan 문서 확정.
- `docs/ARCHITECTURE.md`에 새 URL 공간 표 반영 (구 admin 명세 제거).
- `docs/ADMIN-GUIDE.md` → `docs/OPERATIONS-GUIDE.md`로 개명, 내용도 새 URL 기준으로 재작성.
- `CLAUDE.md` / `AGENTS.md`의 "URL 계약 부채" 항목 갱신 (이번 작업이 그 부채를 해소).

산출물: 문서 PR 1건.

### Phase 1 — 권한 모델 가드 (코드, 동작 변경 없음)

- `useAdminAuth` → `usePermissions` 리네임. capability 키워드 정리 (`canEditProject`, `canManageCategories`, `canReviewKnowledge`, ...).
- Firestore rules 단위 테스트 추가: viewer가 write 시도 시 거부되는지 검증.
- 인라인 편집용 공통 가드 컴포넌트 (`<RequiresCapability>`) 도입. 권한 미확정 동안 fallback skeleton.

산출물: 리팩토링 PR 1건. 외부 동작 동일.

### Phase 2 — 공개 surface에 인라인 편집 흡수 + 프로젝트 상세를 작업 허브로

대상: project new, project edit, project detail, docs viewer.

- `/projects`에 "새 프로젝트" 버튼 (권한 확인 후 노출). 클릭 시 모달 또는 `/projects/new` 로컬 라우트.
- `/project/[slug]`에 다음 인라인 액션 추가:
  - "프로젝트 정보 수정 / 삭제"
  - "토폴로지에서 보기" (`/?focus=slug`)
  - "연관 문서" 섹션 (이미 있음 — visibility 보강)
  - 각 문서 행에 "본문 수정" 또는 "새 버전 등록" 명시적 라벨
- 기존 `AdminProjectEditClientPage`의 폼 로직을 view 컴포넌트로 옮김 (`src/widgets/project-editor/` 신설).
- `AdminKnowledgeDocumentDetailPage`의 "연결 작업 열기" `<details>`를 펼친 상태로 default — 또는 액션 바를 항상 노출. 문서 metadata 인라인 편집 (title/kind/projectIds) 추가.
- `/admin/project/new`, `/admin/project/edit`, `/admin/project/[slug]` → 새 URL로 **클라이언트 redirect** (Next.js export 환경이므로 `app/admin/project/.../page.tsx`에 `redirect()` 또는 클라이언트 `useEffect` redirect).
- `/admin/docs`는 새 인라인 docs 섹션이 갖춰지면 redirect.

산출물: PR 4–5건 (route 단위로 나눔).

### Phase 3 — `/settings/*` 신설

대상: categories, statuses, api-keys, project-import.

- `app/settings/{categories,statuses,api-keys,import}/page.tsx` 추가.
- 기존 view 컴포넌트는 그대로 재사용 (이름만 `Admin*` → 중립 이름으로 리네임).
- `app/admin/{categories,statuses,api-keys,project/import}/page.tsx`는 redirect로 둠.
- `ProjectForm.tsx`의 `/admin/categories`, `/admin/statuses` 링크 갱신.

산출물: PR 1–2건.

### Phase 4 — `/review` 신설 (검토 허브)

대상: knowledge review, dashboard의 "오늘 할 일" 일부.

- `app/review/page.tsx` (검토 큐 진입) 추가.
- `app/review/knowledge/page.tsx` (지식 검토 워크스페이스) 추가.
- `/admin/knowledge/reviews` redirect.
- `/admin/dashboard`의 "문서 연결 검토 열기" 카드 → `/review`가 그 역할.

산출물: PR 1건.

### Phase 5 — `/diagnostics/*` 신설

대상: migrate, insights.

- `app/diagnostics/{migrate,insights}/page.tsx` 추가.
- 기존 `/admin/migrate`, `/admin/insights` redirect.
- 권한 capability: `canRunDiagnostics` (운영자 한정).

산출물: PR 1건.

### Phase 6 — `/knowledge/*` 공개화 (단, 권한은 rules로)

대상: knowledge documents 라우트 본체.

- `app/knowledge/documents/page.tsx`, `app/knowledge/documents/new/page.tsx` 추가됨.
- ~~`app/knowledge/documents/[id]/page.tsx` 추가~~ — **기각 (2026-04-29, Fire 3)**.
- ~~기존 `view?id=` 쿼리 기반 라우팅 → slug/id 동적 라우팅으로 정리~~ — **기각**.
- `/admin/knowledge/*` redirect.
- 주의: knowledge subsystem v2 foundation 구현 진행 중. 이번 이동은 **URL만**, 데이터 계약/Firestore 컬렉션은 그대로.

**slug 라우팅 기각 사유 (2026-04-29 Fire 3 결정)**:
- Next 16 `output: 'export'` 는 `[id]` 동적 라우트의 `dynamicParams = true` 를 지원하지 않음 (모든 ID 가 build-time `generateStaticParams()` 에 enumerate 되어야).
- knowledge documents 는 per-account 인증 데이터 — Firestore rules 가 read 권한 게이트, public REST API 로 build-time 수집 불가능 (`app/project/[slug]` 는 공개 collection 이라 `fetchAllProjectsAtBuild()` 로 가능).
- → `?id=` 쿼리 라우팅이 **올바른 패턴** 으로 인정. URL 빌드는 `getKnowledgeDocumentDetailHref()` 단일 helper 로 centralize (Fire 3 PR — 6 인라인 호출자 마이그레이션).

산출물: PR 1–2건. **slug 라우트 task 는 Phase 6 에서 제거**.

### Phase 7 — 로그인 단일화

- `/admin/login` 폐기. `/login` 하나로 통합. 권한 차이는 로그인 후 라우팅으로 처리.
- `/admin/dev-login` → `/dev/login` (NODE_ENV 가드).
- 모든 잔여 `/admin/login` 참조 제거.

산출물: PR 1건.

### Phase 8 — `/admin/dashboard` 삭제

- `/admin/dashboard` 라우트 자체 삭제. (다른 redirect 라우트가 다 빠진 시점이라 참조 없음)
- `app/admin/page.tsx`(redirect 허브)도 같이 삭제.
- 로그인 후 redirect destination 정리: 이제 `/projects` 또는 `/`.

산출물: PR 1건.

### Phase 9 — `/admin/*` 디렉토리 통째 제거

- 모든 redirect 라우트 제거 (Phase 2~7에서 임시로 둔 것들).
- `src/views/admin-*` 디렉토리 정리:
  - 인라인 흡수된 것들은 `src/widgets/` 또는 도메인 entity 아래로 이동.
  - 단순 이동된 것들은 `Admin` prefix 제거.
- `src/features/admin-auth/` → `src/features/permissions/` 리네임.
- ESLint boundaries 룰 갱신 (admin layer 제거).

산출물: 정리 PR 1건. 큰 diff지만 동작 변경 없음.

### Phase 10 — 문서 최종 정합

- `README.md`에서 admin 언급 제거.
- `docs/ARCHITECTURE.md` URL 공간 표 최종.
- `docs/OPERATIONS-GUIDE.md` 최종.
- `CLAUDE.md` / `AGENTS.md` 갱신: "admin" 폐기 사실 명시.

산출물: 문서 PR 1건.

## 7. 리스크 / 트레이드오프

1. **인라인 편집의 권한 깜빡임** — 정적 export라 SSR 권한 검사 불가. Phase 1의 가드 컴포넌트로 완화하지만, 첫 로드에 read-only 셸이 잠시 보임.
2. **redirect 누적기간 동안의 URL 일관성 부담** — Phase 2~7 동안 `/admin/*`은 redirect로 살아 있음. 이 기간 사용자가 두 URL을 다 보게 됨. 가능한 한 짧게 가져가야 함 (목표: 2주 이내).
3. **knowledge subsystem v2 foundation과의 충돌** — v2가 아직 구현 중. URL 이동을 v2 작업과 같은 시점에 하면 충돌. 권장: v2 foundation의 현재 진행분을 우선 닫고 → URL 이동 → 그 위에서 v2 다음 슬라이스 진행.
4. **Firestore rules가 실제 게이트가 되어야 함** — 지금까지 라우트가 사실상 게이트였다면 Phase 1에서 rules 보강이 누락되면 권한 우회 위험. **Phase 1의 rules 단위 테스트가 게이팅 조건**.
5. **bookmark / 외부 링크 깨짐** — `/admin/*` URL을 외부에 공유한 적이 있다면 redirect는 Phase 9에서 끝나므로 그 시점부터 404. 운영 안내 필요.
6. **demo-viewer 계정의 의미** — 지금은 admin 보드를 demo로 보여주는 계정. 새 모델에선 viewer는 그냥 viewer. demo는 별도 시드 데이터로만 다룸.

## 8. 진행 게이트

다음을 진안이 confirm해야 Phase 1로 들어간다.

1. URL 매핑 표 (§4) 동의.
2. 새 URL 공간 (`/settings`, `/review`, `/diagnostics`, `/knowledge`) 네이밍 동의.
3. knowledge v2와의 순서 (foundation 먼저 닫기 vs. 동시) 결정.
4. demo-viewer 계정의 새 의미 결정.

## 9. 작업량 추정

- Phase 0: 0.5d (문서)
- Phase 1: 1d (리팩토링 + rules 테스트)
- Phase 2: 1.5d (인라인 편집 흡수가 가장 무거움)
- Phase 3: 0.5d
- Phase 4: 0.5d
- Phase 5: 0.5d
- Phase 6: 0.5–1d (v2와 조율)
- Phase 7: 0.5d
- Phase 8: 0.25d
- Phase 9: 0.5d (정리)
- Phase 10: 0.25d

총 6–7d 분량. 단, knowledge v2 진행과 직렬화하면 캘린더상으로는 더 길어질 수 있음.
