# Plan: 로컬 폴더 모드 — 비로그인 사용자가 자기 폴더로 바로 시작

> 작성일: 2026-04-26
> 상태: 제안 (진안 승인 대기)
> 관련: [`docs/superpowers/plans/2026-04-25-admin-namespace-removal.md`](./2026-04-25-admin-namespace-removal.md), [`docs/ARCHITECTURE.md`](../../ARCHITECTURE.md)

## 1. 한 줄 요약

비로그인 사용자가 **로컬 마크다운 폴더를 picker 로 골라** 바로 프로젝트 토폴로지·문서 편집을 쓸 수 있게 한다. Firebase 0% 의존. Notion ↔ Obsidian 차별화의 핵심 funnel.

## 2. 왜 (이득)

1. **온보딩 마찰 0** — 로그인/이메일 없이 5초 체험. OSS 컨버전 가장 큰 레버.
2. **프라이버시 포지셔닝** — "Your data, your disk." Notion 과 정면 차별화. Obsidian 사용자 흡수 명분.
3. **Self-hosted 데모** — Firebase 키 없이 `git clone → pnpm dev` 로 풀 데모 가능. 오픈소스 출시 시 결정적.
4. **수익화 분리 명분** — 로컬은 무료 (viewer/editor). AI 추출·공유 링크·multi-device sync 는 cloud (유료/회원). 자연스러운 conversion 사다리.

## 3. 현재 상태 (이미 있는 인프라)

- `src/features/docs-vault-local/` 에 File System Access API 기반 로컬 폴더 picker 가 이미 있음.
- `useLocalVault()` 훅: directory handle 획득 → IndexedDB 에 저장 → markdown manifest 빌드.
- `LocalVaultPicker` UI: 폴더 권한 요청 / 표시.
- 단, **`/docs/` (Docs Vault) 한 곳에서만 사용**. 프로젝트/카테고리/상태/지식 같은 다른 도메인은 전부 Firestore 직접 호출 — 로컬 모드 적용 안 됨.

## 4. Phase A 목표 (이번 슬라이스)

**비로그인 사용자가 로컬 폴더를 픽 → 그 폴더의 `*.md` 파일들을 프로젝트로 인식 → 프로젝트 목록 + 토폴로지 보기 + 인라인 편집.**

범위 안:
- 홈 `/` 에 "로컬 폴더로 시작" CTA (로그인 옆).
- 신규 라우트 `/local` — picker + 프로젝트 목록.
- `/local/project/[slug]` — 로컬 마크다운 한 장을 프로젝트 상세로 (frontmatter 메타 + 본문 인라인 편집).
- 토폴로지: frontmatter 의 `links:` / `dependencies:` 배열로 1-hop 그래프.
- 모든 read/write 는 디스크 직접. Firestore 0회 호출.

범위 밖 (Phase B+ 후속):
- 카테고리·상태 시스템
- knowledge extraction (AI 추출 — backend 전용)
- 공유 링크
- cloud 와의 sync / 백업

## 5. 데이터 모델 (로컬 마크다운 ↔ Project)

각 `*.md` 한 장 = `Project` 한 개. frontmatter 가 메타.

```markdown
---
slug: reactor                  # 파일명 fallback
name: Reactor                  # 표시 이름
nameEn: Reactor                # 선택
description: Arc Reactor 운영 콘솔
status: in-progress            # 자유 문자열
category: service              # 자유 문자열
links:                         # 1-hop 의존 (slug 배열)
  - aslan-maps
  - groupware-mcp
tags: [hub, internal]
icon: ⚡
updatedAt: 2026-04-25
---

본문 markdown ...
```

**Firestore Project shape 와 다른 점**:
- `id` 없음 — 파일경로 자체가 식별자
- `accountId` 없음
- `position` 없음 (토폴로지 layout 은 client 가 매번 계산)
- `documents` 별도 파일이 아닌 본문 자체

## 6. 데이터 레이어 추상화 (핵심 작업)

현재 컴포넌트들이 Firestore API 를 직접 호출 (`subscribeProjects`, `upsertProject`...). 로컬 모드 추가하려면 추상화가 필요.

**`ProjectStore` 인터페이스 신설** (`src/entities/project/api/store.ts`):

```ts
export interface ProjectStore {
  subscribe(callback: (projects: Project[]) => void): () => void;
  upsert(input: ProjectInput): Promise<void>;
  remove(slug: string): Promise<void>;
  get(slug: string): Promise<Project | null>;
}
```

두 구현:
- `firestoreProjectStore(accountId)` — 기존 호출을 wrap
- `localProjectStore(directoryHandle)` — File System Access API + frontmatter parser

컴포넌트는 context provider 통해 store 를 받는다:

```tsx
// app/local/layout.tsx
<ProjectStoreProvider store={localProjectStore(handle)}>
  {children}
</ProjectStoreProvider>
```

기존 라우트는 `firestoreProjectStore` 주입. 새 `/local/*` 라우트는 `localProjectStore` 주입.

## 7. 라우트 설계

| 신규 라우트 | 역할 |
|---|---|
| `/local` | 폴더 picker. 이미 골랐으면 자동으로 `/local/projects` redirect. |
| `/local/projects` | 폴더의 `*.md` 들을 프로젝트 카드로. |
| `/local/project/[slug]` | 한 markdown 의 프로젝트 상세 + 인라인 편집. |
| `/local/topology` | (선택) 폴더 전체 토폴로지. 처음엔 home `/` 가 "로컬 모드면 로컬 데이터" 로 분기해도 됨. |

홈 `/` CTA:
- 비로그인 + 로컬 핸들 없음 → "로컬 폴더로 시작" / "로그인" 두 CTA
- 비로그인 + 로컬 핸들 있음 (IndexedDB) → 자동 `/local/projects` 진입 또는 "내 폴더로 이동" CTA

