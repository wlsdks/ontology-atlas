#!/usr/bin/env node
/**
 * ACP registry snapshot, fetched once at build time and committed: fetching at runtime would break the
 * trust promises "works without the internet" and "nothing leaves unless the user turns it on", and
 * a committed list changes only when a person runs this script, visible in the git diff.
 * Kept: what is needed to launch and what the screen says (name, description, where to go, licence).
 * Dropped: icon URLs (the app fetches no external images) and the author list.
 *
 * Usage:
 *   node scripts/registry-snapshots/build-acp-registry.mjs           # fetch and update
 *   node scripts/registry-snapshots/build-acp-registry.mjs --check   # fail if it differs from the committed snapshot
 */

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(ROOT, 'src-tauri', 'src', 'acp-registry.json');
/** Icons are fetched and bundled at build time too: a CDN fetch on every launch is traffic the user never enabled. The registry publishes them for client UIs as identification marks. */
const ICON_DIR = join(ROOT, 'public', 'acp-icons');
const SOURCE = 'https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json';

/** Where brand colours come from: every registry icon is monochrome `currentColor`, so the colour is sourced separately. simple-icons path data is CC0-1.0 and only one colour value is taken from it; the provenance is recorded. */
const BRAND_SOURCE = 'https://cdn.jsdelivr.net/npm/simple-icons@latest/data/simple-icons.json';

/**
 * Launcher id to simple-icons entry title; only pairs a person verified one by one. Name matching
 * attaches wrong brand colours, worse than none. A launcher absent here draws neutral. OpenAI
 * (Codex) is absent on purpose: no colour is added to the mark from the ACP registry.
 */
const BRAND_MARK = {
  'claude-acp': 'Claude Code',
  gemini: 'Google Gemini',
  'mistral-vibe': 'Mistral AI',
  'qwen-code': 'QWen',
  'codebuddy-code': 'CodeBuddy',
  'glm-acp-agent': 'Z.ai',
  cursor: 'Cursor',
  'github-copilot-cli': 'GitHub Copilot',
  opencode: 'OpenCode',
  kimi: 'Kimi',
  cline: 'Cline',
};

/** Launchers actually tested: the rest stay listed and launchable, but only these are marked "verified", so the screen never claims a try that did not happen. The set grows only with measured evidence (`docs/DECISIONS.md`). */
const VERIFIED = new Set(['claude-acp', 'codex-acp']);

/**
 * Compatibility pins for runtimes whose newest registry package broke an app-owned safety
 * boundary. These are not ordinary dependency preferences: the app launches the pinned package
 * until a newer upstream package passes the same installed permission matrix.
 *
 * `reviewedUpstreamPackage` keeps the exception from becoming an invisible permanent downgrade.
 * When upstream moves again, `--check` turns red and names both values so a person must inspect the
 * new adapter before either advancing or retaining the pin.
 */
const RUNTIME_LAUNCH_PINS = {
  /*
   * No pin stands today; the table is empty. The mechanism stays so a measured boundary failure can
   * pin a version with a named upstream subject (`docs/DECISIONS.md`).
   */
};

export function runtimeLaunchPinIds() {
  return Object.keys(RUNTIME_LAUNCH_PINS);
}

export function runtimeLaunchPinIssues(rawAgents) {
  const byId = new Map((rawAgents ?? []).map((agent) => [agent.id, agent]));
  const issues = [];
  for (const [id, pin] of Object.entries(RUNTIME_LAUNCH_PINS)) {
    const upstream = pickLaunch(byId.get(id)?.distribution);
    const actual = upstream?.kind === 'npx' ? upstream.package : null;
    if (actual !== pin.reviewedUpstreamPackage) {
      issues.push({
        id,
        pinned: pin.package,
        reviewedUpstream: pin.reviewedUpstreamPackage,
        actualUpstream: actual ?? '(missing-or-not-npx)',
      });
    }
  }
  return issues;
}

