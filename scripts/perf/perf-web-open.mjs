#!/usr/bin/env node
// Opens a generated vault in the static export with GPU Chromium and prints every budget row of
// docs/specs/2026-11-20-performance-strategy.md against scripts/perf/budgets.json.
// Usage: pnpm perf:web-open -- --files=2000 --files=20000 --shape=key --shape=all
//          [--walk=map] [--walk=library] [--profile] [--no-heap-snapshot] [--check] [--build]
//          [--cap=<s>] [--settle=<s>] [--port=3202] [--clean]
// Measures the heap (CDP) steady after a forced collection and at peak over 1 s samples, the
// snapshot's composition, time to first concepts and to loaded from the pick, Chromium `longtask`
// entries after first paint, and per-walk frame intervals. `--profile` records a CPU profile and
// names the five largest functions of each long task. Needs `out/` from `--build`, which builds the
// export with `next build --no-mangling` so profiles carry source names. Generated vaults, profiles
// and snapshots stay under the OS temp folder (`atlas-perf-open`); their paths are printed.
import { spawnSync } from 'node:child_process';
import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs';
import { cpus, loadavg } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBudgets, printBudgetTable } from './lib/budgets.mjs';
import { describeWindows, profileWindows } from './lib/cpu-profile.mjs';
import { EXPORT_DIR, ensurePerfExport } from './lib/perf-export.mjs';
import { capSeconds, cleanVaults, parseOpenArgs, PERF_WORK, prepareVault } from './lib/vaults.mjs';
import { openWebSession, startStaticServer } from './lib/web-session.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const MB = 1048576;
const options = parseOpenArgs(process.argv.slice(2), { walks: ['map', 'library'] });
const profileCpu = Boolean(options.extra.profile);
const heapSnapshot = !options.extra['no-heap-snapshot'];
const RUNS = join(PERF_WORK, 'runs');
mkdirSync(RUNS, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// The losing timer is unref'd, or a long cap keeps the process alive after the run ends.
const withTimeout = (promise, ms) => Promise.race([promise.catch(() => null), new Promise((resolve) => setTimeout(resolve, ms, null).unref())]);

if (options.clean) cleanVaults();
ensurePerfExport({ rebuild: Boolean(options.extra.build) });
console.log(`web-open perf · ${cpus().length} cores · load ${loadavg().map((n) => n.toFixed(1)).join(' ')}`);
const server = await startStaticServer(EXPORT_DIR, options.port);
let broken = 0;
try {
  for (const shape of options.shapes) for (const files of options.files) broken += await measure(shape, files);
} finally {
  server.stop();
}
if (options.check && broken > 0) {
  console.error(`${broken} budget row(s) over their limit`);
  process.exit(1);
}

async function measure(shape, files) {
  const vault = prepareVault(files, shape);
  const label = `web-${shape}-${files}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const capMs = capSeconds(files, options.walks, options.capS) * 1000;
  const { context, page, filledOpfs } = await openWebSession({ origin: server.origin, vault });
  const cdp = await context.newCDPSession(page);
  let crashedAt = null;
  page.on('crash', () => {
    crashedAt = Date.now();
  });
  const heap = [];
  const sampleHeap = async (phase) => {
    const usage = await withTimeout(cdp.send('Runtime.getHeapUsage'), 4000);
    heap.push({ t: Date.now(), phase, mb: usage ? usage.usedSize / MB : null });
    return usage ? usage.usedSize / MB : null;
  };
  const read = () => withTimeout(page.evaluate(() => window.__perfProbe.read()), 8000);

  console.log(`\n## ${shape} · ${files.toLocaleString('en-US')} files (${vault.nodes} concepts) · cap ${capMs / 1000} s${filledOpfs ? ' · OPFS filled this run' : ''}`);
  await cdp.send('HeapProfiler.enable');
  await page.goto(`${server.origin}/en/topology/?e2e=1`);
  await page.evaluate((n) => window.__perfProbe.expect(n), vault.census);
  await page.getByTestId('first-run-starter-open').click({ timeout: 60000 });
  let profileStartedAt = null;
  if (profileCpu) {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
    await cdp.send('Profiler.start');
    profileStartedAt = await page.evaluate(() => performance.now());
  }
  const started = Date.now();
  await page.getByTestId('vault-guide-pick-existing').click({ timeout: 30000 });

  let probe = null;
  while (Date.now() - started < capMs && !crashedAt) {
    await sampleHeap('open');
    probe = (await read()) ?? probe;
    if (probe?.marks.loaded !== undefined) break;
    await sleep(1000);
  }
  const openPeakMb = Math.max(...heap.map((s) => s.mb ?? 0));
  let steadyMb = null;
  if (!crashedAt && probe?.marks.loaded !== undefined) {
    for (let waited = 0; waited < options.settleS * 1000 && !crashedAt; waited += 1000) {
      await sampleHeap('settle');
      await sleep(1000);
    }
    await withTimeout(cdp.send('HeapProfiler.collectGarbage'), 30000);
    steadyMb = await sampleHeap('steady');
  }

  const walkResults = {};
  for (const walk of options.walks) {
    if (crashedAt || steadyMb === null) break;
    const remaining = capMs - (Date.now() - started);
    const ticker = setInterval(() => void sampleHeap(walk), 1000);
    walkResults[walk] = await withTimeout(
      page.evaluate((name) => (name === 'map' ? window.__perfProbe.walkMap() : window.__perfProbe.walkLibrary({ capMs: 180000, settleMs: 10000 })), walk),
      Math.max(10000, remaining),
    );
    clearInterval(ticker);
    if (walk === 'library' && !crashedAt) {
      await withTimeout(cdp.send('HeapProfiler.collectGarbage'), 30000);
      walkResults.libraryHeapMb = await sampleHeap('library-steady');
    }
  }
  probe = (crashedAt ? null : await read()) ?? probe;
  // A page still busy after the walk may not answer `read`; the walk's own result holds the row pick.
  const rowPick = probe?.rowPick ?? (walkResults.library?.firstFrameMs !== undefined ? walkResults.library : null);

  const report = { label, shape, files, concepts: vault.nodes, vaultDir: vault.dir, crashedAfterS: crashedAt ? (crashedAt - started) / 1000 : null, heap, probe, walkResults, load: loadavg() };
  const pickedAt = probe?.marks.picked ?? null;
  const since = (mark) => (pickedAt !== null && probe?.marks[mark] !== undefined ? (probe.marks[mark] - pickedAt) / 1000 : null);
  const segments = probe?.segments ?? {};
  const navSegments = ['pan', 'zoom', 'hover', 'drag'].map((name) => segments[name]).filter(Boolean);
  const frameP95 = navSegments.length ? Math.max(...navSegments.map((s) => s.intervalP95 ?? 0)) : null;

  if (profileCpu && !crashedAt) {
    const { profile } = (await withTimeout(cdp.send('Profiler.stop'), 120000)) ?? {};
    if (profile) {
      const profilePath = join(RUNS, `${label}.cpuprofile`);
      writeFileSync(profilePath, JSON.stringify(profile));
      report.profilePath = profilePath;
      report.profileStartedAt = profileStartedAt;
      const toUs = (ms) => profile.startTime + (ms - profileStartedAt) * 1000;
      const windows = (probe?.longtasks ?? [])
        .filter((task) => task.ms >= 200)
        .slice(0, 8)
        .map((task) => ({ label: `long task at ${(task.at / 1000).toFixed(1)} s (${task.segment ?? phaseOf(task.at, probe)})`, startUs: toUs(task.at), endUs: toUs(task.at + task.ms) }));
      for (const name of ['first-hover', 'row-pick']) {
        const segment = segments[name];
        if (segment) windows.push({ label: `walk segment ${name}`, startUs: toUs(segment.at), endUs: toUs(segment.at + segment.ms) });
      }
      report.profileWindows = describeWindows(profileWindows(profile, windows), ROOT);
    }
  }

  if (heapSnapshot && !crashedAt) {
    const snapshotPath = join(RUNS, `${label}.heapsnapshot`);
    const out = createWriteStream(snapshotPath);
    const onChunk = ({ chunk }) => out.write(chunk);
    cdp.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
    const ok = await withTimeout(cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false, captureNumericValue: false }), 300000);
    cdp.off('HeapProfiler.addHeapSnapshotChunk', onChunk);
    await new Promise((resolve) => out.end(resolve));
    if (ok !== null) {
      report.snapshotPath = snapshotPath;
      const child = spawnSync(process.execPath, ['--max-old-space-size=12000', fileURLToPath(new URL('./lib/heap-composition.mjs', import.meta.url)), snapshotPath, '12'], { encoding: 'utf8', maxBuffer: 1 << 24 });
      report.composition = child.status === 0 ? JSON.parse(child.stdout) : { error: child.stderr.slice(0, 400) };
    }
  }
  await context.close().catch(() => {});

  const reportPath = join(RUNS, `${label}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  const over = printBudgetTable({
    command: 'perf:web-open',
    shape,
    files,
    gated: files <= getBudgets().webGatedUpTo,
    measured: {
      'web-heap-steady': steadyMb,
      'web-heap-peak': heap.length ? Math.max(...heap.map((s) => s.mb ?? 0)) : null,
      'loaded-first-open': { value: since('loaded'), note: crashedAt ? `tab crashed at ${report.crashedAfterS.toFixed(0)} s` : null },
      'longest-task': probe?.longestTask?.ms ?? null,
      'frame-p95': frameP95,
      'row-pick-first-frame': rowPick?.firstFrameMs ?? null,
    },
    notes: {
      'web-heap-steady': crashedAt ? 'the tab crashed' : probe?.marks.loaded === undefined ? `not loaded within the ${capMs / 1000} s cap` : null,
      'frame-p95': options.walks.includes('map') ? 'the map walk did not finish' : 'add --walk=map',
      'row-pick-first-frame': options.walks.includes('library') ? (probe?.log ?? []).slice(-1)[0] ?? 'the Library walk did not pick a row' : 'add --walk=library',
    },
  });
  console.log('\nMeasured beside the budgets:');
  console.log(`- first concepts ${fmtS(since('firstConcepts'))}, loaded ${fmtS(since('loaded'))} after the pick; open heap peak ${openPeakMb.toFixed(0)} MB${profileCpu ? ' (CPU profiler on)' : ''}`);
  console.log(`- long tasks over 50 ms after first paint: ${probe?.longtasksOver50 ?? 'n/a'}; longest ${probe?.longestTask ? `${probe.longestTask.ms} ms at ${(probe.longestTask.at / 1000).toFixed(1)} s` : 'n/a'}; longest frame gap ${probe?.longestGap ? `${probe.longestGap.ms} ms` : 'n/a'}`);
  for (const task of (probe?.longtasks ?? []).slice(0, 6)) console.log(`  - ${task.ms} ms at ${(task.at / 1000).toFixed(1)} s, ${task.segment ?? phaseOf(task.at, probe)}`);
  for (const [name, s] of Object.entries(segments)) {
    console.log(`- walk ${name}: ${s.frames} frames, interval p95 ${fmtMs(s.intervalP95)} max ${fmtMs(s.intervalMax)}, rAF work p95 ${fmtMs(s.workP95)} max ${fmtMs(s.workMax)}${s.error ? `, error ${s.error}` : ''}`);
  }
  if (rowPick) console.log(`- row pick ${rowPick.label}: first frame ${fmtMs(rowPick.firstFrameMs)}`);
  if (walkResults.libraryHeapMb) console.log(`- heap with the Library open, after a collection: ${walkResults.libraryHeapMb.toFixed(0)} MB (${(walkResults.libraryHeapMb - steadyMb).toFixed(0)} MB above steady)`);
  if (report.composition?.top) {
    console.log(`- heap composition at the end (${report.composition.totalMb} MB shallow): strings ${report.composition.strings.map((s) => `${s.kind} ${s.mb} MB × ${s.count}`).join(', ')}`);
    for (const row of report.composition.top) console.log(`  - ${String(row.mb).padStart(7)} MB  ${String(row.count).padStart(9)}  ${row.what}`);
  }
  for (const line of report.profileWindows ?? []) console.log(line);
  for (const line of (probe?.log ?? []).slice(-5)) console.log(`- probe: ${line}`);
  console.log(`- report ${reportPath}${report.profilePath ? `\n- CPU profile ${report.profilePath}` : ''}${report.snapshotPath ? `\n- heap snapshot ${report.snapshotPath}` : ''}`);
  return over.length;
}

function phaseOf(at, probe) {
  const marks = probe?.marks ?? {};
  if (marks.loaded === undefined || at < marks.loaded) return 'while opening';
  return 'after loaded';
}

function fmtS(value) {
  return value === null || value === undefined ? 'n/a' : `${value.toFixed(2)} s`;
}

function fmtMs(value) {
  return value === null || value === undefined ? 'n/a' : `${value.toFixed(1)} ms`;
}
