import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { loadavg } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { deleteCacheDirs } from './delete-cache-dirs.mjs';
import { startCommand } from './start-command.mjs';
import { isPortOpen, waitForPortClosed } from './tcp-port.mjs';

const PROBE_CONFIG = 'tests/e2e/perf/playwright.config.ts';
const PROBE_LIMIT_MS = 5 * 60 * 1000;

async function waitForFile(file, probe) {
  const deadline = Date.now() + PROBE_LIMIT_MS;
  while (!existsSync(file)) {
    if (probe.finished) throw new Error(`the probe exited before writing ${file}\n${probe.output()}`);
    if (Date.now() > deadline) throw new Error(`the probe never wrote ${file}`);
    await sleep(20);
  }
}

/**
 * One `pnpm dev` start timed to a settled map on `/en/topology/` under the faked app runtime.
 * The clock starts at the moment the dev command is spawned and stops when the browser probe
 * (`tests/e2e/perf/time-to-map.probe.ts`) sees `waitForMapSettled` return; the probe's browser is
 * already up by then. Cold deletes `cacheDirs` first.
 */
export async function measureDevStart({ command, port, cwd, cacheDirs, cold, workDir }) {
  if (await isPortOpen(port)) throw new Error(`port ${port} already has a listener; stop it, or the probe would time that server`);
  if (cold) deleteCacheDirs(cacheDirs, cwd);

  const probeDir = mkdtempSync(join(workDir, 'dev-start-'));
  const require = createRequire(join(cwd, 'package.json'));
  const playwrightCli = require.resolve('@playwright/test/cli');
  const probe = startCommand(`"${process.execPath}" "${playwrightCli}" test --config ${PROBE_CONFIG}`, {
    cwd,
    env: { ...process.env, ATLAS_PROBE_DIR: probeDir, PLAYWRIGHT_BASE_URL: `http://localhost:${port}` },
  });
  const probeState = { finished: false, output: () => probe.outputTail() };
  void probe.exited.then(() => {
    probeState.finished = true;
  });

  let dev = null;
  try {
    await waitForFile(join(probeDir, 'ready'), probeState);
    const loadAverageStart = loadavg();
    const t0 = Date.now();
    dev = startCommand(command.replaceAll('{port}', String(port)), { cwd, env: process.env });
    writeFileSync(join(probeDir, 't0'), String(t0));

    const probeResult = await Promise.race([probe.exited, dev.exited.then(() => ({ devExited: true }))]);
    const resultFile = join(probeDir, 'result.json');
    if (probeResult.devExited || !existsSync(resultFile)) {
      return {
        kind: 'dev-start',
        cold,
        ok: false,
        failure: probeResult.devExited ? 'the dev command exited before the map settled' : 'the probe failed',
        outputTail: probeResult.devExited ? dev.outputTail() : probe.outputTail(),
        loadAverageStart,
        loadAverageEnd: loadavg(),
      };
    }
    const { listeningMs, mapSettledMs, consoleErrors } = JSON.parse(readFileSync(resultFile, 'utf8'));
    return {
      kind: 'dev-start',
      cold,
      ok: true,
      mapSettledMs,
      listeningMs,
      consoleErrorCount: consoleErrors.length,
      consoleErrors: consoleErrors.slice(0, 10),
      loadAverageStart,
      loadAverageEnd: loadavg(),
    };
  } finally {
    await probe.stopTree();
    await dev?.stopTree();
    rmSync(probeDir, { recursive: true, force: true });
    if (!(await waitForPortClosed(port))) throw new Error(`port ${port} is still open after stopping the dev command`);
  }
}
