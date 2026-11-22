// Where the lifecycle benchmark reads fixtures and the Atlas MCP server from,
// and where it writes results.
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const FIXTURE_ROOT = join(REPO_ROOT, 'tests/fixtures/meaning-corpus');
export const MCP_SERVER = join(REPO_ROOT, 'mcp/src/index.js');
export const DEFAULT_OUTPUT_ROOT = join(REPO_ROOT, 'docs/benchmark/results');
