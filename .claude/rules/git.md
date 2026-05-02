# Git workflow

> Auto-loaded.

## 커밋 메시지

- **형식**: 영문 conventional prefix + 한국어 (또는 영어) 본문.
- 허용 prefix: `feat:` · `fix:` · `docs:` · `refactor:` · `chore:` · `test:` · `style:` · `perf:`
- 한글 prefix (`정리`, `구조`, `루프` 등) 는 쓰지 않는다.
- 예시:
  - `feat: 검색 팔레트 모바일 시트로 분리`
  - `fix: 다크 모드 alpha 토큰 :root emit 회귀 정정`
  - `docs: 라이트 모드 토글 가이드 추가`
  - `refactor: vault-ontology 를 mode-aware 어댑터 hook 으로 통합`

본문은 변경의 **왜** 를 적는다. 무엇은 diff 가 알려준다. 줄당 80자 안.

## 브랜치

- `feat/...` · `fix/...` · `docs/...` · `chore/...` · `refactor/...`
- main 브랜치에 직접 push 하지 말 것 — 항상 PR.
- 브랜치명에 회사 codename / 인물 이름 / 다른 서비스 이름 금지.

## 커밋 단위

- 작은 단위로 자주. 한 commit 에 두 가지 이상의 작업 단위가 섞이지 않게.
- 회귀 fix 와 리팩터링은 분리.
- Docs-first — 스키마 / 라우트 / 운영 모델 변경은 같은 commit 또는 그 이전 commit 에 docs 를 갱신.

## PR

- title 은 conventional prefix 로 시작. 본문은 `Summary` + `Test plan` 두 섹션.
- 검증: `pnpm exec tsc --noEmit` · `pnpm lint` · `pnpm test:run` 통과를 PR 본문에 명시.
- 디자인 변경 PR 은 before/after 스크린샷 첨부 (다크/라이트 양쪽).

## 함부로 하지 말 것

- `--no-verify` 로 hook 우회 금지.
- `git reset --hard` / `git push --force` 는 user 명시 명령 후만.
- main 에 force push 절대 금지.
