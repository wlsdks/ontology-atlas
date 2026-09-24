#!/usr/bin/env node
/**
 * Captures the six app screens the gateway's screens stage shows, once per locale
 * (`public/gateway/<screen>.<locale>.png`, Korean and English in one run).
 *
 * Why a script and not a hand-taken screenshot: these screens only exist inside the desktop app
 * (a native folder root, Git, a project source), and the gateway promises that each picture is a
 * real screen, not a mockup (`SurfaceCapture`). So the screens are rendered by the real static
 * export in a browser, with the Tauri bridge answered **by Node against real files**:
 *
 * - the ontology folder is this repository's own `docs/ontology`, read from disk;
 * - the harness reading scans this repository itself (its `AGENTS.md`, `.claude/`, `.codex/`…);
 * - the Git screen is `git log -- docs/ontology` of this repository;
 * - only what the repository does not carry is added in memory: a small sample library
 *   (`sources/` + `wiki/`, with real SHA-256 hashes and one deliberately stale page), the
 *   project-source binding, and one saved automation with a finished round.
 *
 * Nothing is written to disk except the PNGs. Every path the app sees is under the fake root
 * `/work/ontology-atlas`, so no private path of the machine that shot them reaches a picture.
 *
 * The pictures are 1336×860 CSS pixels at device scale 2 (2672×1720), dark, and in the page's
 * own language: the Korean set is shot on `/ko/...` with Korean page titles and automation name.
 *
 * Usage (against a static export — the dev server's compile waits make captures flaky):
 *
 *   pnpm build
 *   node scripts/serve-static-export.mjs --port=3198 &
 *   pnpm gateway:capture -- --base-url=http://127.0.0.1:3198 [--only=library,git] [--locales=ko,en] [--out=public/gateway]
 *
 * Re-shoot after any change to one of the six screens; inspect every picture before committing.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FAKE_SOURCE_ROOT = "/work/ontology-atlas";
const FAKE_VAULT_ROOT = `${FAKE_SOURCE_ROOT}/docs/ontology`;
const VAULT_DIR = path.join(REPO, "docs/ontology");
const VIEWPORT = { width: 1336, height: 860 };

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, ...rest] = arg.slice(2).split("=");
      return [key, rest.join("=") || "true"];
    }),
);
const BASE_URL = args["base-url"] ?? "http://127.0.0.1:3198";
const OUT_DIR = path.resolve(REPO, args.out ?? "public/gateway");
const ONLY = args.only ? new Set(args.only.split(",")) : null;
const VERBOSE = args.verbose === "true";

// ─── The in-memory overlay: what the repository does not carry ─────────────

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

/** Five sources about Atlas itself, written for the sample — short, plain, and true. */
const SOURCES = {
  "sources/release-1.2-notes.md":
    "# 1.2 release notes\n\nThe Library reads a folder of sources and compiles wiki pages that cite them.\nThe Git screen restores one document behind a confirm.\nAutomations run a consistency round on a schedule.\n",
  "sources/harness-interview.txt":
    "Interview, harness tab.\nPeople wanted to see which instructions each agent was given, and which checks stop it.\nThe tab reads AGENTS.md, CLAUDE.md and the hook folders of the project source.\n",
  "sources/onboarding-survey.csv":
    "question,answer,count\nfirst screen understood,yes,14\nfirst screen understood,no,3\nfound the library,yes,9\n",
  "sources/architecture-review.md":
    "# Architecture review\n\nThe web app follows app, views, widgets, features, entities, shared.\nImports may only point down the ladder; ESLint enforces it.\n",
  "sources/agent-write-policy.md":
    "# Agent write policy\n\nAn agent may read the ontology freely.\nEvery Atlas write waits for a person to allow it once or reject it.\n",
};

const SOURCE_NAMES = Object.keys(SOURCES);

