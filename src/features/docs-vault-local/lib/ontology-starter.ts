/**
 * mission v2 ontology starter — 5 .md files + agent MCP configs scaffolded into an empty folder.
 *
 * Mirrors cli/templates/vault/. Keep both in sync so the CLI and the web
 * workbench produce the same starter files.
 */

import type { McpServerLaunch } from '@/shared/config';
import { ATLAS_CLI } from '@/shared/config/cli-invocation';

interface StarterFile {
  /** Relative path inside the vault (e.g. README.md, domains/example-domain.md). */
  relPath: string;
  content: string;
}

export type StarterUidFactory = () => string;

const NODE_UID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function freshStarterUid(uidFactory: StarterUidFactory): string {
  const uid = uidFactory();
  if (!NODE_UID_PATTERN.test(uid)) {
    throw new Error(`starter uid must be a lowercase UUIDv4: ${uid}`);
  }
  return uid;
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
element / document), and the frontmatter at the top of each file is the graph.

In this vault, an ontology is an executable meaning model for a codebase:
five authorable kinds and typed relations that explain scope, dependency,
association, and description. The exact includes/excludes, examples,
counterexamples, direct \`is_a\` test, and inference boundary have one source:
https://github.com/wlsdks/ontology-atlas/blob/main/docs/ONTOLOGY-ATLAS-SPEC.md#2-the-five-authorable-node-kinds-and-reserved-reader-kind

## Get started in 5 minutes

1. Open \`project.md\` and write your project's name and description.
2. Create new nodes through the workbench Studio, MCP \`add_concept\`, or the
   source-checkout CLI. These writers mint the immutable UID; do not copy a
   starter file and its identity. After setting \`$ATLAS\` as shown below:
   \`\`\`bash
   ${ATLAS_CLI} add domain auth --title="Authentication" --vault .
   \`\`\`
3. Use the same writer path for capabilities and elements.
4. Register an AI agent (Claude Code, Cursor, …) and it reads/writes the
   same vault, growing it alongside you.
5. To see the graph, open the workbench's \`/docs\` picker and point it at
   this vault folder.

## AI agent setup

There are two ways to connect an agent to this vault.

**If you have the installed Ontology Atlas app**, open this folder in it and
press the connect button. The app writes the Claude Code / Cursor / Codex
config for you: it already knows this folder's real path, and it carries the
MCP server inside its own bundle. No terminal, no Node, no install step.

**If you don't**, run the agent setup command once from an Ontology Atlas
source checkout. Both angle-bracket parts are yours to fill in with real
absolute paths — the checkout you cloned, and this vault folder:

\`\`\`bash
node <ontology-atlas checkout>/cli/src/index.mjs agent-setup <this vault folder> --root . --write
\`\`\`

It creates missing Claude Code / Cursor / Codex config files without adding
starter markdown. In a parseable existing file it changes only the
\`ontology-atlas\` entry and preserves unrelated servers and sections. Invalid
or duplicate Atlas config stays untouched. To merge by hand instead, open
\`.mcp.json.example\`, replace the \`OATLAS_VAULT\` placeholder with the absolute
path to this vault, then copy that server entry into your agent config. The
CLI writes \`.mcp.json\` and \`.codex/config.toml\` pointing at the checkout's
\`mcp/src/index.js\`. Codex loads the project file only after you trust this
folder. Approve its trust prompt, run \`codex mcp list\` here, and confirm
\`ontology-atlas\` appears before any write. A parseable existing review
template keeps its unrelated entries while Atlas is rebound; a malformed
template is preserved and the current binding is written beside it as an
\`.ontology-atlas-current.example\` sidecar.

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

From an Ontology Atlas source checkout, the same first-contact check runs
through the CLI. Point \`$ATLAS\` at the checkout **folder** once — the same meaning every
other Atlas surface uses — then:

\`\`\`bash
export ATLAS=<path to your ontology-atlas source checkout>

${ATLAS_CLI} validate .
${ATLAS_CLI} workspace-brief .
${ATLAS_CLI} agent-brief . --prompt
${ATLAS_CLI} agent-brief . --graph-db-pack
${ATLAS_CLI} agent-brief . --verify-fallbacks
${ATLAS_CLI} cycles . --max-hops 8
${ATLAS_CLI} growth . --limit 20
${ATLAS_CLI} maintenance . --limit 20
${ATLAS_CLI} mcp-verify . --timeout-ms 15000
\`\`\`

For automation that wants a small JSON report instead of human terminal output:

\`\`\`bash
${ATLAS_CLI} agent-brief . --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4
\`\`\`

For an agent opened at your codebase root instead of this vault folder, replace
\`.\` with the vault path, for example \`./ontology\`.

## Kinds and relations

Use the specification linked above rather than guessing from a folder name.
\`project\`, \`domain\`, \`capability\`, \`element\`, and \`document\` are authorable;
\`vault-readme\` is generated and reserved. \`broader:\` is a validated storage key
that the app renders as \`is_a\`, but the current public MCP relation API does not
accept \`broader\` or \`is_a\`. The connected agent receives the exact guarded
\`patch_concept\` fallback in its server instructions.

## What an AI agent can do for you

Once you register the \`ontology-atlas-mcp\` server, the running server gives the
agent its current read/write inventory. Use \`tools/list\` for the exact names and
\`mcp-verify\` to prove that the server can read this vault.

Start with \`connection_info\`, \`list_kinds\`, \`validate_vault\`, and
\`query_ontology({ operation: "agent_brief" })\`. Write only after the read-first
checks are clean and the person accepts the proposed meaning.

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
This node sets the outcome and scope for the rest of the graph; it is not a
synonym for a repository, monorepo, department, or release phase.

Kind and relation contract:
https://github.com/wlsdks/ontology-atlas/blob/main/docs/ONTOLOGY-ATLAS-SPEC.md#2-the-five-authorable-node-kinds-and-reserved-reader-kind

## One-line mission

The problem this project solves, or the value it creates, in a single sentence.

## How it grows

- Fill in \`domains: [...]\` in the frontmatter and the domain nodes hang
  off your project tree automatically.
- Each domain's capabilities and elements follow the same pattern.
- When an AI agent proposes a new node, confirm its meaning before it writes.
  Frontmatter is the source of truth once written; git keeps the change
  inspectable.

## Next steps

1. Edit this file's \`title\` (and any other frontmatter besides \`kind: project\`)
   to match your project.
2. Rename one starter in place, or create each additional domain through Studio,
   MCP \`add_concept\`, or CLI \`add\`. Never copy a starter UID into a new node.
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
elements:
  - elements/example-element
---

# Example domain

A *domain* is a durable responsibility, problem, vocabulary, or ownership
boundary that groups coherent capabilities and would survive an implementation
rewrite. A source/package folder, team, technology, lifecycle phase, or workflow
name is evidence to investigate—not a domain by itself.

Kind and relation contract:
https://github.com/wlsdks/ontology-atlas/blob/main/docs/ONTOLOGY-ATLAS-SPEC.md#2-the-five-authorable-node-kinds-and-reserved-reader-kind

## How to fill it in

- Describe the responsibility it owns, what is inside and outside the boundary,
  and the evidence that supports that meaning.
- Rename this file to a real domain only after that test passes
  (\`domains/identity.md\`, \`domains/billing.md\`, …).
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

A *capability* is an observable ability the product, operator, agent, or a
dependent system can perform without prescribing the current module or
framework. A component, package, UI screen, command, workflow step, or README
heading is not a capability without an independent ability claim.

Kind and relation contract:
https://github.com/wlsdks/ontology-atlas/blob/main/docs/ONTOLOGY-ATLAS-SPEC.md#2-the-five-authorable-node-kinds-and-reserved-reader-kind

## How to fill it in

- State the observable outcome, its boundary, and one or two acceptance
  scenarios. Then rename this file and update \`domain:\` / \`elements:\`.
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

An *element* is a distinct implementation role that realizes or proves a
capability and has evidence someone can open. A bare path, import edge, or
dependency name is evidence—not a concept by itself. Name the role; put its
canonical repository-relative entrypoint in \`path:\`.

Kind and relation contract:
https://github.com/wlsdks/ontology-atlas/blob/main/docs/ONTOLOGY-ATLAS-SPEC.md#2-the-five-authorable-node-kinds-and-reserved-reader-kind

## How to fill it in

- Describe what role this element plays, which capability it realizes or proves,
  and the path or interface that verifies the claim.
- Frontmatter keys:
  - \`domain: <slug>\` — the single parent domain
  - \`path: <src/...>\` — code path this element corresponds to (optional)
  - \`depends_on: [...]\` — other elements / capabilities this depends on
  - \`relates: [...]\` — loose related-to references (optional)
`;

