/**
 * mission v2 ontology starter — 5 .md files + agent MCP configs scaffolded into an empty folder.
 *
 * Mirrors cli/templates/vault/. Keep both in sync so the CLI and the web
 * workbench produce the same starter files.
 */

interface StarterFile {
  /** Relative path inside the vault (e.g. README.md, domains/example-domain.md). */
  relPath: string;
  content: string;
}

const README_MD = `---
slug: README
kind: vault-readme
title: My ontology vault
display_ko: 내 온톨로지 문서함
display_en: My ontology vault
---

# My ontology vault

This folder is **a codebase mental model that humans and AI agents grow
together**. Every \`.md\` file is one node (project / domain / capability /
element / concept), and the frontmatter at the top of each file is the
graph's keys (slug / kind / depends_on / capabilities / elements / domain).

In this vault, an ontology is an executable meaning model for a codebase:
projects, domains, capabilities, elements, and typed relations that explain
ownership, dependency, evidence, and change impact.

## Get started in 5 minutes

1. Open \`project.md\` and write your project's name and description.
2. When a new domain comes to mind, add \`<slug>.md\` under \`domains/\`:
   \`\`\`markdown
   ---
   slug: domains/auth
   kind: domain
   title: Authentication
   capabilities:
     - capabilities/login
     - capabilities/signup
   ---

   Owns user authentication, sessions, and permissions.
   \`\`\`
3. Same pattern for capability and element — under \`capabilities/\` and \`elements/\`.
4. Register an AI agent (Claude Code, Cursor, …) and it reads/writes the
   same vault, growing it alongside you.
5. To see the graph, open the workbench's \`/docs\` picker and point it at
   this vault folder.

Prefer an automatic first graph? From your codebase root:

\`\`\`bash
node /absolute/path/to/ontology-atlas/cli/src/index.mjs bootstrap . --vault <this-folder>
\`\`\`

The command analyzes \`package.json\`, README headings, and \`src/\` layout,
then replaces untouched starter examples with real project/domain/capability
nodes. If you edited a starter file, it is preserved.

## AI agent setup

Public \`ontology-atlas\` and \`ontology-atlas-mcp\` packages were unavailable
when this starter was built (npm E404, checked 2026-07-27). The installed app
therefore creates the markdown vault only; it does not seed an \`npx\` config
that cannot start.

From an Ontology Atlas source checkout, use the local CLI repair path:

\`\`\`bash
node /absolute/path/to/ontology-atlas/cli/src/index.mjs agent-setup /absolute/path/to/this-vault --root . --write
\`\`\`

It creates missing Claude Code / Cursor / Codex config files without adding
starter markdown or overwriting existing configs. If you need a manual merge
instead, open \`.mcp.json.example\`, replace the \`OATLAS_VAULT\` placeholder with
the absolute path to this vault, then copy that server entry into your agent
config. The local CLI writes \`.mcp.json\` and \`.codex/config.toml\` with the
source entry point.

Codex can also be wired globally with one command:

  \`\`\`bash
  codex mcp add ontology-atlas --env OATLAS_VAULT=/absolute/path/to/this-vault -- node /absolute/path/to/ontology-atlas/mcp/src/index.js
  \`\`\`

## Verify the agent loop

After restarting the agent, ask it to prove the connection before it edits
anything:

> Use the ontology-atlas MCP server to run \`validate_vault\`, then
> \`query_ontology({ "operation": "workspace_brief" })\`, then
> \`query_ontology({ "operation": "agent_brief" })\`, then
> \`query_ontology({ "operation": "health" })\`,
> \`query_ontology({ "operation": "cycles", "maxHops": 8 })\`,
> \`query_ontology({ "operation": "growth_plan", "limit": 20 })\`, and
> \`query_ontology({ "operation": "maintenance_plan", "limit": 20 })\`. Tell me
> whether this vault is readable, graph-clean enough, and the write tools are
> available before proposing changes.

If the CLI is installed, the same first-contact check is:

\`\`\`bash
ontology-atlas validate .
ontology-atlas workspace-brief .
ontology-atlas agent-brief . --prompt
ontology-atlas agent-brief . --graph-db-pack
ontology-atlas agent-brief . --verify-fallbacks
ontology-atlas cycles . --max-hops 8
ontology-atlas growth . --limit 20
ontology-atlas maintenance . --limit 20
ontology-atlas mcp-verify . --timeout-ms 15000
\`\`\`

For automation that wants a small JSON report instead of human terminal output:

\`\`\`bash
ontology-atlas agent-brief . --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4
\`\`\`

For an agent opened at your codebase root instead of this vault folder, replace
\`.\` with the vault path, for example \`./ontology\`.

## Relations (frontmatter keys)

| Key | What it expresses |
|---|---|
| \`depends_on: [<slug>, ...]\` | This node depends on other nodes |
| \`capabilities: [...]\` | Capabilities this domain / project provides |
| \`elements: [...]\` | Elements this capability / domain uses |
| \`domain: <slug>\` | Parent domain of this capability/element |
| \`relates: [...]\` | Loose related-to references |

## Kinds

- \`project\` — Top-level. Usually one per workspace.
- \`domain\` — A large area (auth, billing, builder, …).
- \`capability\` — A user-visible feature inside a domain (login, signup, …).
- \`element\` — A smaller unit a capability uses (jwt-token, otp-store, …).
- \`document\` — Evidence node (markdown doc backing other concepts).

## What an AI agent can do for you

Once you register the \`ontology-atlas-mcp\` server, the agent gets 32
tools to read/write this vault:

- **read 19**: connection_info / git_status / git_history / list_concepts / get_concept / get_concepts / find_evidence /
  find_backlinks / find_neighbors / find_path / list_kinds / find_orphans /
  query_concepts / compile_ontology / query_ontology / validate_vault /
  analyze_repo_structure / infer_imports / index_project
- **write 13**: absorb_document / add_concept / add_concepts / add_relation / add_relations /
  remove_relation / replace_relation / patch_concept / reclassify_concept /
  delete_concept / rename_concept / merge_concepts / git_snapshot

Details: https://github.com/wlsdks/ontology-atlas/tree/main/mcp
`;

