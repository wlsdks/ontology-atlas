// R11 #27 — vault validator contract fixture. src/shared/lib/validate-vault-
// Guarantees document.ts (runtime + UI) and mcp/src/validate.mjs (the AI agent
// surface) return the same issue-code set for the same raw input. Adding or changing a
// code on either side is blocked immediately by the contract test.
//
// fixture shape:
//   { name, input, options?, expectedCodes: string[], expectedOk: boolean }
// expectedCodes is a *severity-independent set comparison* — each implementation
// returning the same set is a pass.
//
// `options` is the second argument the validators take — today only `{ slug }`,
// which is how a caller states where the file sits. `slug-outside-kind-folder`
// is a fact about position, not about bytes, so a case eliciting it must supply
// one.
//
// ⚠️ **Bodies matter now.** Since 2026-09-22 the validators read the prose too
// (`definition-missing`, `boundary-missing`, `uncertainty-missing`,
// `epistemic-exclusion`), so a case meant to elicit exactly one frontmatter code
// has to carry a body that is genuinely finished — an empty body under
// `kind: capability` now elicits four more codes and stops testing what it was
// written to test. `CLEAN_CAPABILITY_BODY` and `CLEAN_ELEMENT_BODY` below are
// those finished bodies, written once so a new case cannot drift from them.

/**
 * A body that answers every meaning check for a `capability`: one non-circular
 * sentence before the first `##`, both boundary sides with a real bullet, and a
 * stated unknown. The `Excludes` bullet names a neighbouring ability rather than
 * something the writer did not read, which is what keeps `epistemic-exclusion`
 * quiet.
 */
const CLEAN_CAPABILITY_BODY =
  '# Cap\n\n' +
  'Turns a reviewed vault folder into a graph a reader can walk without opening code.\n\n' +
  '## Includes\n\n' +
  '- Reading frontmatter relations from every document in the folder\n\n' +
  '## Excludes\n\n' +
  '- Drawing the graph on screen, which the map surface owns\n\n' +
  '## Uncertainty\n\n' +
  '- Whether a folder with symlinked subtrees behaves the same was never measured\n';

/** The same, for an `element` — one boundary side each, and an element states no boundary. */
const CLEAN_ELEMENT_BODY =
  '# Agents Destination\n\n' +
  'Holds the one address every agent-facing link resolves to, so a moved surface renames in one place.\n\n' +
  '## Uncertainty\n\n' +
  '- The deep-link fallback for an older app build was not read\n';