// ── Korean starter bodies ───────────────────────────────────────────────────
// Must be **byte-identical** to `cli/templates/vault-ko/` — a contract test enforces it.
// The file set and the frontmatter (slug/kind/title/display_*) match the English version and only
// the prose differs, so any creation language yields the same graph and the canonical `title`,
// the single source of truth for search, is unchanged.
const README_MD_KO = `---
slug: README
kind: vault-readme
title: My ontology vault
display_ko: 내 온톨로지 문서함
display_en: My ontology vault
---

# 내 온톨로지 문서함

이 폴더는 **사람과 AI 에이전트가 함께 키우는 코드베이스 의미 모델**입니다.
\`.md\` 파일 하나가 노드 하나(프로젝트 / 도메인 / 역량 / 요소 / 문서)이고,
파일 맨 위의 frontmatter 자체가 그래프입니다.

여기서 말하는 온톨로지는 코드베이스의 **실행 가능한 의미 모델**입니다 —
저자가 만드는 다섯 kind와 타입 있는 관계로 범위, 의존성, 연관, 설명을
표현합니다. 포함·제외·예시·반례, direct \`is_a\` 판별, 추론 경계의 정본은 한 곳입니다:
https://github.com/wlsdks/ontology-atlas/blob/main/docs/ONTOLOGY-ATLAS-SPEC.md#2-the-five-authorable-node-kinds-and-reserved-reader-kind

## 5분 만에 시작하기

1. \`project.md\` 를 열어 프로젝트 이름과 설명을 씁니다.
2. 새 노드는 공방, MCP \`add_concept\`, 또는 소스 체크아웃 CLI로 만듭니다.
   이 작성 경로가 불변 UID를 발급하므로 스타터 파일과 정체성을 복사하지 마세요.
   아래 안내대로 \`$ATLAS\`를 설정한 뒤:
   \`\`\`bash
   ${ATLAS_CLI} add domain auth --title="Authentication" --vault .
   \`\`\`
3. 역량과 요소도 같은 작성 경로로 만듭니다.
4. AI 에이전트(Claude Code, Cursor, …)를 연결하면 같은 문서함을 읽고 쓰면서
   함께 키웁니다.
5. 그래프로 보려면 워크벤치의 \`/docs\` 피커에서 이 폴더를 고릅니다.

## AI 에이전트 설정

이 문서함에 에이전트를 붙이는 길은 두 가지입니다.

**설치된 Ontology Atlas 앱이 있다면**, 앱에서 이 폴더를 열고 에이전트 연결
버튼을 누르세요. 앱이 Claude Code / Cursor / Codex 설정을 대신 써 줍니다 —
이 폴더의 실제 경로를 이미 알고 있고, MCP 서버를 자기 번들 안에 싣고
다닙니다. 터미널도, node 도, 설치 과정도 필요 없습니다.

**앱이 없다면**, Ontology Atlas 소스 체크아웃에서 에이전트 설정 명령을 한 번
실행합니다. 꺾쇠 두 자리는 내 컴퓨터의 실제 절대 경로로 바꿔 넣으세요 —
클론한 체크아웃, 그리고 이 문서함 폴더입니다:

\`\`\`bash
node <ontology-atlas 체크아웃>/cli/src/index.mjs agent-setup <이 문서함 폴더> --root . --write
\`\`\`

없는 Claude Code / Cursor / Codex 설정 파일을 만들고, 스타터 마크다운은
추가하지 않습니다. 해석 가능한 기존 파일에서는 \`ontology-atlas\` 항목만 새
문서함으로 바꾸며 다른 서버와 섹션은 보존합니다. 잘못되거나 중복된 Atlas 설정은
건드리지 않습니다. 직접 병합하려면 \`.mcp.json.example\`을 열어
\`OATLAS_VAULT\` 자리표시자를 이 문서함의 절대 경로로 바꾼 뒤, 그 서버
항목을 에이전트 설정에 복사하세요. CLI 는 체크아웃의 \`mcp/src/index.js\` 를
가리키는 \`.mcp.json\` 과 \`.codex/config.toml\` 을 만듭니다.
Codex 는 이 폴더를 trusted 로 승인한 뒤에만 프로젝트 설정을 읽습니다. 신뢰
요청을 승인하고 이 폴더에서 \`codex mcp list\` 를 실행해 \`ontology-atlas\` 가
보이는지 확인한 뒤 쓰기를 시작하세요.
해석 가능한 기존 검토 템플릿은 다른 항목을 보존한 채 Atlas 항목만 새 문서함으로
바꿉니다. 잘못된 템플릿은 보존하고, 현재 연결은 같은 위치의
\`.ontology-atlas-current.example\` sidecar 로 따로 만듭니다.

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

Ontology Atlas 소스 체크아웃이 있다면 같은 첫 접속 점검을 CLI 로도 할 수
있습니다. \`$ATLAS\` 를 체크아웃 **폴더**에 한 번 맞춰 두고 — Atlas 의 다른 화면이 쓰는
뜻과 같습니다 — 이렇게 씁니다:

\`\`\`bash
export ATLAS=<ontology-atlas 소스 체크아웃 경로>

${ATLAS_CLI} validate .
${ATLAS_CLI} workspace-brief .
${ATLAS_CLI} agent-brief . --prompt
${ATLAS_CLI} agent-brief . --graph-db-pack
${ATLAS_CLI} agent-brief . --verify-fallbacks
${ATLAS_CLI} cycles . --max-hops 8
${ATLAS_CLI} growth . --limit 20
${ATLAS_CLI} maintenance . --limit 20
${ATLAS_CLI} mcp-verify . --timeout-ms 15000
\`\`\`

사람이 읽는 터미널 출력 대신 작은 JSON 보고서가 필요한 자동화라면:

\`\`\`bash
${ATLAS_CLI} agent-brief . --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4
\`\`\`

에이전트를 이 문서함이 아니라 코드베이스 루트에서 열었다면 \`.\` 대신 문서함
경로를 씁니다(예: \`./ontology\`).

## kind와 관계

폴더 이름으로 추측하지 말고 위 명세를 사용하세요. \`project\`, \`domain\`,
\`capability\`, \`element\`, \`document\`만 저자가 만들며 \`vault-readme\`는 도구가 만드는
예약 kind입니다. \`broader:\`는 검증되는 저장 키이고 앱은 \`is_a\`로 보여 주지만,
현재 공개 MCP relation API는 \`broader\`나 \`is_a\`를 받지 않습니다. 연결된 agent의
server instructions가 충돌을 막는 정확한 \`patch_concept\` fallback을 제공합니다.

## AI 에이전트가 해줄 수 있는 일

\`ontology-atlas-mcp\` 서버를 등록하면 실행 중인 서버가 현재 읽기·쓰기 도구
목록을 에이전트에게 알려 줍니다. 정확한 이름은 \`tools/list\`로 보고,
\`mcp-verify\`로 서버가 이 문서함을 실제로 읽는지 확인하세요.

처음에는 \`connection_info\`, \`list_kinds\`, \`validate_vault\`,
\`query_ontology({ operation: "agent_brief" })\`를 사용합니다. 읽기 점검이 깨끗하고
사람이 제안된 의미를 승인한 뒤에만 씁니다.

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
이 노드는 나머지 그래프의 결과와 범위를 정합니다. 저장소·모노레포·부서·출시
단계와 같은 말이 아닙니다.

kind와 관계 정본:
https://github.com/wlsdks/ontology-atlas/blob/main/docs/ONTOLOGY-ATLAS-SPEC.md#2-the-five-authorable-node-kinds-and-reserved-reader-kind

## 한 줄 사명

이 프로젝트가 푸는 문제, 또는 만들어 내는 가치를 한 문장으로.

## 어떻게 자라나

- frontmatter 의 \`domains: [...]\` 를 채우면 도메인 노드가 프로젝트 트리에
  자동으로 매달립니다.
- 각 도메인의 역량과 요소도 같은 방식으로 이어집니다.
- AI 에이전트가 새 노드를 제안하면 쓰기 전에 그 의미를 확인합니다. 작성된 뒤에는
  frontmatter가 단일 진실원이고 git에서 변경을 검토할 수 있습니다.

## 다음에 할 일

1. 이 파일의 \`title\`(그리고 \`kind: project\` 외 다른 frontmatter)을 내 프로젝트에
   맞게 고칩니다.
2. 스타터 하나는 제자리에서 이름을 바꾸고, 도메인을 더 만들 때는 공방,
   MCP \`add_concept\`, 또는 CLI \`add\`를 씁니다. 스타터 UID를 새 노드에
   복사하지 않습니다.
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
elements:
  - elements/example-element
---

# 예시 영역

*도메인*은 구현을 다시 써도 남을 만큼 지속적인 책임·문제·어휘·소유권 경계이며,
서로 응집된 역량을 묶습니다. 소스/패키지 폴더, 팀, 기술, 생명주기 단계, 워크플로
이름은 조사할 근거일 뿐 그 자체로 도메인이 아닙니다.

kind와 관계 정본:
https://github.com/wlsdks/ontology-atlas/blob/main/docs/ONTOLOGY-ATLAS-SPEC.md#2-the-five-authorable-node-kinds-and-reserved-reader-kind

## 어떻게 채우나

- 이 도메인이 맡는 책임, 경계 안과 밖, 그 의미를 뒷받침하는 근거를 적습니다.
- 이 판별을 통과한 뒤에만 실제 도메인 이름으로 바꿉니다
  (\`domains/identity.md\`, \`domains/billing.md\`, …).
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

*역량*은 현재 모듈이나 프레임워크를 전제로 하지 않고 제품·운영자·에이전트·의존
시스템이 수행할 수 있는 관찰 가능한 능력입니다. 컴포넌트, 패키지, UI 화면,
명령, 워크플로 단계, README 제목은 독립된 능력 주장이 없으면 역량이 아닙니다.

kind와 관계 정본:
https://github.com/wlsdks/ontology-atlas/blob/main/docs/ONTOLOGY-ATLAS-SPEC.md#2-the-five-authorable-node-kinds-and-reserved-reader-kind

## 어떻게 채우나

- 관찰 가능한 결과와 경계, 수용 시나리오 한두 개를 적은 뒤 파일 이름과
  \`domain:\` / \`elements:\`를 고칩니다.
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

*요소*는 역량을 실현하거나 증명하며 누군가 열어볼 수 있는 근거가 있는 독립된
구현 역할입니다. 경로, import edge, 의존성 이름은 근거일 뿐 그 자체로 개념이
아닙니다. 역할을 이름으로 쓰고 정본 저장소 상대 진입점은 \`path:\`에 적습니다.

kind와 관계 정본:
https://github.com/wlsdks/ontology-atlas/blob/main/docs/ONTOLOGY-ATLAS-SPEC.md#2-the-five-authorable-node-kinds-and-reserved-reader-kind

## 어떻게 채우나

- 어떤 역할을 맡고 어느 역량을 실현하거나 증명하며, 어느 경로나 인터페이스로
  그 주장을 확인할 수 있는지 적습니다.
- frontmatter 키:
  - \`domain: <slug>\` — 상위 도메인 하나
  - \`path: <src/...>\` — 이 요소가 대응하는 코드 경로(선택)
  - \`depends_on: [...]\` — 이 요소가 기대는 다른 요소/역량
  - \`relates: [...]\` — 느슨한 연관 참조(선택)
`;