/** Six compiled pages. `stale` records a hash that no longer matches, so the shelf shows drift. */
const PAGES = [
  {
    slug: "release-overview",
    title: "Release overview",
    cites: [0, 3],
    stale: false,
    facts: [
      "The Library compiles wiki pages that cite their sources. [[src:sources/release-1.2-notes.md#p1]]",
      "The layer ladder is enforced by ESLint. [[src:sources/architecture-review.md#p1]]",
      "The map is [[capabilities/ontology-map]]; the Library is [[capabilities/library-workspace]].",
    ],
  },
  {
    slug: "harness-needs",
    title: "What people asked of the harness",
    cites: [1],
    stale: false,
    facts: [
      "People wanted to see which instructions each agent was given. [[src:sources/harness-interview.txt#p1]]",
      "The tab reads the project source's instruction files. [[src:sources/harness-interview.txt#p1]]",
    ],
  },
  {
    slug: "onboarding-findings",
    title: "Onboarding findings",
    cites: [2, 0],
    stale: true,
    facts: [
      "14 of 17 people understood the first screen. [[src:sources/onboarding-survey.csv#p1]]",
      "9 people found the Library on their own. [[src:sources/onboarding-survey.csv#p1]]",
    ],
  },
  {
    slug: "layer-rules",
    title: "Layer rules",
    cites: [3],
    stale: false,
    facts: [
      "Imports point down the ladder only. [[src:sources/architecture-review.md#p1]]",
      "The checked profile lives in [[capabilities/architecture-conformance]].",
    ],
  },
  {
    slug: "write-review",
    title: "Write review",
    cites: [4],
    stale: false,
    facts: [
      "Reads are free; every Atlas write waits for a person. [[src:sources/agent-write-policy.md#p1]]",
      "The review itself is [[capabilities/meaning-write-review]].",
    ],
  },
  {
    slug: "agent-connection",
    title: "Agent connection",
    cites: [4, 1],
    stale: false,
    facts: [
      "The in-app agent works under the same write review. [[src:sources/agent-write-policy.md#p1]]",
      "Setting up an agent is [[capabilities/agent-connector-setup]].",
    ],
  },
];

/**
 * The Korean set's page titles and automation name are Korean, the way a Korean user's own folder
 * would read. Source file names and the fact lines stay as they are — they are file contents. The
 * Korean words live in a fixture because script sources print English only.
 */
const KO = JSON.parse(
  readFileSync(path.join(REPO, "scripts/fixtures/gateway-capture-ko.json"), "utf8"),
);
const TITLES_KO = KO.titles;
const fill = (template, values) =>
  template.replace(/\{(\w+)\}/g, (_, key) => String(values[key]));

function wikiPage(page, locale) {
  const title = locale === "ko" ? TITLES_KO[page.slug] : page.title;
  const cited = page.cites.map((index) => SOURCE_NAMES[index]);
  // A fact must cite a source to fit the template; a line that only names a concept on the map
  // belongs in the summary.
  const facts = page.facts.filter((line) => line.includes("[[src:"));
  const mentions = page.facts.filter((line) => !line.includes("[[src:"));
  return [
    "---",
    `title: ${title}`,
    "created_by: agent:claude",
    "compiled_at: 2026-09-23T09:00:00Z",
    "sources:",
    ...cited.map((name) => `  - ${name}`),
    "source_hash:",
    ...cited.map((name) => `  ${name}: ${page.stale ? "0".repeat(64) : sha256(SOURCES[name])}`),
    "status: draft",
    `summary: ${title}.`,
    "---",
    "",
    "## Summary",
    "",
    [
      locale === "ko"
        ? fill(KO.summary, { count: cited.length, title })
        : `${title}, compiled from ${cited.length === 1 ? "one source" : `${cited.length} sources`}.`,
      ...mentions,
    ].join(" "),
    "",
    "## Facts",
    "",
    ...facts.map((fact) => `- ${fact}`),
    "",
    "## Decisions",
    "",
    "## Open questions",
    "",
    "## Not in sources",
    "",
  ].join("\n");
}

/**
 * One saved automation — a weekday consistency check of the sample library — and the two passes
 * it has already run. The dates follow the clock of the day the pictures are taken, so the next
 * run is always tomorrow morning and the screen never starts a pass of its own while shooting.
 */
