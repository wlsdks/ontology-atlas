#!/usr/bin/env node
// Opens a generated vault in a local build of the macOS app and prints every budget row of
// docs/specs/2026-11-20-performance-strategy.md against scripts/perf/budgets.json.
// Usage: pnpm perf:app-open -- --files=2000 --files=20000 --shape=key [--walk=map] [--walk=library]
//          [--vmmap] [--shots] [--check] [--build] [--cap=<s>] [--settle=<s>] [--clean]
// The app is built beside the installed one (lib/perf-app.mjs: identifier
// dev.jinan.ontology-atlas.perf) and launched by full path with the desktop verifier's fixture-vault
// environment and HOME set to a scratch folder, so its app data, logs and derived index stay out
// of the installed app's folders; it never touches, kills or relaunches the installed app. Each
// size is opened twice: a first open with no index, then a reopen from the index rows. The page
// probe (lib/page-probe.js) writes its report through the app's own file commands into a scratch
// folder the harness grants; `footprint` samples the app, its WebContent process and any child
// twice a second. WebKit has no long-task entries, so the longest task is the longest gap between
// animation frames. The perf window floats above others without taking keyboard focus, because
// WebKit runs no frames and suspends timers in an occluded window. `--shots` captures it every
// 20 s. Run one at a time.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, loadavg } from 'node:os';
import { join } from 'node:path';
import { printBudgetTable } from './lib/budgets.mjs';
import { childrenOf, footprintCategories, footprints, MACOS_TOOL, processName, vmmapRegions, webkitHelpers } from './lib/macos-memory.mjs';
import { ensurePerfApp, PERF_APP_IDENTIFIER, unregisterPerfApp } from './lib/perf-app.mjs';
import { captureWindow } from '../lib/verify-macos/visual-evidence.mjs';
import { parseOnscreenWindows, readOnscreenWindows } from '../lib/verify-macos/window-accessibility.mjs';
import { capSeconds, cleanVaults, parseOpenArgs, PERF_WORK, prepareVault } from './lib/vaults.mjs';

if (process.platform !== 'darwin') {
  console.error('perf:app-open measures the macOS app (footprint and vmmap are macOS tools)');
  process.exit(2);
}
const opts = parseOpenArgs(process.argv.slice(2), { walks: ['map', 'library'] });
const HOME = join(PERF_WORK, 'app-home');
const REPORTS = join(PERF_WORK, 'app-reports');
const GRANTS = join(HOME, 'Library', 'Application Support', PERF_APP_IDENTIFIER, 'granted-vault-roots.json');
const INDEX = join(HOME, 'Library', 'Caches', 'dev.jinan.ontology-atlas', 'vault-index');
const RUNS = join(PERF_WORK, 'runs');
const SAMPLE_MS = 500;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
mkdirSync(RUNS, { recursive: true });

if (opts.clean) cleanVaults();
mkdirSync(REPORTS, { recursive: true });
const app = ensurePerfApp({ reportDir: realpathSync(REPORTS), rebuild: Boolean(opts.extra.build) });
if (screenLocked()) console.log('The screen is locked: WebKit hides the page, so the map, frames and walks cannot be measured; footprint and census times still are.');
console.log(`app-open perf · ${cpus().length} cores · load ${loadavg().map((n) => n.toFixed(1)).join(' ')} · ${app.bundle}`);

const reports = new Map();
/** Reads every page report the probe wrote into the report folder. */
function readReports() {
  for (const name of readdirSync(REPORTS)) {
    if (!name.startsWith('page-')) continue;
    try {
      const report = JSON.parse(readFileSync(join(REPORTS, name), 'utf8'));
      reports.set(report.page, report);
    } catch {}
  }
}

let child = null;
const quit = async () => {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  for (let i = 0; i < 50 && child.exitCode === null; i += 1) await sleep(100);
  if (child.exitCode === null) child.kill('SIGKILL');
};
process.on('SIGINT', async () => {
  await quit();
  process.exit(130);
});

let broken = 0;
try {
  for (const shape of opts.shapes) for (const files of opts.files) broken += await measure(shape, files);
} finally {
  await quit();
  // Everything the perf app wrote lives under the scratch HOME, plus what macOS keeps per identifier.
  rmSync(HOME, { recursive: true, force: true });
  rmSync(REPORTS, { recursive: true, force: true });
  for (const folder of ['Caches', 'WebKit', 'HTTPStorages', 'Saved Application State', 'Logs', 'Application Support']) {
    const home = process.env.HOME;
    rmSync(join(home, 'Library', folder, PERF_APP_IDENTIFIER), { recursive: true, force: true });
    rmSync(join(home, 'Library', folder, `${PERF_APP_IDENTIFIER}.savedState`), { recursive: true, force: true });
  }
  unregisterPerfApp();
}
if (opts.check && broken > 0) {
  console.error(`${broken} budget row(s) over their limit`);
  process.exit(1);
}

