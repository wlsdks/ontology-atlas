export const WRITER_CASES = [
  {
    /*
     * A raw newline in a value breaks frontmatter: the next line reads as a new key and `---` ends the
     * block. Quoting cannot prevent it, so newlines fold to a backslash-n escape that the reader restores.
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
     * With a plain `|-` header the reader takes its base indent from the first non-blank line, so such
     * values need the explicit indentation indicator.
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
     * Strings the reader would re-type as boolean or number are written quoted, or typeof-string consumers
     * drop them after one round trip.
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
