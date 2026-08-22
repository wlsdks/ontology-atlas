// The single test for a documentation check: **only check what a machine can
// generate.**
//
// Everything here derives from code (the MCP tool registry and the CLI command
// registry). Sentences a person wrote are unknown to this module, and need to
// stay that way. `scripts/build-docs-surface.mjs` builds
// `docs/.generated/mcp-surface.json` with these functions and re-generates with
// the same ones to diff.

/**
 * Normalises a tools/list response (or an array of that shape) into a
 * deterministic public-surface record. Sorting happens here so that reordering
 * inside the registry produces no diff — otherwise the "the surface changed"
 * signal drowns in order churn.
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

/** **Counts** of the public contract — they change only deliberately, so they are kept in the generated file. */
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

/** The committed artefact must be byte-identical — even the trailing newline is fixed here. */
export function serializeSurface(surface) {
  return `${JSON.stringify(surface, null, 2)}\n`;
}

/**
 * Checks that the documentation **covers** the surface. Tool and command names
 * come from code, so this is also code-vs-code: it does not inspect prose, only
 * whether every registered name appears in the document. Registering a new tool
 * without documenting it is caught here.
 */
export function namesMissingFromDoc(names, markdown) {
  return names.filter((name) => !markdown.includes(name));
}

/**
 * CLI commands include ordinary words like `export`, so a plain substring check
 * passes spuriously. Match the form the README's command table uses
 * (`ontology-atlas <command>`) instead.
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
