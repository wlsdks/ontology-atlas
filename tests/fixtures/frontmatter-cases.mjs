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
];
