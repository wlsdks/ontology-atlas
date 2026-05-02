# Forbidden patterns — 절대 하지 말 것

> Auto-loaded. 위반은 PR 단계에서 반려된다.

## 디자인

- 보라 → 핑크 그라디언트
- glassmorphism (`backdrop-blur-*`)
- glow pulse · neon · halo animation
- 움직이는 그라디언트 배경 · 오로라
- scale 기반 hover (`hover:scale-*`)
- 둘 이상의 채색 시스템 (인디고 외 새 brand color 추가)

세부: `@.claude/rules/design.md` · `@docs/DESIGN-SYSTEM.md`.

## 라우팅

- `/admin/*` 네임스페이스에 라우트 추가 — 폐기됨. `/settings/*` · `/review/*` · `/diagnostics/*` 로.
- `pages/` 라우터 도입 — App Router 만 사용.
- 정적 export 와 호환 안 되는 server-only API 라우트 (dynamic API endpoints, server actions).

## 인증

- 외부 IAM provider 연동 (`NEXT_PUBLIC_IAM_BASE_URL`, JWT 자체 발급).
- Magic link / SMS / OTP 신규 흐름.
- localStorage 에 raw jwt 또는 password 저장.

세부: `@.claude/rules/auth.md`.

## 코드 / 아키텍처

- FSD import 방향 위반 (`entities` 에서 `widgets` import 등). ESLint 가 잡지만 사람이 우회하면 거절.
- 동일 개념을 두 컬렉션 / 두 진입 경로에서 동시에 진실원으로 두기.
- **`@/entities/<x>` 메인 barrel 에서 firestore api 함수 export 추가** — local-first 첫 paint 청크에 firebase JS 가 leak. api 는 `@/entities/<x>/api` 로만 진입. 자세히 `@.claude/rules/architecture.md`.
- **mapper 에서 `instanceof Timestamp` 사용** — firebase/firestore 정적 import 가 entity model 까지 끌고 와 청크 회귀. `@/shared/lib/firestore-timestamp-coerce` 의 `coerceFirestoreDate` 사용.
- `--no-verify` 로 git hook 우회.
- `git push --force` 를 main 에.

## 명명

- 회사 codename / 인물 이름 / 다른 서비스 브랜드 (e.g. "Aslan", "Narnia", "Notion-killer") 를 식별자 / 라벨 / 주석에 박기.
- 변수 이름이 일반 단어가 아닌 내부 codename (`reactorService`, `paravelClient`).
- 한글 prefix 커밋 메시지 (`정리:`, `구조:` 등).

## 데이터 / 보안

- Service account · API key · `.env*` 파일을 commit.
- 사용자 디스크의 임의 파일을 자동 스캔 / 업로드 (local-first 원칙 위반).
- Firestore rules 변경 없이 새 컬렉션 사용.

## 문서

- 작업 history 주석 (`audit A2`, `iter 18`, `Track D-cont-1` 같은 ephemeral marker) 을 코드에 남기기.
- README / CLAUDE.md 에 stale link 방치 (rename 후 갱신 안 함).
- AGENTS.md 와 CLAUDE.md 가 비동기.

## 의존성

- 새 dependency 추가 시 PR 본문에 이유 명시 안 하기.
- `firebase` 외에 별도 백엔드 SDK 도입 (v0.x 범위 밖).
- node_modules 에 직접 patch (use `pnpm patch` instead).

## "왜" 를 물을 것

위 룰을 어겨야 한다고 느낄 때는 PR 본문에 *왜* 를 적고, 룰 자체를 갱신하는 PR 을 먼저 올려라.