const PROJECT_MD = `---
slug: project
kind: project
title: My project
display_ko: 내 프로젝트
display_en: My project
domains:
  - domains/example-domain
capabilities:
  - capabilities/example-capability
elements:
  - elements/example-element
---

# My project

Write a one- or two-line summary of your project here — *what / for whom / why*.

## One-line mission

The problem this project solves, or the value it creates, in a single sentence.

## How it grows

- Fill in \`domains: [...]\` in the frontmatter and the domain nodes hang
  off your project tree automatically.
- Each domain's capabilities and elements follow the same pattern.
- When an AI agent adds a new node, this file's \`depends_on\` / \`domains\`
  may auto-update — frontmatter is the source of truth, so there are no
  conflicts.

## Next steps

1. Edit this file's \`title\` (and any other frontmatter besides \`kind: project\`)
   to match your project.
2. Rename or copy starters like \`domains/example-domain.md\` into your real domains.
3. Register an AI agent (Claude Code, Cursor, …) and ask it to "tidy up
   the ontology in this vault."
`;

const DOMAIN_MD = `---
slug: domains/example-domain
kind: domain
title: Example domain
display_ko: 예시 영역
display_en: Example domain
capabilities:
  - capabilities/example-capability
---

# Example domain

A *domain* is a large area of your project (subsystems like auth,
billing, builder, realtime, search). Rename this file to match one of
your real domains (\`domains/auth.md\`, \`domains/billing.md\`, …) and list
the capabilities it owns under \`capabilities:\` in the frontmatter above.

## How to fill it in

- Use one or two paragraphs of body text to describe *what this domain is*.
- Markdown links to other domains / capabilities in the body register as
  backlinks automatically.
- Frontmatter keys:
  - \`capabilities: [...]\` — slugs of capabilities this domain owns
  - \`depends_on: [...]\` — other domains or external systems this depends on
  - \`relates: [...]\` — loose related-to references (optional)

## Keep it or delete it?

- Keep it: fill it in following the guide above.
- Don't need it: just delete this file — it's only a starter.
`;

