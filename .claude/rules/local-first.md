# Local-first / offline-first principle

> Auto-loaded. **이 프로젝트의 가장 큰 UX 약속.**

## 한 줄

> **Notion / Obsidian 처럼 — markdown 폴더만 선택하면 바로 쓴다. 백엔드 의존 0.**

## [v9 개정, 2026-07-17] 2층 정체성

이 문서의 약속은 이제 **Layer 1 (로컬 코어)** 의 불변 계약이다. v9 계획
(`docs/plans/PRODUCT-PLAN-2026-07.md`) 이 **Layer 2 (Atlas Network — Spec 표준 ·
Hub 레지스트리 · 수요 게이트 뒤 유료 Team Sync 좌표 모델)** 를 추가했다.
Layer 2 는 선택적이며 forbidden.md 의 신뢰 헌장을 따를 때만 존재할 수 있다.
Layer 1 사용자는 Layer 2 없이 어떤 기능 저하도 겪지 않는다. LLM 연결 (BYOK /
localhost) 은 opt-in + 전송 범위 UI 명시 + 로컬 감사 로그 조건으로 허용된다.

## 이게 의미하는 바 (R10 — auth + cloud surface 영구 제거, Layer 1 기준)

1. **0 마찰 진입** — `pnpm dev` 후 첫 화면이 즉시 사용 가능. 인증 / 가드 자체가
   존재하지 않는다 (R10).
2. **폴더 선택만으로 사용** — 사용자는 로컬 디스크의 markdown 폴더를 가리켜 즉시
   토폴로지·트리·빌더 흐름에 들어간다 (File System Access API 기반,
   `src/features/docs-vault-local/`).
3. **사용자 디스크가 단일 진실원** — vault 의 frontmatter 가 그대로 ontology.
   별도 백엔드 / Firestore / Storage 의존 없음. 데이터는 사용자 디스크 + IndexedDB
   에만 저장.
4. **단일 사용자 모델** — v0.x 는 1인 도구. multi-account / 협업은 미래
   cloud collab 단계가 다시 도입될 때 새로 디자인.

## 코드 가드

- 새 기능을 만들 때 **"vault 만으로 동작 가능한가?"** 를 먼저 물어본다.
- 백엔드 (Firestore / 서버 sync 등) 가 필수처럼 보이면 디자인 다시 — 사용자
  디스크에 markdown 으로 표현 가능한 모델로 환원.
- `src/features/docs-vault-local/` 가 로컬 폴더 기반 흐름의 진입점. 새 기능은
  이 흐름과 호환되게.

## 데이터 모델 가드

- vault frontmatter 가 곧 schema. 별도 store / 컬렉션 도입 금지.
- IndexedDB 는 vault 캐시 / 사용자 설정 저장 정도까지만 — 진실원이 되어선 안 됨.
- 단순한 data shape 우선. 복잡한 cross-vault 관계 강제는 미래 단계로.

## 인증

- **인증 surface 0** — login / signup / account / password reset 모두 R10 에서
  영구 제거. `@/features/user-auth` / `@/features/permissions` /
  `@/features/account-scope` 모두 삭제됨. 새 라우트 추가 시 인증 가드 부활 금지.
- 미래 cloud collab 단계가 다시 도입될 때 인증 + 권한 모델 새로 디자인.

## 보안

- 사용자 디스크의 secret / credentials 같은 파일은 절대 자동 스캔하지 않는다.
- `.env.local` / `.git/` 같은 dotfile / 시스템 폴더는 vault 인덱싱에서 제외.
- vault 외부 (HTTP / WebSocket / 외부 API) 로 사용자 데이터 silent 전송 금지.
