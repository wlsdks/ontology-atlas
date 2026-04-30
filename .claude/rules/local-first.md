# Local-first / offline-first principle

> Auto-loaded. **이 프로젝트의 가장 큰 UX 약속.**

## 한 줄

> **Notion 처럼 — 폴더만 선택하면 바로 쓰고, 로그인은 옵션이다.**

## 이게 의미하는 바

1. **로그인 없이 0 마찰 진입** — `pnpm dev` 후 첫 화면이 사용 가능해야 한다. 인증 게이트가 default 진입을 막지 않는다.
2. **폴더 선택만으로 사용** — 사용자는 로컬 디스크의 markdown 폴더를 가리켜 즉시 토폴로지·트리·검수 흐름에 들어간다 (File System Access API 기반, `src/features/docs-vault-local/`).
3. **데이터는 사용자 디스크가 우선, Firebase 는 옵션** — 로그인하지 않으면 IndexedDB / 디스크에만 저장. 로그인 후엔 Firebase 와 sync.
4. **단일 사용자 모델로 시작** — multi-account workspace 는 v2 협업 단계에서. v0.x 는 1인 도구.

## 코드 가드

- 새 기능을 만들 때 **"로그인 없이 동작 가능한가?"** 를 먼저 물어본다.
- Firebase 의존이 필수 같으면, 그 기능은 옵션이거나 단계적 enhancement 로 디자인한다.
- 권한 게이트 (`PermissionGate`, `useScopedAccountAccess`) 가 default 흐름을 막지 않게 둔다 — 게이트는 *데이터 변경* 같은 명시적 액션 앞에서만 활성화.
- `src/features/docs-vault-local/` 가 로컬 폴더 기반 흐름의 진입점. 새 기능은 가능하면 이 흐름과 호환되게.

## 데이터 모델 가드

- Firebase 컬렉션을 기획할 때 같은 데이터의 **로컬 표현** 도 같이 디자인한다.
- IndexedDB / File-System-Access 에서 표현 가능한 형태가 아니면 다시 생각.
- 단순한 데이터를 우선 — 복잡한 cross-collection 관계 강제는 v2 로 미룬다.

## 인증

- Firebase Auth (email/password + Google) 만. 외부 IAM 연동 금지 — `.claude/rules/auth.md` 참조.
- 로그인하지 않은 사용자도 페이지를 본다. 차단은 *서버 변경* / *공유* 같은 명시적 액션 단계에서만.

## 보안

- Local 모드여도 사용자 디스크의 secret / credentials 같은 파일은 절대 자동 스캔 / 업로드하지 않는다.
- `.env.local` 같은 dotfile 은 인덱싱에서 제외.
- 로그인 후 sync 시 사용자 동의 없는 데이터 전송 금지.
