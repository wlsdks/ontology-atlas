// 4-way frontmatter parser contract — the same input must give the same output.
//
// Single source of truth: this fixture. Verified against:
//   - src/shared/lib/parse-frontmatter.ts        (runtime)
//   - mcp/src/parser.mjs                         (AI agent surface, separate package)
//   - scripts/lib/parse-frontmatter.mjs          (build scripts + validator CLI)
//   - cli/src/lib/parse-frontmatter.mjs          (developer CLI, separate package)
//
// If one drifts, the contract test catches it immediately. `mcp/` and `cli/` ship
// separately and cannot be folded into one physical module, so the contract test is
// what unifies them in effect.

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
    // Object maps such as relation_notes (nested indented key: value) must parse
    // identically across the parsers, or the `why` schema is unsafe. It is also the
    // premise for key rewriting on rename (redirectBacklinks).
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
  // ── Line endings and encoding (measured in the 2026-07-28 code-quality review) ──
  //
  // This matrix had **zero** CRLF or BOM cases. The 4-way contract guarantees the four
  // parsers *agree*, but **it passes when all four are wrong the same way** — and all
  // four were.
  //
  // Why that is critical: the population `.claude/rules/surfaces.md` explicitly
  // supports is "the fallback workbench on Windows Chromium", and what Windows editors
  // produce is exactly CRLF. PowerShell `Out-File` defaults to UTF-8 **with BOM**.
  {
    // `.trim()` rescues scalars, so only block lists die — which makes the symptom
    // "the nodes are visible but every relation disappeared", with no warning at all.
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
    // A BOM makes the `---` check miss entirely, so **the document disappears from the
    // graph as a node**: it looks like a document with no `kind:`.
    name: "BOM — frontmatter 블록이 증발하지 않는다",
    input: "\uFEFF---\nkind: capability\ntitle: T\n---\n본문",
    expected: { frontmatter: { kind: "capability", title: "T" }, body: "본문" },
  },
  {
    name: "BOM + CRLF — 둘이 겹쳐도 읽는다",
    input: "\uFEFF---\r\nkind: domain\r\ntitle: D\r\n---\r\n본문",
    expected: { frontmatter: { kind: "domain", title: "D" }, body: "본문" },
  },
  // ── Quoting and separators (measured in the 2026-07-28 code-quality review) ──
  //
  // The serializer escapes `"` as `\"` while the parser never unescaped it, so every
  // re-serialisation of frontmatter by `patch_concept` **doubled** the backslashes —
  // repeated saves multiplied the corruption (measured over 3 saves: 1 → 2 → 4).
  //
  // Inline lists and objects were unconditionally `split(',')`, so they split on commas
  // inside values: the tail of `labels: { ko: "지도, 검색" }` silently disappeared.
  {
    name: "따옴표 안의 이스케이프된 따옴표 — 원문으로 되돌린다",
    input: '---\nkind: capability\ntitle: "say \\"hello\\""\n---\n',
    expected: { frontmatter: { kind: "capability", title: 'say "hello"' }, body: "" },
  },
  {
    name: "큰따옴표 안의 줄바꿈·탭 이스케이프를 원문으로 되돌린다",
    input: '---\nkind: capability\nsummary: "first\\nsecond\\tvalue"\n---\n',
    expected: {
      frontmatter: { kind: "capability", summary: "first\nsecond\tvalue" },
      body: "",
    },
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
  // ── Two forms YAML allows that our parser could not read (dogfooding, 2026-07-29) ──
  //
  // Every block-list case in this matrix used **two-space indentation**. But YAML does
  // not require a sequence under a key to be indented — writing `- ` at column 0 is
  // valid in PyYAML, js-yaml, gray-matter, Obsidian, and GitHub alike. Our parser used
  // `/^\s+-\s+/`, requiring **at least one space**, so relations written that way
  // became empty strings wholesale. The symptom matches the CRLF case: **the nodes are
  // visible, every relation disappeared, zero warnings.**
  //
  // Block scalars (`|`, `>`) were worse. The indicator was stored as the value
  // (`"|"`), and the indented body lines that followed were **reinterpreted as
  // top-level keys**, because the parser `.trim()`s keys. So a single `kind: element`
  // line inside a description **changed that node's kind** — a document overwriting
  // its own type with its own prose.
  //
  // The 4-way contract passes when all four are wrong the same way, so adding a case
  // to this matrix — the source of truth — is what makes it a requirement on all four
  // parsers.
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