/** Starter body language. The file set and frontmatter are identical; only the prose differs. */
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

/** The starter files for this locale. An unknown locale falls back to English. */
export function starterFilesForLocale(locale: string): ReadonlyArray<StarterFile> {
  return locale === "ko" ? STARTER_FILES_KO : STARTER_FILES_EN;
}

/**
 * Static starters carry no permanent identity. Every actual vault scaffold mints a distinct
 * UUIDv4 for each `kind` document (including vault-readme). Tests inject a factory to verify the
 * output deterministically.
 */
export function materializeStarterFiles(
  locale: string,
  uidFactory: StarterUidFactory = () => globalThis.crypto.randomUUID(),
): ReadonlyArray<StarterFile> {
  return starterFilesForLocale(locale).map((file) => {
    if (!/^kind:\s*\S+/m.test(file.content)) return file;
    if (/^uid:\s*/m.test(file.content)) {
      throw new Error(`starter template must not contain a fixed uid: ${file.relPath}`);
    }
    const uid = freshStarterUid(uidFactory);
    return {
      ...file,
      content: file.content.replace(/^---\n/, `---\nuid: ${uid}\n`),
    };
  });
}

/**
 * The **agent guide** placed inside the vault. The vault folder is the agent's working folder, so
 * codex reads `AGENTS.md` and Claude Code reads `CLAUDE.md`/`AGENTS.md` from here on their own.
 *
 * **Why it is needed** (measured 2026-08-17). Even with the MCP server properly attached, **the
 * agent does not reach for it.** Asked in the installed app to list every concept slug in the
 * folder, codex did this:
 *
 * | | What it did | MCP calls |
 * |---|---|---|
 * | No guide | read five files with `sed`, then `grep '^slug:'` again | **0** |
 * | With guide | *"I will call list_concepts first"* → called it | **1** |
 *
 * The tool description already said *"AI agents call this first"*. What was missing was not a
 * description but **one line readable from the working folder**.
 *
 * This matches the extension mechanism this repository settled on (`.claude/rules/forbidden.md`):
 * the only permitted extension is something written to a file — markdown inside the vault — that
 * executes no code and shows every change in a git diff.
 *
 * ⚠️ **It is not a concept node.** Putting it in `ONTOLOGY_STARTER_FILES` would make the count
 * contract (`starter-counts.ts`) report 6 instead of 5, and screen copy uses that number. So it is
 * written alongside the config files (`.mcp.json`, `.codex/config.toml`).
 */
