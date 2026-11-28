// Entry for the coverage census: loads every server source file that `families.json` maps, so the
// coverage preload can list the functions of files no corpus case ever loads. Run as
// `node --import coverage-preload.mjs census-entry.mjs` with `ATLAS_DIFF_COVERAGE_DIR` set. Files
// that cannot be loaded here are named on standard error and counted as unrun by the harness.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..');
const families = JSON.parse(readFileSync(path.join(repoRoot, 'tests', 'differential', 'families.json'), 'utf8'));
const failed = [];

for (const file of Object.keys(families.files)) {
  if (!/\.m?js$/.test(file) || /\.test\.mjs$/.test(file) || file === 'mcp/src/index.js' || file === 'mcp/src/javascript-server.mjs') continue;
  try {
    await import(pathToFileURL(path.join(repoRoot, file)).href);
  } catch (error) {
    failed.push({ file, error: String(error?.message ?? error).split('\n')[0] });
  }
}
process.stderr.write(`${JSON.stringify({ unloadable: failed })}\n`);
process.exit(0);
