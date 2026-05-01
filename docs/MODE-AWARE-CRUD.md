# Mode-aware CRUD 패턴

> **Status**: 도입 완료 (Phase 2-3, 2026-05-01).
> **Why**: 기획자 audit 의 root cause 1 — *모드 인지 hook 부재로 모든 게이트가 auth role 만 봄*. local vault 활성 비로그인 사용자가 mutation 불가.
> **Spec 의 위치**: `.claude/rules/local-first.md` 헌장 + `docs/LOCAL-FIRST-SYNC.md` § "운영 모드" 의 *코드 레이어 implementation*.

이 문서는 *어떤 entity 가 mutation 을 받는지가 사용자의 진실원 모드에 따라 다른 흐름* 을 갖도록 하는 패턴이다. 새 entity 에 mutation 을 추가할 때 이 가이드를 따라 mode-aware 로 만든다.

---

## 1. 운영 모드 (data source mode)

`docs/LOCAL-FIRST-SYNC.md` §2 의 4 모드 중 본 패턴이 다루는 것:

| Mode | 진실원 | mutation 가능? | 인증 필요? |
|---|---|---|---|
| **static** | `data/manifest.json` (빌드타임) | ❌ no-op + 거절 | — |
| **local** | 사용자 디스크의 `.md` (vault) | ✅ 디스크 직접 쓰기 | ❌ 비로그인 OK |
| **cloud** | Firestore `*` 컬렉션 | ✅ Firestore 쓰기 | ✅ Firebase Auth |

(hybrid 는 v1.0+ 별도 spec.)

---

## 2. 도입된 핵심 모듈

### 2.1 모드 자체를 보는 hook

- `src/shared/lib/data-source-mode.ts` — 순수 함수 `getDataSourceMode({vaultLoaded, isAuthenticated}): DataSourceMode`. 우선순위: vault loaded > authenticated > static.
- `src/features/data-source-mode/model/use-data-source-mode.ts` — `useUserAuth` + `useLocalVault` 합성 hook. `window.__ohMyOntologyMode` 디버그 expose.

### 2.2 entity 별 mode-aware mutation hook

- `src/features/project-data-source/model/use-project-mutations.ts` — Project 의 create/update/delete + canCreate/canEdit/canDelete capability. local 분기는 `useLocalVault.createDoc` / `updateFrontmatter` / `deleteDoc`, cloud 분기는 entity API.

### 2.3 entity ↔ frontmatter 매퍼

- `src/entities/docs-vault/lib/project-frontmatter.ts` — `projectToFrontmatter(project)` + `buildProjectMarkdown(project)`. local 모드 mutation 의 직렬화 유틸.

### 2.4 vault → ontology fast path

- `src/entities/docs-vault/lib/derive-ontology-from-vault.ts` — frontmatter `kind / capabilities / elements / relates / dependencies / domain` 에서 stub 노드/엣지 추출. 검수 큐 거치지 않은 *fast path* (mission v2 = frontmatter 자체가 자기-승인).
- `src/features/vault-ontology/model/use-vault-ontology.ts` — useLocalVault + derive 합성 hook.
- `src/features/vault-ontology/model/use-ontology-insight.ts` — **mission v2 신설** mode-aware ontology insight. local: vault frontmatter stub 변환, cloud: knowledgePublic projection. `/` ontology hub 가 vault 활성 시 자동 vault 모드.

### 2.5 AI agent partner (mission v2 신설)

- `mcp/` 패키지 — `@modelcontextprotocol/sdk` 기반 stdin/stdout JSON-RPC 서버. AI agent (Claude Code 등) 가 vault `.md` 직접 read/write
- 7 도구: `list_concepts` / `get_concept` / `find_evidence` / `find_backlinks` / `add_concept` / `add_relation` / `patch_concept`
- 등록: `.mcp.json.example` 또는 `mcp/README.md`

---

## 3. 새 entity mutation 을 mode-aware 로 만드는 절차

예: `Tag` 엔티티에 mode-aware CRUD 를 추가한다고 가정.

### 3.1 entity 의 frontmatter 직렬화 추가

```ts
// src/entities/docs-vault/lib/tag-frontmatter.ts
export interface TagFrontmatterShape {
  slug: string;
  name: string;
  color?: string;
}
export function tagToFrontmatter(t: TagFrontmatterShape): Record<string, ...> { ... }
export function buildTagMarkdown(t: TagFrontmatterShape): string { ... }
```

local 모드의 `.md` 가 어디 (`tags/<slug>.md`) 에 저장될지도 결정.

### 3.2 mode-aware mutation hook 신설