export const VAULT_AGENT_GUIDE_PATH = "AGENTS.md";

const AGENT_GUIDE_EN = `# This folder is an Ontology Atlas vault

The frontmatter in each \`.md\` file *is* the graph — its nodes and edges.
Before you scan files, **call the \`ontology-atlas\` MCP server first.** It is
already registered for this folder (\`.mcp.json\`, \`.codex/config.toml\`) and
answers with parsing, validation, and relation resolution already done.

| What you want | First call |
|---|---|
| How many of what | \`list_kinds\` |
| The whole node table | \`list_concepts\` |
| One concept and its neighbours | \`get_concept({ slug })\` |
| Who depends on this | \`find_backlinks(slug)\` |
| Are these two connected | \`find_path(from, to)\` |
| Is this vault healthy | \`validate_vault({})\` |

Do not read frontmatter with \`grep\` or \`sed\`. You get the same answer more
slowly, without relation resolution or schema validation.

**Name it the way this vault already does.** \`title\` is the one canonical name
search matches on; put other languages in \`display_ko\` / \`display_en\`. Every
node here keeps an English \`title\`, so a node whose \`title\` repeats its
\`display_ko\` leaves the vault with two languages of canonical name and splits
search.

**Write through the same server** — \`add_concept\` · \`add_relation\` ·
\`patch_concept\` (pass \`expected_mtime\`) · \`rename_concept\` · \`merge_concepts\`.
A file written by hand has no \`uid:\`, and one missing \`uid:\` fails the whole
graph compile.

**When you are done, ask the graph whether it is done.** Call
\`query_ontology({operation:'health'})\` and read two checks in particular:

- \`components\` — a node that is not reachable from the project root belongs to
  no project. New domains do not attach themselves: add
  \`add_relation(<project>, domains/<new>, 'domains')\`.
- \`relation_recommendations\` — a capability with \`domain: X\` still needs \`X\` to
  list it back, via \`add_relation(domains/X, capabilities/<new>, 'capabilities')\`.

Both were clean on the starter vault, so anything they report is something you
added. Nodes that compile but hang off the project are invisible where it
matters.
`;

const AGENT_GUIDE_KO = `# 이 폴더는 Ontology Atlas 볼트입니다

각 \`.md\` 의 frontmatter 가 그래프의 노드와 엣지입니다. 파일을 훑기 전에
**MCP 서버 \`ontology-atlas\` 를 먼저 부르세요.** 이 폴더에 이미 등록돼 있고
(\`.mcp.json\`, \`.codex/config.toml\`), 파싱·검증·관계 해석이 끝난 답을 줍니다.

| 알고 싶은 것 | 첫 호출 |
|---|---|
| 뭐가 몇 개 있나 | \`list_kinds\` |
| 개념 목록 전체 | \`list_concepts\` |
| 한 개념과 그 이웃 | \`get_concept({ slug })\` |
| 이걸 쓰는 곳 | \`find_backlinks(slug)\` |
| 두 개념이 이어져 있나 | \`find_path(from, to)\` |
| 이 볼트가 성한가 | \`validate_vault({})\` |

\`grep\` 이나 \`sed\` 로 frontmatter 를 직접 읽지 마세요. 같은 답을 더 느리게 얻고,
관계 해석과 스키마 검증이 빠집니다.

**이름은 이 볼트가 이미 쓰는 방식대로.** \`title\` 은 검색이 기준으로 삼는 단
하나의 정본 이름이고, 다른 언어 이름은 \`display_ko\` / \`display_en\` 에 넣습니다.
이 폴더의 노드는 전부 \`title\` 을 영어로 두므로, \`title\` 에 \`display_ko\` 와 같은
값을 쓰면 한 볼트 안에 정본 이름의 언어가 섞여 검색이 갈립니다.

**쓸 때도 같은 서버로** — \`add_concept\` · \`add_relation\` · \`patch_concept\`
(\`expected_mtime\` 을 함께) · \`rename_concept\` · \`merge_concepts\`.
손으로 만든 파일은 \`uid:\` 가 없고, \`uid:\` 하나가 없으면 그래프 전체가
컴파일에 실패합니다.

**다 만들었으면 그래프에게 다 됐냐고 물어보세요.**
\`query_ontology({operation:'health'})\` 를 부르고 특히 둘을 읽습니다:

- \`components\` — 프로젝트 뿌리에서 못 닿는 노드는 어느 프로젝트에도 속하지
  않습니다. 새 도메인은 저절로 안 붙으니
  \`add_relation(<project>, domains/<새>, 'domains')\` 를 부르세요.
- \`relation_recommendations\` — \`domain: X\` 를 가진 역량은 \`X\` 쪽에서도 되받아
  걸어야 합니다. \`add_relation(domains/X, capabilities/<새>, 'capabilities')\`.

둘 다 스타터 볼트에서는 깨끗하므로, 여기 뜨는 것은 전부 방금 당신이 더한
것입니다. 컴파일은 되는데 프로젝트에 안 붙은 노드는 정작 보여야 할 곳에서
안 보입니다.
`;

