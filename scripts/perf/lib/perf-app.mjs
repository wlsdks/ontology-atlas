// A local build of the app that runs beside the installed one: its own bundle identifier (so
// single-instance does not forward to the installed app), product name and URL scheme, the perf
// export with the page probe in every page, reporting into a folder the harness reads.
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensurePerfExport } from './perf-export.mjs';
import { MACOS_TOOL } from './macos-memory.mjs';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
export const PERF_APP_IDENTIFIER = 'dev.jinan.ontology-atlas.perf';
const PERF_APP_NAME = 'Ontology Atlas Perf';
const FRONTEND = join(ROOT, 'src-tauri', 'target', 'perf-frontend');
const BUNDLE = join(ROOT, 'src-tauri', 'target', 'release', 'bundle', 'macos', `${PERF_APP_NAME}.app`);
const STAMP = join(ROOT, 'src-tauri', 'target', 'perf-app.json');
const PROBE_FILE = '__perf-probe.js';

function probeSource(reportDir) {
  const source = readFileSync(new URL('./page-probe.js', import.meta.url), 'utf8');
  const injected = source.replace("'__PERF_PROBE_COLLECTOR__'", JSON.stringify(reportDir));
  if (injected === source) throw new Error('page-probe.js lost its report-folder placeholder');
  return injected;
}

function injectProbe(probe) {
  rmSync(FRONTEND, { recursive: true, force: true });
  cpSync(join(ROOT, 'src-tauri', 'target', 'desktop-frontend'), FRONTEND, { recursive: true });
  writeFileSync(join(FRONTEND, PROBE_FILE), probe);
  let pages = 0;
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.name.endsWith('.html')) {
        const html = readFileSync(path, 'utf8');
        // First in <head>, so it wraps requestAnimationFrame and history before the app's scripts run.
        const next = html.replace(/<head([^>]*)>/, `<head$1><script src="/${PROBE_FILE}"></script>`);
        if (next !== html) pages += 1;
        writeFileSync(path, next);
      }
    }
  };
  visit(FRONTEND);
  return pages;
}

function tauriConfig() {
  const appConfig = JSON.parse(readFileSync(join(ROOT, 'src-tauri', 'tauri.conf.json'), 'utf8')).app;
  // An occluded or locked-screen WebView is hidden and WebKit suspends it. Floating without focus
  // keeps it visible beside other apps; no throttling keeps timers alive while the screen is locked.
  const windows = appConfig.windows.map((window) => ({ ...window, alwaysOnTop: true, focus: false, visibleOnAllWorkspaces: true, backgroundThrottling: 'disabled' }));
  return {
    identifier: PERF_APP_IDENTIFIER,
    productName: PERF_APP_NAME,
    build: { beforeBuildCommand: 'node --version', frontendDist: 'target/perf-frontend' },
    bundle: { createUpdaterArtifacts: false },
    app: { windows },
    plugins: { 'deep-link': { desktop: { schemes: ['ontology-atlas-perf'] } } },
  };
}

/** The built bundle and its executable, built when missing, stale, or `rebuild`. */
export function ensurePerfApp({ reportDir, rebuild = false }) {
  const exportStamp = ensurePerfExport();
  const source = probeSource(reportDir);
  const probe = createHash('sha256').update(source).update(JSON.stringify(tauriConfig())).digest('hex').slice(0, 12);
  const want = { commit: exportStamp.commit, dirty: exportStamp.dirty, reportDir, probe };
  const have = existsSync(STAMP) ? JSON.parse(readFileSync(STAMP, 'utf8')) : null;
  if (rebuild || !existsSync(BUNDLE) || !have || have.commit !== want.commit || have.reportDir !== reportDir || have.probe !== probe || want.dirty) {
    const stage = spawnSync(process.execPath, ['scripts/desktop/stage-desktop-frontend.mjs'], { cwd: ROOT, stdio: 'inherit' });
    if (stage.status !== 0) throw new Error('staging the desktop frontend failed');
    const pages = injectProbe(source);
    console.log(`[perf-app] probe added to ${pages} pages`);
    // Tauri embeds frontendDist in the executable; removing it forces the relink that re-embeds.
    rmSync(join(ROOT, 'src-tauri', 'target', 'release', 'ontology-atlas'), { force: true });
    rmSync(BUNDLE, { recursive: true, force: true });
    const build = spawnSync('pnpm', ['tauri', 'build', '--bundles', 'app', '--config', JSON.stringify(tauriConfig())], { cwd: ROOT, stdio: 'inherit' });
    if (build.status !== 0) throw new Error('tauri build of the perf app failed');
    writeFileSync(STAMP, JSON.stringify({ ...want, builtAt: new Date().toISOString() }));
  }
  const executable = execFileSync(MACOS_TOOL.plistBuddy, ['-c', 'Print :CFBundleExecutable', join(BUNDLE, 'Contents', 'Info.plist')], { encoding: 'utf8' }).trim();
  const identifier = execFileSync(MACOS_TOOL.plistBuddy, ['-c', 'Print :CFBundleIdentifier', join(BUNDLE, 'Contents', 'Info.plist')], { encoding: 'utf8' }).trim();
  if (identifier !== PERF_APP_IDENTIFIER) throw new Error(`the perf bundle says ${identifier}; refusing to launch something that could be the installed app`);
  return { bundle: BUNDLE, executable: join(BUNDLE, 'Contents', 'MacOS', executable), identifier };
}

/** Forgets the perf bundle in LaunchServices, so its URL scheme and name leave no trace. */
export function unregisterPerfApp() {
  const lsregister = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';
  if (existsSync(BUNDLE)) spawnSync(lsregister, ['-u', BUNDLE], { stdio: 'ignore' });
}
