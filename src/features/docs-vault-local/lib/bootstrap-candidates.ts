/**
 * "Start an ontology from my documents" — derives ontology candidates deterministically from an
 * already-scanned vault manifest (no AI, nothing transmitted, no side effects).
 *
 * **Why it exists**: the starter seed fires only in an empty folder, so a target user who already
 * has `.md` files lands in a "0 concepts" dead end. This module catches that moment (md ≥ 1 and
 * ontology nodes = 0) and builds a first graph from the user's own documents — the browser
 * equivalent of the CLI's `bootstrap` and MCP's `analyze_repo_structure`.
 *
 * Candidate rules (the simplicity is deliberate — three kinds, containment relations only):
 * - the root README sources the project title (the file itself is never touched, to avoid exposing
 *   a frontmatter table in GitHub's rendering)
 * - a one-deep folder → domain candidate (only folders holding at least one md)
 * - every other `.md` → element candidate, with `domain:` set to its own top-level folder
 * - a root-level `.md` (README excepted) → an element with no domain, linked directly by
 *   project.md's `elements:` array (derive-ontology's elements[] rule)
 * - files somebody else owns are never candidates and are tallied instead, so the screen can say
 *   why they are missing: runtime-owned `SKILL.md`, agent pointer documents, and the Library's
 *   own `sources/`, `wiki/` and `.ontology-atlas/` folders (each has its own note below)
 *
 * Graph-linking contract (consistent with derive-ontology-from-vault.ts):
 * - an element's `domain: <name>` → a `domain:slugifyName(name)` stub node plus a domain→element
 *   contains edge
 * - a project's `domains: [<name>...]` → resolves to the same id → project→domain
 * - the two paths' slugs must agree for the graph to connect, so both use the same original name.
 */

import { generateNodeUid, slugifyName } from '@/entities/docs-vault';
import { VAULT_SIDECAR_DIR } from '@/shared/lib/vault-sidecar';
import { WIKI_DIR, WIKI_SOURCES_DIR } from '@/shared/lib/wiki-page-schema';

export interface BootstrapDocInput {
  slug: string;
  title: string;
  /** frontmatter — used to exclude documents that already carry a `kind:`. */
  frontmatter: Record<string, unknown>;
}

export interface BootstrapElementCandidate {
  slug: string;
  title: string;
  /** Top-level folder name; null for a root document (project.md links it directly). */
  domain: string | null;
}

export interface BootstrapDomainCandidate {
  name: string;
  docCount: number;
}

export interface BootstrapPlan {
  projectTitle: string;
  /** Slug of the project document to create; an alternative slug when it collides with an existing file. */
  projectSlug: string;
  /**
   * The slug of an existing `kind: project` document, when the vault already has one. In that case
   * no new project file is created (avoiding two projects) and the approved domains are appended to
   * the existing document's `domains:`.
   */
  existingProjectSlug: string | null;
  domains: BootstrapDomainCandidate[];
  elements: BootstrapElementCandidate[];
  /** How many documents already carry a `kind:` — used to explain a partially built vault. */
  alreadyTypedCount: number;
  /** How many were excluded as runtime-owned `SKILL.md` — so the screen can say **why** they are missing. */
  runtimeOwnedSkipped: number;
  /** How many were excluded as agent pointer documents (`AGENTS.md`, `CLAUDE.md`, `.claude/**` …). */
  agentPointerSkipped: number;
  /** How many were excluded as the Library's own files (`sources/`, `wiki/`, `.ontology-atlas/`). */
  librarySkipped: number;
}

function hasOwnKind(fm: Record<string, unknown>): boolean {
  return typeof fm.kind === 'string' && fm.kind.trim() !== '';
}

function isRootReadme(slug: string): boolean {
  return slug.toLowerCase() === 'readme';
}

/**
 * **Is this file owned by an agent runtime?** If so, we do not write to it.
 *
 * **What happened** (found in the PO council, 2026-08-09). "Build a map from my documents" treats
 * **any slug** in `manifest.docs` as a candidate and, on approval, writes `uid`, `kind`, and
 * `title` into that file's frontmatter. But when a user opens a skills folder
 * (`~/.claude/skills`, a plugin folder) as their document store, **the `SKILL.md` files come
 * straight into that list** — measured: opening one marketplace folder produced 105 candidates,
 * all of them `SKILL.md`.
 *
 * Those files are **owned by the Claude runtime and the marketplace.** Their spec has only `name`
 * and `description`; `kind` is ours. Writing our keys there means:
 *
 * - reinstalling the plugin **erases** what we wrote (that folder is a git checkout and an update
 *   overwrites it — confirmed by measurement),
 * - **we** break trust-charter promise ④, that the data is always plain markdown you can carry away,
 * - and the screen calls that action "raising", not writing.
 *
 * The 2026-07-29 council blocked a "skill editor", but **this path shipped unblocked.** Whichever
 * way the verdict went, this is a defect.
 *
 * The test follows the official spec exactly: the file is named `SKILL.md`, its frontmatter has both
 * required keys (`name`, `description`), and it has no `kind`. Only all three together exclude it —
 * a `SKILL.md` a user wrote in their own vault is still read by the runtime if it has this shape, so
 * the same judgement is correct there.
 */
