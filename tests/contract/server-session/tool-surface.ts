import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The tool surface the MCP server embeds (`src-tauri/crates/mcp-server/surface/`): the definitions
 * `tools/list` is built from and the names a retired tool answers to. Contract tests read it here
 * instead of importing the script server's registry, so they hold whichever program serves it.
 */
const SURFACE_DIRECTORY = join(process.cwd(), 'src-tauri', 'crates', 'mcp-server', 'surface');

export interface SurfaceTool {
  name: string;
  description: string;
  inputSchema: { properties: Record<string, { enum?: string[] }> };
}

const readSurfaceJson = <T>(file: string): T => JSON.parse(readFileSync(join(SURFACE_DIRECTORY, file), 'utf8')) as T;

/** Every tool the server can run, including retired ones it still answers. */
export function surfaceTools(): SurfaceTool[] {
  return readSurfaceJson<SurfaceTool[]>('tools.json');
}

/** The tools `tools/list` advertises: every defined tool except the retired names. */
export function advertisedToolNames(): string[] {
  const retired = new Set(
    readSurfaceJson<{ retiredTools: { name: string }[] }>('registry.json').retiredTools.map((tool) => tool.name),
  );
  return surfaceTools()
    .map((tool) => tool.name)
    .filter((name) => !retired.has(name));
}

/** The names the server groups its tools by: the read tools and the retired tools with their replacements. */
export function serverRegistry(): { readTools: string[]; retiredTools: { name: string; replacement: string }[] } {
  return readSurfaceJson('registry.json');
}

/** What the server says when a client connects: the text of `initialize.instructions`. */
export function serverInstructions(): string {
  return readFileSync(join(SURFACE_DIRECTORY, 'instructions.txt'), 'utf8');
}

/** The construction card and the guide topics `connection_info({ guide })` serves. */
export function serverGuides(): { card: string; topics: string[]; texts: Record<string, string> } {
  return readSurfaceJson('guides.json');
}
