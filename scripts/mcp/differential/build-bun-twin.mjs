#!/usr/bin/env node
/**
 * Builds the Bun comparison program: the server compiled by Bun with the shipped binary's flags
 * (`bunCompileArgs`), plus the harness's pinned clock and seeded UUID source. The shipped program
 * cannot take a preload, so the only differences from it are those two inputs.
 *
 *   node scripts/mcp/differential/build-bun-twin.mjs --outfile=<path>
 *
 * Runs itself under `bun` because the plugin API (`Bun.build`) is a Bun global.
 */
import { spawnSync } from 'node:child_process';
import * as nodeCrypto from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BUN_VERSION_FILE,
  bunCompileArgs,
  bunVersionVerdict,
  hostTargetTriple,
  pinnedBunVersion,
} from '../../lib/packaging/mcp-binary.mjs';
import { streamNameOfModule } from '../../../tests/differential/support/deterministic-inputs.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..');
const entry = path.join(repoRoot, 'tests', 'differential', 'support', 'bun-deterministic-entry.mjs');
const inputs = path.join(repoRoot, 'tests', 'differential', 'support', 'deterministic-inputs.mjs');

// `ATLAS_DIFF_BUN` names the Bun executable when the pinned release is not the one on the search path.
const bunProgram = process.env.ATLAS_DIFF_BUN ?? 'bun';

if (typeof Bun === 'undefined') {
  const result = spawnSync(bunProgram, [fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    stdio: 'inherit',
  });
  process.exit(result.status ?? 1);
}

// The comparison is only worth anything against the runtime people run, so any other release is
// refused here, unlike a local `pnpm mcp:build-binary`, which only warns.
{
  const pinned = pinnedBunVersion(readFileSync(path.join(repoRoot, BUN_VERSION_FILE), 'utf8'));
  const verdict = bunVersionVerdict(pinned, Bun.version, { ci: true });
  if (verdict) {
    console.error(`${verdict.message}\n  (or point ATLAS_DIFF_BUN at a ${pinned} executable)`);
    process.exit(1);
  }
}

const outfileArg = process.argv.slice(2).find((value) => value.startsWith('--outfile='));
if (!outfileArg) {
  console.error('usage: build-bun-twin.mjs --outfile=<path>');
  process.exit(2);
}
const outfile = path.resolve(outfileArg.slice('--outfile='.length));
mkdirSync(path.dirname(outfile), { recursive: true });

// `export * from 'node:crypto'` inside a plugin module compiles to a dangling reference in Bun, so
// the shim names every other export itself.
const CRYPTO_EXPORTS = Object.keys(nodeCrypto).filter(
  (name) => name !== 'randomUUID' && name !== 'default' && /^[A-Za-z_$][\w$]*$/.test(name),
);

/**
 * A server module that asks `node:crypto` for `randomUUID` gets the seeded stream of its own
 * name. Bun does not run plugins for built-in imports, so the importing file is rewritten on load
 * to import a virtual module that re-exports `node:crypto` with its own `randomUUID`.
 */
const seededCrypto = {
  name: 'seeded-crypto',
  setup(build) {
    build.onLoad({ filter: /[\\/]mcp[\\/]src[\\/].*\.mjs$/ }, async (args) => {
      const text = await Bun.file(args.path).text();
      if (!text.includes('randomUUID') || !text.includes("from 'node:crypto'")) return undefined;
      const stream = streamNameOfModule(args.path);
      return {
        contents: text.replace("from 'node:crypto'", `from 'seeded-crypto:${stream}'`),
        loader: 'js',
      };
    });
    build.onResolve({ filter: /^seeded-crypto:/ }, (args) => ({
      path: args.path,
      namespace: 'seeded-crypto',
    }));
    build.onLoad({ filter: /.*/, namespace: 'seeded-crypto' }, (args) => ({
      contents: [
        "import real from 'node:crypto';",
        ...CRYPTO_EXPORTS.map((name) => `export const ${name} = real.${name};`),
        `import { uuidStream } from ${JSON.stringify(inputs)};`,
        `export const randomUUID = uuidStream(${JSON.stringify(args.path.slice('seeded-crypto:'.length))});`,
      ].join('\n'),
      loader: 'js',
    }));
  },
};

// Bun ignores plugins when it compiles in the same call, so bundle first, compile second.
const stage = mkdtempSync(path.join(path.dirname(outfile), 'twin-'));
const built = await Bun.build({
  entrypoints: [entry],
  outdir: stage,
  naming: 'twin.mjs',
  target: 'bun',
  plugins: [seededCrypto],
});
if (!built.success) {
  for (const log of built.logs) console.error(String(log));
  process.exit(1);
}
const compiled = spawnSync(
  bunProgram,
  bunCompileArgs({ triple: hostTargetTriple(), entry: path.join(stage, 'twin.mjs'), outfile }),
  { stdio: 'inherit' },
);
rmSync(stage, { recursive: true, force: true });
if (compiled.status !== 0 || !existsSync(outfile)) process.exit(1);

if (process.platform === 'darwin') {
  const signed = spawnSync('codesign', ['-s', '-', '-f', outfile], { encoding: 'utf8' });
  if (signed.status !== 0) {
    console.error(`codesign failed: ${signed.stderr}`);
    process.exit(1);
  }
}
console.log(`built ${outfile}`);
