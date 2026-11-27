// Runs every selected case on two servers and compares them. Cases run in parallel, each worker on
// its own folder; the two servers of one case share that folder, one after the other.
import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { HarnessContext, runCaseOnServer } from './case-runner.mjs';
import { compareRuns } from './compare-runs.mjs';
import { requestCount } from './corpus.mjs';

/**
 * @param {object} options
 * @param {string} options.repoRoot
 * @param {string} options.workRoot
 * @param {object[]} options.cases from `loadCorpus`
 * @param {import('./servers.mjs').ServerSpec} options.serverA
 * @param {import('./servers.mjs').ServerSpec} options.serverB
 * @param {string} options.localeA
 * @param {string} options.localeB
 * @param {Record<string, { tool?: string, path: string }[]>} [options.except] per family
 * @param {number} [options.concurrency]
 * @param {(result: object) => void} [options.onResult]
 */
export async function runPairs({
  repoRoot,
  workRoot,
  cases,
  serverA,
  serverB,
  localeA,
  localeB,
  except = {},
  concurrency = 4,
  onResult,
}) {
  const context = new HarnessContext({ repoRoot, workRoot });
  for (const fixture of new Set(cases.map((c) => c.header.vault))) context.template(fixture);
  const results = new Array(cases.length);
  let next = 0;
  const worker = async (index) => {
    const workerDir = path.join(workRoot, `worker-${index}`);
    mkdirSync(workerDir, { recursive: true });
    for (;;) {
      const at = next;
      next += 1;
      if (at >= cases.length) return;
      const caseDef = cases[at];
      const started = Date.now();
      const runA = await runCaseOnServer({ context, caseDef, server: serverA, locale: localeA, workerDir });
      const runB = await runCaseOnServer({ context, caseDef, server: serverB, locale: localeB, workerDir });
      const differences = compareRuns(runA, runB, { except: except[caseDef.family] ?? [] });
      const result = {
        family: caseDef.family,
        name: caseDef.name,
        requests: requestCount(caseDef),
        differences,
        ms: Date.now() - started,
        labelA: `${serverA.label} [${localeA}]`,
        labelB: `${serverB.label} [${localeB}]`,
      };
      results[at] = result;
      onResult?.(result);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, (_, index) => worker(index)));
  return results;
}
