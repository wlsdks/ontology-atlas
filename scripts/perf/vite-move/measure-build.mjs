import { loadavg } from 'node:os';
import { deleteCacheDirs } from './delete-cache-dirs.mjs';
import { samplePeakMemory } from './sample-peak-memory.mjs';
import { startCommand } from './start-command.mjs';

const BUILD_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * One build of `command` with the type check skipped. Cold deletes `cacheDirs` first; warm
 * leaves whatever the previous build left. Wall time runs from spawning the command to its exit;
 * peak memory is the largest resident sum over the command's whole process tree.
 */
export async function measureBuild({ command, cwd, cacheDirs, cold }) {
  if (cold) deleteCacheDirs(cacheDirs, cwd);
  const loadAverageStart = loadavg();
  const startedAt = performance.now();
  const build = startCommand(command, { cwd, env: { ...process.env, ATLAS_BUILD_SKIP_TYPECHECK: '1' } });
  const memory = samplePeakMemory(build.pid);
  const timeout = setTimeout(() => void build.stopTree(), BUILD_TIMEOUT_MS);
  const result = await build.exited;
  clearTimeout(timeout);
  const wallMs = Math.round(performance.now() - startedAt);
  const peak = await memory.stop();
  await build.stopTree();

  const ok = result.exitCode === 0;
  return {
    kind: 'build',
    cold,
    ok,
    wallMs,
    ...peak,
    exitCode: result.exitCode,
    loadAverageStart,
    loadAverageEnd: loadavg(),
    ...(ok ? {} : { failure: result.error ?? `exit ${result.exitCode} ${result.signal ?? ''}`.trim(), outputTail: build.outputTail() }),
  };
}
