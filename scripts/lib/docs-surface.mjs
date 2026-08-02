// 문서 검사의 단일 판별 기준: **기계가 만들 수 있는 것만 검사한다.**
//
// 여기 있는 것은 전부 코드(=MCP 도구 레지스트리 · CLI 커맨드 레지스트리)에서
// 유도된다. 사람이 판단해서 쓴 문장은 이 모듈이 알지 못하고, 알 필요도 없다.
// `scripts/build-docs-surface.mjs` 가 이 함수들로 `docs/.generated/mcp-surface.json`
// 을 만들고, 같은 함수로 재생성해 diff 한다.

/**
 * tools/list 응답(또는 그 모양의 배열)을 결정적인 공개 표면 레코드로 정규화한다.
 * 정렬을 여기서 하는 이유: 레지스트리 안 순서가 바뀌어도 diff 가 나지 않아야
 * "표면이 바뀌었다" 는 신호가 순서 흔들림에 묻히지 않는다.
 */
export function normalizeMcpTools(tools) {
  return tools
    .map((tool) => {
      const properties = tool?.inputSchema?.properties ?? {};
      const required = Array.isArray(tool?.inputSchema?.required) ? tool.inputSchema.required : [];
      const oneOfRequired = (Array.isArray(tool?.inputSchema?.oneOf)
        ? tool.inputSchema.oneOf
        : []
      )
        .map((alternative) =>
          Array.isArray(alternative?.required)
            ? [...alternative.required].map(String).sort()
            : [],
        )
        .filter((alternative) => alternative.length > 0)
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
      return {
        name: String(tool?.name ?? ''),
        mode: tool?.annotations?.readOnlyHint === true ? 'read' : 'write',
        arguments: Object.keys(properties).sort(),
        required: [...required].map(String).sort(),
        ...(oneOfRequired.length > 0 ? { oneOfRequired } : {}),
      };
    })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** 공개 계약의 **수** — 의도적으로 바꿀 때만 바뀌므로 생성물에 남긴다. */
export function mcpSurfaceCounts(tools) {
  const read = tools.filter((tool) => tool.mode === 'read').length;
  return { toolCount: tools.length, readToolCount: read, writeToolCount: tools.length - read };
}

export function buildSurface({ tools, cliCommands }) {
  const normalized = normalizeMcpTools(tools);
  return {
    _generatedBy: 'pnpm docs:surface:build',
    _contract:
      'Derived from the MCP tool registry and the CLI command registry. ' +
      'Never hand-edit — run `pnpm docs:surface:build` and commit the diff.',
    mcp: { ...mcpSurfaceCounts(normalized), tools: normalized },
    cli: { commandCount: cliCommands.length, commands: [...cliCommands].sort() },
  };
}

/** 커밋되는 생성물은 바이트 동일해야 한다 — 개행 하나까지 여기서 고정한다. */
export function serializeSurface(surface) {
  return `${JSON.stringify(surface, null, 2)}\n`;
}

/**
 * 문서가 표면을 **덮는지** 본다. 도구/커맨드 이름은 코드에서 나왔으므로
 * 이것도 코드-대조다 — 산문을 검사하지 않고 "등록된 이름이 문서에 나오는가"
 * 만 본다. 새 도구를 등록하고 문서를 안 쓰면 여기서 걸린다.
 */
export function namesMissingFromDoc(names, markdown) {
  return names.filter((name) => !markdown.includes(name));
}

/**
 * CLI 커맨드는 `export` 같은 흔한 단어가 섞여 있어 단순 포함 검사가 통과해
 * 버린다. README 의 커맨드 표가 쓰는 형태(`ontology-atlas <command>`)로 본다.
 */
export function cliCommandsMissingFromDoc(commands, markdown) {
  return commands.filter((command) => !markdown.includes(`ontology-atlas ${command}`));
}

export function diffSurface(expected, actual) {
  if (expected === actual) return null;
  const expectedLines = expected.split('\n');
  const actualLines = actual.split('\n');
  const max = Math.max(expectedLines.length, actualLines.length);
  for (let i = 0; i < max; i += 1) {
    if (expectedLines[i] !== actualLines[i]) {
      return {
        line: i + 1,
        expected: expectedLines[i] ?? '<end of file>',
        actual: actualLines[i] ?? '<end of file>',
      };
    }
  }
  return { line: max, expected: '<eof>', actual: '<eof>' };
}