/** The guide for this locale. An unknown locale falls back to English — same rule as the starters. */
export function vaultAgentGuideForLocale(locale: string): StarterFile {
  return {
    relPath: VAULT_AGENT_GUIDE_PATH,
    content: locale === "ko" ? AGENT_GUIDE_KO : AGENT_GUIDE_EN,
  };
}

/**
 * The **bridge file** for Claude Code. Its content is a single line pointing at `AGENTS.md`.
 *
 * With the guide living only in `AGENTS.md`, **a Claude Code session receives nothing** — this
 * repository's own tool table records why: Codex reads `AGENTS.md` directly, while Claude Code
 * reaches it through `CLAUDE.md`'s `@AGENTS.md` import. The vault uses the same arrangement this
 * repository uses at its own root.
 *
 * The product already has a check for this — `claude-agents-bridge` in
 * `cli/src/lib/agent-files.mjs`. But with no `CLAUDE.md` at all it **silently reports "not
 * applicable"**, so nobody saw that the guidance was reaching only half its audience. Placing the
 * file is what puts that check to work.
 */
export const VAULT_CLAUDE_BRIDGE_PATH = "CLAUDE.md";

const CLAUDE_BRIDGE_EN = `# Ontology Atlas vault

@AGENTS.md

Everything an agent needs is in the file above. Claude Code reads this file;
Codex, Cursor, and Gemini CLI read \`AGENTS.md\` directly. Keeping the guide in
one place is why this file is only a pointer — edit \`AGENTS.md\`, not this one.
`;

const CLAUDE_BRIDGE_KO = `# Ontology Atlas 볼트

@AGENTS.md

에이전트에게 필요한 것은 전부 위 파일에 있습니다. Claude Code 는 이 파일을 읽고,
Codex · Cursor · Gemini CLI 는 \`AGENTS.md\` 를 직접 읽습니다. 안내를 한 곳에만
두려고 이 파일은 가리키기만 합니다 — 고칠 때는 \`AGENTS.md\` 를 고치세요.
`;

/** The bridge file for this locale. An unknown locale falls back to English. */
export function vaultClaudeBridgeForLocale(locale: string): StarterFile {
  return {
    relPath: VAULT_CLAUDE_BRIDGE_PATH,
    content: locale === "ko" ? CLAUDE_BRIDGE_KO : CLAUDE_BRIDGE_EN,
  };
}


/**
 * The **procedural skill set** the vault carries with it.
 *
 * **Why they live inside the vault** (measured 2026-08-17). The app launches the coding agent
 * **from the vault folder** (`cwd: vaultRoot` in `use-acp-session.ts`), so
 * `.claude/skills/<name>/SKILL.md` inside the vault appears directly in that session's `/` listing.
 * Measured: of the 50 commands in a session launched with the app's own configuration, these three
 * took **the first three slots**, tagged `(project)`.
 *
 * **Why the tool table is not enough.** `AGENTS.md` says **what to call** but not **in what order,
 * or where to stop**. With 35 tools the agent re-decides that order every time, so the same request
 * produces different work each time. These three fix the order — in particular "do not write during
 * the proposal step" and "verify after writing".
 *
 * ⚠️ **They are not concept nodes.** Putting them in `ONTOLOGY_STARTER_FILES` would make the count
 * contract report 8 instead of 5, and screen copy uses that number. They are written alongside the
 * guide and the config files.
 *
 * ⚠️ **`description` is rendered on screen** — the composer's `/` menu truncates it to one line
 * (`AcpChatPanel`). So the opening has to carry the meaning, and em dashes are not used.
 * Gate: `tests/contract/starter-templates.contract.test.ts`.
 *
 * ⚠️ Codex reads `.agents/skills/`. That copy is **not shipped yet** — whether `codex-acp` surfaces
 * skills in its `/` listing has not been measured, and shipping an unmeasured copy into every vault
 * would make it a dead file.
 */
export const VAULT_SKILL_NAMES = ["atlas-review", "atlas-grow", "atlas-absorb"] as const;

/** Where a skill file lives inside the vault. Claude Code reads this folder. */
export function vaultSkillPath(name: string): string {
  return `.claude/skills/${name}/SKILL.md`;
}

const SKILL_REVIEW_EN = `---
name: atlas-review
description: Review this vault. Find what is broken or disconnected, report it in plain language, and give the exact call that fixes each one. Writes nothing. Use for "what's wrong here" · "check the vault" · "is this healthy".
---

# /atlas-review — is this vault sound right now

**This skill writes nothing.** What it produces is one page: what is off, and
what call fixes it. Fixing happens after a person has read it and decided.

1. **Two calls**

- \`validate_vault({})\` — frontmatter and relation references
- \`query_ontology({ operation: 'health' })\` — the graph integrity checks

Do not \`grep\` or \`sed\` the frontmatter directly. You get the same answer more
slowly, without relation resolution or schema validation.

2. **Do not report what passed**

Listing healthy checks spends the reader's attention and buries the one thing
they need to act on. Report **only what needs a hand**. If everything is sound,
end in one line — "nothing to fix · N nodes · M relations".

3. **Three things per item**

| | |
|---|---|
| What happened | One plain sentence. Do not paste the check's identifier |
| Why it matters | What goes missing or renders wrong if it stays |
| The fix | One line the reader can copy and run |

The two you will see most:

- **Unreachable nodes** (\`components\`) — a node the project root cannot reach
  belongs to no project, so it never appears on the map. It exists and is invisible.
  → \`add_relation('<project>', 'domains/<new domain>', 'domains')\`
- **One-sided relations** (\`relation_recommendations\`) — a capability declares
  \`domain: X\` but \`X\` does not claim it back.
  → \`add_relation('domains/X', 'capabilities/<capability>', 'capabilities')\`

4. **If project meaning is yellow — stop here**

Never finalize \`meaning_assessment\` without human approval. The project's five
competency answers are a claim about what this project *is*, and an agent
cannot settle that on someone's behalf. Show what is missing and stop.

## How this skill fails

- Lists passing checks until the actionable one is buried
- Pastes the check identifier without translating what it means
- States the problem with no fix line — so the reader has to ask again
- Fixes things without asking
`;

