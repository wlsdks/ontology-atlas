# Git Workflow 규칙

## 브랜치

- **네이밍**: `feature/{english-kebab-case}` 로 통일. 타입 구분 prefix 없음.
  - ✅ `feature/initial-design-spec`
  - ✅ `feature/project-node-component`
  - ✅ `feature/fix-admin-auth`
  - ❌ `feat/xxx`, `docs/xxx`, `fix/xxx` (prefix 분산 금지)
  - ❌ `feature/프로젝트노드` (한글 금지)
- 브랜치 생성은 자유, **삭제는 사전 확인**

## 커밋

- **작업 단위마다 커밋** — 큰 덩어리 금지. 논리적으로 독립된 단위마다 commit.
- **메시지 형식**: `타입: 한글 설명`
  - **타입**: 영어 (`feat`, `fix`, `docs`, `refactor`, `chore`, `style`, `test`)
  - **설명**: 한글로 "무엇을 왜"
- **예시**:
  - `feat: 프로젝트 노드 컴포넌트 추가`
  - `fix: 어드민 인증 가드 리디렉션 경로 수정`
  - `docs: FSD 아키텍처 규칙 업데이트`
  - `chore: Next.js 정적 export 설정 추가`

## Merge

- main으로 merge — 기본 `--no-ff` merge commit (브랜치 히스토리 유지)
- **squash는 사용자가 요청할 때만**

## 금지 행위 (사전 확인 없이 절대 금지)

- `git reset --hard`
- `git push --force` / `--force-with-lease`
- 브랜치 삭제 (`branch -D`, `branch -d`)
- `checkout .`, `restore .`, `clean -f`
- main에 직접 커밋 (항상 브랜치 경유)
- `--no-verify` (hook 건너뛰기)
- `--amend` (push된 커밋에 대한)

## Co-author

AI가 생성한 커밋은 항상 다음을 포함:

```
Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
```

## Merge 요청 템플릿

```bash
git checkout main
git merge feature/xxx --no-ff -m "Merge branch 'feature/xxx'

<한 줄 요약>

<상세 변경 내역>

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```
