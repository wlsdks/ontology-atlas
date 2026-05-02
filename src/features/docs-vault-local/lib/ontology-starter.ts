/**
 * mission v2 ontology starter — 빈 폴더에 scaffold 할 5 md + .mcp.json.
 *
 * cli/templates/vault/ 와 동일한 시드. CLI 와 web workbench 가 같은 결과를
 * 보여줘 사용자 혼동 없게. 변경 시 둘 다 갱신.
 */

interface StarterFile {
  /** 폴더 안 상대 경로. README.md 같은 단일 파일 또는 domains/example.md 같은 nested. */
  relPath: string;
  content: string;
}

const README_MD = `---
slug: README
kind: vault-readme
title: My ontology vault
---

# My ontology vault

이 폴더는 **사람과 AI agent 가 같이 키우는 codebase mental model** 입니다.
각 \`.md\` 파일은 한 노드 (project / domain / capability / element / concept)
이고, 파일 위 frontmatter 가 그래프의 키 (slug / kind / depends_on /
capabilities / elements / domain) 입니다.

## 시작 방법 (5분)

1. \`project.md\` 를 열어 프로젝트 이름과 설명을 적습니다.
2. 새 도메인이 떠오르면 \`domains/\` 안에 \`<slug>.md\` 추가:
   \`\`\`markdown
   ---
   slug: domains/auth
   kind: domain
   title: 인증
   capabilities:
     - capabilities/login
     - capabilities/signup
   ---

   사용자 인증·세션·권한을 담당.
   \`\`\`
3. capability / element 도 같은 패턴 — \`capabilities/\` 와 \`elements/\`.
4. AI agent (Claude Code 등) 를 등록하면 같은 vault 를 읽고 쓰며 같이 키워갑니다.
5. 그래프로 보고 싶으면 이 web workbench 의 토폴로지 / 트리 / 빌더 view 참고.

## 관계 (frontmatter 키)

| 키 | 어떤 관계 |
|---|---|
| \`depends_on: [<slug>, ...]\` | 이 노드가 다른 노드에 의존 |
| \`capabilities: [...]\` | 이 도메인 / 프로젝트가 가진 역량 |
| \`elements: [...]\` | 이 역량 / 도메인이 사용하는 요소 |
| \`domain: <slug>\` | 이 capability/element 의 상위 도메인 |
| \`evidenceIds: [doc-1, ...]\` | 이 노드의 근거 문서 ID |

## kind 종류

- \`project\` — 최상위. 워크스페이스 1개당 보통 1.
- \`domain\` — 큰 영역 (인증, 결제, 빌더 등).
- \`capability\` — 도메인의 한 역량 (로그인, 회원가입, …).
- \`element\` — capability 가 쓰는 작은 요소 (jwt-token, otp-store, …).
- \`concept\` — 이 외 자유로운 개념 (프로토콜·표준·외부 시스템 등).

## AI agent 가 자동으로 할 수 있는 일

\`oh-my-ontology-mcp\` 서버를 등록하면 다음 11 도구로 vault read/write:

- **read 7**: list_concepts / get_concept / find_evidence / find_backlinks /
  find_path / list_kinds / find_orphans
- **write 4**: add_concept / add_relation / patch_concept / delete_concept

자세히: https://github.com/wlsdks/oh-my-ontology/tree/main/mcp
`;

const PROJECT_MD = `---
slug: project
kind: project
title: My project
domains:
  - domains/example
capabilities:
  - capabilities/example
elements:
  - elements/example
---

# My project

여기서 프로젝트의 한두 줄 요약을 적습니다 — *"무엇을 / 누구에게 / 왜"*.

## 한 줄 mission

이 프로젝트가 해결하는 문제 / 만드는 가치를 한 줄로.

## 어떻게 자라는가

- frontmatter 의 \`domains: [...]\` 를 채우면 도메인 노드가 트리에 매달립니다.
- 각 도메인 안 capability / element 도 같은 패턴.
- AI agent 가 새 노드를 만들 때 이 파일의 \`depends_on\` / \`domains\` 가
  자동 갱신될 수 있어요 — frontmatter 가 진실원이라 충돌 안 납니다.

## 다음 단계

1. 이 파일의 \`title\` 과 \`kind: project\` 외 frontmatter 를 본인 프로젝트에 맞게 수정
2. \`domains/example.md\` 같은 starter 를 본인 영역으로 rename / 복제
3. AI agent (Claude Code 등) 등록 후 "이 vault 의 ontology 좀 정리해줘" 라고 요청
`;

