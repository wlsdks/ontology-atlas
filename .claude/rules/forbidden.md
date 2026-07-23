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

- 폐기된 namespace 부활 — `/admin/*`, `/login`, `/signup`, `/account`, `/reset-password`, `/settings/*`, `/knowledge/*`, `/review/*`, `/diagnostics/*` 등은 R10 (auth + cloud surface 영구 제거) 에서 잘려나갔다. 새 라우트 추가 시 `/`, `/topology`, `/docs`, `/ontology`, `/projects`, `/project/[slug]` 외 5 surface 안에서 디자인.
- `pages/` 라우터 도입 — App Router 만 사용.
- 정적 export 와 호환 안 되는 server-only API 라우트 (dynamic API endpoints, server actions).

## 인증 / 백엔드

- 인증 surface 부활 (login / signup / account / password reset) — **Layer 1 (로컬 코어) 에서는 영구 금지.**
- Firebase / Firestore / Cloud Functions / Storage 의존 재도입 — R10 결정. Layer 1 에는 여전히 영구 금지.
- **[v9 개정, 2026-07-17]** AGENTS.md 가 예약해 둔 cloud collab 재설계가 Layer 2 (Atlas Network) 로 조기 개시됐다 (`docs/PRODUCT-PLAN-2026-07.md`). Layer 2 의 네트워크 기능 (Spec / Hub / Team Sync 좌표 모델) 은 **신뢰 헌장 준수 시에만** 허용: ① Layer 1 은 영원히 무료·완전·오프라인 ② 조용한 수집 0, 전송은 opt-in + 로컬 감사 로그 ③ 로그인 강제 0 ④ 평문 마크다운 포터빌리티 절대 ⑤ 소급 변경 금지 ⑥ 보안 주장은 구현 공개 + 감사 초청이 있을 때만. 헌장 위반이 필요한 설계는 기능 폐기가 답이다.
- 위 헌장 밖의 백엔드 SDK 신규 도입은 여전히 금지.

## 코드 / 아키텍처

- FSD import 방향 위반 (`entities` 에서 `widgets` import 등). ESLint 가 잡지만 사람이 우회하면 거절.
- 동일 개념을 두 진입 경로 (예: vault frontmatter 와 별도 store) 에서 동시에 진실원으로 두기.
- `--no-verify` 로 git hook 우회.
- `git push --force` 를 main 에.

## 명명

- 회사 codename / 인물 이름 / 다른 서비스 브랜드 (e.g. "Aslan", "Narnia", "Notion-killer") 를 식별자 / 라벨 / 주석에 박기.
- 변수 이름이 일반 단어가 아닌 내부 codename (`reactorService`, `paravelClient`).
- 한글 prefix 커밋 메시지 (`정리:`, `구조:` 등).

## 데이터 / 보안

- Service account · API key · `.env*` 파일을 commit.
- 사용자 디스크의 임의 파일을 자동 스캔 / 업로드 (local-first 원칙 위반).
- vault 외부 (Firestore / 서버) 로 사용자 데이터 silent 전송.

## 문서

- 작업 history 주석 (`audit A2`, `iter 18`, `Track D-cont-1` 같은 ephemeral marker) 을 코드에 남기기.
- README / CLAUDE.md 에 stale link 방치 (rename 후 갱신 안 함).
- AGENTS.md 와 CLAUDE.md 가 비동기.

## 플러그인 / 확장 (2026-07-23 소유자 승인 노선)

- **코드 실행 플러그인(임의 JS 로드/실행) 영구 미지원.** 신뢰 헌장("조용한
  수집 0", "사용자 디스크 자동 스캔 금지")과 정면 충돌하고, 정적 export +
  로컬-퍼스트 약속 위에서 무감사 코드 실행을 정당화할 수 없다.
- **이 제품의 플러그인 시스템은 MCP 도구 + skills 다** — 확장 주체가 "vault
  를 읽고 쓰는 에이전트"이고, 실행 환경이 사용자가 이미 신뢰 결정을 내린
  에이전트 런타임(Claude Code/Codex/Cursor)이다.
- 허용 가능한 확장은 **선언적 확장뿐**: vault 안 md/설정으로 표현되는 것
  (저장 쿼리, 템플릿, `.ontology-atlasignore` 선례). 코드 실행 0, git diff
  로 감사 가능해야 한다.

## 의존성

- 새 dependency 추가 시 PR 본문에 이유 명시 안 하기.
- 백엔드 SDK 도입 (Firebase / Supabase / 자체 서버 등) — R10 의 local-first 약속에 맞지 않음. 미래 cloud collab 단계에서 다시 평가.
- node_modules 에 직접 patch (use `pnpm patch` instead).

## 🚫 npm publish — 사용자 명시 승인 없이 실행 절대 금지

`npm publish`, `pnpm publish`, `yarn publish` 등 **외부 레지스트리 발행 명령**은:

- 사용자가 직접 "publish 해줘" / "npm 에 올려줘" 같이 *명시적* 지시를 하기 전엔 절대 실행하지 않는다.
- "정리하자" · "다음 뭐 할까" · "마무리하자" 같은 모호한 지시는 publish 승인이 아니다.
- `.claude/settings.json` 의 PreToolUse hook 이 1차 차단하고 있고, hook 이 비활성이어도 행동 규칙으로 금지.
- *제안* 은 가능 — "이제 publish 가능합니다, 실행할까요?" 라고 묻고 사용자 답을 기다린 다음 실행.
- `npm pack --dry-run` 같은 *읽기 전용 audit* 명령은 OK. 실제 발행 (`npm publish`, `npm pack` 의 tarball 업로드, `npm version` + 자동 publish chain) 은 금지.

**왜**: npm 패키지는 영구 발행. 잘못된 버전이 나가면 24h 이후엔 되돌릴 수 없고, 사용자 본인 계정으로 발행되므로 평판이 직접 걸린다. 자동 publish 를 막아야 사용자가 PR/diff/audit 를 거쳐 의도적으로 발행할 수 있다.

## "왜" 를 물을 것

위 룰을 어겨야 한다고 느낄 때는 PR 본문에 *왜* 를 적고, 룰 자체를 갱신하는 PR 을 먼저 올려라.
