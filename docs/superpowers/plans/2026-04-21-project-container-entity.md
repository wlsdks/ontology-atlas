# P0-B · Project 컨테이너 entity 도입 — Workspace > Project > Hub > Node 4-layer

**시작일:** 2026-04-21
**목표:** 현재 평면 `projects` 컬렉션 (isHub 플래그로 허브 여부 구분) 구조를, "워크스페이스 안에 여러 **컨테이너 프로젝트**, 각 컨테이너 안에 여러 **허브**, 허브에 연결된 **노드**" 로 4-layer 로 재구성.

## 배경

사용자가 여러 iter 에 걸쳐 지적한 용어 혼란:

> "허브도 프로젝트고 허브가 아닌것도 프로젝트라고 칭해서 너무너무 헷갈리거든?"

현재 데이터 모델:

```
accounts/{accountId}/projects/{slug}
  - name, isHub, dependencies[], ...
```

모든 것이 `projects` 의 row. "프로젝트" 라는 단어가 **워크스페이스 지도 · 허브 · 서비스** 셋 다를 동시에 지시.

목표 4-layer:

```
Workspace  (= Account, 기존 accounts/{id})
  └── Project  (container, 새 entity — 수백 개/workspace)
       └── Hub  (major system — 수백 개/project, 현재 "isHub=true" 역할)
            └── Node  (구성 요소 — 허브에 연결, 현재 "isHub=false" 역할)
```

## 용어 확정

| 코드 이름 | 한글 라벨 | 역할 | 기존 대응 |
|---|---|---|---|
| `Account` | "워크스페이스" | 최상위 공간 (유저 1인당 1공간) | 현재 그대로 |
| `WorkspaceProject` | "프로젝트" | 한 워크스페이스 내부의 논리 묶음 (예: "Narnia 플랫폼") | **신규** |
| `Hub` | "허브" | 한 프로젝트 내 주요 시스템 | 기존 `projects` 의 `isHub=true` |
| `Node` / `Service` | "노드" 또는 "서비스" | 허브에 연결된 구성 요소 | 기존 `projects` 의 `isHub=false` |

`WorkspaceProject` 이름은 기존 `entities/project/Project` 와 충돌 피하려 명시적으로 "workspace" prefix. 장기적으로 기존 `Project` 를 `Hub`/`Node` 로 rename 하면 prefix 제거 가능.

## Firestore 스키마 (목표)

```
accounts/{accountId}
  └── projects/{projectId}              # WorkspaceProject 컨테이너 (신규)
       ├── hubs/{hubId}                  # 허브 (기존 projects 중 isHub=true 이관 예정)
       │    └── nodes/{nodeId}           # 노드 (기존 projects 중 isHub=false 이관 예정)
       └── (기타 project-scoped: knowledgeDocuments 등도 이쪽으로 묶을지 검토)
```

**마이그레이션 전략:**
1. 기본 `General` 프로젝트 1개 자동 생성 — `accounts/{accountId}/projects/general`
2. 기존 `accounts/{accountId}/projects/{slug}` row 를 `accounts/{accountId}/projects/general/hubs/{slug}` 또는 `.../nodes/{slug}` 로 이관 (isHub 플래그 기준)
3. 이관 완료 후 기존 row 는 삭제 (또는 soft delete)
4. 마이그레이션 함수는 admin-only, 한 번만 돌려도 idempotent

⚠️ 당장 스키마 migration 을 강제하지 않음. 먼저 **병존 단계** 를 둬서 신규 WorkspaceProject 컬렉션을 추가하고 UI 도 adapter 로 두 스키마 모두 읽기 가능하게 만든 뒤, 사용자가 "마이그레이션 실행" 버튼을 누를 때만 이관.

## 단계별 플랜

### Phase 0 — 설계 (이 문서, 완료)

### Phase 1 — entity 타입 스켈레톤 (미사용, 안전)
- `src/entities/workspace-project/` 신규
  - `model/types.ts`: `WorkspaceProject` 타입
  - `model/mapper.ts`: Firestore ↔ domain 변환
  - `index.ts`: export
- 어디에도 import 하지 않음. 타입만 생김.
- 검증: tsc · lint · test 통과

### Phase 2 — Firestore rules · API skeleton
- `firestore.rules` 에 `accounts/{accountId}/projects/{projectId}` 패턴 추가
  (기존 `/projects/{projectId}` 는 legacy 로 남김)
- `api/workspace-project-api.ts`: listByAccount · getById · upsert · subscribe
- 아직 어떤 UI 도 이 API 를 사용하지 않음. 테스트만.

### Phase 3 — 자동 기본 프로젝트 보장
- `ensureOwnWorkspace` 의 패턴과 유사하게, 로그인 후 `accounts/{uid}/projects/general` 가 없으면 자동 생성
- 기존 `ensureOwnWorkspace` 확장 or 신규 `ensureDefaultWorkspaceProject`

### Phase 4 — UI 도입 (비파괴)
- `/` 홈은 계속 flat projects 를 보여주되, 위쪽에 "프로젝트" 셀렉터 바 추가 (default "전체")
- WorkspaceProject 목록 페이지 `/projects` 재활용 또는 새 `/projects` 은 컨테이너 리스트, `/projects/{id}` 는 그 컨테이너의 허브 지도
- 과도기: 하나의 "General" 컨테이너만 노출

