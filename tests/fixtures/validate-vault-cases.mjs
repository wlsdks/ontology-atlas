// R11 #27 — vault validator contract fixture. src/shared/lib/validate-vault-
// document.ts (런타임 + UI) 와 mcp/src/validate.mjs (AI agent) 가 같은
// raw 입력에 대해 같은 issue codes set 반환 보장. 한 쪽 추가/변경 시 contract
// test 가 즉시 차단.
//
// fixture shape:
//   { name, input, expectedCodes: string[], expectedOk: boolean }
// expectedCodes 는 *severity 무관 set 비교* — 각 구현이 같은 set 을 반환하면 OK.

export const VALIDATE_CASES = [
  {
    name: 'frontmatter 없는 docs 파일 — clean',
    input: '# just a doc\n\nbody only.',
    expectedCodes: [],
    expectedOk: true,
  },
  {
    name: 'canonical kind = project — clean',
    input: '---\nkind: project\ntitle: Foo\n---\nbody',
    expectedCodes: [],
    expectedOk: true,
  },
  {
    name: 'canonical kind = capability — clean',
    input: '---\nkind: capability\ntitle: Cap\n---\n',
    expectedCodes: [],
    expectedOk: true,
  },
  {
    name: '닫는 --- 빠짐 → unclosed-frontmatter (error, ok=false)',
    input: '---\nkind: project\ntitle: Foo\n# unclosed',
    expectedCodes: ['unclosed-frontmatter'],
    expectedOk: false,
  },
  {
    name: '빈 kind 값 → empty-kind (error, ok=false)',
    input: '---\nkind:\nslug: foo\n---\n',
    expectedCodes: ['empty-kind'],
    expectedOk: false,
  },
  {
    name: 'frontmatter 있는데 kind 자체 없음 → missing-kind (warning, ok=true)',
    input: '---\nslug: foo\ntitle: Foo\n---\n',
    expectedCodes: ['missing-kind'],
    expectedOk: true,
  },
  {
    name: 'unknown kind value → unknown-kind (warning, ok=true)',
    input: '---\nkind: bogus\ntitle: Foo\n---\n',
    expectedCodes: ['unknown-kind'],
    expectedOk: true,
  },
  {
    name: 'frontmatter 블록은 있는데 키 0 → parse-zero-keys (warning, ok=true)',
    input: '---\n: bad\n# comment\n---\n',
    expectedCodes: ['parse-zero-keys'],
    expectedOk: true,
  },
];
