/**
 * The one `Server` object. It lives apart from the entry point so a handler can
 * ask the connected client who it is without importing `index.js`.
 */

import { SERVER_VERSION } from '../server-version.mjs';
import { SERVER_INSTRUCTIONS } from './instructions.mjs';
import { Server } from '@modelcontextprotocol/server';

const server = new Server(
  { name: 'ontology-atlas-mcp', version: SERVER_VERSION },
  {
    capabilities: { tools: {} },
    instructions: SERVER_INSTRUCTIONS,
  },
);

export {
  server,
};
