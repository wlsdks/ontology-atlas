#!/usr/bin/env node
/**
 * ACP registry snapshot — fetched once at build time and committed to the repo.
 *
 * **Why not fetch at runtime.** It would break trust-charter promises ① ("works
 * without the internet") and ② ("nothing leaves unless the user turns it on") at
 * the same time: hitting a CDN on every app launch is traffic the user never
 * enabled, and on a plane the list would simply be empty. So the list is
 * **committed as a file**; it only changes when a person runs this script, and
 * what changed is visible in the git diff.
 *
 * **What is kept and what is dropped.** Kept: what is needed to launch (how to
 * run it) and what the screen must say (name, one-line description, where to go,
 * licence). Dropped: icon URLs (the app does not fetch external images — same
 * reason) and the author list (no screen uses it).
 *
 * Usage:
 *   node scripts/build-acp-registry.mjs           # fetch and update
 *   node scripts/build-acp-registry.mjs --check   # fail if it differs from the committed snapshot
 */

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src-tauri', 'src', 'acp-registry.json');
/**
 * Icons are **fetched and bundled at build time** too, for the same reason the
 * list is committed as a file: fetching images from a CDN on every launch is
 * traffic the user never enabled, and on a plane the list becomes grey squares.
 *
 * Using another vendor's logo is not the same as copying their design. This is
 * an identification mark saying "this is that tool", and the registry publishes
 * it specifically for client UIs.
 */
const ICON_DIR = join(ROOT, 'public', 'acp-icons');
const SOURCE = 'https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json';

/**
 * Where brand colours come from. Every registry icon is **monochrome
 * `currentColor`** (the registration rules reject SVGs with baked-in colour), so
 * the colour is sourced separately here.
 *
 * simple-icons path data is CC0-1.0, and all we take from it is **one colour
 * value** — the artwork stays the vendor's own mark as supplied by the registry.
 * A colour value is not itself copyrightable, but the provenance is recorded.
 */
const BRAND_SOURCE = 'https://cdn.jsdelivr.net/npm/simple-icons@latest/data/simple-icons.json';

/**
 * Launcher id → simple-icons entry title. **Only pairs a person has verified
 * one by one.**
 *
 * ⚠️ Matching by name automatically attaches **the wrong brand colour**. Two
 * measured cases: `amp-acp` (Sourcegraph Amp) matched Google AMP's blue
 * (#005AF0), and `pi-acp` matched Raspberry Pi's black. **A wrong colour is worse
 * than no colour** — with none the screen falls back to neutral, with a wrong one
 * we misrepresent someone else's brand.
 *
 * So there is no automatic matching. A launcher absent from this table is drawn
 * neutral.
 *
 * OpenAI (Codex) is **deliberately absent** — it was removed from simple-icons
 * v16 at the vendor's request. The mark itself comes from what the ACP registry
 * publishes for client UIs; no colour is added. Buzz does not bundle the OpenAI
 * mark for the same reason.
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

/**
 * Launchers we have **actually tested**.
 *
 * The rest stay listed and launchable, but only these two are marked "verified",
 * so the screen never claims we tried something we did not. This set grows only
 * with measured evidence (decision ledger 2026-08-16).
 */
const VERIFIED = new Set(['claude-acp', 'codex-acp']);

/**
 * Display-name overrides — only for launchers whose registry name differs from
 * what people actually call them.
 *
 * **Empty today, and it must stay empty** (2026-08-16). It once held
 * `'claude-acp': 'Claude Code'`, on the grounds that *the registry's `Claude
 * Agent` is accurate but nobody calls it that*. That name is **explicitly not
 * permitted**:
 *
 * > **Not permitted:** "Claude Code" or "Claude Code Agent"
 * > **Allowed:** "Claude Agent", preferred for **dropdown menus**
 * > — Anthropic, Claude Agent SDK docs, "Branding guidelines"
 * >   (https://code.claude.com/docs/en/agent-sdk/overview)
 *
 * This list is exactly such a dropdown menu, and the registry was already using
 * the allowed name. Overriding it is what broke the rule.
 *
 * ⚠️ **This does not mean erasing the words "Claude Code" from the repository.**
 * Sentences referring to **the product the user installed separately on their own
 * machine** (for example "connect to Claude Code" in the MCP setup guidance) name
 * that product correctly and stay as they are — renaming there would make the
 * guidance wrong. What is forbidden is **attaching that name to an agent our
 * product ships**.
 */
const DISPLAY_NAME = {};

