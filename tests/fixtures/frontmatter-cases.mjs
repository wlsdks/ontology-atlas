// 4-way frontmatter parser contract — 같은 입력에 같은 출력을 보장.
//
// 단일 진실원: 이 fixture 1 곳. 검증 대상:
//   - src/shared/lib/parse-frontmatter.ts        (런타임)
//   - mcp/src/parser.mjs                         (AI agent surface, 별도 npm pkg)
//   - scripts/lib/parse-frontmatter.mjs          (빌드 스크립트 + validator CLI)
//   - cli/src/lib/parse-frontmatter.mjs          (developer CLI, 별도 npm pkg)
//
// 한쪽이 drift 하면 contract test 가 즉시 잡는다. mcp/ 와 cli/ 는 별도 publish 라
// 물리적 단일 모듈로 묶을 수 없으므로 contract test 가 effective 단일화.

export const CASES = [
  {
    name: "frontmatter 없는 본문",
    input: "hello\nworld",
    expected: { frontmatter: {}, body: "hello\nworld" },
  },
  {
    name: "scalar 매핑",
    input: "---\nname: Alpha\nstatus: live\n---\nbody",
    expected: {
      frontmatter: { name: "Alpha", status: "live" },
      body: "body",
    },
  },
  {
    name: "quoted scalar — 양쪽 quote 제거",
    input: `---\nname: "Hello: World"\nslug: 'a-b'\n---\n`,
    expected: {
      frontmatter: { name: "Hello: World", slug: "a-b" },
      body: "",
    },
  },
  {
    name: "inline list",
    input: "---\ntags: [auth, security, identity]\n---\n",
    expected: {
      frontmatter: { tags: ["auth", "security", "identity"] },
      body: "",
    },
  },
  {
    name: "block list",
    input:
      "---\ncaps:\n  - login\n  - reset\n  - permission\n---\n# heading",
    expected: {
      frontmatter: { caps: ["login", "reset", "permission"] },
      body: "# heading",
    },
  },
  {
    name: "inline object",
    input: "---\nposition: { x: 10, y: 20 }\n---\n",
    expected: {
      frontmatter: { position: { x: 10, y: 20 } },
      body: "",
    },
  },
  {
    name: "block object",
    input: "---\ntimeline:\n  start: 2026-01-01\n  end: 2026-12-31\n---\n",
    expected: {
      frontmatter: { timeline: { start: "2026-01-01", end: "2026-12-31" } },
      body: "",
    },
  },
  {
    name: "boolean / number 자동 변환 (block object)",
    input: "---\nflags:\n  ready: true\n  count: 42\n  draft: false\n---\n",
    expected: {
      frontmatter: { flags: { ready: true, count: 42, draft: false } },
      body: "",
    },
  },
  {
    name: "닫는 --- 빠지면 frontmatter 0 (lenient)",
    input: "---\nkind: project\n# heading without close",
    expected: {
      frontmatter: {},
      body: "---\nkind: project\n# heading without close",
    },
  },
  {
    name: "빈 키 라인은 skip",
    input: "---\n: bad\nkind: project\n---\n",
    expected: { frontmatter: { kind: "project" }, body: "" },
  },
  {
    name: "prototype key 아래 필드가 top-level schema로 승격되지 않는다",
    input:
      "---\n__proto__:\n  kind: project\n  title: Forged\n  uid: 01890f3e-7b5d-4c0a-8f14-123456789abc\nsafe: kept\n---\n",
    expected: {
      frontmatter: { safe: "kept" },
      body: "",
      diagnostics: [
        {
          code: "malformed-frontmatter-line",
          line: 2,
          message: "Frontmatter line 2 uses unsafe object key `__proto__`.",
        },
      ],
    },
  },
  {
    name: "중첩 객체의 prototype meta key도 거절한다",
    input:
      "---\nmetadata:\n  __proto__: blocked\n  constructor: blocked\n  prototype: blocked\n  safe: kept\n---\n",
    expected: {
      frontmatter: { metadata: { safe: "kept" } },
      body: "",
      diagnostics: [
        {
          code: "malformed-frontmatter-line",
          line: 3,
          message: "Frontmatter line 3 uses unsafe object key `__proto__`.",
        },
        {
          code: "malformed-frontmatter-line",
          line: 4,
          message: "Frontmatter line 4 uses unsafe object key `constructor`.",
        },
        {
          code: "malformed-frontmatter-line",
          line: 5,
          message: "Frontmatter line 5 uses unsafe object key `prototype`.",
        },
      ],
    },
  },
  {
    name: "콜론 없는 frontmatter 선언은 구조 진단",
    input: "---\nkind: capability\nelements\n  - elements/orphan\n---\n",
    expected: {
      frontmatter: { kind: "capability" },
      body: "",
      diagnostics: [
        {
          code: "malformed-frontmatter-line",
          line: 3,
          message: "Frontmatter line 3 must use key: value syntax.",
        },
        {
          code: "malformed-frontmatter-line",
          line: 4,
          message: "Frontmatter list item on line 4 has no parent key.",
        },
      ],
    },
  },
  {
    name: "들여쓴 콜론 없는 frontmatter 선언도 구조 진단",
    input: "---\nkind: capability\n  domain domains/auth\n  orphan value\n---\n",
    expected: {
      frontmatter: { kind: "capability" },
      body: "",
      diagnostics: [
        {
          code: "malformed-frontmatter-line",
          line: 3,
          message: "Frontmatter line 3 must use key: value syntax.",
        },
        {
          code: "malformed-frontmatter-line",
          line: 4,
          message: "Frontmatter line 4 must use key: value syntax.",
        },
      ],
    },
  },
  {
    name: "value 없는 key — 빈 문자열",
    input: "---\nkind:\n---\n",
    expected: { frontmatter: { kind: "" }, body: "" },
  },
  {
    name: "Korean 슬러그 / 한글 값",
    input: "---\ntitle: 안녕\ntags: [한글, 영어]\n---\n본문",
    expected: {
      frontmatter: { title: "안녕", tags: ["한글", "영어"] },
      body: "본문",
    },
  },
  {
    // P6 게이트 ② — relation_notes 같은 객체 맵(중첩 들여쓰기 key: value)이
    // 3-way 파서(런타임/MCP/스크립트)에서 동일하게 해석돼야 why 스키마가
    // 안전하다. rename 시 키 재작성(redirectBacklinks)의 전제이기도 하다.
    name: "객체 맵 (relation_notes 형) — 중첩 key: value",
    input: "---\nkind: capability\ntitle: T\nrelation_notes:\n  capabilities/mcp-server: 쓰기 경로가 이 서버를 지난다\n  domains/views: 지도가 이 관계를 그린다\n---\n본문",
    expected: {
      frontmatter: {
        kind: "capability",
        title: "T",
        relation_notes: {
          "capabilities/mcp-server": "쓰기 경로가 이 서버를 지난다",
          "domains/views": "지도가 이 관계를 그린다",
        },
      },
      body: "본문",
    },
  },
  // ── 줄바꿈·인코딩 (2026-07-28 코드 품질 리뷰 실측) ────────────────────────
  //
  // 이 매트릭스에 CRLF·BOM 케이스가 **0건**이었다. 4-way 계약은 네 파서의
  // *일치*를 보장하지만 **넷이 똑같이 틀리면 통과한다** — 그리고 실제로
  // 똑같이 틀려 있었다.
  //
  // 왜 치명적인가: `surfaces.md` 가 명시 지원한다고 적은 인구가 "Windows
  // Chromium 의 차선 워크벤치" 이고, Windows 편집기가 만드는 것이 정확히
  // CRLF 다. PowerShell `Out-File` 기본값은 UTF-8 **BOM** 이다.
  {
    // 스칼라는 `.trim()` 이 구제해서 살아남고 블록 리스트만 죽는다 — 그래서
    // 증상이 "노드는 보이는데 관계만 전부 사라진다" 는 형태로 나타난다.
    // 아무 경고도 없다.
    name: "CRLF — 블록 리스트가 살아남는다",
    input: "---\r\nkind: capability\r\ntitle: T\r\nrelates:\r\n  - a\r\n  - b\r\n---\r\n본문",
    expected: {
      frontmatter: { kind: "capability", title: "T", relates: ["a", "b"] },
      body: "본문",
    },
  },
  {
    name: "CRLF — 중첩 객체 맵이 살아남는다",
    input: "---\r\nkind: capability\r\nlabels:\r\n  ko: 지도\r\n  en: Map\r\n---\r\n",
    expected: {
      frontmatter: { kind: "capability", labels: { ko: "지도", en: "Map" } },
      body: "",
    },
  },
  {
    // BOM 은 `---` 판정을 통째로 빗나가게 해서 **그 문서가 그래프에서 노드
    // 자체로 사라진다**. `kind:` 가 없는 문서로 보이기 때문이다.
    name: "BOM — frontmatter 블록이 증발하지 않는다",
    input: "\uFEFF---\nkind: capability\ntitle: T\n---\n본문",
    expected: { frontmatter: { kind: "capability", title: "T" }, body: "본문" },
  },
  {
    name: "BOM + CRLF — 둘이 겹쳐도 읽는다",
    input: "\uFEFF---\r\nkind: domain\r\ntitle: D\r\n---\r\n본문",
    expected: { frontmatter: { kind: "domain", title: "D" }, body: "본문" },
  },
  // ── 인용·구분자 (2026-07-28 코드 품질 리뷰 실측) ──────────────────────────
  //
  // serializer 는 `"` 를 `\"` 로 이스케이프하는데 파서는 언이스케이프를 안
  // 했다. 그래서 `patch_concept` 가 프론트매터를 재직렬화할 때마다 백슬래시가
  // **배가**된다 — 저장 반복 = 오염 증식(실측 3회: 1개 → 2개 → 4개).
  //
  // 인라인 리스트/객체는 무조건 `split(',')` 라 값 안의 콤마에서 쪼개졌다.
  // `labels: { ko: "지도, 검색" }` 의 뒷조각이 조용히 사라진다.
  {
    name: "따옴표 안의 이스케이프된 따옴표 — 원문으로 되돌린다",
    input: '---\nkind: capability\ntitle: "say \\"hello\\""\n---\n',
    expected: { frontmatter: { kind: "capability", title: 'say "hello"' }, body: "" },
  },
  {
    name: "인라인 리스트 — 따옴표 안의 콤마로 쪼개지 않는다",
    input: '---\nkind: capability\ntags: ["a, b", c]\n---\n',
    expected: { frontmatter: { kind: "capability", tags: ["a, b", "c"] }, body: "" },
  },
  {
    name: "인라인 객체 — 따옴표 안의 콤마로 쪼개지 않는다",
    input: '---\nkind: capability\nlabels: { ko: "지도, 검색", en: Map }\n---\n',
    expected: {
      frontmatter: { kind: "capability", labels: { ko: "지도, 검색", en: "Map" } },
      body: "",
    },
  },
  // ── YAML 이 허용하는데 우리 파서가 못 읽던 두 형식 (2026-07-29 도그푸딩) ──
  //
  // 이 매트릭스의 블록 리스트 케이스는 전부 **2칸 들여쓰기**였다. 그런데 YAML
  // 은 키 아래 시퀀스에 들여쓰기를 요구하지 않는다 — `- ` 를 0칸으로 쓰는 것이
  // PyYAML·js-yaml·gray-matter·Obsidian·GitHub 모두에서 정상이다. 우리 파서는
  // `/^\s+-\s+/` 라 **공백 하나 이상**을 요구했고, 그래서 그 형식의 관계가
  // 통째로 빈 문자열이 됐다. 증상은 CRLF 때와 같다: **노드는 보이는데 관계만
  // 전부 사라지고 경고 0.**
  //
  // 블록 스칼라(`|`, `>`)는 더 나빴다. 지시자가 값으로 저장되고(`"|"`), 이어지는
  // 들여쓴 본문 줄들이 **최상위 키로 재해석**됐다 — 파서가 키를 `.trim()` 하기
  // 때문이다. 그래서 설명문 안의 `kind: element` 한 줄이 그 노드의 **종류를
  // 바꿔 버렸다.** 문서가 자기 설명으로 자기 타입을 덮어쓰는 것이다.
  //
  // 넷이 똑같이 틀리면 4-way 계약은 통과한다 — 이 매트릭스가 진실원이라
  // 여기에 케이스를 넣는 것이 곧 네 파서 모두에 대한 요구다.
  {
    name: "블록 리스트 — 0칸 들여쓰기도 YAML 이다",
    input: "---\nkind: capability\ndepends_on:\n- alpha\n- beta\n---\n",
    expected: {
      frontmatter: { kind: "capability", depends_on: ["alpha", "beta"] },
      body: "",
    },
  },
  {
    name: "블록 리스트 — 0칸과 2칸이 같은 결과를 낸다",
    input: "---\nkind: capability\ntags:\n-  a\n-  b\n---\n",
    expected: { frontmatter: { kind: "capability", tags: ["a", "b"] }, body: "" },
  },
  {
    name: "블록 스칼라 `|` — 본문이 값이 되고, 그 안의 콜론이 키가 되지 않는다",
    input:
      "---\nkind: capability\ndefinition: |\n  토큰을 발급한다.\n  kind: element\n---\n본문",
    expected: {
      frontmatter: {
        kind: "capability",
        definition: "토큰을 발급한다.\nkind: element",
      },
      body: "본문",
    },
  },
  {
    name: "블록 스칼라 `>` — 접힌 스칼라도 값으로 삼킨다",
    input: "---\nkind: domain\nsummary: >\n  한 줄\n  다음 줄\n---\n",
    expected: {
      frontmatter: { kind: "domain", summary: "한 줄 다음 줄" },
      body: "",
    },
  },
  {
    name: "블록 스칼라 뒤의 최상위 키는 계속 최상위 키다",
    input:
      "---\nkind: capability\ndefinition: |\n  설명\ndomain: auth\n---\n",
    expected: {
      frontmatter: { kind: "capability", definition: "설명", domain: "auth" },
      body: "",
    },
  },
  {
    name: "블록 스칼라 왕복 — 직렬화한 것을 다시 읽으면 같다",
    input:
      "---\nkind: capability\ndefinition: |-\n  첫 줄\n  Note: 둘째 줄\ndepends_on: [a, b]\n---\n",
    expected: {
      frontmatter: {
        kind: "capability",
        definition: "첫 줄\nNote: 둘째 줄",
        depends_on: ["a", "b"],
      },
      body: "",
    },
  },
];