### Phase 5 — 데이터 이관
- admin 전용 "마이그레이션 실행" 버튼 (이미 있는 snapshot 툴 근처)
- accounts/{accountId}/projects/{slug} → accounts/{accountId}/projects/general/hubs|nodes/{slug} 복제
- 이관 완료 flag: `accounts/{accountId}/meta.migratedToContainer: true`
- 기존 row 삭제는 별도 버튼 (안전상 분리)

### Phase 6 — Legacy 제거
- flat projects 읽기 경로 제거
- 라우트 redirect: `/` 의 전체 지도는 "General 컨테이너" 자동 선택 상태로
- E2E 테스트 업데이트

## 위험 · 완화

- **기존 데이터 손실**: Phase 5 마이그레이션은 복제 후 flag 설정까지 실행, 삭제는 별도. Firestore snapshot export 먼저 권장.
- **URL 파괴**: 기존 `/project/{slug}` 북마크는 redirect 로 `/p/{container}/{hub}` 같은 새 URL 로 이동. static export 제약상 Suspense wrapper + client redirect.
- **성능 회귀**: `nodes/{nodeId}` 서브컬렉션 수가 커지면 쿼리 비용 증가. Phase 2 에서 인덱스 설계 동반.

## Endgame 정합

- M2 HTTP API (`POST /api/v1/docs`) 는 `{accountId, projectId, hubId?}` 3-tuple 을 받아야 함. 신규 entity 가 이 contract 의 backbone.
- M4 presence 는 "누가 어디서 작업 중" 에서 "어디" 가 `project/hub/node` 계층이라 설명이 명확해짐.

## 종료 조건

- Phase 5 마이그레이션이 성공한 사용자 계정에서 UI 상 4-layer 가 자연스럽게 동작
- 기존 flat `projects` 컬렉션을 삭제해도 아무 기능이 깨지지 않음 (Phase 6 완료)
- P0-B 마스터 체크박스 ✅

## Phase 기록 (진행 중 업데이트)

- [x] Phase 0 — 설계 문서 (iter 47, 2026-04-21)
- [x] Phase 1 — entity 타입 스켈레톤 (iter 47)
- [x] Phase 2 — Firestore rules · API skeleton (iter 48)
- [x] Phase 3 — 자동 기본 프로젝트 보장 (iter 49)
- [x] Phase 4 — UI 셀렉터 바 (iter 50–52, 59 dropdown 확장)
- [x] Phase 5 — 마이그레이션 실행 (iter 53–58, write + 라이브 검증)
- [x] Phase 6 — read/write/delete 어댑터 점진 전환 (iter 60–71)
  - URL `?pj=` 양방향 동기화 (iter 60, 67)
  - subscribe/get/list adapter (iter 61, 65)
  - HomePage / ProjectSelector / ProjectDetail read swap (iter 63–65)
  - upsert/create/delete adapter + ProjectDetail / ProjectQuickEdit /
    ProjectQuickCreate / AdminProjectEditor / AdminProjectImport /
    AdminDashboard write swap (iter 68–71)
- [ ] Phase 7 — Legacy flat 컬렉션 제거 (다음)

## Phase 7 — Legacy flat 제거 (계획)

**목표:** `accounts/{accountId}/projects/{slug}` (및 root `projects/{slug}`) 읽기·쓰기 경로를 코드에서 완전 제거. workspaceProjects 만 남는 단일 진실원.

**선행 조건:**
1. 사용자가 모든 활성 워크스페이스에 대해 마이그레이션 1회 실행 완료
2. 기존 flat 데이터와 컨테이너 데이터의 차이 확인 (admin 검증 카드 라이브 카운트 동일)

**단계:**
1. **잔여 비-adaptive 호출처 swap** — `seed-runner` · `restore-admin-snapshot` 도 컨테이너 컨텍스트(option 또는 runtime URL) 인지하도록 확장. 현재는 forward-compat `accountId?` 파라미터만 추가된 상태.
2. **flat 경로 read 함수 alias** — `subscribeProjects` / `listProjects` / `getProject` 가 내부에서 `subscribeProjectsForContainer("general")` 등 컨테이너 경로로 라우팅. 한 번에 swap 하지 않고 컨테이너 데이터가 비어있지 않으면 컨테이너 우선, 비어있으면 flat fallback.
3. **flat 의존 코드 grep 제거** — `appendAccountQuery("/admin/...")` 외 직접 collection 접근하는 곳 모두 컨테이너 경로 사용으로 통일.
4. **Firestore rules 업데이트** — `accounts/{accountId}/projects/{projectId}` rules 제거. dev-admin-bypass 같은 우회 경로의 flat write 도 정리.
5. **flat 데이터 archive 삭제 도구** — admin/migrate 페이지에 "삭제 단계" 추가. 마이그레이션 후 사용자 확인 받고 flat row 제거.
6. **테스트 정리** — `subscribeProjects` 등의 fallback 분기 제거 후 단위 테스트 단순화.

**위험·완화:**
- read 라우팅 변경 직후 사용자 데이터가 안 보일 수 있음 → step 2 의 fallback 으로 1단계 안전장치.
- 마이그레이션 안 한 사용자가 있다면 flat → 컨테이너 자동 마이그레이션 트리거 (Cloud Function 으로 백그라운드 실행) 검토.
- snapshot/seed 같은 admin 도구는 컨테이너 인지 옵션 미적용 시 flat 으로 폴백 — 사용자 혼란 방지.