/** One launch: samples until the probe says its walks are done, the cap passes, or the app exits. */
async function launch(vault, { walks, capMs, label, composition }) {
  reports.clear();
  for (const name of readdirSync(REPORTS)) rmSync(join(REPORTS, name), { force: true });
  // As if the person had opened both folders before: a fresh app data folder has no grant, and
  // the app then shows its chooser instead of reopening the folder.
  mkdirSync(join(GRANTS, '..'), { recursive: true });
  writeFileSync(GRANTS, JSON.stringify([realpathSync(vault.dir), realpathSync(REPORTS)]));
  const config = { walks, settleMs: opts.settleS * 1000, capMs, expectConcepts: vault.census, library: { capMs: 180000, settleMs: 10000 } };
  writeFileSync(join(REPORTS, 'config.json'), JSON.stringify(config));
  const before = new Set(webkitHelpers().keys());
  mkdirSync(HOME, { recursive: true });
  const launchedAt = Date.now();
  child = spawn(app.executable, [], {
    cwd: join(app.bundle, 'Contents', 'MacOS'),
    env: {
      ...process.env,
      HOME,
      ONTOLOGY_ATLAS_VERIFY_WEBVIEW: '1',
      ONTOLOGY_ATLAS_VERIFY_VAULT: vault.dir,
      ONTOLOGY_ATLAS_VERIFY_WINDOW_SIZE: '1512x900',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', () => {});
  const helpers = new Map();
  const childNames = {};
  const samples = [];
  let exitedAt = null;
  child.once('exit', () => {
    exitedAt = Date.now();
  });
  const shots = [];
  let lastShot = 0;
  while (Date.now() - launchedAt < capMs && exitedAt === null) {
    if (opts.extra.shots && Date.now() - lastShot >= 20000) {
      lastShot = Date.now();
      const window = parseOnscreenWindows(readOnscreenWindows(), [child.pid])[0];
      const shot = window ? captureWindow(window, { keepPath: join(RUNS, `${label}-${Math.round((lastShot - launchedAt) / 1000)}s.png`) }) : null;
      if (shot?.artifactPath) shots.push(shot.artifactPath);
    }
    for (const [pid, kind] of webkitHelpers()) if (!before.has(pid) && !helpers.has(pid)) helpers.set(pid, { kind, firstSeen: Date.now() });
    const kids = childrenOf(child.pid);
    for (const pid of kids) childNames[pid] ??= processName(pid);
    const pids = [child.pid, ...helpers.keys(), ...kids];
    const measured = footprints(pids);
    samples.push({ t: Date.now(), byPid: Object.fromEntries([...measured].map(([pid, value]) => [pid, value])), kids });
    readReports();
    const current = latestPage();
    if (current?.marks.walksDone !== undefined) break;
    await sleep(SAMPLE_MS);
  }
  const webContent = [...helpers].filter(([, info]) => info.kind === 'WebContent').map(([pid]) => pid);
  const liveWebContent = webContent.filter((pid) => samples.at(-1)?.byPid[pid]);
  const extra = {};
  if (composition && exitedAt === null) {
    for (const pid of [...liveWebContent, child.pid]) {
      const categories = footprintCategories(pid);
      const regions = vmmapRegions(pid);
      const raw = join(RUNS, `${label}-${pid}.vmmap.txt`);
      writeFileSync(raw, `${categories.raw}\n\n${regions.raw}`);
      extra[pid] = { name: processName(pid), categories: categories.rows, regions: regions.rows, errors: [categories.error, regions.error].filter(Boolean), raw };
    }
  }
  const crashedAt = exitedAt;
  const final = await quitAndRead();
  const stdoutPath = join(RUNS, `${label}.stdout.txt`);
  writeFileSync(stdoutPath, stdout);
  return { pid: child.pid, launchedAt, exitedAt: crashedAt, helpers: Object.fromEntries(helpers), webContent, childNames, samples, page: final, extra, shots, stdoutPath };

  async function quitAndRead() {
    readReports();
    const page = latestPage();
    await quit();
    return page;
  }
}

function screenLocked() {
  const session = spawnSync(MACOS_TOOL.ioreg, ['-n', 'Root', '-d1', '-a'], { encoding: 'utf8' }).stdout ?? '';
  return /<key>CGSSessionScreenIsLocked<\/key>\s*<true\/>/.test(session);
}

/** The report of the last page that opened the vault; earlier pages are the verifier's reloads. */
function latestPage() {
  const pages = [...reports.values()].sort((a, b) => a.timeOrigin - b.timeOrigin);
  return pages.filter((page) => page.marks.firstConcepts !== undefined).at(-1) ?? pages.at(-1) ?? null;
}

function median(values) {
  const sorted = values.filter((v) => typeof v === 'number').sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
}

/** Median footprint of `pids` over samples in [from, to] epoch ms, summed across pids per sample. */
function steadyMb(run, pids, from, to) {
  return median(run.samples.filter((s) => s.t >= from && s.t <= to).map((s) => {
    const values = pids.map((pid) => s.byPid[pid]?.mb).filter((v) => typeof v === 'number');
    return values.length ? values.reduce((a, b) => a + b, 0) : null;
  }));
}

function peakMb(run, pids) {
  let peak = null;
  for (const s of run.samples) for (const pid of pids) {
    const value = s.byPid[pid]?.peakMb ?? s.byPid[pid]?.mb;
    if (typeof value === 'number' && (peak === null || value > peak)) peak = value;
  }
  return peak;
}

async function measure(shape, files) {
  const vault = prepareVault(files, shape);
  const capMs = capSeconds(files, opts.walks, opts.capS) * 1000;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  console.log(`\n## ${shape} · ${files.toLocaleString('en-US')} files (${vault.nodes} concepts) · cap ${capMs / 1000} s`);
  rmSync(INDEX, { recursive: true, force: true });
  const first = await launch(vault, { walks: opts.walks, capMs, label: `app-${shape}-${files}-${stamp}-first`, composition: Boolean(opts.extra.vmmap) || files <= 2000 });
  await sleep(2000);
  const reopen = await launch(vault, { walks: [], capMs: capSeconds(files, [], opts.capS) * 1000, label: `app-${shape}-${files}-${stamp}-reopen`, composition: false });

  const at = (run, mark) => (run.page?.marks[mark] !== undefined ? run.page.timeOrigin + run.page.marks[mark] : null);
  const seconds = (run, mark) => (run.page?.marks[mark] !== undefined ? run.page.marks[mark] / 1000 : null);
  const settleEnd = at(first, 'settled');
  const wc = first.webContent;
  const webSteady = settleEnd ? steadyMb(first, wc, settleEnd - 10000, settleEnd) : null;
  const mainPid = first.pid;
  const mainSteady = settleEnd ? steadyMb(first, [mainPid], settleEnd - 10000, settleEnd) : null;
  const libraryQuiet = at(first, 'libraryQuiet');
  const libraryMb = libraryQuiet ? steadyMb(first, wc, libraryQuiet - 5000, libraryQuiet) : null;
  const kids = [...new Set(first.samples.flatMap((s) => s.kids))];
  const segments = first.page?.segments ?? {};
  const nav = ['pan', 'zoom', 'hover', 'drag'].map((name) => segments[name]).filter(Boolean);
  const crashed = (run) => (run.exitedAt !== null ? `the app exited after ${((run.exitedAt - run.launchedAt) / 1000).toFixed(0)} s` : null);
  const webContentDied = wc.length > 1 ? `${wc.length} WebContent processes in one launch (a WebView crash restarts it)` : null;

  const report = { shape, files, concepts: vault.nodes, vaultDir: vault.dir, first, reopen, load: loadavg() };
  const reportPath = join(RUNS, `app-${shape}-${files}-${stamp}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  const over = printBudgetTable({
    command: 'perf:app-open',
    shape,
    files,
    measured: {
      'app-webview-steady': webSteady,
      'app-webview-peak': { value: peakMb(first, wc), note: webContentDied },
      'app-webview-library-added': libraryMb !== null && webSteady !== null ? libraryMb - webSteady : null,
      'app-main-steady': mainSteady,
      'app-main-peak': mainPid ? peakMb(first, [mainPid]) : null,
      'first-concepts-app-reopen': seconds(reopen, 'firstConcepts'),
      'loaded-app-reopen': seconds(reopen, 'loaded'),
      'loaded-first-open': seconds(first, 'loaded'),
      'longest-task': first.page?.longestGap?.ms ?? null,
      'frame-p95': nav.length ? Math.max(...nav.map((s) => s.intervalP95 ?? 0)) : null,
      'row-pick-first-frame': first.page?.rowPick?.firstFrameMs ?? null,
    },
    notes: {
      'app-webview-steady': crashed(first) ?? 'not loaded within the cap',
      'app-webview-library-added': opts.walks.includes('library') ? (crashed(first) ?? (first.page?.log ?? []).slice(-1)[0] ?? 'the Library did not settle') : 'add --walk=library',
      'first-concepts-app-reopen': crashed(reopen) ?? 'the reopen did not show concepts within the cap',
      'loaded-app-reopen': crashed(reopen) ?? 'the reopen did not load within the cap',
      'loaded-first-open': crashed(first) ?? 'not loaded within the cap',
      'frame-p95': opts.walks.includes('map') ? 'the map walk did not finish' : 'add --walk=map',
      'row-pick-first-frame': opts.walks.includes('library') ? (first.page?.log ?? []).slice(-1)[0] ?? 'no row picked' : 'add --walk=library',
    },
  });

  console.log('\nMeasured beside the budgets:');
  const firstPage = first.page;
  for (const [name, run] of [['first open', first], ['reopen', reopen]]) {
    const hiddenS = (run.page?.hiddenMs ?? 0) / 1000;
    console.log(`- ${name}: census shown ${fmt(seconds(run, 'censusShown'), 's')}, complete ${fmt(seconds(run, 'censusComplete'), 's')}; page hidden for ${hiddenS.toFixed(0)} s${hiddenS > 1 ? ' (screen locked or window covered: no map, frame or walk figures)' : ''}`);
  }
  console.log(`- first open: first concepts ${fmt(seconds(first, 'firstConcepts'), 's')}, loaded ${fmt(seconds(first, 'loaded'), 's')} from the page's start; the page started ${firstPage ? ((firstPage.timeOrigin - first.launchedAt) / 1000).toFixed(1) : 'n/a'} s after launch (the verifier seeds the folder and reloads)`);
  console.log(`- reopen: first concepts ${fmt(seconds(reopen, 'firstConcepts'), 's')}, loaded ${fmt(seconds(reopen, 'loaded'), 's')}; WebView steady ${fmt(steadyMb(reopen, reopen.webContent, (at(reopen, 'settled') ?? 0) - 10000, at(reopen, 'settled') ?? 0), 'MB')}, peak ${fmt(peakMb(reopen, reopen.webContent), 'MB')}`);
  console.log(`- frame gaps over 50 ms after first paint (first open): ${firstPage?.gapsOver50 ?? 'n/a'}; the longest ${firstPage?.longestGap ? `${firstPage.longestGap.ms} ms at ${(firstPage.longestGap.at / 1000).toFixed(1)} s${firstPage.longestGap.segment ? ` in ${firstPage.longestGap.segment}` : ''}` : 'n/a'}`);
  for (const gap of (firstPage?.gaps ?? []).slice(0, 6)) console.log(`  - ${gap.ms} ms at ${(gap.at / 1000).toFixed(1)} s${gap.segment ? ` (${gap.segment})` : ''}`);
  for (const [name, s] of Object.entries(segments)) {
    console.log(`- walk ${name}: ${s.frames} frames, interval p95 ${fmt(s.intervalP95, 'ms')} max ${fmt(s.intervalMax, 'ms')}, rAF work p95 ${fmt(s.workP95, 'ms')} max ${fmt(s.workMax, 'ms')}${s.error ? `, error ${s.error}` : ''}`);
  }
  if (firstPage?.rowPick) console.log(`- row pick ${firstPage.rowPick.label}: first frame ${fmt(firstPage.rowPick.firstFrameMs, 'ms')}, press handled in ${fmt(firstPage.rowPick.pressMs, 'ms')}`);
  if (libraryMb !== null) console.log(`- WebView with the Library open ${libraryMb.toFixed(0)} MB`);
  console.log(`- processes: app ${mainPid} (peak ${fmt(mainPid ? peakMb(first, [mainPid]) : null, 'MB')}); WebKit ${Object.entries(first.helpers).map(([pid, info]) => `${info.kind} ${pid} (peak ${fmt(peakMb(first, [Number(pid)]), 'MB')})`).join(', ')}; children of the app: ${kids.length ? kids.map((pid) => `${first.childNames[pid] || '?'} ${pid} (peak ${fmt(peakMb(first, [pid]), 'MB')})`).join(', ') : 'none'}`);
  for (const [pid, info] of Object.entries(first.extra)) {
    console.log(`- composition of ${info.name} ${pid} at the end of the first open (footprint categories, dirty MB):`);
    for (const row of info.categories) console.log(`  - ${String(row.dirtyMb).padStart(8)}  ${row.category} (${row.regions} regions)`);
    console.log('  vmmap --summary regions (dirty + swapped MB):');
    for (const row of info.regions) console.log(`  - ${String((row.dirtyMb + row.swappedMb).toFixed(1)).padStart(8)}  ${row.region}`);
    for (const error of info.errors) console.log(`  - error: ${error}`);
    console.log(`  raw: ${info.raw}`);
  }
  for (const line of (firstPage?.log ?? []).slice(-5)) console.log(`- probe: ${line}`);
  if (!firstPage) console.log(`- the probe never reported; app stdout ${first.stdoutPath}`);
  for (const shot of [...first.shots, ...reopen.shots]) console.log(`- window capture ${shot}`);
  console.log(`- report ${reportPath}`);
  return over.length;
}

function fmt(value, unit) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `${unit === 'MB' ? value.toFixed(0) : unit === 's' ? value.toFixed(2) : value.toFixed(1)} ${unit}`;
}