const SKILL_GROW_EN = `---
name: atlas-grow
description: The next step. Propose, with evidence, what would add the most to this vault. Writes nothing until a person picks. Use for "what should I fill in next" · "find the gaps" · "what's missing".
---

# /atlas-grow — where to fill in next

## One rule — the proposal step never writes

Only what a person picked lands in the vault. An invented node is the worst
thing this tool can produce: **a wrong map is worse than no map.** With no map
people go look for themselves; with a wrong one they decide on it.

1. **Where does this vault stand**

- \`query_ontology({ operation: 'agent_brief' })\` — the starting point and next action
- \`query_ontology({ operation: 'growth_plan' })\` — what is empty

2. **Filter candidates against evidence**

Do not relay the candidates as they arrive. Each one must survive three tests.

- **Does it exist** — is there evidence in code or docs, or does it merely
   sound plausible? Check with \`find_evidence({ title })\`. If a source folder is
   bound, \`analyze_repo_structure\` and \`infer_imports\` supply the evidence.
- **Is it already here** — search near-names first with
   \`query_concepts({ filter })\`. If it exists, do not create a second one; fill
   the existing node with \`patch_concept\` (pass \`expected_mtime\`).
- **Does it carry meaning** — an element needs a reason beyond its location.
   One node per file is not a map, it is a file listing.

3. **Show it to the person**

**Five at a time, at most.** Each line carries three things — ① what ② where it
attaches ③ why you believe it (the evidence). Do not ask "shall I create them
all?" Number them so the answer can be a selection.

4. **Write only what was approved — then verify**

- Nodes: \`add_concepts\` (chunks of 50 when there are many)
- **Only after every node succeeded**, relations: \`add_relations\`
- \`validate_vault({})\` → \`query_ontology({ operation: 'health' })\`

**A new domain does not attach itself to the project.** Skip
\`add_relation('<project>', 'domains/<new domain>', 'domains')\` and you have
built something the map will never show. Step 4's health check catches it.

## How this skill fails

- Invents plausible names with no evidence
- Misses an existing node and creates a near-duplicate beside it
- Writes without asking
- Creates nodes but no relations, so nothing it made is visible anywhere
- Skips verification, leaving the person to discover the breakage later
`;

const SKILL_ABSORB_EN = `---
name: atlas-absorb
description: Pull concepts out of prose (meeting notes, specs, PR descriptions), checking for duplicates first. Writes nothing until a person picks. Use for "extract from this" · "fold this document in".
---

# /atlas-absorb — prose into the graph

## The value here is in what it does *not* create

The most common failure when extracting concepts from prose is **recreating
something that already exists under a different name**. So the order is not
"extract, then check for duplicates" but **"check for duplicates, then extract"**.

1. **What are you reading**

- **A file in the vault** (or one the user pointed at) → \`absorb_document({ filePath })\`.
  Call it **without \`confirm\` first** — that returns proposals and writes nothing.
- **Prose pasted into the conversation** → read it directly and draw candidates.

2. **Check each candidate for duplicates first**

For every candidate name, make two calls.

- \`query_concepts({ filter: '<name>' })\` — does a near-name already exist
- \`find_evidence({ title: '<name>' })\` — is it already here under another name

If it exists, **do not create a new node.** Do one of two things: fill the
existing node with \`patch_concept\` (pass \`expected_mtime\`), or add only the
missing relation.

3. **Do not create what the text does not claim**

Prose is written loosely. "It would be nice if…" and "this might…" are wishes,
not facts. Only raise candidates the text **actually asserts**. When it is
borderline, raise it but mark it "weak support in the text" so the person decides.

4. **Write only what was approved — then verify**

- For a file: \`absorb_document({ filePath, confirm: true })\`
- For pasted prose: \`add_concepts\` → (after all succeed) \`add_relations\`
- Then \`validate_vault({})\` → \`query_ontology({ operation: 'health' })\`

## Name things the way this vault already does

\`title\` is the single canonical name search matches on, so **one language must
win across the vault**. Mixing them splits search. Other-language names go in
\`display_ko\` / \`display_en\`. Check which way this vault leans with
\`list_concepts\` before writing.

## How this skill fails

- Invents a plausible concept the text never claimed
- Recreates an existing concept under a new name
- Calls \`confirm: true\` first, writing before anyone has looked
- Uses a \`title\` language the vault does not use, splitting search
`;