const CAPABILITY_MD = `---
slug: capabilities/example-capability
kind: capability
title: Example capability
display_ko: 예시 기능
display_en: Example capability
domain: domains/example-domain
elements:
  - elements/example-element
---

# Example capability

A *capability* is one user-visible feature within a domain (login,
signup, checkout, search, relation editing, …). Rename this file to match
one of your real capabilities (\`capabilities/login.md\`,
\`capabilities/checkout.md\`) and update the \`domain:\` and \`elements:\`
keys above accordingly.

## How to fill it in

- In the body, describe *what this capability does* and one or two user
  scenarios.
- Frontmatter keys:
  - \`domain: <slug>\` — the single parent domain
  - \`elements: [...]\` — slugs of elements this capability uses
  - \`depends_on: [...]\` — other capabilities this depends on
  - \`relates: [...]\` — loose related-to references (optional)
`;

const ELEMENT_MD = `---
slug: elements/example-element
kind: element
title: Example element
display_ko: 예시 구성요소
display_en: Example element
domain: domains/example-domain
---

# Example element

An *element* is a smaller unit a capability uses (jwt-token, otp-store,
indexeddb-adapter, sigma-canvas, …). Rename this file to match a real
element (\`elements/jwt-token.md\`) and set \`domain:\` to the right parent.

## How to fill it in

- One or two paragraphs in the body covering *what / why / which interface*.
- Frontmatter keys:
  - \`domain: <slug>\` — the single parent domain
  - \`path: <src/...>\` — code path this element corresponds to (optional)
  - \`depends_on: [...]\` — other elements / capabilities this depends on
  - \`relates: [...]\` — loose related-to references (optional)
`;