function isRuntimeOwnedSkill(slug: string, fm: Record<string, unknown>): boolean {
  const fileName = slug.split('/').pop() ?? '';
  if (fileName.toLowerCase() !== 'skill') return false;
  const hasName = typeof fm.name === 'string' && fm.name.trim() !== '';
  const hasDescription = typeof fm.description === 'string' && fm.description.trim() !== '';
  return hasName && hasDescription && !hasOwnKind(fm);
}

/**
 * **Is this document an agent pointer rather than a concept?**
 *
 * The starter itself writes `AGENTS.md` and its `CLAUDE.md` bridge into every new folder
 * (`entities/vault-session/lib/ontology-starter.ts`, mirroring `cli/templates/vault/`). Those two
 * files carry no `kind:`, so "start an ontology from my documents" counted them as ordinary
 * uncataloged documents — and one click after "start from an empty folder" the INDEX offered to
 * put **the starter's own instruction files** on the map. Measured on 2026-09-04: a freshly
 * started folder showed "2 docs not on the map" and the dialog proposed stamping `kind:` on
 * `AGENTS.md` and `CLAUDE.md`.
 *
 * They are addressed to a program, not to a person building a graph: an agent reads them to learn
 * how to use the vault. Stamping `kind: element` on them adds a node that means nothing, and the
 * next starter run (or a CLI template refresh) rewrites the file anyway — the same failure mode as
 * the runtime-owned `SKILL.md` above.
 *
 * The rule stays narrow so a user's own writing is never swallowed: only the three root-level
 * pointer names, plus anything inside an agent runtime's own directory.
 */
const AGENT_POINTER_ROOT_SLUGS = new Set(['agents', 'claude', 'gemini']);
const AGENT_RUNTIME_DIRS = ['.claude/', '.agents/', '.codex/'];

function isAgentPointerDoc(slug: string): boolean {
  if (AGENT_RUNTIME_DIRS.some((dir) => slug.startsWith(dir))) return true;
  return !slug.includes('/') && AGENT_POINTER_ROOT_SLUGS.has(slug.toLowerCase());
}

/**
 * **Is this document the Library's own, rather than a concept somebody wrote?**
 *
 * The vault shape the starter writes is one folder holding `sources/` (raw documents kept
 * verbatim, never edited by us) and `wiki/` (what Compile made of them, plus the
 * `_template.md`/`_log.md` furniture). Neither carries a `kind:`, so every one of them
 * counted as an "uncataloged document": measured 2026-09-20 on a dogfood folder, the INDEX
 * row offered to add seven documents to the map when the only kind-less files were six raw
 * sources and the wiki's pages.
 *
 * One press would have stamped `kind: element` onto them. That is wrong twice over. A raw
 * source is a copy of somebody else's document — writing frontmatter into it breaks the
 * verbatim promise the Library is built on, and the citation hashes recorded against it no
 * longer match the bytes. A wiki page is a *statement about* sources, already addressed by
 * the Library's own screens and rewritten in place by the next Compile run — the same
 * "the owner rewrites the file" failure mode as the runtime-owned `SKILL.md` above.
 *
 * The sidecar joins them because `.ontology-atlas/` is Atlas's own runtime state (activity
 * log, connectors, ledgers), not the ontology. The browser walk prunes dotfiles before the
 * manifest, so it never arrives from there today; naming it here keeps that true for any
 * other walk that does not.
 *
 * The rule is anchored at the vault root exactly as the walk anchors it
 * (`build-local-manifest.ts`): `notes/wiki/plan.md` is a person's own document and stays a
 * candidate, because "everything under this one top-level name" is the rule a person can
 * hold in their head.
 */
const LIBRARY_OWNED_DIRS = [WIKI_SOURCES_DIR, WIKI_DIR, VAULT_SIDECAR_DIR];

function isLibraryOwnedDoc(slug: string): boolean {
  return LIBRARY_OWNED_DIRS.some((dir) => slug.startsWith(`${dir}/`));
}

/**
 * Manifest document list → a bootstrap plan. Safe even when the input already contains documents
 * with ontology nodes (those drop out of the candidates and are only tallied into
 * `alreadyTypedCount`).
 */
