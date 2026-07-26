# Local-first / Firebase Sync 정책

> **Status**: 부분 구현 + 활성 가이드. mode-aware adapters (PR #5/#6) + useOntologyInsight (Q1=(a)) 머지로 Static / Local / Cloud 3 모드는 코드 구현 완료. Hybrid (양방향 sync) 는 v2 협업 단계.

이 문서는 *로컬 디스크의 markdown 폴더* 와 *Firebase (Firestore + Storage)* 사이의 데이터 흐름·sync·충돌 정책을 명시한다. `.claude/rules/local-first.md` 의 "Notion 처럼 폴더만 선택해도 사용" 헌장을 데이터 레이어에서 어떻게 구현하는지 정의.

관련 문서:
- `.claude/rules/local-first.md` — 헌장 (이 문서가 따른다)
- `docs/DATA-MODEL.md` — Firestore 컬렉션 스키마
- `docs/ONTOLOGY-MODEL-V2-DRAFT.md` — V1.x ontology 모델 진화 (sync 정책과 호환되어야)

---

## 1. 한 줄 요약

> **로컬 디스크가 진실원, Firebase 는 옵션 (백업 / 공유 / 협업) 에만.**

---

## 2. 4 가지 운영 모드

운영 모드는 사용자가 *명시적으로* 선택. 자동 모드 전환 없음 (사용자 혼란 방지).

| 모드 | 진입 | 데이터 진실원 | Firebase 사용 |
|---|---|---|---|
| **A. Static** | `pnpm build` 의 정적 manifest | `data/manifest.json` | 사용 안 함 |
| **B. Local** | 사용자가 폴더 선택 (File System Access API) | 사용자 디스크의 `.md` | 사용 안 함 |
| **C. Cloud** | Firebase Auth 로그인 후 sync 활성화 | Firestore | Firestore + Storage |
| **D. Hybrid** | Local + Cloud 동시 (옵션, v1.0+) | 디스크 (master) → Firestore (slave) | 단방향 push |

v0.x 는 **A · B · C** 만 지원. **D (Hybrid)** 는 v1.0 협업 단계에서 별도 spec.

### 모드 결정 규칙

1. 사용자가 토글 선택 → 그 모드 유지 (`localStorage`).
2. 첫 진입은 **A** (정적) — Firebase 미설정 / 비로그인 / 폴더 미선택.
3. 폴더 선택 → **B** 자동 전환 *지점* (단, 명시적 토글 후 적용 — Open question #1 참고).
4. Firebase 로그인 + sync 토글 ON → **C**.
5. 모드 사이 전환은 항상 *명시적*. 자동 fallback 없음 (단 unsupported 브라우저면 B → A 로 복귀).

---

## 3. 충돌 모델 (Hybrid 모드 D 의 미래)

v0.x 에는 sync 가 없으므로 충돌도 없음. 이 절은 **v1.0 Hybrid 도입 시점의 정책 가이드**.

### 3.1 단방향 push (Hybrid 의 default)

**기본**: 디스크 = master, Firestore = read-only slave.
- 디스크 변경 → Firestore 자동 push (debounce 5초).
- Firestore 변경 → 디스크에 반영 안 함 (사용자 외 누구도 못 바꿈).
- 따라서 **충돌 가능성 0** — 디스크가 single writer.

이게 v1.0 의 default. *공유* 가 목적이면 충분 (다른 사용자는 read-only 로 본다).

### 3.2 양방향 sync (먼 미래, v2.0 협업)

여러 사용자가 동시에 ontology 를 키울 때만 필요. 그때는:

**원칙 A — 의미 단위 충돌 해소** — 같은 fact 의 다중 statement 는 V1.1 의 `rank` 로 자연 표현. preferred / normal / deprecated 로 정렬.

**원칙 B — Last-write-wins per file (frontmatter)** — frontmatter 의 동일 key 는 mtime 기준. 단, 사용자가 의도적으로 *옛 값을 복원* 한 경우는 새 mtime 으로 후속 sync 에서 우선.

**원칙 C — 본문은 3-way merge** — 본문 wikilink / 텍스트 변경은 git-style 3-way merge. 충돌 시 사용자에게 표시.

**원칙 D — 지연 sync 우선** — 네트워크 단절 후 복귀 시 *항상 로컬 변경이 우선* push. 서버 변경이 충돌하면 별도 branch 처럼 보존하고 사용자에게 머지 요청.

**원칙 E — 삭제는 tombstone 으로** — 한쪽에서 삭제, 다른 쪽에서 수정 시 tombstone marker. 사용자 결정 전 데이터 보존.

이 5 원칙은 *원격 사용자 도입 전* 별도 spec 으로 deepen 필요.

---

## 4. 모드 별 데이터 흐름

### 4.1 Static (모드 A)

```
[빌드 타임]
  scripts/build-docs-vault.mjs → data/manifest.json (커밋됨)

[런타임 read]
  Static manifest → useStaticVault → 토폴로지 / 트리 / 검수 큐
```

쓰기 없음. 읽기만.

### 4.2 Local (모드 B)

```
[사용자 액션]
  showDirectoryPicker() → FileSystemDirectoryHandle → IndexedDB 영속 (local-fs-handle entity)

[런타임 read]
  IDB handle 복원 → buildLocalManifest() → useLocalVault → manifest

[런타임 write — saveDoc / createDoc / deleteDoc / renameDoc]
  manifest 의 fileHandle → createWritable() → 디스크 직접 쓰기 → manifest 재빌드 (fingerprint 비교)

[자동 새로 고침]
  focus / visibilitychange → computeLocalVaultFingerprint()
  변경 있으면 → buildLocalManifest 재실행
  변경 없으면 → no-op
```

Firebase 호출 없음. 모든 데이터는 디스크.

### 4.3 Cloud (모드 C)

```
[로그인]
  Firebase Auth (email/password 또는 Google OAuth)

[런타임 read]
  Firestore onSnapshot 실시간 구독 → React state

[런타임 write]
  upsertProject / approveNode / publishOntology 등 entity API → Firestore
```

디스크 미사용. 모든 데이터는 Firestore.

### 4.4 Hybrid (모드 D, v1.0+)

```
[모드 활성화]
  로컬 모드 + Firebase 로그인 + 사용자 명시 sync ON

[디스크 → 클라우드 (단방향)]
  fileHandle 변경 감지 (chokidar 또는 polling) → debounce 5초 →
  ontology spec V1.x 의 markdown ↔ Firestore 매핑 (§8.1) 적용 → upsertProject / 등 호출

[클라우드 → 디스크]
  v1.0 Hybrid 에서는 *없음* (single-writer).
  v2.0 협업에서만 양방향. 별도 spec.

[충돌]
  v1.0 Hybrid 에서는 없음 (single writer).
  v2.0 에서는 §3.2 의 5 원칙.
```

---

## 5. 보안 원칙

이 정책의 *모든 모드* 가 다음을 위반 금지:

- **로컬 모드 시 사용자 디스크의 비밀 파일 자동 스캔 / 업로드 금지** — `.claude/rules/local-first.md` 와 일치. dotfile (`.env*`, `.git*` 등) 은 인덱싱 제외.
- **로그인 후 sync 시 사용자 동의 없는 데이터 전송 금지** — `_actions/` 같은 schema 폴더는 명시적 opt-in 후에만 push.
- **Firebase API key 는 client OK, service account 는 server (Functions) 만** — `.claude/rules/auth.md` 와 일치.
- **사용자 데이터 암호화** — Hybrid sync 시 Firestore 에 저장되는 fact 가 사용자 디스크의 *plain* 보다 암호화 약하지 않도록. 현재 Firestore 는 transit + at-rest 암호화 (Google) 라 디스크 plain 과 동등 수준.

---

## 6. 운영 모드 식별 / 디버그

`window.__ohMyOntologyMode` 에 현재 모드 expose (개발자 도구용 — 런타임 코드는 의존하지 말 것).

`/diagnostics/sync` 페이지 (v1.0 추가 예정) 에서:
- 활성 모드 표시
- 마지막 sync 시각 / Hybrid 모드일 때
- pending writes 큐 / 실패 로그

---

## 7. v1.0 Hybrid 도입 전 결정 필요 (open questions)

이 정책의 *Hybrid* / *Cloud* 모드 가 본격 도입되려면 다음 결정 필요:

1. **Q1 (LOOP-TASK 기존)** — `/` 토폴로지가 활성 vault 가 있을 때 자동 전환되어야 하는가? *모드 B 의 자동 진입* 결정.
2. **Q-NEW-1** — Hybrid 모드의 sync 주기 — 5초 debounce 가 적절한가, 더 길게 / 짧게?
3. **Q-NEW-2** — Hybrid 모드의 *push 거부 시* 처리 — Firestore rules 가 거부하면 (예: 다른 사용자 진실원 접근) 디스크 변경을 어떻게 표시?
4. **Q-NEW-3** — `_actions/`, `_relations/`, `_classes/` schema 폴더 sync 의 권한 — 일반 사용자가 push 가능? admin 만?
5. **Q-NEW-4** — 다중 디바이스 같은 vault 동시 편집 시 — 한 디바이스 = master 룰 강제? 또는 last-write-wins? (양방향 sync 가 필요해지는 지점)

---

## 8. 코드 위치 가이드

이 정책 구현 시 코드는 다음 위치에:

| 책임 | 위치 |
|---|---|
| 모드 토글 (사용자 액션) | `src/features/sync-mode/` (신설 예정 — v1.0) |
| 디스크 ↔ Firestore mapper | `src/features/sync-mode/api/disk-to-firestore.ts` |
| File watch | `src/features/docs-vault-local/model/use-local-vault.ts` (이미 존재 — fingerprint skip 도입됨) |
| Sync queue | `src/features/sync-mode/model/sync-queue.ts` |
| Conflict UI | `src/features/sync-mode/ui/ConflictResolver.tsx` |

새 코드는 **FSD import 방향** 준수 (features → entities → shared).

---

> **결론**: v0.x 는 모드 A·B·C 만 명시적으로 운영. Hybrid 는 v1.0 별도 spec PR. 모든 모드 전환은 사용자 명시적 액션. 충돌 가능성 0 을 v1.0 Hybrid 까지 유지하고, v2.0 협업 단계에서만 양방향 sync + 5 원칙 충돌 해소 도입. 이 단계 분리가 *local-first 약속을 깨지 않으면서* 점진적 cloud 통합을 가능케 한다.