// ── 한국어 스타터 본문 (#73) ────────────────────────────────────────────────
// `cli/templates/vault-ko/` 와 **바이트 동일**해야 한다 — 계약 테스트가 잡는다.
// 파일 세트와 frontmatter(slug/kind/title/display_*)는 영어판과 같고 산문 본문만
// 다르다. 그래서 어떤 언어로 만들었든 같은 그래프가 나오고, 검색의 단일
// 진실원인 canonical `title` 도 그대로다.
const README_MD_KO = `---
slug: README
kind: vault-readme
title: My ontology vault
display_ko: 내 온톨로지 문서함
display_en: My ontology vault
---

# 내 온톨로지 문서함

이 폴더는 **사람과 AI 에이전트가 함께 키우는 코드베이스 의미 모델**입니다.
\`.md\` 파일 하나가 노드 하나(프로젝트 / 도메인 / 역량 / 요소 / 개념)이고,
파일 맨 위의 frontmatter 가 그래프의 키(slug / kind / depends_on /
capabilities / elements / domain)입니다.

여기서 말하는 온톨로지는 코드베이스의 **실행 가능한 의미 모델**입니다 —
프로젝트·도메인·역량·요소와 타입 있는 관계로 소유권, 의존성, 근거, 변경 영향을
설명합니다.

## 5분 만에 시작하기

1. \`project.md\` 를 열어 프로젝트 이름과 설명을 씁니다.
2. 새 도메인이 떠오르면 \`domains/\` 아래에 \`<slug>.md\` 를 추가합니다:
   \`\`\`markdown
   ---
   slug: domains/auth
   kind: domain
   title: Authentication
   display_ko: 인증
   capabilities:
     - capabilities/login
     - capabilities/signup
   ---

   사용자 인증, 세션, 권한을 담당합니다.
   \`\`\`
3. 역량과 요소도 같은 방식으로 — \`capabilities/\` 와 \`elements/\` 아래에.
4. AI 에이전트(Claude Code, Cursor, …)를 연결하면 같은 문서함을 읽고 쓰면서
   함께 키웁니다.
5. 그래프로 보려면 워크벤치의 \`/docs\` 피커에서 이 폴더를 고릅니다.

첫 그래프를 자동으로 만들고 싶다면, 코드베이스 루트에서:

\`\`\`bash
node /ontology-atlas/소스/절대/경로/cli/src/index.mjs bootstrap . --vault <이-폴더>
\`\`\`

이 명령은 \`package.json\`, README 제목, \`src/\` 구조를 분석해 손대지 않은 예시
스타터를 실제 프로젝트/도메인/역량 노드로 바꿉니다. 이미 수정한 스타터 파일은
그대로 둡니다.

## AI 에이전트 설정

이 스타터를 만들 때 공개 \`ontology-atlas\`와 \`ontology-atlas-mcp\`
패키지는 npm E404 상태였습니다(2026-07-27 확인). 설치 앱은 실행할 수 없는
\`npx\` 설정을 심지 않고 마크다운 문서함만 만듭니다.

Ontology Atlas 소스 체크아웃이 있다면 로컬 CLI 복구 경로를 씁니다:

\`\`\`bash
node /ontology-atlas/소스/절대/경로/cli/src/index.mjs agent-setup /이-문서함의/절대/경로 --root . --write
\`\`\`

없는 Claude Code / Cursor / Codex 설정 파일만 만들고, 스타터 마크다운을
추가하거나 기존 설정을 덮어쓰지 않습니다. 직접 병합하려면 \`.mcp.json.example\`
을 열어 \`OATLAS_VAULT\` 자리표시자를 이 문서함의 절대 경로로 바꾼 뒤, 그 서버
항목을 에이전트 설정에 복사하세요. 로컬 CLI는 소스 엔트리포인트를 쓰는
\`.mcp.json\`과 \`.codex/config.toml\`을 만듭니다.

Codex 는 명령 한 줄로 전역 등록도 됩니다:

\`\`\`bash
codex mcp add ontology-atlas --env OATLAS_VAULT=/이-문서함의/절대/경로 -- node /ontology-atlas/소스/절대/경로/mcp/src/index.js
\`\`\`

## 에이전트 연결 확인

에이전트를 재시작한 뒤, **무언가를 고치기 전에** 연결을 증명하게 하세요:

> ontology-atlas MCP 서버로 \`validate_vault\` 를 실행하고, 이어서
> \`query_ontology({ "operation": "workspace_brief" })\`,
> \`query_ontology({ "operation": "agent_brief" })\`,
> \`query_ontology({ "operation": "health" })\`,
> \`query_ontology({ "operation": "cycles", "maxHops": 8 })\`,
> \`query_ontology({ "operation": "growth_plan", "limit": 20 })\`,
> \`query_ontology({ "operation": "maintenance_plan", "limit": 20 })\` 를
> 실행해 줘. 이 문서함을 읽을 수 있는지, 그래프가 충분히 깨끗한지, 쓰기 도구가
> 준비됐는지 변경을 제안하기 전에 알려 줘.

CLI 가 설치돼 있다면 같은 첫 접속 점검은:

\`\`\`bash
ontology-atlas validate .
ontology-atlas workspace-brief .
ontology-atlas agent-brief . --prompt
ontology-atlas agent-brief . --graph-db-pack
ontology-atlas agent-brief . --verify-fallbacks
ontology-atlas cycles . --max-hops 8
ontology-atlas growth . --limit 20
ontology-atlas maintenance . --limit 20
ontology-atlas mcp-verify . --timeout-ms 15000
\`\`\`

사람이 읽는 터미널 출력 대신 작은 JSON 보고서가 필요한 자동화라면:

\`\`\`bash
ontology-atlas agent-brief . --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4
\`\`\`

에이전트를 이 문서함이 아니라 코드베이스 루트에서 열었다면 \`.\` 대신 문서함
경로를 씁니다(예: \`./ontology\`).

## 관계 (frontmatter 키)

| 키 | 뜻 |
|---|---|
| \`depends_on: [<slug>, ...]\` | 이 노드가 기대는 다른 노드 |
| \`capabilities: [...]\` | 이 도메인/프로젝트가 제공하는 역량 |
| \`elements: [...]\` | 이 역량/도메인이 쓰는 요소 |
| \`domain: <slug>\` | 이 역량/요소의 상위 도메인 |
| \`relates: [...]\` | 느슨한 연관 참조 |

## 종류(kind)

- \`project\` — 최상위. 보통 작업공간당 하나.
- \`domain\` — 큰 영역(인증, 결제, 빌더, …).
- \`capability\` — 도메인 안에서 사용자가 할 수 있는 일 하나(로그인, 가입, …).
- \`element\` — 역량이 쓰는 더 작은 단위(jwt-token, otp-store, …).
- \`document\` — 근거 노드(다른 개념을 뒷받침하는 마크다운 문서).

## AI 에이전트가 해줄 수 있는 일

\`ontology-atlas-mcp\` 서버를 등록하면 에이전트가 이 문서함을 읽고 쓰는 도구
32개를 갖습니다:

- **읽기 19**: connection_info / git_status / git_history / list_concepts / get_concept / get_concepts / find_evidence /
  find_backlinks / find_neighbors / find_path / list_kinds / find_orphans /
  query_concepts / compile_ontology / query_ontology / validate_vault /
  analyze_repo_structure / infer_imports / index_project
- **쓰기 13**: absorb_document / add_concept / add_concepts / add_relation / add_relations /
  remove_relation / replace_relation / patch_concept / reclassify_concept /
  delete_concept / rename_concept / merge_concepts / git_snapshot

자세히: https://github.com/wlsdks/ontology-atlas/tree/main/mcp
`;