const SKILL_REVIEW_KO = `---
name: atlas-review
description: 볼트 점검. 지금 어긋난 곳과 끊긴 곳을 찾아 사람 말로 정리하고, 각각을 고치는 정확한 호출을 함께 낸다. 아무것도 고치지 않는다. "어디가 문제야" · "점검해줘" · "성한지 봐줘" 일 때 쓴다.
---

# /atlas-review — 지금 이 볼트가 성한가

**아무것도 쓰지 않는다.** 이 스킬이 내놓는 것은 「무엇이 어긋났고 무엇을 부르면
고쳐지는가」 한 장이다. 고치는 것은 사람이 보고 정한 다음이다.

1. **두 번 부른다**

- \`validate_vault({})\` — frontmatter 와 관계 참조가 성한가
- \`query_ontology({ operation: 'health' })\` — 그래프 무결성 검사 묶음

\`grep\` 이나 \`sed\` 로 frontmatter 를 직접 훑지 않는다. 같은 답을 더 느리게 얻고
관계 해석과 스키마 검증이 빠진다.

2. **통과한 것은 말하지 않는다**

성한 검사를 나열하는 보고는 읽는 사람 시간을 쓰고, 정작 손댈 것을 묻는다.
**손댈 것이 있는 것만** 적는다. 전부 성하면 한 줄로 끝낸다 —
「지금 손댈 곳 없음 · 노드 N · 관계 M」.

3. **항목마다 셋을 적는다**

| | |
|---|---|
| 무슨 일인가 | 사람 말 한 줄. 검사 이름을 그대로 옮기지 않는다 |
| 왜 문제인가 | 이대로 두면 화면에서 무엇이 안 보이거나 틀리게 보이는지 |
| 고치는 호출 | 복사해서 바로 쓸 수 있는 한 줄 |

자주 나오는 둘:

- **닿지 않는 노드**(\`components\`) — 프로젝트 뿌리에서 못 닿는 노드는 어느
  프로젝트에도 안 속해서 지도에 안 나온다. 만들어 놓고 안 보이는 상태다.
  → \`add_relation('<project>', 'domains/<새 도메인>', 'domains')\`
- **한쪽만 아는 관계**(\`relation_recommendations\`) — 역량이 \`domain: X\` 를
  갖고 있는데 \`X\` 쪽에서 되받아 걸지 않았다.
  → \`add_relation('domains/X', 'capabilities/<역량>', 'capabilities')\`

4. **프로젝트 의미가 노랗다면 — 여기서 멈춘다**

\`meaning_assessment\` 는 **사람 승인 없이 마무리하지 않는다.** 프로젝트가 답할
다섯 질문은 「이 프로젝트가 무엇인가」에 대한 주장이라, 에이전트가 대신 확정할
수 없다. 무엇이 비었는지만 보여 주고 멈춘다.

## 이 스킬이 실패하는 방식

- 통과한 검사까지 나열해서 정작 손댈 것이 묻힌다
- 검사 이름을 그대로 옮겨 적고 뜻을 안 풀어 준다
- 문제만 적고 「고치는 호출」이 없다 — 그러면 읽는 사람이 다시 물어야 한다
- 물어보지도 않고 고쳐 버린다
`;

const SKILL_GROW_KO = `---
name: atlas-grow
description: 다음 한 걸음. 이 볼트에 무엇을 더하면 값이 가장 큰지 후보를 근거와 함께 뽑아 보여 준다. 사람이 고르기 전에는 한 글자도 쓰지 않는다. "다음에 뭐 채워" · "빈 곳 찾아줘" · "더 넣을 거 있어" 일 때 쓴다.
---

# /atlas-grow — 다음에 채울 곳

## 규율 하나 — 제안 단계는 절대 쓰지 않는다

사람이 고른 것만 볼트에 들어간다. 지어낸 노드는 이 도구가 낼 수 있는 최악의
결과다 — **틀린 지도는 없는 지도보다 나쁘다.** 없으면 사람이 직접 찾아보지만,
틀린 것이 있으면 그걸 믿고 결정한다.

1. **지금 어디까지 왔나**

- \`query_ontology({ operation: 'agent_brief' })\` — 이 볼트의 시작점과 다음 행동
- \`query_ontology({ operation: 'growth_plan' })\` — 무엇이 비어 있나

2. **후보를 근거로 거른다**

받은 후보를 그대로 옮기지 않는다. 하나씩 셋을 통과해야 남는다.

- **실재하는가** — 이름만 그럴듯한 게 아니라 코드나 문서에 근거가 있나.
   \`find_evidence({ title })\` 로 확인한다. 코드 폴더가 묶여 있으면
   \`analyze_repo_structure\` · \`infer_imports\` 가 근거를 준다.
- **이미 있는가** — \`query_concepts({ filter })\` 로 비슷한 이름을 먼저 찾는다.
   있으면 새로 만들지 말고 그것을 \`patch_concept\`(\`expected_mtime\` 함께)로 채운다.
- **뜻이 있는가** — 자리 말고 다른 이유가 있어야 element 다. 파일 하나마다
   노드 하나를 만들면 그건 지도가 아니라 파일 목록이다.

3. **사람에게 보여 준다**

한 번에 **다섯 개까지**. 줄마다 셋을 적는다 — ① 무엇을 ② 어디에 붙이고
③ 왜 그렇게 보는지(근거). 「전부 만들까요?」라고 묻지 않는다. 번호를 붙여서
골라서 답할 수 있게 한다.

4. **승인된 것만 쓴다 — 그리고 확인한다**

- 노드: \`add_concepts\` (많으면 50개씩 나눠서)
- **노드가 전부 성공한 다음에** 관계: \`add_relations\`
- \`validate_vault({})\` → \`query_ontology({ operation: 'health' })\`

**새 도메인은 저절로 프로젝트에 안 붙는다.**
\`add_relation('<project>', 'domains/<새 도메인>', 'domains')\` 를 빠뜨리면
만들어 놓고 지도에 안 보인다. 4번의 health 가 그것을 잡는다.

## 이 스킬이 실패하는 방식

- 근거 없이 그럴듯한 이름을 만들어 낸다
- 이미 있는 것을 못 찾아 비슷한 노드를 하나 더 만든다
- 묻지 않고 쓴다
- 노드만 만들고 관계를 안 걸어서, 만든 것이 어디에도 안 보인다
- 쓰고 나서 확인을 안 해, 깨진 것을 사람이 나중에 발견한다
`;

