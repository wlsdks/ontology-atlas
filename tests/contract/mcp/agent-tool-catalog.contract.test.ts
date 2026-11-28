// Blocks drift between the app agent's tool catalogue and the MCP server's tool
// definitions.
//
// Principle: **a tool we hand out has exactly the MCP name, arguments, and
// effects.** Screen, CLI, and MCP giving the same answer is this repository's
// recurring contract (3-way parser, 2-way validator); the same grammar applies to
// tool definitions.
//
// The definitions are read from the surface the server embeds
// (`src-tauri/crates/mcp-server/surface/tools.json`), each tool's `inputSchema` giving its
// argument keys and required list. Adding or renaming an argument on the MCP side breaks this
// immediately.
import { describe, expect, it } from 'vitest';

import { AGENT_READ_TOOLS, AGENT_TOOLS, AGENT_WRITE_TOOLS } from '@/features/vault-agent/model/agent-tools/tool-catalog';

import { surfaceTools } from '../server-session/tool-surface';

/**
 * Tools the app agent keeps under their old name whose question the server now
 * answers as an option of another tool, so there is no definition to compare.
 */
const ANSWERED_BY_ANOTHER_TOOL = new Map<string, { tool: string; arguments: readonly string[] }>([
  ['find_orphans', { tool: 'query_ontology', arguments: ['kind', 'excludeKinds'] }],
]);
/**
 * Arguments the server takes that the app agent does not: the predicate `filter` of `list_concepts`
 * has one implementation, the server's, and the app does not carry a port of it.
 */
const SERVER_ONLY_ARGUMENTS = new Set(['filter']);
const COMPARED_TOOLS = AGENT_TOOLS.filter((tool) => !ANSWERED_BY_ANOTHER_TOOL.has(tool.name));

interface McpToolShape {
  propertyNames: string[];
  required: string[];
}

const SURFACE = surfaceTools() as unknown as Array<{
  name: string;
  inputSchema: { properties?: Record<string, unknown>; required?: string[] };
}>;

/** One tool's top-level argument names and required list, from the server's embedded definition. */
function readMcpToolShape(toolName: string): McpToolShape {
  const tool = SURFACE.find((candidate) => candidate.name === toolName);
  if (!tool) throw new Error(`tool missing from the MCP: ${toolName}`);
  return {
    propertyNames: Object.keys(tool.inputSchema.properties ?? {}),
    required: [...(tool.inputSchema.required ?? [])],
  };
}

describe('agent tool catalog matches the MCP server definition', () => {
  it('the reader itself works (get_concept takes one of slug/uid plus body)', () => {
    // If the definition silently reads as empty, every test below is meaningless.
    const shape = readMcpToolShape('get_concept');
    expect(shape.propertyNames).toEqual(['slug', 'uid', 'body']);
    // The "exactly one" contract is enforced by the MCP JSON Schema's oneOf.
    expect(shape.required).toEqual([]);
  });

  it.each(COMPARED_TOOLS.map((tool) => [tool.name, tool] as const))(
    '%s: the argument name set equals the one on the MCP side',
    (_name, tool) => {
      const mcp = readMcpToolShape(tool.name);
      const ours = Object.keys(tool.parameters.properties ?? {});
      expect([...ours].sort()).toEqual([...mcp.propertyNames.filter((name) => !SERVER_ONLY_ARGUMENTS.has(name))].sort());
    },
  );

  it.each(COMPARED_TOOLS.map((tool) => [tool.name, tool] as const))(
    '%s: the required arguments equal those on the MCP side',
    (_name, tool) => {
      const mcp = readMcpToolShape(tool.name);
      const ours = [...(tool.parameters.required ?? [])];
      expect(ours.sort()).toEqual([...mcp.required].sort());
    },
  );

  it.each(COMPARED_TOOLS.map((tool) => [tool.name, tool] as const))(
    '%s: an argument that lists its allowed values lists the ones on the MCP side',
    (_name, tool) => {
      const server = SURFACE.find((candidate) => candidate.name === tool.name)!.inputSchema.properties ?? {};
      for (const [argument, schema] of Object.entries(tool.parameters.properties ?? {})) {
        const ours = (schema as { enum?: readonly string[] }).enum;
        const theirs = (server[argument] as { enum?: string[] } | undefined)?.enum;
        if (ours && theirs) expect([...ours].sort(), argument).toEqual([...theirs].sort());
      }
    },
  );

  it.each([...ANSWERED_BY_ANOTHER_TOOL])(
    '%s: its arguments are arguments of the server tool that answers it',
    (name, { tool, arguments: names }) => {
      const mcp = readMcpToolShape(tool);
      const ours = Object.keys(AGENT_TOOLS.find((candidate) => candidate.name === name)!.parameters.properties ?? {});
      expect([...ours].sort()).toEqual([...names].sort());
      for (const argument of names) expect(mcp.propertyNames).toContain(argument);
    },
  );

  it('offers no tool that looks outside the vault', () => {
    // Work that needs code belongs to the terminal — the tool set makes that boundary structural.
    const forbidden = [
      'analyze_repo_structure',
      'infer_imports',
      'index_project',
      'delete_concept',
      'rename_concept',
      'merge_concepts',
      'absorb_document',
    ];
    for (const name of forbidden) {
      expect(AGENT_TOOLS.map((tool) => tool.name)).not.toContain(name);
    }
  });

  it('minimum shipped set: at least 6 read tools plus 5 write tools', () => {
    expect(AGENT_READ_TOOLS.length).toBeGreaterThanOrEqual(6);
    expect(AGENT_WRITE_TOOLS.map((tool) => tool.name).sort()).toEqual([
      'add_concept',
      'add_concepts',
      'add_relation',
      'add_relations',
      'patch_concept',
    ]);
  });
});