const PROJECT_MD_KO = `---
slug: project
kind: project
title: My project
display_ko: 내 프로젝트
display_en: My project
domains:
  - domains/example-domain
capabilities:
  - capabilities/example-capability
elements:
  - elements/example-element
---

# 내 프로젝트

이 프로젝트가 무엇인지 한두 줄로 적어 주세요 — *무엇을 / 누구를 위해 / 왜*.

## 한 줄 사명

이 프로젝트가 푸는 문제, 또는 만들어 내는 가치를 한 문장으로.

## 어떻게 자라나

- frontmatter 의 \`domains: [...]\` 를 채우면 도메인 노드가 프로젝트 트리에
  자동으로 매달립니다.
- 각 도메인의 역량과 요소도 같은 방식으로 이어집니다.
- AI 에이전트가 새 노드를 추가하면 이 파일의 \`depends_on\` / \`domains\` 가
  자동 갱신될 수 있습니다 — frontmatter 가 단일 진실원이라 충돌이 없습니다.

## 다음에 할 일

1. 이 파일의 \`title\`(그리고 \`kind: project\` 외 다른 frontmatter)을 내 프로젝트에
   맞게 고칩니다.
2. \`domains/example-domain.md\` 같은 스타터를 실제 도메인 이름으로 바꾸거나
   복사합니다.
3. AI 에이전트(Claude Code, Cursor, …)를 연결하고 "이 문서함의 온톨로지를
   정리해 줘" 라고 부탁합니다.
`;

