function formatToolNames(tools) {
  if (tools.length === 0) return 'none';
  return tools.map((tool) => `\`${tool.name}\``).join(' · ');
}

export function buildToolInventorySection(tools) {
  if (!Array.isArray(tools)) {
    throw new TypeError('Tool inventory requires an array.');
  }

  const names = tools.map((tool) => tool?.name);
  if (names.some((name) => typeof name !== 'string' || !/^[a-z][a-z0-9_]*$/.test(name))) {
    throw new TypeError('Every advertised tool must have a canonical tool name.');
  }
  if (new Set(names).size !== names.length) {
    throw new TypeError('Advertised tool names must be unique.');
  }

  const readTools = tools.filter((tool) => tool.annotations?.readOnlyHint === true);
  const writeTools = tools.filter((tool) => tool.annotations?.readOnlyHint !== true);

  return `## Tool inventory (${tools.length} tools = read ${readTools.length} + write ${writeTools.length})

**read** — ${formatToolNames(readTools)}.
**write** — ${formatToolNames(writeTools)}.`;
}
