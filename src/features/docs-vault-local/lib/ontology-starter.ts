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
 * 정적 스타터에는 영구 식별자를 넣지 않는다. 실제 vault scaffold 한 번마다
 * 모든 kind 문서(vault-readme 포함)에 서로 다른 UUIDv4를 발급한다. 테스트는
 * factory를 주입해 산출물을 결정론적으로 검증한다.
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
 * 기존 소비자를 위한 영어 기본값 — 개수 계약(`starter-counts`)과 CLI 기본
 * `init` 이 이걸 기준으로 남는다.
 */
export const ONTOLOGY_STARTER_FILES: ReadonlyArray<StarterFile> = STARTER_FILES_EN;

/**
 * 설정 템플릿이 서버를 **어떻게 띄우는가**.
 *
 * 설치된 앱은 자기 번들 안의 바이너리 절대 경로를 넘긴다 — 사용자 머신에
 * node 도 npx 도 소스 체크아웃도 필요 없다. 그걸 모르는 표면(웹)은 소스
 * 체크아웃 자리표시자로 강등한다. `npx` 는 더 이상 어느 경로에도 없다
 * (npm 발행 계획 폐기, docs/DECISIONS.md 2026-07-27).
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
