import type { Page } from "@playwright/test";

/**
 * **The Rounds tab's desktop bridge, stubbed** — shared by every Rounds spec.
 *
 * The installed app is a WKWebView running this same static export, so answering the commands
 * the walk calls exercises the real handle, the real store and the real presentation. It lives
 * beside the specs rather than inside one because two specs now need it, and a second copy is
 * a second fixture that drifts.
 *
 * ⚠️ **Not `desktop-rail-arrival-harness.ts`.** That harness answers no write command
 * (`write_vault_text_file` / `create_vault_text_file`), so a round registered through it
 * cannot reach `.ontology-atlas/rounds.json` — which is the whole point of these specs.
 */

export const VAULT_ROOT = "/Users/probe/Ontology Atlas/launch";
const HASH_A = "a".repeat(64);

function wikiPage(title: string, source: string): string {
  return [
    "---",
    `title: ${title}`,
    "created_by: agent:claude",
    "compiled_at: 2026-09-15T09:00:00Z",
    "sources:",
    `  - ${source}`,
    "source_hash:",
    `  ${source}: ${HASH_A}`,
    "status: draft",
    `summary: ${title}.`,
    "---",
    "",
    "## Summary",
    "",
    `${title} [[src:${source}#p1]].`,
    "",
    "## Facts",
    "",
    `- A fact [[src:${source}#p1]]`,
    "",
    "## Decisions",
    "",
    "## Open questions",
    "",
    "## Not in sources",
    "",
  ].join("\n");
}

/** Timestamps are built at page time so "today" and "yesterday" are the runner's, not the author's. */
const SEED_SCRIPT = `
  const day = (offsetDays, h, m, s = 0) => { const d = new Date(); d.setDate(d.getDate() + offsetDays); d.setHours(h, m, s, 0); return d; };
  const iso = (d) => d.toISOString();
  const rounds = { v: 1, rounds: [
    { id: "r-consistency", name: "Pages still match", kind: "consistency", cadence: { every: "hour" }, enabled: true, onStale: "redraft", createdAt: iso(day(-3, 9, 0)), lastPassAt: iso(day(0, 9, 0)), nextDueAt: iso(day(1, 9, 0)) },
    { id: "r-confluence", name: "Confluence", kind: "service", cadence: { daily: "07:30", weekdaysOnly: true }, enabled: true, connectorId: "c1", connectorName: "confluence", query: "pages changed in the last day", limit: 20, createdAt: iso(day(-3, 9, 0)), lastPassAt: iso(day(0, 7, 30)), nextDueAt: iso(day(1, 7, 30)) },
  ], lastAway: { from: iso(day(-1, 18, 30)), to: iso(day(0, 9, 2)) } };
  const held = (id, d) => ({ v: 1, id, roundId: "r-consistency", roundName: "Pages still match", kind: "consistency", startedAt: iso(d), endedAt: iso(new Date(d.getTime() + 3000)), outcome: "held", checked: 4, stale: [], written: [], refused: [], called: [], agentTurns: 0, summary: "", trigger: "clock" });
  const ledger = [
    held("p1", day(-1, 19, 0)),
    held("p2", day(-1, 20, 0)),
    { v: 1, id: "gap1", startedAt: iso(day(0, 1, 12)), endedAt: iso(day(0, 7, 28)), outcome: "asleep", checked: 0, stale: [], written: [], refused: [], called: [], agentTurns: 0, summary: "", trigger: "clock" },
    { v: 1, id: "p3", roundId: "r-confluence", roundName: "Confluence", kind: "service", startedAt: iso(day(0, 7, 30)), endedAt: iso(day(0, 7, 33)), outcome: "redrafted", checked: 4, stale: [], written: ["sources/onboarding.md", "wiki/onboarding.md"], refused: ["mcp__confluence__create_page"], called: ["mcp__confluence__search"], agentTurns: 1, summary: "", trigger: "catch-up" },
    { v: 1, id: "p4", roundId: "r-consistency", roundName: "Pages still match", kind: "consistency", startedAt: iso(day(0, 8, 0)), endedAt: iso(day(0, 8, 0, 4)), outcome: "stale", checked: 4, stale: ["wiki/design-system"], written: [], refused: [], called: [], agentTurns: 0, summary: "", trigger: "catch-up" },
    held("p5", day(0, 9, 0)),
  ];
  files[".ontology-atlas/rounds.json"] = JSON.stringify(rounds, null, 2) + "\\n";
  files[".ontology-atlas/rounds-ledger.jsonl"] = ledger.map((e) => JSON.stringify(e)).join("\\n") + "\\n";
`;

const VAULT: Record<string, string> = {
  "project.md": ["---", "kind: project", "slug: launch", "title: Launch", "---", "", "# Launch", ""].join("\n"),
  "sources/payments-api.md": "---\nsource_url: https://example.atlassian.net/wiki/1\n---\n# Payments API\n",
  "sources/design-system.pdf": "%PDF-1.7 design system\n",
  "sources/onboarding.md": "---\nsource_url: https://example.atlassian.net/wiki/3\n---\n# Onboarding\n",
  "wiki/payments-api.md": wikiPage("Payments API", "sources/payments-api.md"),
  "wiki/design-system.md": wikiPage("Design system", "sources/design-system.pdf"),
  "wiki/onboarding.md": wikiPage("Onboarding", "sources/onboarding.md"),
  ".ontology-atlas/.gitignore": "*\n",
  ".ontology-atlas/connectors.json": JSON.stringify({
    version: 1,
    connectors: [
      { id: "c1", name: "confluence", transport: "http", args: [], url: "https://mcp.atlassian.com/v1/mcp", env: [], headers: [], enabled: true },
    ],
  }),
};