const DOMAIN_MD_KO = `---
slug: domains/example-domain
kind: domain
title: Example domain
display_ko: 예시 영역
display_en: Example domain
capabilities:
  - capabilities/example-capability
---

# 예시 영역

*도메인*은 프로젝트의 큰 영역입니다(인증, 결제, 빌더, 실시간, 검색 같은
하위 시스템). 이 파일을 실제 도메인 이름으로 바꾸고
(\`domains/auth.md\`, \`domains/billing.md\`, …) 위 frontmatter 의
\`capabilities:\` 에 이 도메인이 가진 역량을 적으세요.

## 어떻게 채우나

- 본문 한두 문단으로 *이 도메인이 무엇인지* 설명합니다.
- 본문에서 다른 도메인/역량으로 거는 마크다운 링크는 자동으로 역참조(backlink)
  로 잡힙니다.
- frontmatter 키:
  - \`capabilities: [...]\` — 이 도메인이 가진 역량의 slug
  - \`depends_on: [...]\` — 이 도메인이 기대는 다른 도메인이나 외부 시스템
  - \`relates: [...]\` — 느슨한 연관 참조(선택)

## 남길까, 지울까?

- 남긴다: 위 안내대로 채웁니다.
- 필요 없다: 그냥 이 파일을 지우세요 — 스타터일 뿐입니다.
`;

const CAPABILITY_MD_KO = `---
slug: capabilities/example-capability
kind: capability
title: Example capability
display_ko: 예시 기능
display_en: Example capability
domain: domains/example-domain
elements:
  - elements/example-element
---

# 예시 기능

*역량*은 도메인 안에서 사용자가 할 수 있는 일 하나입니다(로그인, 가입, 결제,
검색, 빌더 캔버스, …). 이 파일을 실제 역량 이름으로 바꾸고
(\`capabilities/login.md\`, \`capabilities/checkout.md\`) 위의 \`domain:\` 과
\`elements:\` 키를 그에 맞게 고치세요.

## 어떻게 채우나

- 본문에 *이 역량이 무엇을 하는지* 와 사용자 시나리오 한두 개를 적습니다.
- frontmatter 키:
  - \`domain: <slug>\` — 상위 도메인 하나
  - \`elements: [...]\` — 이 역량이 쓰는 요소의 slug
  - \`depends_on: [...]\` — 이 역량이 기대는 다른 역량
  - \`relates: [...]\` — 느슨한 연관 참조(선택)
`;

const ELEMENT_MD_KO = `---
slug: elements/example-element
kind: element
title: Example element
display_ko: 예시 구성요소
display_en: Example element
domain: domains/example-domain
---

# 예시 구성요소

*요소*는 역량이 쓰는 더 작은 단위입니다(jwt-token, otp-store,
indexeddb-adapter, sigma-canvas, …). 이 파일을 실제 요소 이름으로 바꾸고
(\`elements/jwt-token.md\`) \`domain:\` 을 알맞은 상위로 지정하세요.

## 어떻게 채우나

- 본문 한두 문단으로 *무엇을 / 왜 / 어떤 인터페이스인지* 를 적습니다.
- frontmatter 키:
  - \`domain: <slug>\` — 상위 도메인 하나
  - \`path: <src/...>\` — 이 요소가 대응하는 코드 경로(선택)
  - \`depends_on: [...]\` — 이 요소가 기대는 다른 요소/역량
  - \`relates: [...]\` — 느슨한 연관 참조(선택)
`;

/** 스타터 본문 언어. 파일 세트·frontmatter 는 동일, 산문만 다르다. */
export type StarterLocale = "en" | "ko";

const STARTER_FILES_EN: ReadonlyArray<StarterFile> = [
  { relPath: 'README.md', content: README_MD },
  { relPath: 'project.md', content: PROJECT_MD },
  { relPath: 'domains/example-domain.md', content: DOMAIN_MD },
  { relPath: 'capabilities/example-capability.md', content: CAPABILITY_MD },
  { relPath: 'elements/example-element.md', content: ELEMENT_MD },
];

const STARTER_FILES_KO: ReadonlyArray<StarterFile> = [
  { relPath: 'README.md', content: README_MD_KO },
  { relPath: 'project.md', content: PROJECT_MD_KO },
  { relPath: 'domains/example-domain.md', content: DOMAIN_MD_KO },
  { relPath: 'capabilities/example-capability.md', content: CAPABILITY_MD_KO },
  { relPath: 'elements/example-element.md', content: ELEMENT_MD_KO },
];

