import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_ROOT = resolve(__dirname, '..', '..');
const require_ = createRequire(import.meta.url);

export function parseMcpToolMetadataFromDescription(description) {
  const match = String(description || '').match(/(\d+) tools \((\d+) read \+ (\d+) write\)/);
  if (!match) return null;
  return {
    toolCount: match[1],
    readCount: match[2],
    writeCount: match[3],
    splitText: `${match[2]} read + ${match[3]} write`,
    splitPattern: new RegExp(`\\(${match[2]} read \\+ ${match[3]} write\\)`),
  };
}

export function readMcpPackageMetadata() {
  const candidates = [];
  try {
    candidates.push(require_.resolve('ontology-atlas-mcp/package.json'));
  } catch {
    // Source checkout fallback below.
  }
  candidates.push(resolve(CLI_ROOT, '..', 'mcp', 'package.json'));

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const pkg = JSON.parse(readFileSync(candidate, 'utf-8'));
    return parseMcpToolMetadataFromDescription(pkg.description) ?? {};
  }

  return {};
}
