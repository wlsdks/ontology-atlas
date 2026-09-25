import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { parseFrontmatter } from "../../src/shared/lib/parse-frontmatter";
import { judgeEvidence } from "../../src/shared/lib/evidence-verdict.mjs";
import type { StubPathChange } from "./desktop-rail-arrival-harness";

/**
 * Vaults for the hex board specs: the product's own dogfood vault with the Git walk answered
 * from this repository's real history (and the stale count the product's rule gives), and a
 * synthetic 300-capability vault for the far band.
 */

const REPO = path.resolve(__dirname, "../..");
const VAULT = path.join(REPO, "docs/ontology");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const abs = path.join(dir, name);
    if (statSync(abs).isDirectory()) walk(abs, out);
    else if (name.endsWith(".md")) out.push(abs);
  }
  return out;
}

function gitTime(repoRelative: string): string | null {
  try {
    const out = execFileSync("git", ["log", "-1", "--format=%cI", "--", repoRelative], { cwd: REPO }).toString().trim();
    return out || null;
  } catch {
    return null;
  }
}

export interface DogfoodVault {
  files: Record<string, string>;
  changes: Record<string, StubPathChange>;
  expectedStale: number;
  capabilities: number;
  domains: number;
}

export function dogfoodEvidenceVault(): DogfoodVault {
  const files: Record<string, string> = {};
  const docs: { rel: string; kind: string; slug: string; path: string | null; elements: string[] }[] = [];
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
    const change = { exists, isDir: exists && statSync(abs).isDirectory(), lastChangedAt: exists ? gitTime(p) : null };
    changes[p] = change;
    return change;
  };
  let expectedStale = 0;
  let capabilities = 0;
  let domains = 0;
  for (const doc of docs) {
    const docKey = `${doc.slug}.md`;
    changes[docKey] = { exists: true, isDir: false, lastChangedAt: gitTime(path.join("docs/ontology", doc.rel)) };
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
    if (doc.kind === "domain") domains += 1;
    if (doc.kind === "capability") {
      capabilities += 1;
      if (verdict === "stale" || verdict === "missing") expectedStale += 1;
    }
  }
  return { files, changes, expectedStale, capabilities, domains };
}

/** `capabilities` capabilities over `domains` domains, unevenly, with a few elements and dependencies. */
export function syntheticVault(capabilities: number, domainCount: number): Record<string, string> {
  const files: Record<string, string> = {};
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const domainSlugs = Array.from({ length: domainCount }, (_, d) => `domains/synthetic-${letters[d]!.toLowerCase()}`);
  files["synthetic-project.md"] = `---\nslug: synthetic-project\nkind: project\ntitle: Synthetic project\ndisplay_ko: 합성 프로젝트\ndomains: [${domainSlugs.join(", ")}]\n---\n\nA synthetic project for the scale study.\n`;
  const capsOf = new Map<string, string[]>();
  for (let c = 0; c < capabilities; c++) {
    // Uneven: the first three domains take most of the load.
    const d = c < capabilities / 2 ? c % 3 : 3 + ((c * 7) % (domainCount - 3));
    const slug = `capabilities/synthetic-${String(c).padStart(3, "0")}`;
    (capsOf.get(domainSlugs[d]!) ?? capsOf.set(domainSlugs[d]!, []).get(domainSlugs[d]!)!).push(slug);
    const target = (c * 7919 + 13) % capabilities;
    const deps = c % 3 === 0 && target !== c ? [`capabilities/synthetic-${String(target).padStart(3, "0")}`] : [];
    files[`${slug}.md`] = `---\nslug: ${slug}\nkind: capability\ntitle: Synthetic capability ${c}\ndisplay_ko: 합성 역량 ${c}\ndomain: ${domainSlugs[d]}\ndependencies: [${deps.join(", ")}]\n---\n\nSynthetic capability ${c}.\n`;
  }
  domainSlugs.forEach((slug, d) => {
    files[`${slug}.md`] = `---\nslug: ${slug}\nkind: domain\ntitle: Synthetic domain ${letters[d]}\ndisplay_ko: 합성 도메인 ${letters[d]}\ncapabilities: [${(capsOf.get(slug) ?? []).join(", ")}]\n---\n\nSynthetic domain ${letters[d]}.\n`;
  });
  return files;
}