export function deriveBootstrapPlan(
  docs: readonly BootstrapDocInput[],
  vaultName: string,
): BootstrapPlan {
  const existingSlugs = new Set(docs.map((d) => d.slug));
  const existingProject = docs.find(
    (d) => typeof d.frontmatter.kind === 'string' && d.frontmatter.kind.trim() === 'project',
  );
  let projectTitle = vaultName.trim() || 'my-project';
  let alreadyTypedCount = 0;
  let runtimeOwnedSkipped = 0;
  let agentPointerSkipped = 0;
  let librarySkipped = 0;
  const domainCounts = new Map<string, number>();
  const elements: BootstrapElementCandidate[] = [];

  for (const doc of docs) {
    if (hasOwnKind(doc.frontmatter)) {
      alreadyTypedCount += 1;
      continue;
    }
    if (isRuntimeOwnedSkill(doc.slug, doc.frontmatter)) {
      // Someone else's file — excluded from the candidates, and counted so the screen can say how many.
      runtimeOwnedSkipped += 1;
      continue;
    }
    if (isAgentPointerDoc(doc.slug)) {
      // The starter's own instruction files — excluded, and counted so the screen can say how many.
      agentPointerSkipped += 1;
      continue;
    }
    if (isLibraryOwnedDoc(doc.slug)) {
      // The Library's raw sources and wiki pages — excluded, and counted so the screen can say how many.
      librarySkipped += 1;
      continue;
    }
    if (isRootReadme(doc.slug)) {
      if (doc.title.trim()) projectTitle = doc.title.trim();
      continue;
    }
    const segments = doc.slug.split('/');
    const topFolder = segments.length > 1 ? segments[0] : null;
    if (topFolder) domainCounts.set(topFolder, (domainCounts.get(topFolder) ?? 0) + 1);
    elements.push({
      slug: doc.slug,
      title: doc.title.trim() || segments[segments.length - 1],
      domain: topFolder,
    });
  }

  const domains = [...domainCounts.entries()]
    .map(([name, docCount]) => ({ name, docCount }))
    .sort((a, b) => b.docCount - a.docCount || a.name.localeCompare(b.name));

  return {
    projectTitle: existingProject
      ? String(existingProject.frontmatter.title ?? projectTitle) || projectTitle
      : projectTitle,
    projectSlug: existingSlugs.has('project') ? 'ontology-project' : 'project',
    existingProjectSlug: existingProject?.slug ?? null,
    domains,
    elements,
    alreadyTypedCount,
    runtimeOwnedSkipped,
    agentPointerSkipped,
    librarySkipped,
  };
}

/** Computes the elements that will actually be written, given the current selection. */
export function selectedElements(
  plan: BootstrapPlan,
  acceptedDomains: ReadonlySet<string>,
): BootstrapElementCandidate[] {
  return plan.elements.filter((el) => el.domain === null || acceptedDomains.has(el.domain));
}

/**
 * Promotion writes a domain as a real `.md` rather than a stub. The file tail must match derive's
 * `domain:slugifyName(name)` ref for the graph to connect (the same slugify rule is imported).
 */
export function domainDocSlug(name: string): string {
  const tail = slugifyName(name);
  return `${name}/${tail}`;
}

export function buildDomainMarkdown(domain: BootstrapDomainCandidate, uid?: string): string {
  return [
    '---',
    `uid: ${generateNodeUid(uid)}`,
    'kind: domain',
    `title: ${domain.name}`,
    '---',
    '',
    `# ${domain.name}`,
    '',
    `\`${domain.name}/\` 폴더의 문서 ${domain.docCount}개를 묶는 도메인입니다.`,
    '이 파일의 frontmatter 가 곧 그래프입니다 — 설명을 자유롭게 채우세요.',
    '',
  ].join('\n');
}

export function buildProjectMarkdown(
  plan: BootstrapPlan,
  acceptedDomains: ReadonlySet<string>,
  uid?: string,
): string {
  const lines: string[] = [
    '---',
    `uid: ${generateNodeUid(uid)}`,
    'kind: project',
    `title: ${plan.projectTitle}`,
  ];
  const domains = plan.domains.filter((d) => acceptedDomains.has(d.name));
  if (domains.length > 0) {
    lines.push('domains:');
    for (const d of domains) lines.push(`  - ${d.name}`);
  }
  const rootElements = plan.elements.filter((el) => el.domain === null);
  if (rootElements.length > 0) {
    lines.push('elements:');
    for (const el of rootElements) {
      lines.push(`  - ${el.slug.split('/').pop()}`);
    }
  }
  lines.push('---', '', `# ${plan.projectTitle}`, '');
  lines.push('이 문서는 "내 문서에서 온톨로지 시작하기"가 만든 프로젝트 노드입니다.');
  lines.push('제목·설명을 자유롭게 고치세요 — 이 파일의 frontmatter 가 곧 그래프입니다.');
  lines.push('');
  return lines.join('\n');
}
