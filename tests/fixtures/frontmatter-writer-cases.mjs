export const WRITER_CASES = [
  {
    /*
     * ⚠️ **A newline destroys frontmatter** (review 2026-08-16, reproduced).
     *
     * When the writer emits a raw newline, the next line is read as a new key — a
     * `kind: element` inside a `note` value **changed the node's kind**. A `---` inside a
     * value ends the frontmatter there and drops the remaining keys into the body. No
     * warning is produced.
     *
     * Quoting alone cannot prevent it (the line is already broken). It is folded to
     * `\n` and the reader restores it.
     */
    name: 'newlines fold into \\n instead of breaking the block',
    input: {
      frontmatter: {
        title: 'A note',
        note: 'first line\nkind: element',
        tags: ['plain', 'two\nlines'],
        notes: { a: 'x\ny' },
      },
      body: 'Body',
    },
    /*
     * Top-level scalars go out as **block scalars** (`|-`), which always worked. What
     * was newly closed is **inside arrays and objects**: there the value must fit on one
     * line, so block syntax is unavailable and it folds to `\n`. That is where the real
     * breakage happened (`relation_notes: { slug: why }` — `add_relation`'s `why`).
     */
    expected:
      '---\n' +
      'title: A note\n' +
      'note: |-\n' +
      '  first line\n' +
      '  kind: element\n' +
      'tags: [plain, "two\\nlines"]\n' +
      'notes: { a: "x\\ny" }\n' +
      '---\n\n' +
      'Body',
  },
  {
    /*
     * `unquote` strips unmatched quotes from both ends, so a value that is itself
     * wrapped in quotes **loses them** — the writer has to wrap it.
     */
    name: 'values that already look quoted keep their quotes',
    input: {
      frontmatter: { title: "'지도'" },
      body: 'Body',
    },
    expected: '---\n' + 'title: "\'지도\'"\n' + '---\n\n' + 'Body',
  },

  {
    name: 'scalar / array / object serialization',
    input: {
      frontmatter: {
        slug: 'capabilities/login',
        kind: 'capability',
        title: 'Login Flow',
        elements: ['elements/auth-form', 'elements/session-store'],
        position: { x: 10, y: 20 },
        active: true,
        priority: 3,
      },
      body: '# Login Flow\n',
    },
    expected:
      '---\n' +
      'slug: capabilities/login\n' +
      'kind: capability\n' +
      'title: Login Flow\n' +
      'elements: [elements/auth-form, elements/session-store]\n' +
      'position: { x: 10, y: 20 }\n' +
      'active: true\n' +
      'priority: 3\n' +
      '---\n\n' +
      '# Login Flow\n',
  },
  {
    name: 'quotes values that would break inline YAML',
    input: {
      frontmatter: {
        title: 'Hello: World',
        tags: ['plain', 'needs, comma', 'needs [bracket]'],
      },
      body: 'Body',
    },
    expected:
      '---\n' +
      'title: "Hello: World"\n' +
      'tags: [plain, "needs, comma", "needs [bracket]"]\n' +
      '---\n\n' +
      'Body',
  },
  {
    name: 'skips null and undefined keys',
    input: {
      frontmatter: {
        title: 'Kept',
        deleted: null,
        omitted: undefined,
      },
      body: '',
    },
    expected: '---\ntitle: Kept\n---\n\n',
  },
  {
    /*
     * Bug sweep 2026-09-01, reproduced: with the plain `|-` header the reader
     * took its base indent from the first non-blank line, so a value whose first
     * line has its own leading whitespace re-read with a deeper base and every
     * later line escaped the scalar into the top-level loop (`kind: capability`
     * inside a description changed the node's kind). The writer must emit the
     * explicit indentation indicator for exactly these values.
     */
    name: 'first-line leading whitespace gets an explicit indentation indicator',
    input: {
      frontmatter: {
        kind: 'element',
        definition: '  sample: yaml snippet\nkind: capability\nnote about it',
      },
      body: '',
    },
    expected:
      '---\n' +
      'kind: element\n' +
      'definition: |2-\n' +
      '    sample: yaml snippet\n' +
      '  kind: capability\n' +
      '  note about it\n' +
      '---\n\n',
  },
  {
    /*
     * Bug sweep 2026-09-01: an unquoted 'true' or '2026' re-read as a
     * boolean/number, and consumers gating on typeof string (buildMdEntry's
     * title, readDisplayLocales) silently dropped the value after one round
     * trip. Strings the reader would re-type are now written quoted.
     */
    name: 'quotes strings the reader would re-type as boolean or number',
    input: {
      frontmatter: {
        title: 'true',
        display_ko: '2026',
        note: 'false',
        version: '1.0.1',
      },
      body: '',
    },
    expected:
      '---\n' +
      'title: "true"\n' +
      'display_ko: "2026"\n' +
      'note: "false"\n' +
      'version: 1.0.1\n' +
      '---\n\n',
  },
  {
    name: 'normalizes leading body newlines',
    input: {
      frontmatter: { kind: 'project', title: 'Sample' },
      body: '\n\n# Sample\n',
    },
    expected: '---\nkind: project\ntitle: Sample\n---\n\n# Sample\n',
  },
];
