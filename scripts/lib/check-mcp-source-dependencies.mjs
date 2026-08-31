#!/usr/bin/env node

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertSourceCheckoutMcpDependencies } from '../../cli/src/lib/mcp-module.mjs';

/**
 * Cheap source-checkout guard for commands that spawn `mcp/src/index.js`.
 * Dependency installation stays an explicit contributor action.
 */
export function runMcpSourceDependencyPreflight({ mcpRoot, stderr = process.stderr } = {}) {
  try {
    assertSourceCheckoutMcpDependencies(mcpRoot);
    return 0;
  } catch (error) {
    if (error?.code !== 'OATLAS_MCP_SOURCE_DEPENDENCIES_MISSING') throw error;
    stderr.write(`error  ${error.message}\n`);
    return 2;
  }
}

const isDirectRun =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  process.exitCode = runMcpSourceDependencyPreflight();
}