const SKILL_ABSORB_KO = `---
name: atlas-absorb
description: 글에서 개념 뽑기. 회의록·기획서·PR 설명에서 개념 후보를 뽑되 중복부터 먼저 확인한다. 사람이 고르기 전에는 쓰지 않는다. "이 글에서 뽑아줘" · "이 문서 반영해줘" 일 때 쓴다.
---

# /atlas-absorb — 글을 그래프로

## 이 스킬의 가장 큰 값은 「안 만드는 것」이다

산문에서 개념을 뽑을 때 가장 흔한 실패는 **이미 있는 것을 이름만 바꿔 또
만드는 것**이다. 그래서 순서가 「뽑고 나서 중복 확인」이 아니라
**「중복 확인하고 나서 뽑기」** 다.

1. **무엇을 읽나**

- **볼트 안(또는 사용자가 가리킨) 파일**이면 → \`absorb_document({ filePath })\`.
  \`confirm\` 을 **빼고 먼저 부른다** — 그러면 쓰지 않고 제안만 돌려준다.
- **대화에 붙여 넣은 글**이면 → 그 글을 직접 읽고 후보를 뽑는다.

2. **후보마다 중복을 먼저 본다**

후보 이름 하나하나에 대해 둘을 부른다.

- \`query_concepts({ filter: '<이름>' })\` — 비슷한 이름이 이미 있나
- \`find_evidence({ title: '<이름>' })\` — 다른 이름으로 이미 들어와 있나

있으면 **새로 만들지 않는다.** 둘 중 하나를 한다 —
\`patch_concept\`(\`expected_mtime\` 함께)로 내용을 채우거나, 관계만 더한다.

3. **글에 없는 것은 만들지 않는다**

산문은 사람이 대충 쓴다. 「~하면 좋겠다」 · 「~일 수도 있다」 는 아직 사실이
아니라 바람이다. **글이 실제로 주장하는 것만** 후보로 올린다. 애매하면
후보에는 올리되 「글의 근거가 약함」이라고 적어서 사람이 판단하게 한다.

4. **승인된 것만 쓴다 — 그리고 확인한다**

- 파일이면 \`absorb_document({ filePath, confirm: true })\`
- 붙여 넣은 글이면 \`add_concepts\` → (전부 성공한 뒤) \`add_relations\`
- 그다음 \`validate_vault({})\` → \`query_ontology({ operation: 'health' })\`

## 이름은 이 볼트가 쓰는 방식대로

\`title\` 은 검색이 기준으로 삼는 단 하나의 정본 이름이라 **볼트 안에서 언어가
하나로 통일돼야** 한다. 섞이면 검색이 갈린다. 다른 언어 이름은 \`display_ko\` /
\`display_en\` 에 넣는다. 지금 이 볼트가 어느 쪽인지는 \`list_concepts\` 로 먼저 본다.

## 이 스킬이 실패하는 방식

- 글에 없는 개념을 그럴듯하게 지어낸다
- 이미 있는 개념을 이름만 바꿔 또 만든다
- \`confirm: true\` 를 먼저 불러 사람이 보기 전에 써 버린다
- \`title\` 언어를 볼트와 다르게 넣어 검색이 갈린다
`;

/** The procedural skills for this locale. An unknown locale falls back to English. */
export function vaultSkillFilesForLocale(locale: string): ReadonlyArray<StarterFile> {
  const ko = locale === "ko";
  return [
    { relPath: vaultSkillPath("atlas-review"), content: ko ? SKILL_REVIEW_KO : SKILL_REVIEW_EN },
    { relPath: vaultSkillPath("atlas-grow"), content: ko ? SKILL_GROW_KO : SKILL_GROW_EN },
    { relPath: vaultSkillPath("atlas-absorb"), content: ko ? SKILL_ABSORB_KO : SKILL_ABSORB_EN },
  ];
}

/**
 * The English default, kept for existing consumers — the count contract (`starter-counts`) and the
 * CLI's default `init` both measure against it.
 */
export const ONTOLOGY_STARTER_FILES: ReadonlyArray<StarterFile> = STARTER_FILES_EN;

/**
 * **How** a config template launches the server.
 *
 * The installed app passes the absolute path of the binary inside its own bundle, so the user's
 * machine needs neither node, npx, nor a source checkout. A surface that does not know that path
 * (the web) degrades to a source-checkout placeholder. `npx` is no longer on any path (the npm
 * publishing plan was dropped — docs/DECISIONS.md 2026-07-27).
 */
const SOURCE_CHECKOUT_PLACEHOLDER: McpServerLaunch = {
  kind: 'source-checkout',
  command: 'node',
  args: [`<absolute path to your ontology-atlas checkout>/mcp/src/index.js`],
};

function resolveLaunch(launch?: McpServerLaunch | null): McpServerLaunch {
  return launch ?? SOURCE_CHECKOUT_PLACEHOLDER;
}

/**
 * MCP config template to register an AI agent (Claude Code, Cursor, …) from
 * a different working directory. `OATLAS_VAULT` must be the absolute path to
 * the vault folder — the browser cannot know it.
 */
export function buildMcpConfigJson(
  vaultName: string,
  vaultPath?: string | null,
  launch?: McpServerLaunch | null,
): string {
  return buildMcpConfigJsonForVault(
    vaultPath ?? `<absolute path to your ${vaultName} folder>`,
    launch,
  );
}

/**
 * Ready-to-use MCP config for opening the vault folder itself in Claude Code
 * or Cursor. `OATLAS_VAULT=.` keeps the config portable inside the folder.
 */
export function buildVaultMcpConfigJson(launch?: McpServerLaunch | null): string {
  return buildMcpConfigJsonForVault('.', launch);
}

function buildMcpConfigJsonForVault(
  omotVault: string,
  launch?: McpServerLaunch | null,
): string {
  const resolved = resolveLaunch(launch);
  return (
    JSON.stringify(
      {
        mcpServers: {
          'ontology-atlas': {
            command: resolved.command,
            args: resolved.args,
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
export function buildCodexConfigToml(
  omotVault = '.',
  launch?: McpServerLaunch | null,
): string {
  const resolved = resolveLaunch(launch);
  return [
    '[mcp_servers.ontology-atlas]',
    `command = ${JSON.stringify(resolved.command)}`,
    `args = ${JSON.stringify(resolved.args)}`,
    '',
    '[mcp_servers.ontology-atlas.env]',
    `OATLAS_VAULT = ${JSON.stringify(omotVault)}`,
    '',
  ].join('\n');
}

export function buildCodexConfigTomlTemplate(
  vaultName: string,
  vaultPath?: string | null,
  launch?: McpServerLaunch | null,
): string {
  return buildCodexConfigToml(
    vaultPath ?? `<absolute path to your ${vaultName} folder>`,
    launch,
  );
}

/**
 * One-line Codex CLI registration for users who prefer mutating their Codex
 * MCP config through the CLI instead of editing `.codex/config.toml`.
 */
export function buildCodexMcpAddCommandTemplate(
  vaultName: string,
  vaultPath?: string | null,
  launch?: McpServerLaunch | null,
): string {
  const resolvedVaultPath = vaultPath ?? `<absolute path to your ${vaultName} folder>`;
  const resolved = resolveLaunch(launch);
  return [
    'codex',
    'mcp',
    'add',
    'ontology-atlas',
    '--env',
    `OATLAS_VAULT=${shellQuote(resolvedVaultPath)}`,
    '--',
    shellQuote(resolved.command),
    ...resolved.args.map(shellQuote),
  ].join(' ');
}

/**
 * Safer existing-vault repair command for agents opened at a codebase root.
 * It creates missing config files, atomically rebinds one parseable Atlas
 * entry, and leaves ambiguous config untouched with a merge template.
 */
export function buildAgentSetupCliCommandTemplate(vaultName: string): string {
  const vaultPath = `<absolute path to your ${vaultName} folder>`;
  return [
    ATLAS_CLI,
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
    ATLAS_CLI,
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