export const VALIDATE_CASES = [
  {
    name: 'frontmatter 없는 docs 파일 — clean',
    input: '# just a doc\n\nbody only.',
    expectedCodes: [],
    expectedOk: true,
  },
  {
    name: 'canonical kind = project — clean',
    input: '---\nuid: 01890f3e-7b5d-4c0a-8f14-123456789abc\nkind: project\ntitle: Foo\n---\nbody',
    expectedCodes: [],
    expectedOk: true,
  },
  {
    // R14 — a capability or element with no domain produces a missing-expected-field
    // warning. Filling in the domain too is the 'clean' baseline.
    name: 'canonical kind = capability — clean (with domain)',
    input:
      '---\nuid: 01890f3e-7b5d-4c0a-8f14-123456789abd\nkind: capability\ntitle: Cap\ndomain: domains/auth\n---\n' +
      CLEAN_CAPABILITY_BODY,
    expectedCodes: [],
    expectedOk: true,
  },
  {
    name: 'capability without domain → missing-expected-field warning',
    input:
      '---\nuid: 01890f3e-7b5d-4c0a-8f14-123456789abe\nkind: capability\ntitle: Cap\n---\n' +
      CLEAN_CAPABILITY_BODY,
    expectedCodes: ['missing-expected-field'],
    expectedOk: true,
  },
  {
    // Bug sweep 2026-09-01: the raw-text check ran before the parser's BOM/CRLF
    // normalization, so a Windows-authored `﻿---` file looked like "no
    // frontmatter" and passed validate clean — while the manifest and graph
    // treated the same bytes as a live node. All checks must apply after the
    // same normalization the parser uses.
    name: 'BOM + CRLF file is validated like its normalized bytes (missing-uid still caught)',
    input: '﻿---\r\nkind: project\r\ntitle: Foo\r\n---\r\nbody',
    expectedCodes: ['missing-uid'],
    expectedOk: false,
  },
  {
    name: 'BOM + unclosed frontmatter is still an error',
    input: '﻿---\nkind: project\ntitle: Foo\n',
    expectedCodes: ['unclosed-frontmatter'],
    expectedOk: false,
  },
  {
    name: 'canonical kind without uid → missing-uid (error, ok=false)',
    input: '---\nkind: project\ntitle: Foo\n---\nbody',
    expectedCodes: ['missing-uid'],
    expectedOk: false,
  },
  {
    name: 'canonical kind with malformed uid → invalid-uid (error, ok=false)',
    input: '---\nuid: node-12\nkind: project\ntitle: Foo\n---\nbody',
    expectedCodes: ['invalid-uid'],
    expectedOk: false,
  },
  {
    name: 'merged_uids contains malformed identity → invalid-merged-uids',
    input: '---\nuid: 01890f3e-7b5d-4c0a-8f14-123456789abc\nmerged_uids: [node-12]\nkind: project\ntitle: Foo\n---\nbody',
    expectedCodes: ['invalid-merged-uids'],
    expectedOk: false,
  },
  {
    name: 'merged_uids cannot repeat the surviving uid',
    input: '---\nuid: 01890f3e-7b5d-4c0a-8f14-123456789abc\nmerged_uids: [01890f3e-7b5d-4c0a-8f14-123456789abc]\nkind: project\ntitle: Foo\n---\nbody',
    expectedCodes: ['invalid-merged-uids'],
    expectedOk: false,
  },
  {
    name: 'merged_uids must be canonical sorted unique UUIDv4 values',
    input: '---\nuid: 01890f3e-7b5d-4c0a-8f14-123456789abc\nmerged_uids: [21890f3e-7b5d-4c0a-8f14-123456789abc, 11890f3e-7b5d-4c0a-8f14-123456789abc, 21890f3e-7b5d-4c0a-8f14-123456789abc]\nkind: project\ntitle: Foo\n---\nbody',
    expectedCodes: ['non-canonical-merged-uids'],
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
    name: 'reviewed architecture profile is a clean non-graph document',
    input: '---\narchitecture_schema: architecture-profile/v1\nprofile_uid: 11890f3e-7b5d-4c0a-8f14-123456789abc\nproject_uid: 21890f3e-7b5d-4c0a-8f14-123456789abc\ntitle: Web architecture\n---\n',
    expectedCodes: [],
    expectedOk: true,
  },
  {
    name: 'unknown architecture profile contract does not bypass missing-kind',
    input: '---\narchitecture_schema: architecture-profile/v0\ntitle: Stale architecture\n---\n',
    expectedCodes: ['missing-kind'],
    expectedOk: true,
  },
  {
    name: 'unknown kind value → unknown-kind (warning, ok=true)',
    input: '---\nuid: 21890f3e-7b5d-4c0a-8f14-123456789abc\nkind: bogus\ntitle: Foo\n---\n',
    expectedCodes: ['unknown-kind'],
    expectedOk: true,
  },
  {
    name: 'frontmatter 블록은 있는데 키 0 → parse-zero-keys (warning, ok=true)',
    input: '---\n: bad\n# comment\n---\n',
    expectedCodes: ['parse-zero-keys'],
    expectedOk: true,
  },
  {
    name: '키 없이 malformed frontmatter만 있으면 parser diagnostics가 error를 유지',
    input: '---\nmalformed declaration\n---\n',
    expectedCodes: ['malformed-frontmatter-line', 'parse-zero-keys'],
    expectedOk: false,
  },
  {
    name: '콜론 없는 frontmatter 선언 → malformed-frontmatter-line (error, ok=false)',
    input:
      '---\nuid: 01890f3e-7b5d-4c0a-8f14-123456789abc\nkind: capability\ndomain: domains/probe\nelements\n  - elements/orphan\n---\n' +
      CLEAN_CAPABILITY_BODY,
    expectedCodes: ['malformed-frontmatter-line', 'malformed-frontmatter-line'],
    expectedOk: false,
  },
  {
    name: '들여쓴 콜론 없는 frontmatter 선언 → malformed-frontmatter-line (error, ok=false)',
    input:
      '---\nuid: 01890f3e-7b5d-4c0a-8f14-123456789abc\nkind: capability\ndomain: domains/probe\n  missing-colon\n  orphan value\n---\n' +
      CLEAN_CAPABILITY_BODY,
    expectedCodes: ['malformed-frontmatter-line', 'malformed-frontmatter-line'],
    expectedOk: false,
  },
  {
    name: 'graph 배열 중복/비정렬 → non-canonical-graph-array warning',
    input: '---\nuid: 11890f3e-7b5d-4c0a-8f14-123456789abc\nkind: project\ntitle: Foo\ndependencies: [z, a, z]\n---\n',
    expectedCodes: ['non-canonical-graph-array'],
    expectedOk: true,
  },
  {
    // Audit 2026-07-25 — `broader` (is_a / SKOS) existed only in the MCP validator and
    // was missing from `GRAPH_ARRAY_KEYS` in all three of scripts, web, and CLI. That list
    // drives **both** `non-canonical-graph-array` and `dangling-graph-reference`, so the
    // omission meant "an agent can write a typo'd slug in `broader:` and CI stays green"
    // (the web deriver mints unresolved refs as new nodes — the same class as the phantom
    // accident in `derive-ontology-from-vault.ts`).
    //
    // This fixture pins that drift three ways: adding the key on one side alone turns red
    // immediately.
    name: 'broader 배열도 canonical 검사를 받는다 (검증기 3-way drift 차단)',
    // `kind: project` — using capability here would also attach `missing-expected-field`
    // (no domain) and blur the contract this fixture checks. Same condition as the
    // adjacent fixture.
    input: '---\nuid: 11890f3e-7b5d-4c0a-8f14-123456789abd\nkind: project\ntitle: Foo\nbroader: [z, a, z]\n---\n',
    expectedCodes: ['non-canonical-graph-array'],
    expectedOk: true,
  },
  {
    // Regression fixture — the exact line that stood in
    // `docs/ontology/elements/agents-destination.md` while `vault:validate`
    // reported "0 issues" (2026-08-31). The value renders with a stray quote,
    // so this is an error: the document is readable but says the wrong thing.
    name: 'quoted scalar closing early → malformed-quoted-scalar (error, ok=false)',
    input:
      '---\nuid: 981cd7f6-506a-4b2b-b62c-cd56896e81b0\nkind: element\ndomain: domains/agent-integration\ntitle: Agents Destination\ndisplay_ko: "에이전트" 목적지\n---\n' +
      CLEAN_ELEMENT_BODY,
    expectedCodes: ['malformed-quoted-scalar'],
    expectedOk: false,
  },
  {
    // The body half, one code at a time. An `element` carries no boundary, so it
    // is the quietest kind to isolate the definition rule in.
    name: 'body that opens straight into headings → definition-missing (warning, ok=true)',
    input:
      '---\nuid: 41890f3e-7b5d-4c0a-8f14-123456789abc\nkind: element\ndomain: domains/auth\ntitle: Token Rotator\n---\n' +
      '# Token Rotator\n\n## Uncertainty\n\n- The refresh path was never opened\n',
    expectedCodes: ['definition-missing'],
    expectedOk: true,
  },
  {
    // The non-circular half of the same rule: long enough to be a sentence, and
    // still saying nothing the title did not.
    name: 'definition that only restates the title → definition-missing',
    input:
      '---\nuid: 41890f3e-7b5d-4c0a-8f14-123456789abd\nkind: element\ndomain: domains/auth\ntitle: Bottom Tab Bar\n---\n' +
      '# Bottom Tab Bar\n\n## Definition\n\n' +
      'The bottom tab bar is a bar of tabs on the bottom of the app.\n\n' +
      '## Uncertainty\n\n- The tablet layout was not measured\n',
    expectedCodes: ['definition-missing'],
    expectedOk: true,
  },
  {
    name: 'capability with no `## Excludes` → boundary-missing (one per missing side)',
    input:
      '---\nuid: 41890f3e-7b5d-4c0a-8f14-123456789abe\nkind: capability\ndomain: domains/auth\ntitle: Cap\n---\n' +
      '# Cap\n\n' +
      'Turns a reviewed vault folder into a graph a reader can walk without opening code.\n\n' +
      '## Includes\n\n- Reading frontmatter relations from every document\n\n' +
      '## Uncertainty\n\n- The Windows watcher path was not exercised\n',
    expectedCodes: ['boundary-missing'],
    expectedOk: true,
  },
  {
    name: 'exclusion bullet that names an evidence limit → epistemic-exclusion',
    input:
      '---\nuid: 41890f3e-7b5d-4c0a-8f14-123456789abf\nkind: capability\ndomain: domains/auth\ntitle: Cap\n---\n' +
      '# Cap\n\n' +
      'Turns a reviewed vault folder into a graph a reader can walk without opening code.\n\n' +
      '## Includes\n\n- Reading frontmatter relations from every document\n\n' +
      '## Excludes\n\n- The retry queue, which this survey did not inspect\n\n' +
      '## Uncertainty\n\n- The Windows watcher path was not exercised\n',
    expectedCodes: ['epistemic-exclusion'],
    expectedOk: true,
  },
  {
    // A placeholder bullet is not an answer — the scaffold's own `<…>` slot has
    // to count as empty, or the default write silences the one question the
    // default write cannot have answered.
    name: 'Uncertainty section left as the template placeholder → uncertainty-missing',
    input:
      '---\nuid: 51890f3e-7b5d-4c0a-8f14-123456789abc\nkind: element\ndomain: domains/auth\ntitle: Token Rotator\n---\n' +
      '# Token Rotator\n\n' +
      'Holds the one address every agent-facing link resolves to, so a moved surface renames once.\n\n' +
      '## Uncertainty\n\n- <what you did not read or could not check>\n',
    expectedCodes: ['uncertainty-missing'],
    expectedOk: true,
  },
  {
    // Position, not bytes: the caller states the slug, so a case that leaves
    // `options` out is asking about a document whose location nobody knows.
    name: 'element written flat at the vault root → slug-outside-kind-folder',
    input:
      '---\nuid: 51890f3e-7b5d-4c0a-8f14-123456789abd\nkind: element\ndomain: domains/auth\ntitle: Token Rotator\n---\n' +
      CLEAN_ELEMENT_BODY.replace('# Agents Destination', '# Token Rotator'),
    options: { slug: 'token-rotator' },
    expectedCodes: ['slug-outside-kind-folder'],
    expectedOk: true,
  },
  {
    name: 'the same element inside its kind folder is clean',
    input:
      '---\nuid: 51890f3e-7b5d-4c0a-8f14-123456789abe\nkind: element\ndomain: domains/auth\ntitle: Token Rotator\n---\n' +
      CLEAN_ELEMENT_BODY.replace('# Agents Destination', '# Token Rotator'),
    options: { slug: 'elements/token-rotator' },
    expectedCodes: [],
    expectedOk: true,
  },
];