const DOMAIN_MD = `---
slug: domains/example
kind: domain
title: 예시 도메인
capabilities:
  - capabilities/example
---

# 예시 도메인

도메인 = 프로젝트의 큰 영역 (인증·결제·빌더·실시간·검색 같은 하위 시스템).
이 파일을 본인 도메인 이름으로 rename 하고 (\`domains/auth.md\`,
\`domains/billing.md\` 등) 그 도메인이 가진 capability 를 위 frontmatter
\`capabilities:\` 에 적어주세요.

## 어떻게 채우나

- 한두 단락의 본문은 *그 도메인이 무엇인지* 설명.
- 본문에 다른 도메인 / capability 의 markdown link 를 넣으면 backlink
  로 인식됩니다.
- frontmatter 키:
  - \`capabilities: [...]\` — 이 도메인이 가진 역량 slug 들
  - \`depends_on: [...]\` — 이 도메인이 의존하는 다른 도메인 / 외부 시스템
  - \`evidenceIds: [...]\` — 이 노드의 근거 문서 ID (선택)

## 살릴까 지울까

- 살릴 거면 위 가이드대로 채우기
- 안 쓸 거면 이 파일 삭제 — 그냥 starter 입니다
`;

const CAPABILITY_MD = `---
slug: capabilities/example
kind: capability
title: 예시 역량
domain: domains/example
elements:
  - elements/example
---

# 예시 역량

Capability = 도메인의 한 사용자-가시 기능 단위 (로그인, 회원가입, 결제,
검색, 빌더 캔버스 등). 이 파일을 본인 역량 이름으로 rename 하고
(\`capabilities/login.md\`, \`capabilities/checkout.md\`) 위 frontmatter
\`domain:\` 과 \`elements:\` 를 본인 환경에 맞게 적어주세요.

## 어떻게 채우나

- 본문에 *이 capability 가 무엇을 하는지* + 사용자 시나리오 한두 줄.
- frontmatter 키:
  - \`domain: <slug>\` — 상위 도메인 한 개
  - \`elements: [...]\` — 이 capability 가 사용하는 element slug 들
  - \`depends_on: [...]\` — 다른 capability 에 의존하면
  - \`evidenceIds: [...]\` — 명세 / 결정문서 ID (선택)
`;

const ELEMENT_MD = `---
slug: elements/example
kind: element
title: 예시 요소
domain: domains/example
---

# 예시 요소

Element = capability 가 쓰는 더 작은 단위 (jwt-token, otp-store,
indexeddb-adapter, sigma-canvas, …). 이 파일을 본인 element 이름으로
rename 하고 (\`elements/jwt-token.md\`) 위 frontmatter \`domain:\` 을
정확한 도메인으로 적어주세요.

## 어떻게 채우나

- 본문은 *무엇을 / 왜 / 어떤 인터페이스* 한두 단락.
- frontmatter 키:
  - \`domain: <slug>\` — 상위 도메인 한 개
  - \`depends_on: [...]\` — 다른 element / capability 에 의존하면
  - \`evidenceIds: [...]\` — 라이브러리 docs / 결정 문서 ID (선택)
`;

export const ONTOLOGY_STARTER_FILES: ReadonlyArray<StarterFile> = [
  { relPath: 'README.md', content: README_MD },
  { relPath: 'project.md', content: PROJECT_MD },
  { relPath: 'domains/example.md', content: DOMAIN_MD },
  { relPath: 'capabilities/example.md', content: CAPABILITY_MD },
  { relPath: 'elements/example.md', content: ELEMENT_MD },
];

/**
 * AI agent (Claude Code 등) 등록용 MCP config — 사용자가 자기 agent
 * 설정으로 복사. `OMOT_VAULT` 환경변수는 vault 폴더 절대경로로 사용자가 채워야 한다 (브라우저는 절대경로 모름).
 */
export function buildMcpConfigJson(vaultName: string): string {
  return (
    JSON.stringify(
      {
        mcpServers: {
          'oh-my-ontology': {
            command: 'npx',
            args: ['-y', 'oh-my-ontology-mcp'],
            env: {
              OMOT_VAULT: `<absolute path to your ${vaultName} folder>`,
            },
          },
        },
      },
      null,
      2,
    ) + '\n'
  );
}
