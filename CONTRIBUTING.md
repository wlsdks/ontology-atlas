# Contributing to oh-my-ontology

오픈소스 컨트리뷰션을 환영합니다. 이 가이드는 처음 참여하는 분이 5 분 안에 첫 PR 흐름을 이해할 수 있게 만든 짧은 안내입니다.

## 시작하기

```bash
git clone https://github.com/wlsdks/oh-my-ontology.git
cd oh-my-ontology
pnpm install
cp .env.example .env.local        # Firebase 사용 시 값 채움 (없어도 dev 서버는 뜸)
pnpm dev                          # http://localhost:3000
```

자세한 작업 가이드는 [`AGENTS.md`](AGENTS.md) 와 [`.claude/rules/`](.claude/rules/) 안 9 개 rule 파일을 참조하세요.

## PR 워크플로

1. **Issue 로 의도 공유** — 코드 변경 전에 issue 또는 discussion 으로 방향을 짧게 적어주세요. 작업 중복 / 방향 차이 방지.
2. **새 브랜치에서 작업** — `feat/...`, `fix/...`, `docs/...`, `chore/...`, `refactor/...` prefix.
3. **작은 단위로 커밋** — 한 commit 에 두 가지 작업 단위가 섞이지 않게.
4. **검증 통과 확인** —
   ```bash
   pnpm exec tsc --noEmit          # 0 errors
   pnpm lint                       # 0 errors
   pnpm test:run                   # 모든 단위 test 통과
   ```
5. **PR 본문 작성** — `Summary` / `Test plan` 두 섹션. 디자인 변경은 before/after 스크린샷 (다크 / 라이트 양쪽).
6. **review** — main 브랜치는 항상 PR 통해 머지. 직접 push 금지.

## 커밋 메시지

영문 conventional prefix + 한국어 (또는 영어) 본문.

허용 prefix: `feat:` · `fix:` · `docs:` · `refactor:` · `chore:` · `test:` · `style:` · `perf:`

예시:

```
feat: 검색 팔레트 모바일 시트로 분리
fix: 다크 모드 alpha 토큰 :root emit 회귀 정정
docs: contributor 가이드 작성
```

본문은 변경의 **왜** 를 적습니다. **무엇** 은 diff 가 이미 알려줍니다.

## 코드 스타일

- TypeScript strict, `pnpm lint` 가 통과해야 함
- ESLint `eslint-plugin-boundaries` 가 FSD import 방향을 강제 — 위반 시 빌드 깨짐
- 자세한 룰: [`.claude/rules/architecture.md`](.claude/rules/architecture.md), [`.claude/rules/design.md`](.claude/rules/design.md)

## 디자인 룰

- **Linear 베이스, 무채색 + 단일 인디고** 라는 극단적 제약. 자세한 토큰 / 모션 / 금지 패턴: [`docs/DESIGN-SYSTEM.md`](docs/DESIGN-SYSTEM.md), [`.claude/rules/design.md`](.claude/rules/design.md), [`.claude/rules/forbidden.md`](.claude/rules/forbidden.md)
- 새 brand color, glassmorphism, glow pulse, scale hover 같은 패턴은 PR 단계에서 반려됩니다.

## 테스트

- 단위 / 컴포넌트: Vitest + Testing Library
- E2E: Playwright
- TDD-first 가 권장 — 새 기능 / 버그 fix 전에 실패하는 test 부터.
- 자세한 룰: [`.claude/rules/testing.md`](.claude/rules/testing.md)

## 데이터 모델 변경

스키마 변경은 **문서가 먼저** 입니다.

1. `docs/DATA-MODEL.md` 갱신
2. `firestore.rules` / `storage.rules` / `firestore.indexes.json` 같이 수정
3. `src/entities/*/model` 타입 + `src/entities/*/api` CRUD 시그니처 확인
4. emulator 로 검증 — `pnpm dev:firestore-emulator`
5. 마이그레이션 필요하면 `scripts/migrations/` 에 스크립트 추가

자세한 룰: [`.claude/rules/firestore-schema.md`](.claude/rules/firestore-schema.md)

## 인증

Firebase Auth (email/password + Google OAuth) 만 허용. 외부 IAM 연동 / magic link / OTP 신규 흐름 도입은 거절합니다.

자세한 룰: [`.claude/rules/auth.md`](.claude/rules/auth.md)

## Local-first 원칙

이 프로젝트의 가장 큰 UX 약속은 **"Notion 처럼 — 폴더만 선택하면 바로 쓰고, 로그인은 옵션"** 입니다.

새 기능을 만들 때 가장 먼저 묻는 질문: **"로그인 없이 동작 가능한가?"**. 자세한 가드: [`.claude/rules/local-first.md`](.claude/rules/local-first.md)

## 행동 강령

- 의견 차이는 issue / PR 댓글에서 직설적이지만 친절하게.
- 회사 codename, 타사 이름, 다른 contributor 의 인적 정보를 코드 / 주석 / 커밋에 박지 마세요.
- 보안 이슈는 public issue 가 아닌 maintainer 에게 직접 (이메일).

## 라이선스

contribution 은 [MIT License](LICENSE) 아래로 라이선싱됩니다.
