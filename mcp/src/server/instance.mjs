/**
 * The one `Server` object, with the `initialize` instructions already carrying
 * the live tool inventory. It lives apart from the entry point so a handler can
 * ask the connected client who it is without importing `index.js`.
 */
import { SERVER_VERSION } from '../server-version.mjs';
import { Server } from '@modelcontextprotocol/server';

import { buildToolInventorySection } from '../tool-inventory.mjs';
import {
  SERVER_INSTRUCTIONS_TEMPLATE,
  TOOL_INVENTORY_PLACEHOLDER,
} from './instructions.mjs';
import { TOOLS_FOR_LIST } from './registry.mjs';

const SERVER_INSTRUCTIONS = SERVER_INSTRUCTIONS_TEMPLATE.replace(
  TOOL_INVENTORY_PLACEHOLDER,
  buildToolInventorySection(TOOLS_FOR_LIST),
);


const server = new Server(
  { name: 'ontology-atlas-mcp', version: SERVER_VERSION },
  {
    capabilities: { tools: {} },
    instructions: SERVER_INSTRUCTIONS,
  },
);

export {
  SERVER_INSTRUCTIONS,
  server,
};