```ts
// src/features/tag-data-source/model/use-tag-mutations.ts
export function useTagMutations(): TagMutations {
  const mode = useDataSourceMode();
  const vault = useLocalVault();

  const createTag = async (input: TagInput) => {
    if (mode === 'static') throw new Error(STATIC_REJECTION);
    if (mode === 'local') {
      const path = `tags/${input.slug}`;
      if (vault.fileHandles.has(path)) throw new Error('이미 존재');
      await vault.createDoc(path, buildTagMarkdown(input));
      return;
    }
    // cloud
    await cloudUpsertTag(input);
  };
  // ... updateTag / deleteTag 비슷한 분기
  return { createTag, updateTag, deleteTag, canCreate: mode !== 'static', mode };
}
```

### 3.3 UI 컴포넌트에서 hook 사용

```tsx
function TagCreateForm() {
  const { createTag, canCreate, mode } = useTagMutations();

  if (!canCreate) {
    return <p>정적 데모 모드. 폴더 열기 또는 로그인 후.</p>;
  }
  // ... form
  await createTag(input);
}
```

### 3.4 게이트는 *mode* 기준, *role* 기준 X

❌ 잘못된 패턴 (audit 가 발견한 문제):
```tsx
const { canManage } = useScopedAccountAccess(); // = isLoggedIn
return canManage ? <CreateButton /> : null;     // local 사용자 차단됨
```

✅ 올바른 패턴:
```tsx
const { canCreate } = useTagMutations();        // = mode !== 'static'
return canCreate ? <CreateButton /> : null;     // local 도 OK
```

---

## 4. List subscribe 도 mode-aware (TODO — Phase 6+ 후속)

현재는 mutation 만 mode-aware. **Read 측 (subscribe)** 은 아직 Firestore 우선:
- `subscribeProjects(accountId, ...)` — Firestore 만 본다.
- 결과: local 모드 사용자가 새 vault project 추가해도 list 에 안 나옴 (vault manifest 변경은 별도 surface).

향후 도입 권장:
```ts
// src/features/project-data-source/model/use-projects.ts
export function useProjects() {
  const mode = useDataSourceMode();
  // mode === 'local' → useLocalVault().manifest 의 projects/*.md 를 buildTopologyFromVault 로
  // mode === 'cloud' → subscribeProjects (entity API)
  // mode === 'static' → vaultManifest static
}
```

이렇게 하면 *consumer 가 mode 인지 없이* 동일 hook 사용. 현재는 view 가 직접 entity API 호출 — 점진 swap 필요.

---

## 5. e2e 테스트 가이드

각 mode-aware mutation 마다 3 시나리오 e2e:
- **static**: createX 호출 시 거절 (toast or throw).
- **local**: vault picker mock 후 vault active → createX → 디스크 .md 생성 확인.
- **cloud**: Firebase Auth emulator 로 로그인 → createX → Firestore doc 생성 확인.

본 시점 (2026-05-01) 의 e2e 는 local/cloud 시나리오가 미구현. Phase 6+ 후속.

---

## 6. 관련 spec / 룰

- `.claude/rules/local-first.md` — 헌장
- `docs/LOCAL-FIRST-SYNC.md` — 4 모드 정의 + 충돌 모델
- `docs/OFFLINE-FIRST-UX-FLOW.md` — UI 흐름 가이드 (5 페이지 게이트 분류 §5)
- `docs/ONTOLOGY-MODEL-V2-DRAFT.md` — V1.x ontology 진화 (V1.4 ActionType 도 mode-aware capability 받음)

---

## 7. anti-pattern 모음 (회귀 차단)

도입 전에 발견된 (그리고 fix 된) 안티 패턴:

| ❌ | 해결 |
|---|---|
| `const accountId = null; useScopedAccountAccess(accountId)` 식 항상 null 하드코드 | `accountId` 파라미터 제거 (B4) |
| Firestore 의 `Missing or insufficient permissions` raw 메시지가 사용자에게 그대로 노출 | accountId === null 면 구독 자체 skip + 빈 그래프 + loaded:true |
| `<PermissionGate>` 가 페이지 entry 통째 차단 | 진입 게이트 → submit 시점 게이트 (Phase 3.2) |
| entity API 가 `upsertProject(input)` 만 — Firestore 외 path 없음 | 호출자 (UI) 가 mode-aware hook 거쳐 분기. entity 는 그대로 cloud-only 유지하되 새 hook 이 wrapper 로 동작. |

---

> **결론**: mode-aware CRUD 는 *local-first 헌장의 코드 레이어 표현*. 새 entity 에 mutation 을 추가할 때 §3 의 4 단계를 따라 mode-aware 로. 이 패턴이 깨지면 *비로그인 + vault 사용자가 다시 dead-end* 회귀 — 헌장 위반.
