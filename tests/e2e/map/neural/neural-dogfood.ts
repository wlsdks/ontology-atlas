import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
import { parseFrontmatter } from "../../../../src/shared/lib/vault-document/parse-frontmatter";
import { judgeEvidence } from "../../../../src/shared/lib/git/evidence-verdict.mjs";
import { installDesktopRailRuntime, type StubPathChange } from "../../desktop-rail-arrival-harness";
import { seedFirstRunSeen } from "../../first-run-seed";
import { waitForDomeEntered } from "../../settle";
import { stubDirectoryPicker } from "../../vault-picker-stub";

/**
 * The dogfood vault opened in Neural through the installed-app runtime, with the Git walk answered
 * by a fixed clock, and the map probe Neural's specs read.
 */

const REPO = path.resolve(__dirname, "../../../..");
const VAULT = path.join(REPO, "docs/ontology");

interface VaultDocFacts {
  rel: string;
  kind: string;
  slug: string;
  path: string | null;
  elements: string[];
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const abs = path.join(dir, name);
    if (statSync(abs).isDirectory()) walk(abs, out);
    else if (name.endsWith(".md")) out.push(abs);
  }
  return out;
}

/** Every document was last written at this time. */
const DOC_CHANGED_AT = "2026-06-01T00:00:00+00:00";

/**
 * One source path in four changed after the documents, chosen by the path's own text. A CI checkout
 * carries one commit, whose history calls nothing stale, so the clock is the spec's own.
 */
function sourceChangedAt(repoRelative: string): string {
  let sum = 0;
  for (const ch of repoRelative) sum += ch.codePointAt(0)!;
  return sum % 4 === 0 ? "2026-07-01T00:00:00+00:00" : "2026-05-01T00:00:00+00:00";
}

export const idOf = (kind: string, slug: string) => `${kind}:${slug.split("/").pop()}`;

/** The vault's files, the Git walk's answers, and the concepts the rule calls stale. */
export function dogfoodVault(): { files: Record<string, string>; changes: Record<string, StubPathChange>; stale: Set<string> } {
  const files: Record<string, string> = {};
  const docs: VaultDocFacts[] = [];
  for (const abs of walk(VAULT)) {
    const rel = path.relative(VAULT, abs);
    const text = readFileSync(abs, "utf8");
    files[rel] = text;
    const data = parseFrontmatter(text).frontmatter;
    if (typeof data.kind !== "string" || typeof data.slug !== "string") continue;
    docs.push({
      rel,
      kind: data.kind,
      slug: data.slug,
      path: typeof data.path === "string" ? data.path : null,
      elements: Array.isArray(data.elements) ? data.elements.filter((e): e is string => typeof e === "string") : [],
    });
  }
  const pathBySlug = new Map(docs.filter((d) => d.path).map((d) => [d.slug, d.path!]));
  const changes: Record<string, StubPathChange> = {};
  const repoChange = (p: string): StubPathChange => {
    if (changes[p]) return changes[p]!;
    const abs = path.join(REPO, p);
    const exists = existsSync(abs);
    const change = { exists, isDir: exists && statSync(abs).isDirectory(), lastChangedAt: exists ? sourceChangedAt(p) : null };
    changes[p] = change;
    return change;
  };
  const stale = new Set<string>();
  for (const doc of docs) {
    const docKey = `${doc.slug}.md`;
    changes[docKey] = { exists: true, isDir: false, lastChangedAt: DOC_CHANGED_AT };
    const paths = new Set<string>();
    if (doc.path) paths.add(doc.path);
    for (const e of doc.elements) {
      const p = pathBySlug.get(e);
      if (p) paths.add(p);
    }
    const verdict = judgeEvidence({
      docChangedAt: changes[docKey]!.lastChangedAt,
      entries: [...paths].map((p) => ({ path: p, change: repoChange(p) })),
    }).verdict;
    if (["project", "domain", "capability", "element"].includes(doc.kind) && (verdict === "stale" || verdict === "missing")) {
      stale.add(idOf(doc.kind, doc.slug));
    }
  }
  return { files, changes, stale };
}

export type NeuralLit = {
  focusId: string | null;
  selected: boolean;
  needs: string[];
  usedBy: string[];
  impact: Record<string, number> | null;
  spread: number;
  hops: number;
  liftedCells: number;
  plateFacts: string | null;
};

export type Probe = {
  nodes: () => Array<{ id: string; kind: string; x: number; y: number; radius: number; hidden: boolean }>;
  camera: () => { x: number; y: number; scale: number } | null;
  selection: () => { nodeId: string | null };
  hover: () => string | null;
  idleDebug: () => { lastActive: { t: number } | null };
  dome: () => {
    yaw: number;
    pitch: number;
    poseTween: boolean;
    flight: string | null;
    flyPending: boolean;
    light: { current: number; stale: number; unknown: number };
    neural: NeuralLit;
  } | null;
};

/** Reads the page's map probe. `read` must be self-contained: it is sent as source. */
export const probe = <T>(page: Page, read: (p: Probe) => T) =>
  page.evaluate(`(${read.toString()})(window.__atlasMap)`) as Promise<T>;

export async function openNeural(page: Page, runtime: "desktop" | "web" = "desktop", width = 1512) {
  const vault = dogfoodVault();
  await page.setViewportSize({ width, height: Math.round((width * 982) / 1512) });
  if (runtime === "web") {
    await seedFirstRunSeen(page);
    await stubDirectoryPicker(page, vault.files);
    await page.goto("/ko/topology/?guides=off&e2e=1&view=neural", { waitUntil: "domcontentloaded" });
    await page.getByTestId("first-run-starter-open").click();
    await page.getByTestId("vault-guide-pick-existing").click();
  } else {
    await installDesktopRailRuntime(page, vault.files, undefined, { replaceFixture: true, gitPathChanges: vault.changes });
    await page.goto("/ko/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
    await page.getByTestId("first-run-open").click();
    await page.getByTestId("topology-view-3d").click();
    await page.getByTestId("topology-view-3d-choice-neural").click();
  }
  // The starter's own Neural may already be drawn; the claims are about this vault.
  await expect.poll(() => probe(page, (p) => p.nodes().some((n) => n.id === "capability:mcp-tool-server")), { timeout: 60_000 }).toBe(true);
  await waitForDomeEntered(page, 60_000);
  const legend = page.getByTestId("topology-neural-legend");
  if (runtime === "desktop") await expect(legend).toHaveAttribute("data-evidence-availability", "measured", { timeout: 30_000 });
  return { vault, legend };
}