/** 이 로케일의 스타터 파일. 모르는 로케일은 영어로 떨어진다. */
export function starterFilesForLocale(locale: string): ReadonlyArray<StarterFile> {
  return locale === "ko" ? STARTER_FILES_KO : STARTER_FILES_EN;
}

/**
 * 기존 소비자를 위한 영어 기본값 — 개수 계약(`starter-counts`)과 CLI 기본
 * `init` 이 이걸 기준으로 남는다.
 */
export const ONTOLOGY_STARTER_FILES: ReadonlyArray<StarterFile> = STARTER_FILES_EN;

/**
 * MCP config template to register an AI agent (Claude Code, Cursor, …) from
 * a different working directory. `OATLAS_VAULT` must be the absolute path to
 * the vault folder — the browser cannot know it.
 */
export function buildMcpConfigJson(vaultName: string, vaultPath?: string | null): string {
  return buildMcpConfigJsonForVault(
    vaultPath ?? `<absolute path to your ${vaultName} folder>`,
  );
}

/**
 * Ready-to-use MCP config for opening the vault folder itself in Claude Code
 * or Cursor. `OATLAS_VAULT=.` keeps the config portable inside the folder.
 */
export function buildVaultMcpConfigJson(): string {
  return buildMcpConfigJsonForVault('.');
}

function buildMcpConfigJsonForVault(omotVault: string): string {
  return (
    JSON.stringify(
      {
        mcpServers: {
          'ontology-atlas': {
            command: 'npx',
            args: ['-y', 'ontology-atlas-mcp'],
            env: {
              OATLAS_VAULT: omotVault,
            },
          },
        },
      },
      null,
      2,
    ) + '\n'
  );
}

/**
 * Codex MCP config. Defaults to the vault folder itself, but can also render
 * the codebase-root template where `OATLAS_VAULT` must be an absolute path.
 */
export function buildCodexConfigToml(omotVault = '.'): string {
  return [
    '[mcp_servers.ontology-atlas]',
    'command = "npx"',
    'args = ["-y", "ontology-atlas-mcp"]',
    '',
    '[mcp_servers.ontology-atlas.env]',
    `OATLAS_VAULT = ${JSON.stringify(omotVault)}`,
    '',
  ].join('\n');
}

export function buildCodexConfigTomlTemplate(
  vaultName: string,
  vaultPath?: string | null,
): string {
  return buildCodexConfigToml(vaultPath ?? `<absolute path to your ${vaultName} folder>`);
}

/**
 * One-line Codex CLI registration for users who prefer mutating their Codex
 * MCP config through the CLI instead of editing `.codex/config.toml`.
 */
export function buildCodexMcpAddCommandTemplate(
  vaultName: string,
  vaultPath?: string | null,
): string {
  const resolvedVaultPath = vaultPath ?? `<absolute path to your ${vaultName} folder>`;
  return [
    'codex',
    'mcp',
    'add',
    'ontology-atlas',
    '--env',
    `OATLAS_VAULT=${shellQuote(resolvedVaultPath)}`,
    '--',
    'npx',
    '-y',
    'ontology-atlas-mcp',
  ].join(' ');
}

/**
 * Safer existing-vault repair command for agents opened at a codebase root.
 * It creates only missing config files and writes merge templates for stale
 * configs, so it is the preferred path before manual template editing.
 */
export function buildAgentSetupCliCommandTemplate(vaultName: string): string {
  const vaultPath = `<absolute path to your ${vaultName} folder>`;
  return [
    'ontology-atlas',
    'agent-setup',
    shellQuote(vaultPath),
    '--root',
    shellQuote('<absolute path to your codebase root>'),
    '--write',
  ].join(' ');
}

export function buildAgentSetupCheckCliCommandTemplate(vaultName: string): string {
  const vaultPath = `<absolute path to your ${vaultName} folder>`;
  return [
    'ontology-atlas',
    'agent-setup',
    shellQuote(vaultPath),
    '--root',
    shellQuote('<absolute path to your codebase root>'),
    '--json',
  ].join(' ');
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
