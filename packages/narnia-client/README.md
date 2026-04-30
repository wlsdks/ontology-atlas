# project-narnia-client

Narnia HTTP API 클라이언트 — 외부 도구 (CLI · CI · MCP server) 가 워크스페이스에 노드/허브를 push.

## 설치

```bash
npm install project-narnia-client
# or
pnpm add project-narnia-client
```

요구사항: Node.js >= 18 (글로벌 `fetch`).

## 사용

### 1. API key 발급

Narnia 웹 admin 의 `/admin/api-keys/?a=<accountId>` 에서 키 발급 → 평문 1회 노출 → 안전한 곳에 저장.

### 2. 클라이언트 생성

```ts
import { Narnia } from "project-narnia-client";

const narnia = new Narnia({
  apiKey: process.env.NARNIA_API_KEY!,
  accountId: "stark",
  baseUrl: "https://asia-northeast3-<project>.cloudfunctions.net",
  defaultProjectId: "narnia", // 모든 push 가 narnia 컨테이너로 (옵션)
});
```

### 3. push

```ts
const result = await narnia.pushDoc({
  // projectId 미지정 시 defaultProjectId 또는 "general"
  projectId: "narnia",
  doc: {
    slug: "iam-spec",
    name: "IAM Spec",
    description: "통합 인증 명세서",
    isHub: false,
    hubIds: ["iam-hub"], // 이 노드가 속한 hub 들
    detail: "# IAM Spec\n\n...md...",
    tags: ["auth", "spec"],
    stack: ["TypeScript"],
    owner: "stark",
  },
});

console.log(result);
// { status: "ok", action: "created", path: "...", writtenAt: "..." }
```

## API

### `new Narnia(config)`

| 옵션 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `apiKey` | string | ✅ | Bearer 토큰 (`nk_...` 평문) |
| `accountId` | string | ✅ | 워크스페이스 id |
| `baseUrl` | string | ✅ | Cloud Function 베이스 URL (`https://<region>-<project>.cloudfunctions.net`) |
| `defaultProjectId` | string |  | 기본 컨테이너. 미지정 시 `"general"` |
| `fetch` | typeof fetch |  | 테스트용 fetch 구현체 |

### `narnia.pushDoc(options)`

upsert. 같은 slug 가 있으면 update, 없으면 create.

`options`:
- `projectId?: string` — 컨테이너 id
- `doc: NarniaDoc` — push 할 문서

`NarniaDoc` 주요 필드:
- `slug` (필수) — kebab-case unique
- `name` (필수)
- `isHub` — true 면 `hubs/{slug}`, false 면 `nodes/{slug}` (default false)
- `hubIds` — node 의 소속 hub 배열
- `description`, `detail` (md), `tags`, `stack`, `links`, `dependencies`, `owner`, `icon`, `progress`, `metadata` 등

### `NarniaError`

`pushDoc` 가 throw. `status` (HTTP) + `code` (`invalid_argument` / `unauthorized` / `forbidden` / `internal`).

## 사용 예

### CI 후 자동 등록

```yaml
# .github/workflows/docs.yml
- name: Push spec to Narnia
  run: npx project-narnia-client push docs/iam-spec.md
  env:
    NARNIA_API_KEY: ${{ secrets.NARNIA_API_KEY }}
```

### Node 스크립트로 배치

```ts
import { Narnia } from "project-narnia-client";
import { readdir, readFile } from "node:fs/promises";

const narnia = new Narnia({
  apiKey: process.env.NARNIA_API_KEY!,
  accountId: "stark",
  baseUrl: process.env.NARNIA_BASE_URL!,
  defaultProjectId: "narnia",
});

for (const file of await readdir("docs")) {
  const md = await readFile(`docs/${file}`, "utf8");
  await narnia.pushDoc({
    doc: {
      slug: file.replace(/\.md$/, ""),
      name: file,
      isHub: false,
      hubIds: ["docs"],
      detail: md,
    },
  });
}
```

## 라이선스

Apache-2.0 © Aslan Labs
