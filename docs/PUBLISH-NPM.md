# npm publish 단계별 가이드

이 프로젝트는 두 npm 패키지를 publish 합니다:

| 패키지 | 위치 | 무엇 | publish 필수성 |
|---|---|---|---|
| `oh-my-ontology-mcp` | `mcp/` | MCP 서버 (AI agent 가 vault read/write) | **필수** — AI agent 통합의 핵심 |
| `oh-my-ontology` | `cli/` | `init` CLI (vault scaffold) | **선택** — web workbench 의 scaffold 버튼이 대체 가능 |

> **비용**: $0 — npm 의 public package 는 영구 무료. 다운로드/사용자 무제한.
> 단, npm 계정 + 2FA 가 필요 (계정도 무료).

---

## 사전 점검 (이미 끝남, 참고용)

`pnpm` 의 npm pack dry-run 으로 어떤 파일이 publish 될지 사전 확인 가능:

```bash
cd mcp
npm pack --dry-run
# Tarball Contents 표시 — README.md, package.json, src/*, scripts/verify.mjs
# 이 외 파일은 publish 안 됨

cd ../cli
npm pack --dry-run
# README.md, package.json, src/index.mjs, templates/vault/*.md
```

이미 audit 끝 — secret/PII 0, 절대경로 0.

---

## 1단계: npm 계정 만들고 로그인

### a) npm 계정 만들기 (이미 가입했다면 skip)

1. https://www.npmjs.com/signup — 이메일 + 패스워드 (비번은 강하게)
2. 이메일 인증 (메일에서 링크 클릭)
3. **2FA 설정 강력 권장** — 계정 lock 방지:
   - 로그인 후 https://www.npmjs.com/settings/{username}/account
   - "Two-Factor Authentication" 섹션 → "Enable 2FA"
   - "auth-only" 모드 선택 (publish 시점에만 OTP 입력) — 모바일 OTP 앱 (1Password / Authy / Google Authenticator) 으로 QR 스캔
   - **recovery codes 안전한 곳에 저장**

### b) 터미널에서 로그인

```bash
npm login
# 브라우저가 열리고 npm 로그인 페이지로 이동
# 로그인 후 OTP 입력
# "Logged in as <username>" 메시지 뜨면 성공
```

확인:

```bash
npm whoami
# 본인 username 출력되면 OK
```

---

## 2단계: 패키지 이름 사용 가능한지 확인

```bash
npm view oh-my-ontology
# 만약 "404 Not Found" 면 사용 가능 (✅)
# 만약 패키지 정보가 나오면 이미 다른 사람이 사용 중 — 다른 이름 필요

npm view oh-my-ontology-mcp
# 동일 체크
```

만약 충돌하면:
- 옵션 A: 다른 이름 (예: `wlsdks-oh-my-ontology`)
- 옵션 B: scope 사용 (`@wlsdks/oh-my-ontology`) — 공개 scope 도 무료

---

## 3단계: MCP 서버 publish (먼저, 핵심이므로)

```bash
cd mcp
npm publish --access=public
# OTP 입력 (2FA 활성화한 경우)
# "+ oh-my-ontology-mcp@0.5.0" 출력되면 성공
```

확인:
- https://www.npmjs.com/package/oh-my-ontology-mcp 페이지가 뜸
- `npx -y oh-my-ontology-mcp` 가 어디서든 동작 (테스트해보려면 다른 디렉토리에서):

```bash
cd /tmp
OMOT_VAULT=/path/to/some/folder npx -y oh-my-ontology-mcp
# 서버가 시작되며 stdin 대기 — Ctrl+C 로 종료
```

---

## 4단계: CLI publish (선택)

```bash
cd cli
npm publish --access=public
# OTP 입력
```

확인:

```bash
cd /tmp
npx oh-my-ontology --help
# Help 메시지 출력
npx oh-my-ontology init test-vault
# test-vault 폴더에 5 md + .mcp.json.example 시드
rm -rf test-vault
```

CLI 를 publish *안* 하려면? — 사용자는 web workbench 의 `/docs` 페이지에서
"starter 시드 만들기" 버튼으로 같은 결과 얻을 수 있음. CLI 는 *AI-native
developer 의 1줄 setup* 편의용.

---

## 5단계: 동작 확인

### A) AI agent 등록 (Claude Code 예시)

`~/.config/claude-code/mcp.json` (또는 적절한 경로) 에:

```json
{
  "mcpServers": {
    "oh-my-ontology": {
      "command": "npx",
      "args": ["-y", "oh-my-ontology-mcp"],
      "env": {
        "OMOT_VAULT": "/Users/me/my-vault"
      }
    }
  }
}
```

Claude Code 재시작 → tool 목록에 `oh-my-ontology__list_concepts` 등 11
도구가 나타나면 성공.

### B) 사용자 vault 시작 (CLI 사용 케이스)

```bash
# 어디서든
npx oh-my-ontology init my-vault
cd my-vault
ls -la
# 5 md + .mcp.json.example
```

### C) 사용자 vault 시작 (workbench 사용 케이스)

1. https://oh-my-ontology.web.app/docs (Firebase 배포 후)
2. "내 PC 의 마크다운 폴더 열기" → 빈 폴더 선택
3. "starter 시드 만들기" 버튼 클릭
4. 5 md + .mcp.json.example 자동 작성

---

## Unpublish / 패키지 삭제

publish 후 24시간 안에는 unpublish 가능 (실수로 잘못 올렸을 때):

```bash
npm unpublish oh-my-ontology-mcp@0.5.0
```

24시간 후엔 unpublish 불가 — `deprecate` 만 가능 (사용자 install 시 경고만):

```bash
npm deprecate oh-my-ontology-mcp@0.5.0 "version 0.5.0 has critical bug, use 0.5.1+"
```

> 따라서 첫 publish 전에 `npm pack --dry-run` 으로 한 번 더 확인 권장.
> 우리는 이미 audit 끝.

---

## 버전 올리기 (다음 publish 부터)

코드 변경 후 다시 publish 하려면 버전 bump 필수 (npm 은 같은 버전 재publish 막음):

```bash
cd mcp
# Patch (bug fix): 0.5.0 → 0.5.1
npm version patch
# 또는 minor: 0.5.0 → 0.6.0
npm version minor
# 또는 major: 0.5.0 → 1.0.0
npm version major

npm publish --access=public
```

버전 bump 는 자동으로 `package.json` 의 version 갱신 + git commit + tag 생성.

---

## 트러블슈팅

| 증상 | 원인 / 해결 |
|---|---|
| `403 Forbidden` | 2FA OTP 잘못 또는 만료. 다시 시도. |
| `404 Not Found` (publish 시) | scope 패키지인데 `--access=public` 안 줬을 때. 추가. |
| `EEXIST` (`oh-my-ontology` already exists) | 이름 충돌. 다른 이름 또는 scope 사용. |
| `npx oh-my-ontology` 안 됨 | publish 후 npm CDN 반영에 1-2분 걸림. 잠시 후 재시도. |

---

## 한 줄 요약

```bash
# 한 번만 (계정 + 로그인)
npm login

# 매 publish 시
cd mcp && npm publish --access=public
cd ../cli && npm publish --access=public

# 동작 확인
cd /tmp && npx oh-my-ontology init test-vault && rm -rf test-vault
```

전부 무료. 24시간 안에 실수 되돌리기 가능. 평생 사용자 무제한.
