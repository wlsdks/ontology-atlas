export const WRITER_CASES = [
  {
    /*
     * ⚠️ **줄바꿈은 frontmatter 를 부순다** (2026-08-16 검수, 재현됨).
     *
     * 쓰는 쪽이 줄바꿈을 그대로 내보내면 다음 줄이 새 키로 읽힌다 —
     * `note` 값 안의 `kind: element` 가 **노드의 종류를 바꿨다**. `---` 가 들어
     * 있으면 frontmatter 가 거기서 끝나고 나머지 키가 본문으로 떨어진다.
     * 아무 경고도 안 난다.
     *
     * 따옴표만으로는 못 막는다(줄이 이미 끊겼다). `\n` 으로 접고, 읽는 쪽이
     * 되돌린다.
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
     * 맨 위 스칼라는 **블록 스칼라**(`|-`)로 나간다 — 그 길은 원래 있었다.
     * 새로 막은 것은 **배열·객체 안**이다: 거기서는 값이 한 줄에 들어가야 해서
     * 블록 문법을 못 쓰므로 `\n` 으로 접는다. 실제로 깨진 자리가 그쪽이었다
     * (`relation_notes: { slug: why }` — `add_relation` 의 `why`).
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
     * `unquote` 는 짝이 안 맞는 따옴표를 양 끝에서 벗긴다. 그래서 값 자체가
     * 따옴표로 감싸인 모양이면 **따옴표째 사라진다** — 쓰는 쪽이 감싸 줘야 한다.
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
    name: 'normalizes leading body newlines',
    input: {
      frontmatter: { kind: 'project', title: 'Sample' },
      body: '\n\n# Sample\n',
    },
    expected: '---\nkind: project\ntitle: Sample\n---\n\n# Sample\n',
  },
];