const RUNTIME = {
  id: "claude-code",
  label: "Claude Agent",
  description: "",
  website: null,
  license: null,
  verified: true,
  icon: null,
  brandInk: null,
  launchKind: "npx",
  state: "ready",
  cliPath: "/opt/homebrew/bin/claude",
  adapterPath: null,
  adapterPackage: "@agentclientprotocol/claude-agent-acp",
  isolated: true,
};

export async function installDesktopBridge(page: Page, options: { seedRounds: boolean }) {
  await page.addInitScript(
    ({ files, runtime, rootPath, seed }) => {
      const MTIME = 1_757_000_000_000;
      const encoder = new TextEncoder();
      if (seed) {
        new Function("files", seed)(files);
      }
      const listDirectory = (relative: string) => {
        const prefix = relative ? `${relative}/` : "";
        const seen = new Map<string, "file" | "directory">();
        for (const path of Object.keys(files)) {
          if (!path.startsWith(prefix)) continue;
          const rest = path.slice(prefix.length);
          if (!rest) continue;
          const slash = rest.indexOf("/");
          if (slash < 0) seen.set(rest, "file");
          else seen.set(rest.slice(0, slash), "directory");
        }
        return [...seen].map(([name, kind]) => ({ name, kind }));
      };
      const answer = (command: string, args: Record<string, unknown> = {}): unknown => {
        const relative = String(args.relativePath ?? "");
        switch (command) {
          case "pick_vault_directory":
            return rootPath;
          case "list_vault_directory":
            return listDirectory(relative);
          case "vault_path_exists":
            if (args.kind === "directory") {
              return relative === "" || Object.keys(files).some((path) => path.startsWith(`${relative}/`));
            }
            return relative in files;
          case "read_vault_text_file":
            if (!(relative in files)) throw new Error(`missing ${relative}`);
            return { text: files[relative], lastModified: MTIME };
          case "read_vault_binary_file":
            if (!(relative in files)) throw new Error(`missing ${relative}`);
            return { bytes: [...encoder.encode(files[relative])], lastModified: MTIME };
          case "write_vault_text_file":
            files[relative] = String(args.content ?? "");
            return null;
          case "create_vault_text_file":
            files[relative] = String(args.content ?? "");
            return true;
          case "ensure_vault_directory":
            return null;
          case "vault_fingerprint":
            return {
              entries: Object.entries(files)
                .filter(([path]) => path.endsWith(".md") || path.startsWith("sources/"))
                .map(([path, body]) => ({ relativePath: path, lastModified: MTIME, size: encoder.encode(body).length })),
              truncated: false,
              prunedDirs: [],
            };
          case "hash_vault_files":
            return (args.relativePaths as string[]).map((relativePath) => ({ relativePath, sha256: "a".repeat(64) }));
          case "acp_detect_runtimes":
            return [runtime];
          case "mcp_bundled_server":
            return { path: "/Applications/Ontology Atlas.app/mcp", available: true, reason: null };
          case "discover_source_candidates":
            return { candidates: [], truncated: false, unreadableRoots: [] };
          case "discover_mcp_connectors":
            return { servers: [], problems: [] };
          case "start_vault_watch":
            return null;
          case "connector_secret_status":
            return { present: false };
          default:
            return undefined;
        }
      };
      (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {
        transformCallback: (cb: unknown) => cb,
        invoke: (command: string, args?: Record<string, unknown>) => {
          try {
            const value = answer(command, args ?? {});
            return value === undefined ? Promise.reject(new Error(`no stub for ${command}`)) : Promise.resolve(value);
          } catch (error) {
            return Promise.reject(error);
          }
        },
      };
      (window as unknown as { isTauri?: boolean }).isTauri = true;
      (window as unknown as { __roundsStubFiles?: Record<string, string> }).__roundsStubFiles = files;
    },
    { files: { ...VAULT }, runtime: RUNTIME, rootPath: VAULT_ROOT, seed: options.seedRounds ? SEED_SCRIPT : "" },
  );
}

export async function openRounds(page: Page) {
  await page.goto("/en/docs/");
  await page.waitForLoadState("networkidle");
  const door = page.getByRole("button", { name: /^Open my folder/ });
  await door.first().waitFor({ timeout: 25_000 });
  await door.first().click();
  await page.getByRole("heading", { name: "Map", level: 1 }).waitFor({ timeout: 30_000 });
  await page.getByTestId("app-nav-rail").getByRole("link", { name: "Library" }).click();
  await page.getByTestId("library-workspace-rounds").waitFor({ timeout: 30_000 });
  await page.getByTestId("library-workspace-rounds").click();
  await page.getByTestId("library-rounds").waitFor({ timeout: 30_000 });
}