## 8. 단계별 실행

### Phase A.0 — 추상화 + spec (코드 변경 없음)
- 본 plan 확정.
- `ProjectStore` 인터페이스 합의.
- 로컬 마크다운 frontmatter 계약 합의 (§5).

### Phase A.1 — `ProjectStore` 추출 (Firestore 만 그대로)
- `src/entities/project/api/store.ts` 신설.
- 기존 `subscribeProjects` / `upsertProject` 등을 `firestoreProjectStore` 안으로 이동 (시그니처는 그대로).
- `ProjectStoreContext` + `useProjectStore()` provider.
- 기존 라우트는 root provider 에서 firestore store 주입. 동작 변화 없음.

산출물: 1 PR. 외부 동작 동일.

### Phase A.2 — `localProjectStore` 구현
- `src/entities/project/api/local-store.ts`.
- `subscribe`: 폴더 스캔 + `FileSystemObserver` 또는 visibilitychange 시 재스캔.
- `upsert`: frontmatter 갱신 + 본문 보존 + write file.
- `remove`: confirm 후 unlink.
- `get`: 파일 read + frontmatter parse.
- 기존 frontmatter parser (`src/features/docs-vault-local/`) 재활용.

산출물: 1 PR. 단위 테스트 (메모리 mock filesystem).

### Phase A.3 — `/local/*` 라우트
- `app/local/page.tsx` (picker) — 이미 있는 `LocalVaultPicker` 재활용.
- `app/local/projects/page.tsx` — `localProjectStore` 주입한 `ProjectSelectorPage` 재사용.
- `app/local/project/[slug]/page.tsx` — `ProjectDetailPage` 재사용.
- 인증 없이 접근 가능 (PermissionGate 안 씀 — 로컬 데이터는 디스크 권한이 곧 게이트).

산출물: 1 PR.

### Phase A.4 — 홈 CTA + 자동 복귀
- 홈 `/` 에 "로컬 폴더로 시작" 버튼.
- 폴더 핸들이 IndexedDB 에 있으면 "다시 열기" 자동 옵션.
- 비호환 브라우저 (Safari/Firefox) 안내 메시지.

산출물: 1 PR.

### Phase A.5 — 시드 / 첫 경험
- 빈 폴더 픽한 사용자에게 "샘플 프로젝트 5개 만들기" 버튼.
- 첫 .md 파일 5개 generate (예: `welcome.md`, `sample-hub.md` ...).
- 그 위에서 인라인 편집·토폴로지 즉시 체험.

산출물: 1 PR.

## 9. 리스크 / 트레이드오프

1. **브라우저 호환성** — File System Access API 는 Chromium 만. Safari/Firefox 는 폴백 (download manifest + 다시 upload) 또는 "Chrome 권장" 배너. Phase A 는 Chrome-only 로 한정해도 가치 큼.
2. **데이터 레이어 추상화 비용** — 기존 코드가 Firestore 호출에 박혀 있어 store 추상화는 substantial. Phase A.1 만 잘 끝내면 나머지는 적용.
3. **충돌 해결 (Phase C 영역)** — 로컬 → cloud 백업 시 conflict resolution 필요. Phase A 에서는 단방향 (로컬만) 이라 무관.
4. **knowledge extraction 작동 안 함** — backend-owned 부분이라 로컬 모드에서 비활성. UI 에서 "AI 추출은 클라우드 계정에서만" 안내 + 회원 가입 CTA. 자연스러운 conversion.
5. **테스트 분기** — local store / firestore store 두 패스. ProjectStore 인터페이스로 중앙 집중하면 비교적 적은 비용.
6. **knowledge subsystem v2 와의 시점 충돌** — v2 foundation 진행 중. 둘 동시는 위험. Phase A 는 knowledge 안 건드리니 평행 진행 가능.

## 10. 진행 게이트

진안 confirm 필요:

1. Phase A 범위 동의 (knowledge / 카테고리 / 공유 제외, 프로젝트 + 토폴로지 + 본문 편집만).
2. frontmatter 계약 (§5) 동의.
3. `/local/*` 라우트 명명 동의.
4. Chrome-only Phase A 시작 → Safari/Firefox 폴백은 후속, 동의?
5. Phase A 우선순위 — admin 폐기 후속 정리와 동시 진행 vs. 순차?

## 11. 작업량 추정

| Phase | 작업 |
|---|---|
| A.0 | 0.5d (문서) |
| A.1 | 1d (추상화 — 신중) |
| A.2 | 1.5d (local store + 테스트) |
| A.3 | 0.5d (라우트 wrapper) |
| A.4 | 0.5d (홈 CTA) |
| A.5 | 0.5d (시드 데이터) |

총 4.5d. 단 `ProjectStore` 추상화 (A.1) 는 시간 보일 수 있고 신중해야 함.

## 12. UI Patrol 과의 관계

`.improvements/ui-patrol-findings.md` 에서 본 plan 으로 포인터. 패트롤은 Phase A 진행 중에도 다음 항목 추가 검사:

- 비로그인 + 폴더 미선택 상태에서 홈 `/` 가 명확히 "로컬 폴더로 시작" CTA 를 보여주는가?
- `/local/*` surface 가 cloud surface 와 동일한 디자인 시스템을 따르는가?
- 로컬 모드에서 cloud 전용 액션 ("AI 추출", "공개 반영") 이 disabled + 안내 메시지로 표시되는가?

패트롤은 "implement Phase A" 를 직접 하진 않음 (5분 사이클을 넘는 작업). 대신 Phase A 산출물의 UI 회귀 / 디자인 일관성 점검 역할.