function applyRuntimeLaunchPin(id, launch) {
  const pin = RUNTIME_LAUNCH_PINS[id];
  return pin && launch?.kind === 'npx' ? { ...launch, package: pin.package } : launch;
}

/**
 * Display-name overrides, only for launchers whose registry name differs from what people call them.
 * It must stay empty: Anthropic's branding guidelines
 * (https://code.claude.com/docs/en/agent-sdk/overview) do not permit "Claude Code" for an agent a
 * product ships ("Claude Agent" is allowed in dropdown menus), and the registry already uses the
 * allowed name. Sentences about the product the user installed separately may still say "Claude Code".
 */
const DISPLAY_NAME = {};

/** The executable name of the real CLI each adapter wraps, which the registry lacks: it lets the screen tell "the tool is missing" from "Node is missing". Unknown ones are left out, because guessing invents a reason. */
const UNDERLYING_CLI = {
  'claude-acp': 'claude',
  'codex-acp': 'codex',
  goose: 'goose',
  gemini: 'gemini',
  'github-copilot-cli': 'copilot',
  cursor: 'cursor-agent',
  opencode: 'opencode',
  'amp-acp': 'amp',
  cline: 'cline',
  'qwen-code': 'qwen',
  kimi: 'kimi',
  junie: 'junie',
};

