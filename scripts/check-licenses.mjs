#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { collectAttributionMarkers } from './lib/attribution-marker.mjs';
import { SNIPPET_LICENSES, evaluateLicensePolicy } from './lib/license-policy.mjs';
import { collectInventories } from './lib/third-party-inventory.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXCEPTIONS = 'scripts/data/license-exceptions.json';
const RULES = 'docs/engineering/third-party-code.md';

function markerProblems(markers) {
  return markers.flatMap((marker) => {
    if (marker.malformed) {
      return [`${marker.path}: "${marker.malformed}" is not \`// Adapted from <url> (<SPDX>, © <holder>)\``];
    }
    if (SNIPPET_LICENSES.includes(marker.license)) return [];
    return [`${marker.path}: adapted under ${marker.license}; adapt only from ${SNIPPET_LICENSES.join(', ')} sources`];
  });
}

export function judgeLicenses({ packages, exceptions, markers, judged }) {
  const { violations, problems } = evaluateLicensePolicy({ packages, exceptions, judged });
  const refused = [...new Set(violations.map((pkg) => `${pkg.ecosystem} ${pkg.name}@${pkg.version}: ${pkg.license} (${pkg.reason})`))].sort();
  return { refused, problems: [...problems, ...markerProblems(markers)] };
}

function main({ env = process.env } = {}) {
  const { web, mcp, rust } = collectInventories({ root: REPO_ROOT, env });
  const exceptions = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, EXCEPTIONS), 'utf8'));
  const markers = collectAttributionMarkers(REPO_ROOT);
  const { refused, problems } = judgeLicenses({
    packages: [...web, ...mcp, ...(rust ?? [])],
    exceptions,
    markers,
    judged: rust ? ['npm', 'cargo'] : ['npm'],
  });

  if (refused.length > 0 || problems.length > 0) {
    if (refused.length > 0) {
      console.error(`[licenses] ${refused.length} package(s) fail the license policy (${RULES}):`);
      for (const line of refused) console.error(`  ${line}`);
      console.error(`  Replace the dependency, or record why it may ship in ${EXCEPTIONS}.`);
    }
    for (const line of problems) console.error(`[licenses] ${line}`);
    return 1;
  }
  const names = (packages) => new Set(packages.map((entry) => entry.name)).size;
  const crates = rust ? `${names(rust)} Rust crates` : 'no Rust crates (cargo is not installed here; CI checks them)';
  console.log(
    `[licenses] ${names(web)} web and ${names(mcp)} MCP npm packages, ${crates} and ${markers.length} adapted functions ` +
      `pass the license policy, every installed version judged (${exceptions.exceptions.length} recorded exceptions).`,
  );
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(`[licenses] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
