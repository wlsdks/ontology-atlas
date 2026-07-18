import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { parseFrontmatter } from "./parse-frontmatter.mjs";

export function countMarkdownFiles(root) {
  if (!existsSync(root)) return 0;
  const stats = statSync(root);
  if (stats.isFile()) return root.endsWith(".md") ? 1 : 0;
  if (!stats.isDirectory()) return 0;
  let count = 0;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      count += countMarkdownFiles(full);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      count += 1;
    }
  }
  return count;
}

function markdownFiles(root) {
  if (!existsSync(root)) return [];
  const stats = statSync(root);
  if (stats.isFile()) return root.endsWith(".md") ? [root] : [];
  if (!stats.isDirectory()) return [];
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...markdownFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(full);
    }
  }
  return files;
}

export function dogfoodVaultCensus(root) {
  const ontologyRoot = join(root, "docs", "ontology");
  const files = markdownFiles(ontologyRoot);
  const docs = files.map((file) => parseFrontmatter(readFileSync(file, "utf-8")));

  return dogfoodVaultCensusFromDocs(docs, files.length);
}

const CONCEPT_KINDS = new Set([
  "project",
  "domain",
  "capability",
  "element",
  "document",
]);

// 관계로 세는 frontmatter array 키 — containment 3종 + typed relation 계열.
// tags / aliases 같은 메타 배열은 관계가 아니므로 allowlist 방식.
const RELATION_KEYS = [
  "domains",
  "capabilities",
  "elements",
  "relates",
  "dependencies",
  "describes",
  "depends",
  "depends_on",
  "uses",
  "implements",
  "refines",
  "supports",
];

function normalizeSlug(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const segments = trimmed.split("/");
  return segments[segments.length - 1] || null;
}

/**
 * 랜딩 히어로의 "정직한 topology 미니어처" 데이터 —
 * 실제 dogfood vault frontmatter 에서만 유도한다 (장식 숫자 금지 계약).
 *
 * - concepts: vault-readme 제외 ontology kind 노드 수
 * - relations: containment(domains/capabilities/elements) + typed relation 배열 항목 수
 * - domains: project 아래 그릴 domain 칩 목록 (slug 정규화 + 정렬)
 * - domainRelates: domain 간 relates 무향 dedupe 쌍 (점선 trace 용)
 * - hub: 가장 많이 참조된 capability (허브 원 1개)
 */
export function dogfoodVaultGraphSummary(docs) {
  const rows = Array.isArray(docs) ? docs : [];
  const concepts = [];
  for (const doc of rows) {
    const fm = doc?.frontmatter;
    if (!fm || typeof fm !== "object") continue;
    if (!CONCEPT_KINDS.has(fm.kind)) continue;
    concepts.push(fm);
  }

  let relations = 0;
  for (const fm of concepts) {
    for (const key of RELATION_KEYS) {
      const value = fm[key];
      if (Array.isArray(value)) relations += value.length;
    }
  }

  const domains = concepts
    .filter((fm) => fm.kind === "domain")
    .map((fm) => ({
      slug: normalizeSlug(fm.slug),
      title: typeof fm.title === "string" ? fm.title : normalizeSlug(fm.slug),
    }))
    .filter((d) => d.slug !== null)
    .sort((a, b) => a.slug.localeCompare(b.slug));
  const domainSlugs = new Set(domains.map((d) => d.slug));

  const pairKeys = new Set();
  const domainRelates = [];
  for (const fm of concepts) {
    if (fm.kind !== "domain") continue;
    const from = normalizeSlug(fm.slug);
    if (!from || !Array.isArray(fm.relates)) continue;
    for (const target of fm.relates) {
      const to = normalizeSlug(target);
      if (!to || to === from || !domainSlugs.has(to)) continue;
      const pair = from < to ? [from, to] : [to, from];
      const key = pair.join("→");
      if (pairKeys.has(key)) continue;
      pairKeys.add(key);
      domainRelates.push(pair);
    }
  }

  const capabilityBySlug = new Map();
  for (const fm of concepts) {
    if (fm.kind !== "capability") continue;
    const slug = normalizeSlug(fm.slug);
    if (!slug) continue;
    capabilityBySlug.set(slug, {
      slug,
      title: typeof fm.title === "string" ? fm.title : slug,
    });
  }
  const referenceCount = new Map();
  for (const fm of concepts) {
    for (const key of RELATION_KEYS) {
      const value = fm[key];
      if (!Array.isArray(value)) continue;
      for (const target of value) {
        const slug = normalizeSlug(target);
        if (!slug || !capabilityBySlug.has(slug)) continue;
        referenceCount.set(slug, (referenceCount.get(slug) ?? 0) + 1);
      }
    }
  }
  let hub = null;
  let hubCount = -1;
  for (const [slug, count] of [...referenceCount.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    if (count > hubCount) {
      hub = capabilityBySlug.get(slug);
      hubCount = count;
    }
  }
  if (hub) {
    // 허브 원을 소유 domain 칩 옆에 앵커하기 위한 owning domain (contains).
    let owningDomain = null;
    for (const fm of concepts) {
      if (fm.kind !== "domain" || !Array.isArray(fm.capabilities)) continue;
      const slug = normalizeSlug(fm.slug);
      if (!slug) continue;
      if (fm.capabilities.some((c) => normalizeSlug(c) === hub.slug)) {
        if (owningDomain === null || slug.localeCompare(owningDomain) < 0) {
          owningDomain = slug;
        }
      }
    }
    hub = { ...hub, domain: owningDomain };
  }

  return {
    concepts: concepts.length,
    relations,
    domains,
    domainRelates,
    hub,
  };
}

export function dogfoodVaultCensusFromDocs(docs, fileCount) {
  const rows = Array.isArray(docs) ? docs : [];
  const safeFileCount = Number.isInteger(fileCount) && fileCount >= 0 ? fileCount : rows.length;
  const byKind = {
    capabilities: 0,
    document: 0,
    domains: 0,
    elements: 0,
    project: 0,
    "vault-readme": 0,
  };
  for (const doc of rows) {
    const kind = doc?.frontmatter?.kind;
    if (kind === "capability") byKind.capabilities += 1;
    if (kind === "document") byKind.document += 1;
    if (kind === "domain") byKind.domains += 1;
    if (kind === "element") byKind.elements += 1;
    if (kind === "project") byKind.project += 1;
    if (kind === "vault-readme") byKind["vault-readme"] += 1;
  }
  const total = Object.values(byKind).reduce((sum, count) => sum + count, 0);

  return {
    files: safeFileCount,
    total,
    byKind,
  };
}
