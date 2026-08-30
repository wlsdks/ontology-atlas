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
 *
 * Graph-linking contract (consistent with derive-ontology-from-vault.ts):
 * - an element's `domain: <name>` → a `domain:slugifyName(name)` stub node plus a domain→element
 *   contains edge
 * - a project's `domains: [<name>...]` → resolves to the same id → project→domain
 * - the two paths' slugs must agree for the graph to connect, so both use the same original name.
 */

import { generateNodeUid, slugifyName } from '@/entities/docs-vault';

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
