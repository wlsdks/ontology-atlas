import { existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export function resolveMcpServerCommand() {
  const envPath = process.env.OATLAS_MCP_PATH;
  if (envPath) {
    if (!existsSync(envPath)) {
      throw new Error(`OATLAS_MCP_PATH does not exist: ${envPath}`);
    }
    if (!isFile(envPath)) {
      throw new Error(`OATLAS_MCP_PATH is not a file: ${envPath}`);
    }
    return { command: 'node', args: [envPath] };
  }

  const checkoutServer = resolve(PKG_ROOT, '..', 'mcp', 'src', 'index.js');
  if (existsSync(checkoutServer)) {
    return { command: 'node', args: [checkoutServer] };
  }

  // Look for the binary bundled in the installed app; an `npx` fallback would write a command that
  // always fails.
  if (isFile(BUNDLED_MCP_BINARY)) {
    return { command: BUNDLED_MCP_BINARY, args: [] };
  }

  throw new Error(
    'Could not find the ontology-atlas MCP server.\n' +
      `  Install the macOS app (it bundles the server at ${BUNDLED_MCP_BINARY}),\n` +
      '  or run this from an ontology-atlas source checkout,\n' +
      '  or point OATLAS_MCP_PATH at mcp/src/index.js yourself.',
  );
}

/**
 * The MCP server carried inside the app bundle. Installing the macOS app is what
 * provides it, and the user connects with no node and no source checkout.
 */
const BUNDLED_MCP_BINARY =
  '/Applications/Ontology Atlas.app/Contents/MacOS/ontology-atlas-mcp';

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