function pickLaunch(distribution) {
  if (distribution?.npx?.package) {
    return {
      kind: 'npx',
      package: distribution.npx.package,
      args: distribution.npx.args ?? [],
    };
  }
  if (distribution?.binary) {
    // Take only the executable name and args from the per-platform entry. Archive
    // URLs are not kept — the app does not download and run someone else's binary
    // on the user's behalf.
    const anyPlatform = Object.values(distribution.binary)[0];
    if (!anyPlatform?.cmd) return null;
    return {
      kind: 'binary',
      // `./goose` → `goose`
      command: String(anyPlatform.cmd).replace(/^\.\//, ''),
      args: anyPlatform.args ?? [],
    };
  }
  if (distribution?.uvx?.package) {
    return { kind: 'uvx', package: distribution.uvx.package, args: distribution.uvx.args ?? [] };
  }
  return null;
}

/**
 * Fetches brand colours for the verified pairs. If a pair exists but its
 * counterpart has disappeared upstream this **fails loudly rather than skipping**
 * — that row needs a person to re-verify it.
 */
async function fetchBrandInk() {
  const response = await fetch(BRAND_SOURCE, { headers: { accept: 'application/json' } });
  if (!response.ok) {
    console.error(`[acp-registry] failed to fetch the brand colors: HTTP ${response.status}`);
    process.exit(1);
  }
  const data = await response.json();
  const icons = Array.isArray(data) ? data : (data.icons ?? []);
  const byTitle = new Map(icons.map((i) => [String(i.title).toLowerCase(), i]));
  const ink = {};
  for (const [id, title] of Object.entries(BRAND_MARK)) {
    const match = byTitle.get(title.toLowerCase());
    if (!match) {
      console.error(`[acp-registry] a brand color pairing disappeared: ${id} → "${title}"`);
      console.error('  A person has to re-check that row of BRAND_MARK.');
      process.exit(1);
    }
    ink[id] = `#${match.hex}`;
  }
  return ink;
}

function normalize(raw, brandInk = {}) {
  const agents = [];
  for (const agent of raw.agents ?? []) {
    const launch = applyRuntimeLaunchPin(agent.id, pickLaunch(agent.distribution));
    if (!launch) continue; // No way to launch it means no reason to list it.
    agents.push({
      id: agent.id,
      name: DISPLAY_NAME[agent.id] ?? agent.name,
      description: agent.description ?? '',
      website: agent.website ?? agent.repository ?? null,
      license: agent.license ?? null,
      verified: VERIFIED.has(agent.id),
      icon: agent.icon ? `/acp-icons/${agent.id}.svg` : null,
      // `null` when there is no verified pair — the screen draws it neutral.
      brandInk: brandInk[agent.id] ?? null,
      cli: UNDERLYING_CLI[agent.id] ?? null,
      launch,
    });
  }
  agents.sort((a, b) => {
    // Tested ones first, then by name, so no screen has to re-sort.
    if (a.verified !== b.verified) return a.verified ? -1 : 1;
    return a.name.localeCompare(b.name, 'en');
  });
  return {
    source: SOURCE,
    registryVersion: raw.version ?? null,
    npmDependencyCutoff: null,
    agents,
    // Fetching icons needs the upstream absolute URLs. They are not persisted.
    __raw: (raw.agents ?? []).filter((a) => agents.some((n) => n.id === a.id)),
  };
}

/** npx's `--before` for the hardened runtimes (src-tauri/src/acp/launch/runtime_environment.rs); moves with the snapshot. */
export function withDependencyCutoff(normalized, committed, now = new Date()) {
  const bare = (snapshot) => JSON.stringify({ ...snapshot, npmDependencyCutoff: null });
  const kept = committed?.npmDependencyCutoff && bare(committed) === bare(normalized);
  return { ...normalized, npmDependencyCutoff: kept ? committed.npmDependencyCutoff : now.toISOString() };
}

export function hardenedRuntimeIds() {
  const rust = readFileSync(join(ROOT, 'src-tauri', 'src', 'acp', 'launch', 'runtime_environment.rs'), 'utf8');
  const list = /NPM_HARDENED_RUNTIMES: &\[&str\] = &\[([^\]]*)\]/.exec(rust)?.[1] ?? '';
  const ids = [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  if (ids.length === 0) {
    console.error('[acp-registry] NPM_HARDENED_RUNTIMES parsed to zero runtimes; refusing to pass');
    process.exit(1);
  }
  return ids;
}

export function npmPackageSpec(spec) {
  const match = /^((?:@[^/@]+\/)?[^/@]+)@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(spec ?? '');
  return match ? { name: match[1], version: match[2] } : null;
}

export function cutoffProblems({ snapshot, hardened, publishedAt }) {
  const cutoff = Date.parse(snapshot.npmDependencyCutoff ?? '');
  if (!Number.isFinite(cutoff)) {
    return [`npmDependencyCutoff is missing or not a date: ${snapshot.npmDependencyCutoff}`];
  }
  const problems = [];
  for (const id of hardened) {
    const launch = snapshot.agents.find((agent) => agent.id === id)?.launch;
    const spec = launch?.kind === 'npx' ? npmPackageSpec(launch.package) : null;
    if (!spec) {
      problems.push(`${id}: no exact npx version to check`);
      continue;
    }
    const published = publishedAt(spec.name, spec.version);
    if (!published) problems.push(`${id}: npm does not say when ${spec.name}@${spec.version} was published`);
    else if (Date.parse(published) > cutoff) {
      problems.push(`${id}: ${spec.name}@${spec.version} was published ${published}, after ${snapshot.npmDependencyCutoff}`);
    }
  }
  return problems;
}

async function npmPublishTimes(snapshot, hardened) {
  const times = new Map();
  for (const id of hardened) {
    const launch = snapshot.agents.find((agent) => agent.id === id)?.launch;
    const spec = launch?.kind === 'npx' ? npmPackageSpec(launch.package) : null;
    if (!spec) continue;
    const response = await fetch(`https://registry.npmjs.org/${spec.name.replace('/', '%2f')}`, {
      headers: { accept: 'application/json' },
    });
    if (!response.ok) {
      console.error(`[acp-registry] npm answered HTTP ${response.status} for ${spec.name}`);
      process.exit(1);
    }
    times.set(`${spec.name}@${spec.version}`, (await response.json()).time?.[spec.version] ?? null);
  }
  return (name, version) => times.get(`${name}@${version}`) ?? null;
}

/** Fetches and stores one icon. On failure that entry alone goes without one. */
async function fetchIcon(agent) {
  if (!agent.icon) return false;
  try {
    const response = await fetch(agent.icon);
    if (!response.ok) return false;
    const svg = await response.text();
    // Reject scripts and external references inside the SVG. An image drawn inside
    // the app has no reason to reach outward or execute code.
    if (/<script|xlink:href\s*=\s*["']https?:|href\s*=\s*["']https?:/i.test(svg)) return false;
    writeFileSync(join(ICON_DIR, `${agent.id}.svg`), svg);
    return true;
  } catch {
    return false;
  }
}

/**
 * The runtimes this app runs, read from Rust's `ISOLATION` table. A stale entry for one of these
 * fails the release check; others are reported without blocking. Stays blocking for
 * `claude-agent-acp` and `codex-acp`: a stale adapter ships unmeasured permission behaviour.
 */
export function isolatedRuntimeIds() {
  const rust = readFileSync(join(ROOT, 'src-tauri', 'src', 'acp', 'isolation.rs'), 'utf8');
  const start = rust.indexOf('ISOLATION: &[IsolationSpec]');
  if (start < 0) {
    console.error('[acp-registry] could not find the ISOLATION table in src-tauri/src/acp/isolation.rs');
    process.exit(1);
  }
  const block = rust.slice(start, rust.indexOf('];', start));
  const ids = [...block.matchAll(/id:\s*"([^"]+)"/g)].map((m) => m[1]);
  if (ids.length === 0) {
    // ⚠️ An empty list would silently turn this into a gate that never blocks — the exact failure
    // ("a gate that exists but does not run") the release workflow's own comment records.
    console.error('[acp-registry] the ISOLATION table parsed to zero runtimes; refusing to pass');
    process.exit(1);
  }
  return ids;
}

/** Which agents changed, and how — so the message names versions instead of saying "something". */
export function driftedAgents(committed, current) {
  const before = new Map(committed.map((a) => [a.id, a]));
  const drifted = [];
  for (const agent of current) {
    const previous = before.get(agent.id);
    const a = JSON.stringify(previous?.launch ?? null);
    const b = JSON.stringify(agent.launch ?? null);
    if (!previous) {
      drifted.push({ id: agent.id, before: '(new)', after: launchLabel(agent) });
    } else if (a !== b) {
      drifted.push({ id: agent.id, before: launchLabel(previous), after: launchLabel(agent) });
    }
  }
  for (const agent of committed) {
    if (!current.some((a) => a.id === agent.id)) {
      drifted.push({ id: agent.id, before: launchLabel(agent), after: '(removed)' });
    }
  }
  return drifted;
}

export function launchLabel(agent) {
  const launch = agent?.launch;
  if (!launch) return '(none)';
  return launch.package ?? launch.command ?? launch.kind ?? '(unknown)';
}

async function main() {
  const check = process.argv.includes('--check');
  const response = await fetch(SOURCE, { headers: { accept: 'application/json' } });
  if (!response.ok) {
    console.error(`[acp-registry] fetch failed: HTTP ${response.status}`);
    process.exit(1);
  }
  const rawJson = await response.json();
  const pinIssues = runtimeLaunchPinIssues(rawJson.agents);
  if (pinIssues.length > 0) {
    console.error('[acp-registry] a compatibility-pinned runtime moved upstream:');
    for (const issue of pinIssues) {
      console.error(
        `    ${issue.id}: pinned ${issue.pinned}; reviewed ${issue.reviewedUpstream}; upstream is ${issue.actualUpstream}`,
      );
    }
    console.error('  Re-run the installed permission matrix before changing either recorded version.');
    process.exit(1);
  }

  if (check) {
    // Icons and brand colours are not fetched — check mode asks only whether **the
    // list is current**. Overlaying the committed snapshot's values before comparing
    // is what stops "one icon fetch failed" from masquerading as a list mismatch.
    const normalized = normalize(rawJson);
    const committed = JSON.parse(readFileSync(OUT, 'utf8'));
    const hardened = hardenedRuntimeIds();
    const cutoffIssues = cutoffProblems({
      snapshot: committed,
      hardened,
      publishedAt: await npmPublishTimes(committed, hardened),
    });
    if (cutoffIssues.length > 0) {
      console.error('[acp-registry] npx would refuse a pinned adapter under the dependency cutoff:');
      for (const issue of cutoffIssues) console.error(`    ${issue}`);
      console.error('  Run node scripts/registry-snapshots/build-acp-registry.mjs to move the cutoff, review the diff, and commit.');
      process.exit(1);
    }
    const byId = new Map(committed.agents.map((a) => [a.id, a]));
    delete normalized.__raw;
    normalized.npmDependencyCutoff = committed.npmDependencyCutoff ?? null;
    for (const agent of normalized.agents) {
      agent.icon = byId.get(agent.id)?.icon ?? null;
      agent.brandInk = byId.get(agent.id)?.brandInk ?? null;
    }
    const serialized = `${JSON.stringify(normalized, null, 2)}\n`;
    if (readFileSync(OUT, 'utf8') !== serialized) {
      const drifted = driftedAgents(committed.agents, normalized.agents);
      const isolated = isolatedRuntimeIds();
      const blocking = drifted.filter((entry) => isolated.includes(entry.id));
      const rest = drifted.filter((entry) => !isolated.includes(entry.id));

      const describe = (entry) => `    ${entry.id}: ${entry.before} → ${entry.after}`;
      if (rest.length > 0) {
        console.warn(`[acp-registry] ${rest.length} listed agent(s) moved upstream:`);
        for (const entry of rest) console.warn(describe(entry));
        console.warn('  Refresh when convenient: node scripts/registry-snapshots/build-acp-registry.mjs');
      }
      if (blocking.length > 0) {
        console.error('[acp-registry] a runtime this app actually runs has gone stale:');
        for (const entry of blocking) console.error(describe(entry));
        console.error('  Run node scripts/registry-snapshots/build-acp-registry.mjs, review the diff, and commit.');
        process.exit(1);
      }
      console.log(
        `[acp-registry] snapshot differs, but no runtime this app isolates moved (${isolated.join(', ')}) · ${committed.agents.length} agents`,
      );
      return;
    }
    console.log(`[acp-registry] current · ${normalized.agents.length} agents`);
    return;
  }

  const normalized = normalize(rawJson, await fetchBrandInk());
  /*
   * Do not wipe the folder — it also holds the **provenance record**
   * (`CREDITS.md`), not just icons. Wiping it would erase where each vendor's mark
   * came from on every refresh. Only what we generated (`*.svg`) is removed.
   */
  mkdirSync(ICON_DIR, { recursive: true });
  for (const name of readdirSync(ICON_DIR)) {
    if (name.endsWith('.svg')) rmSync(join(ICON_DIR, name));
  }
  const raw = normalized.__raw;
  delete normalized.__raw;
  let icons = 0;
  for (const agent of raw) {
    if (await fetchIcon(agent)) icons += 1;
    else {
      const entry = normalized.agents.find((a) => a.id === agent.id);
      if (entry) entry.icon = null;
    }
  }
  let committed = null;
  try {
    committed = JSON.parse(readFileSync(OUT, 'utf8'));
  } catch {
    committed = null;
  }
  writeFileSync(OUT, `${JSON.stringify(withDependencyCutoff(normalized, committed), null, 2)}\n`);
  const verified = normalized.agents.filter((a) => a.verified).length;
  console.log(`[acp-registry] ${icons} icons → public/acp-icons/`);
  console.log(
    `[acp-registry] ${normalized.agents.length} agents (${verified} verified) → src-tauri/src/acp-registry.json`,
  );
}

/* Only when run as a command: importing this module to test its pure helpers must not fetch the upstream registry. */
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
