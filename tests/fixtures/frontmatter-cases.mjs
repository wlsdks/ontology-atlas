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
  {
    // The inline flow-map form `add_relation(why)` actually writes, with the value
    // quoted because it carries a comma and a colon. Unquoted, the comma would end
    // the entry early and turn the rest of the sentence plus the next slug into a
    // pseudo-key (the acp-runtime accident, 2026-08-30). Every parser must read
    // one map with two string entries, or `find_path` and the compiler read a
    // rationale the writer never meant.
    name: "relation_notes inline flow map — quoted values with commas and colons",
    input:
      '---\nkind: capability\ntitle: T\ndependencies: [capabilities/mcp-server]\nrelates: [capabilities/reviewed-ontology-writing]\n' +
      'relation_notes: { capabilities/mcp-server: "The ACP session receives this server as an mcpServer, ACP sits on top of it.", capabilities/reviewed-ontology-writing: "Permission requests reuse the reviewed contract: read tools continue, write tools pause." }\n---\nbody',
    expected: {
      frontmatter: {
        kind: "capability",
        title: "T",
        dependencies: ["capabilities/mcp-server"],
        relates: ["capabilities/reviewed-ontology-writing"],
        relation_notes: {
          "capabilities/mcp-server": "The ACP session receives this server as an mcpServer, ACP sits on top of it.",
          "capabilities/reviewed-ontology-writing": "Permission requests reuse the reviewed contract: read tools continue, write tools pause.",
        },
      },
      body: "body",
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
  // inside values: the tail of `labels: { ko: "map, search" }` silently disappeared.
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
  {
    // Found in this repository's own vault, 2026-08-31, on `display_ko`.
    // `unquote` only strips a matching pair, so the opening quote survived as
    // literal text and every reader rendered the stray quote — with 0 issues.
    name: "quoted scalar closing early keeps the quote — diagnosed",
    input: '---\ntitle: Agents Destination\ndisplay_ko: "에이전트" 목적지\n---\n',
    expected: {
      frontmatter: { title: "Agents Destination", display_ko: '에이전트" 목적지' },
      body: "",
      diagnostics: [
        {
          code: "malformed-quoted-scalar",
          line: 3,
          message:
            "Frontmatter line 3 `display_ko:` closes its quote before the end of the value, " +
            "so the rest is read as literal text. Close the quote or remove it: `display_ko: 에이전트 목적지`",
        },
      ],
    },
  },
  {
    name: "single quote closing early and a never-closed quote are both diagnosed",
    input: "---\nsummary: 'a' b\nnote: \"unclosed\n---\n",
    expected: {
      frontmatter: { summary: "a' b", note: "unclosed" },
      body: "",
      diagnostics: [
        {
          code: "malformed-quoted-scalar",
          line: 2,
          message:
            "Frontmatter line 2 `summary:` closes its quote before the end of the value, " +
            "so the rest is read as literal text. Close the quote or remove it: `summary: a b`",
        },
        {
          code: "malformed-quoted-scalar",
          line: 3,
          message:
            "Frontmatter line 3 `note:` opens a quote the value never closes, " +
            "so the quote is read as literal text. Close the quote or remove it: `note: unclosed`",
        },
      ],
    },
  },
  {
    // The boundary: an escaped inner quote, an unquoted value that merely contains
    // quotes, and an empty quoted value are all legal and must stay silent.
    name: "escaped, unquoted and empty quoted values stay clean",
    input: '---\ntitle: "a \\"b\\""\nsubtitle: a "b" c\nempty: ""\n---\n',
    expected: {
      frontmatter: { title: 'a "b"', subtitle: 'a "b" c', empty: "" },
      body: "",
    },
  },
  {
    // The rule follows `unquote`, not YAML: a wrapping pair is stripped whenever
    // the last character is the same quote, so an inner apostrophe or an inner
    // pair of double quotes renders exactly as written. Diagnosing these would
    // turn a vault that reads correctly today into an error tomorrow.
    name: "inner quotes inside a closed pair render as written and stay clean",
    input:
      "---\ntitle: 'Owner's guide'\ndisplay_en: \"He said \"hi\" today\"\n---\n",
    expected: {
      frontmatter: { title: "Owner's guide", display_en: 'He said "hi" today' },
      body: "",
    },
  },
  {
    // 2026-09-01 review: the serializer writes booleans and numbers unquoted,
    // but the read side returned them as strings — `draft: false` came back as
    // the truthy string 'false' after one round trip, with the type depending
    // on nesting depth in the same file. Top-level scalars are typed like
    // nested ones.
    name: "top-level booleans and numbers are typed, matching nested members",
    input: "---\ndraft: false\ncount: 2\nratio: 0.8\nmeta: { flag: false }\n---\n",
    expected: {
      frontmatter: { draft: false, count: 2, ratio: 0.8, meta: { flag: false } },
      body: "",
    },
  },
  {
    // Quoting is how an author forces text: a quoted 'false' or '2' stays a
    // string, and date-like or version-like values never coerce.
    name: "quoted scalars stay strings; date/version-like values stay strings",
    input: '---\nliteral: "false"\nversion: 1.0.0\ncreated: 2026-08-31\n---\n',
    expected: {
      frontmatter: { literal: "false", version: "1.0.0", created: "2026-08-31" },
      body: "",
    },
  },
];