/**
 * The executable name of the **real CLI** each adapter wraps. The registry does
 * not carry this, so it is paired here — it is what lets the screen distinguish
 * "the tool is missing" from "Node is missing", and those need different actions
 * from the user.
 *
 * Unknown ones are left out. Guessing makes the screen invent a reason.
 */
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
  const res = await fetch(BRAND_SOURCE, { headers: { accept: 'application/json' } });
  if (!res.ok) {
    console.error(`[acp-registry] 브랜드 색 받기 실패: HTTP ${res.status}`);
    process.exit(1);
  }
  const data = await res.json();
  const icons = Array.isArray(data) ? data : (data.icons ?? []);
  const byTitle = new Map(icons.map((i) => [String(i.title).toLowerCase(), i]));
  const ink = {};
  for (const [id, title] of Object.entries(BRAND_MARK)) {
    const match = byTitle.get(title.toLowerCase());
    if (!match) {
      console.error(`[acp-registry] 브랜드 색 짝이 사라졌습니다: ${id} → "${title}"`);
      console.error('  BRAND_MARK 의 그 줄을 사람이 다시 확인해야 합니다.');
      process.exit(1);
    }
    ink[id] = `#${match.hex}`;
  }
  return ink;
}

function normalize(raw, brandInk = {}) {
  const agents = [];
  for (const agent of raw.agents ?? []) {
    const launch = pickLaunch(agent.distribution);
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
    agents,
    // Fetching icons needs the upstream absolute URLs. They are not persisted.
    __raw: (raw.agents ?? []).filter((a) => agents.some((n) => n.id === a.id)),
  };
}

/** Fetches and stores one icon. On failure that entry alone goes without one. */
async function fetchIcon(agent) {
  if (!agent.icon) return false;
  try {
    const res = await fetch(agent.icon);
    if (!res.ok) return false;
    const svg = await res.text();
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
 * The runtimes this application **actually runs**, read from Rust rather than transcribed.
 *
 * ⚠️ **Why the gate is narrow now** (measured across rc.11 through rc.14, 2026-08-25/26). The
 * release check blocked on any of 39 listed agents moving, and it fired on all four releases that
 * day. Not once was the mover a runtime this app runs: cline, codebuddy-code, dimcode, droid,
 * glm-acp-agent, grok, gemini-cli, qwen-code. Each cost a full round trip — refresh, PR, CI, retag —
 * to ship a version number for a tool nobody here launches. On rc.14 the check was green when the
 * tag was cut and stale twenty seconds later when the workflow ran, which is the shape of a rule
 * that cannot be satisfied rather than one that is being broken.
 *
 * The danger it was written for is real and stays blocking: on 2026-08-20 the snapshot had fallen
 * behind on `claude-agent-acp` and `codex-acp` themselves, so the app shipped launching adapter
 * versions whose permission behaviour nobody had measured. That is a safety claim, not freshness.
 *
 * So: a stale entry for a runtime in Rust's `ISOLATION` table fails; every other entry is reported
 * and does not block. `ISOLATION` is the honest source — it is exactly the set this app claims
 * specific knowledge about, and `runtime-gate.test.ts` already reads it the same way.
 */
export function isolatedRuntimeIds() {
  const rust = readFileSync(join(ROOT, 'src-tauri', 'src', 'acp.rs'), 'utf8');
  const start = rust.indexOf('ISOLATION: &[IsolationSpec]');
  if (start < 0) {
    console.error('[acp-registry] could not find the ISOLATION table in src-tauri/src/acp.rs');
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
    console.error(`[acp-registry] 받기 실패: HTTP ${response.status}`);
    process.exit(1);
  }
  const rawJson = await response.json();

  if (check) {
    // Icons and brand colours are not fetched — check mode asks only whether **the
    // list is current**. Overlaying the committed snapshot's values before comparing
    // is what stops "one icon fetch failed" from masquerading as a list mismatch.
    const normalized = normalize(rawJson);
    const committed = JSON.parse(readFileSync(OUT, 'utf8'));
    const byId = new Map(committed.agents.map((a) => [a.id, a]));
    delete normalized.__raw;
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
        console.warn('  Refresh when convenient: node scripts/build-acp-registry.mjs');
      }
      if (blocking.length > 0) {
        console.error('[acp-registry] a runtime this app actually runs has gone stale:');
        for (const entry of blocking) console.error(describe(entry));
        console.error('  Run node scripts/build-acp-registry.mjs, review the diff, and commit.');
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
  writeFileSync(OUT, `${JSON.stringify(normalized, null, 2)}\n`);
  const verified = normalized.agents.filter((a) => a.verified).length;
  console.log(`[acp-registry] 아이콘 ${icons}개 → public/acp-icons/`);
  console.log(
    `[acp-registry] ${normalized.agents.length} agents (검증됨 ${verified}) → src-tauri/src/acp-registry.json`,
  );
}

/*
 * ⚠️ Only when run as a command. Without this guard, importing this module to test its pure
 * helpers would fetch the upstream registry — a test that needs the network to check a string
 * comparison is a test that fails on a plane.
 */
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