function automationFiles(locale) {
  const ko = locale === "ko";
  const roundName = ko ? KO.roundName : "Library sources check";
  const day = 86_400_000;
  const at = (offsetDays, hour, minute = 0) => {
    const date = new Date(Date.now() + offsetDays * day);
    date.setHours(hour, minute, 0, 0);
    return date.toISOString();
  };
  const stalePage = PAGES.find((page) => page.stale);
  const rounds = {
    v: 1,
    rounds: [
      {
        id: "round-library-check",
        name: roundName,
        kind: "consistency",
        cadence: { daily: "09:00", weekdaysOnly: true },
        enabled: true,
        onStale: "mark",
        places: [{ kind: "vault", paths: ["wiki"] }],
        createdAt: at(-8, 9),
        lastPassAt: at(0, 9),
        nextDueAt: at(1, 9),
      },
    ],
  };
  const pass = (offsetDays, outcome, stale, summary) => ({
    v: 1,
    id: `pass-${offsetDays}`,
    roundId: "round-library-check",
    roundName,
    kind: "consistency",
    startedAt: at(offsetDays, 9),
    endedAt: at(offsetDays, 9, 1),
    outcome,
    checked: PAGES.length,
    stale,
    written: [],
    refused: [],
    called: [],
    places: ["wiki"],
    agentTurns: 0,
    summary,
    trigger: "clock",
  });
  const ledger = [
    pass(-1, "held", [], ko ? fill(KO.passHeld, { count: PAGES.length }) : `${PAGES.length} pages checked; every source still matches.`),
    pass(0, "stale", [`wiki/${stalePage.slug}.md`], ko ? fill(KO.passStale, { count: PAGES.length }) : `${PAGES.length} pages checked; 1 page's source changed.`),
  ];
  return {
    ".ontology-atlas/rounds.json": rounds,
    ".ontology-atlas/rounds-ledger.jsonl": `${ledger.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
  };
}

function buildOverlay(locale) {
  const overlay = new Map();
  for (const [name, text] of Object.entries(SOURCES)) overlay.set(name, text);
  for (const page of PAGES) overlay.set(`wiki/${page.slug}.md`, wikiPage(page, locale));
  overlay.set(
    ".ontology-atlas/project-sources.json",
    `${JSON.stringify(
      {
        contractVersion: 1,
        bindings: [
          {
            projectSlug: "ontology-atlas",
            sourceId: "ontology-atlas",
            rootPath: FAKE_SOURCE_ROOT,
            kind: "git",
            boundAt: "2026-09-23T09:00:00.000Z",
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  for (const [name, text] of Object.entries(automationFiles(locale))) {
    overlay.set(name, typeof text === "string" ? text : `${JSON.stringify(text, null, 2)}\n`);
  }
  return overlay;
}

// ─── The bridge: Tauri commands answered from real files ───────────────────

const MTIME = Date.parse("2026-09-23T09:00:00Z");

/** Maps a fake root plus relative path to a real path, refusing anything outside the repo. */
function realPath(root, relativePath = "") {
  const rel = String(relativePath ?? "").replace(/^\/+/, "").replace(/\/+$/, "");
  let base;
  if (root === FAKE_VAULT_ROOT) base = VAULT_DIR;
  else if (root === FAKE_SOURCE_ROOT) base = REPO;
  else throw new Error(`unknown root ${root}`);
  const full = path.resolve(base, rel);
  if (!full.startsWith(REPO)) throw new Error(`outside the repository: ${rel}`);
  return { full, rel };
}

/** Folders a real scan would never want from this checkout. */
const SKIP = new Set(["node_modules", ".next", "out", "output", ".git", "target", "coverage"]);

function listDirectory(root, relativePath, overlay) {
  const { full, rel } = realPath(root, relativePath);
  const entries = new Map();
  if (existsSync(full) && statSync(full).isDirectory()) {
    for (const name of readdirSync(full)) {
      if (SKIP.has(name)) continue;
      const kind = statSync(path.join(full, name)).isDirectory() ? "directory" : "file";
      entries.set(name, kind);
    }
  }
  if (root === FAKE_VAULT_ROOT) {
    const prefix = rel ? `${rel}/` : "";
    for (const file of overlay.keys()) {
      if (!file.startsWith(prefix)) continue;
      const [name, child] = file.slice(prefix.length).split("/");
      if (name) entries.set(name, child ? "directory" : "file");
    }
  }
  if (!entries.size && !(existsSync(full) && statSync(full).isDirectory())) {
    throw new Error(`missing directory ${rel}`);
  }
  return [...entries].map(([name, kind]) => ({ name, kind }));
}

function readText(root, relativePath, overlay) {
  const { full, rel } = realPath(root, relativePath);
  if (root === FAKE_VAULT_ROOT && overlay.has(rel)) return overlay.get(rel);
  if (existsSync(full) && statSync(full).isFile()) return readFileSync(full, "utf8");
  throw new Error(`missing ${rel}`);
}

function git(...gitArgs) {
  return execFileSync("git", ["-C", REPO, ...gitArgs], { encoding: "utf8", maxBuffer: 64 << 20 });
}

const STATUS = { A: "added", M: "modified", D: "deleted", R: "renamed" };

function changeEntry(repoPath, code, previous) {
  const vaultPath = repoPath.replace(/^docs\/ontology\//, "");
  const slug = vaultPath.replace(/\.md$/, "");
  const folder = slug.includes("/") ? slug.split("/")[0] : null;
  const kind = folder ? folder.replace(/s$/, "") : slug === "ontology-atlas" ? "project" : null;
  return {
    path: vaultPath,
    status: STATUS[code[0]] ?? "modified",
    kind,
    slug,
    renamedFrom: previous ? previous.replace(/^docs\/ontology\//, "") : null,
  };
}

function relativeTime(iso) {
  const days = Math.round((Date.parse("2026-09-24T09:00:00Z") - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.round(days / 7);
  return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
}

function gitHistory(limit, onlyPath) {
  const pathspec = onlyPath ? `docs/ontology/${onlyPath}` : "docs/ontology";
  const raw = git(
    "log",
    `-n${limit ?? 50}`,
    "--name-status",
    "--format=%x1e%H%x1f%h%x1f%s%x1f%cI",
    "--",
    pathspec,
  );
  return raw
    .split("\x1e")
    .filter((block) => block.trim())
    .map((block) => {
      const [head, ...lines] = block.split("\n");
      const [hash, shortHash, subject, isoTime] = head.split("\x1f");
      const files = lines
        .filter((line) => line.trim())
        .map((line) => {
          const [code, first, second] = line.split("\t");
          const target = second ?? first;
          if (!target.startsWith("docs/ontology/")) return null;
          return changeEntry(target, code, second ? first : null);
        })
        .filter(Boolean);
      return { shortHash, hash, subject, relativeTime: relativeTime(isoTime), isoTime, files };
    });
}

function commitDiff(hash) {
  const diff = git("show", "--format=", hash, "--", "docs/ontology");
  const files = git("show", "--format=", "--name-status", hash, "--", "docs/ontology")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      const [code, first, second] = line.split("\t");
      return changeEntry(second ?? first, code, second ? first : null);
    });
  return { count: files.length, files, diff: diff.slice(0, 200_000), truncated: diff.length > 200_000 };
}

function lastChange(repoPaths, vaultPaths) {
  const out = [];
  const probe = (repoPath, reported) => {
    const full = path.join(REPO, repoPath);
    const exists = existsSync(full);
    let lastChangedAt = null;
    try {
      lastChangedAt = git("log", "-1", "--format=%cI", "--", repoPath).trim() || null;
    } catch {
      lastChangedAt = null;
    }
    out.push({ path: reported, exists, isDir: exists && statSync(full).isDirectory(), lastChangedAt });
  };
  for (const repoPath of repoPaths ?? []) probe(repoPath, repoPath);
  for (const vaultPath of vaultPaths ?? []) probe(`docs/ontology/${vaultPath}`, vaultPath);
  return out;
}

function makeBridge(overlay, unstubbed) {
  const vaultRootOf = (input) => input.rootPath ?? input.vaultPath ?? FAKE_VAULT_ROOT;
  return async (command, input = {}) => {
    switch (command) {
      case "pick_vault_directory":
        return FAKE_VAULT_ROOT;
      case "vault_path_exists": {
        const root = vaultRootOf(input);
        const { full, rel } = realPath(root, input.relativePath);
        if (input.kind === "directory") {
          if (existsSync(full) && statSync(full).isDirectory()) return true;
          return root === FAKE_VAULT_ROOT && [...overlay.keys()].some((file) => file.startsWith(`${rel}/`));
        }
        if (root === FAKE_VAULT_ROOT && overlay.has(rel)) return true;
        return existsSync(full) && statSync(full).isFile();
      }
      case "list_vault_directory":
        return listDirectory(vaultRootOf(input), input.relativePath, overlay);
      case "read_vault_text_file":
        return { text: readText(vaultRootOf(input), input.relativePath, overlay), lastModified: MTIME };
      case "read_vault_binary_file": {
        const text = readText(vaultRootOf(input), input.relativePath, overlay);
        return { bytes: [...Buffer.from(text, "utf8")], lastModified: MTIME };
      }
      case "write_vault_text_file":
      case "create_vault_text_file": {
        const { rel } = realPath(vaultRootOf(input), input.relativePath);
        overlay.set(rel, String(input.contents ?? input.text ?? ""));
        return null;
      }
      case "vault_fingerprint":
        return `capture-${overlay.size}`;
      case "hash_vault_files":
        return (input.relativePaths ?? []).map((relativePath) => {
          try {
            return { relativePath, sha256: sha256(readText(vaultRootOf(input), relativePath, overlay)) };
          } catch {
            return { relativePath, sha256: null };
          }
        });
      case "git_probe":
        return { installed: true, version: "git version 2.49.0", platform: "macos" };
      case "git_status":
        return {
          ok: true,
          initialized: true,
          repoRoot: FAKE_SOURCE_ROOT,
          branch: "main",
          upstream: "origin/main",
          changedCount: 0,
          changes: [],
          ahead: 0,
          behind: 0,
          stagedOutsideVault: [],
        };
      case "git_history":
        return gitHistory(input.limit, input.path);
      case "git_diff":
        return { count: 0, files: [], diff: "", truncated: false };
      case "git_commit_diff":
        return commitDiff(input.hash);
      case "git_document_diff":
        return { path: input.relativePath, diff: "", untracked: false, tooLarge: false };
      case "git_paths_last_change":
        return lastChange(input.repoPaths, input.vaultPaths);
      case "plugin:event|listen":
        return Number(input.handler);
      case "plugin:event|unlisten":
        return null;
      case "acp_detect_runtimes":
        return [];
      case "acp_start":
        return new Promise(() => {});
      case "discover_mcp_connectors":
        return { servers: [], problems: [] };
      case "discover_source_candidates":
        return { candidates: [], truncated: false, unreadableRoots: [] };
      case "mcp_bundled_server":
        return { path: `${FAKE_SOURCE_ROOT}/mcp`, available: true, reason: null };
      case "secret_status":
      case "connector_secret_status":
        return { provider: input.provider, stored: false, last4: null };
      case "start_vault_watch":
      case "ensure_vault_directory":
      case "log_webview_error":
        return null;
      default:
        unstubbed.add(command);
        throw new Error(`unstubbed native command: ${command}`);
    }
  };
}

// ─── The six screens ───────────────────────────────────────────────────────

/**
 * Each screen: where to go and what to wait for before the shutter. `prepare` runs after the
 * route settles and may press what the picture needs (a tab, a row).
 */
const SCREENS = [
  {
    name: "library",
    route: "/library/",
    async prepare(page) {
      await page.getByTestId("library-workspace-wiki").click().catch(() => {});
      await page.waitForTimeout(2500);
    },
  },
  {
    name: "harness",
    route: "/architecture/?view=structure",
    async prepare(page) {
      await page.waitForTimeout(6000);
    },
  },
  {
    name: "insights",
    route: "/ontology/insights/",
    async prepare(page) {
      // The brief's four cores settle on their own clocks — the guidance core scans the whole
      // project source — and a cell still `reading` prints a loading word. Wait for all four to
      // have an answer, not for a fixed time.
      await page.waitForFunction(
        () => {
          const cells = [...document.querySelectorAll("[data-brief-availability]")];
          return cells.length >= 4 && cells.every((cell) => cell.getAttribute("data-brief-availability") !== "reading");
        },
        undefined,
        { timeout: 180_000, polling: 250 },
      );
      await page.waitForTimeout(300);
    },
  },
  {
    name: "projects",
    route: "/project/ontology-atlas/",
    async prepare(page) {
      await page.waitForTimeout(3000);
    },
  },
  {
    name: "git",
    route: "/git/",
    async prepare(page) {
      await page.waitForTimeout(3000);
    },
  },
  {
    name: "automations",
    route: "/automations/",
    async prepare(page) {
      // The saved check is a documents automation: it compares the Library's pages with
      // their sources and needs no agent.
      await page.getByTestId("automations-tab-documents").click();
      await page.waitForTimeout(3000);
    },
  },
];

async function installRuntime(context, bridge) {
  await context.exposeBinding("__atlasCaptureBridge", async (_source, command, input) => {
    try {
      return { ok: true, value: await bridge(command, input) };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  });
  await context.addInitScript(() => {
    const callbacks = new Map();
    let nextCallback = 1;
    window.isTauri = true;
    window.__TAURI_INTERNALS__ = {
      transformCallback(callback) {
        const id = nextCallback++;
        callbacks.set(id, callback);
        return id;
      },
      async invoke(command, input = {}) {
        const answer = await window.__atlasCaptureBridge(command, input);
        if (!answer.ok) throw new Error(answer.message);
        return answer.value;
      },
    };
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => undefined };
  });
}

/** Both sets, in one run: the gateway serves `<file>.<locale>.png` to each page. */
const LOCALES = args.locales ? args.locales.split(",") : ["ko", "en"];
const BROWSER_LOCALE = { ko: "ko-KR", en: "en-US" };

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const unstubbed = new Set();
  const browser = await chromium.launch();

  for (const locale of LOCALES) {
    // A fresh context per locale: its own storage, its own overlay, its own opened folder.
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 2,
      colorScheme: "dark",
      locale: BROWSER_LOCALE[locale] ?? locale,
      reducedMotion: "reduce",
    });
    await installRuntime(context, makeBridge(buildOverlay(locale), unstubbed));
    const page = await context.newPage();
    if (VERBOSE) page.on("console", (message) => console.log(`[page] ${message.text()}`));

    // Open the folder once through the app's own chooser, the way a person does.
    await page.goto(`${BASE_URL}/${locale}/?guides=off`);
    await page.waitForLoadState("networkidle");
    await page.getByTestId("first-run-open").click();
    await page.getByTestId("app-nav-rail").waitFor({ timeout: 60_000 });

    for (const screen of SCREENS) {
      if (ONLY && !ONLY.has(screen.name)) continue;
      await page.goto(`${BASE_URL}/${locale}${screen.route}`);
      await page.waitForLoadState("networkidle");
      await screen.prepare(page);
      // The pointer rests off the picture so no hover state is captured.
      await page.mouse.move(VIEWPORT.width - 2, VIEWPORT.height - 2);
      const file = path.join(OUT_DIR, `${screen.name}.${locale}.png`);
      await page.screenshot({ path: file });
      console.log(`captured ${path.relative(REPO, file)}`);
    }
    await context.close();
  }

  await browser.close();
  if (unstubbed.size) console.log(`unstubbed native commands: ${[...unstubbed].sort().join(", ")}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
