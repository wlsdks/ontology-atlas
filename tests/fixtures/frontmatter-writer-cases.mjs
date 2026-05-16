export const WRITER_CASES = [
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
    name: 'normalizes leading body newlines',
    input: {
      frontmatter: { kind: 'project', title: 'Sample' },
      body: '\n\n# Sample\n',
    },
    expected: '---\nkind: project\ntitle: Sample\n---\n\n# Sample\n',
  },
];
