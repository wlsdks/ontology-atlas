import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { stdout } from 'node:process';
import { COLORS } from '../colors.mjs';
import { startHereContext, startHereRows } from '../start-here.mjs';

/**
 * Reads enough of the working directory to say what to do next. Deliberately shallow (three
 * `existsSync` calls and one directory read): bare `atlas` must answer instantly.
 */
function readSituation() {
  const here = process.cwd();
  const isVault = (dir) =>
    existsSync(join(dir, 'project.md')) ||
    existsSync(join(dir, 'domains')) ||
    existsSync(join(dir, 'capabilities'));
  const inVault = isVault(here);
  let nearbyVault = null;
  if (!inVault) {
    for (const name of ['atlas', 'vault', 'ontology', join('docs', 'ontology')]) {
      if (isVault(join(here, name))) {
        nearbyVault = `./${name}`;
        break;
      }
    }
  }
  const looksLikeCode = ['package.json', 'Cargo.toml', 'go.mod', 'pyproject.toml', 'pom.xml', 'src']
    .some((name) => existsSync(join(here, name)));
  let conceptCount = 0;
  const vaultDir = inVault ? here : nearbyVault ? join(here, nearbyVault) : null;
  if (vaultDir) {
    for (const sub of ['domains', 'capabilities', 'elements']) {
      try {
        conceptCount += readdirSync(join(vaultDir, sub)).filter((f) => f.endsWith('.md')).length;
      } catch {
        /* a vault need not have every folder */
      }
    }
    if (existsSync(join(vaultDir, 'project.md'))) conceptCount += 1;
  }
  const shimInstalled = (process.env.PATH ?? '')
    .split(':')
    .filter(Boolean)
    .some((dir) => existsSync(join(dir, 'atlas')));
  return { inVault, nearbyVault, looksLikeCode, conceptCount, shimInstalled };
}

/**
 * The bare command suggests the next step instead of listing every command: typing the bare word
 * says the person does not know the next one. `--help` keeps the full list.
 */
export function printStartHere({ version, stream = stdout } = {}) {
  const situation = readSituation();
  const rows = startHereRows(situation);
  const width = Math.max(...rows.map((r) => r.command.length));
  stream.write(
    `${COLORS.bold}atlas${COLORS.reset} ${COLORS.dim}v${version}${COLORS.reset}\n\n` +
      `${COLORS.dim}${startHereContext(situation)}${COLORS.reset}\n\n`,
  );
  for (const row of rows) {
    stream.write(`  ${COLORS.bold}${row.command.padEnd(width)}${COLORS.reset}  ${COLORS.dim}${row.why}${COLORS.reset}\n`);
  }
  stream.write('\n');
}
