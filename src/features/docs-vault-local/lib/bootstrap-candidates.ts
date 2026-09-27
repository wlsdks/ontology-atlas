/**
 * Derives ontology candidates deterministically from a scanned vault manifest (no AI, nothing
 * transmitted, no side effects) for a folder that has `.md` files but no ontology nodes; the
 * browser counterpart of the CLI `bootstrap` and MCP `analyze_repo_structure`.
 *
 * Candidate rules:
 * - the root README sources the project title (the file itself is never touched, so GitHub does
 *   not render a frontmatter table)
 * - a top-level folder holding at least one md → domain candidate
 * - every other `.md` → element candidate whose `domain:` is its top-level folder
 * - a root-level `.md` (README excepted) → an element with no domain, linked by project.md's
 *   `elements:` array (derive-ontology's elements[] rule)
 * - files somebody else owns are tallied instead, so the screen can say why they are missing
 *
 * An element's `domain: <name>` and a project's `domains: [<name>]` both resolve to
 * `domain:slugifyName(name)` (derive-ontology-from-vault.ts); both use the original name or the
 * graph does not connect.
 */

import { generateNodeUid, slugifyName } from '@/entities/docs-vault';
import { VAULT_SIDECAR_DIR } from '@/shared/lib/vault-sidecar';
import { WIKI_DIR, WIKI_SOURCES_DIR } from '@/shared/lib/wiki-page-schema';

export interface BootstrapDocInput {
  slug: string;
  title: string;
  /** Used to exclude documents that already carry a `kind:`. */
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
  /** An alternative slug when it collides with an existing file. */
  projectSlug: string;
  /**
   * An existing `kind: project` document; when set, no second project file is created and the
   * approved domains are appended to its `domains:`.
   */
  existingProjectSlug: string | null;
  domains: BootstrapDomainCandidate[];
  elements: BootstrapElementCandidate[];
  /** How many documents already carry a `kind:` — used to explain a partially built vault. */
  alreadyTypedCount: number;
  /** Runtime-owned `SKILL.md` files excluded, so the screen can say why they are missing. */
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
 * A `SKILL.md` with both spec keys (`name`, `description`) and no `kind` is owned by the agent
 * runtime or marketplace. Writing our keys there is erased on reinstall (the folder is a git
 * checkout) and breaks the plain-markdown promise. All three conditions are required; a user's
 * own `SKILL.md` of this shape is also read by the runtime, so the same judgement holds.
 */
function isRuntimeOwnedSkill(slug: string, fm: Record<string, unknown>): boolean {
  const fileName = slug.split('/').pop() ?? '';
  if (fileName.toLowerCase() !== 'skill') return false;
  const hasName = typeof fm.name === 'string' && fm.name.trim() !== '';
  const hasDescription = typeof fm.description === 'string' && fm.description.trim() !== '';
  return hasName && hasDescription && !hasOwnKind(fm);
}

/**
 * Agent pointer documents: the starter writes `AGENTS.md` and its `CLAUDE.md` bridge
 * (`entities/vault-session/lib/ontology-starter.ts`, mirroring `cli/templates/vault/`) and the
 * next starter run rewrites them, so a `kind:` stamped there means nothing. The rule stays narrow
 * so a user's own writing is never swallowed: the three root pointer names plus agent runtime dirs.
 */
const AGENT_POINTER_ROOT_SLUGS = new Set(['agents', 'claude', 'gemini']);
const AGENT_RUNTIME_DIRS = ['.claude/', '.agents/', '.codex/'];

function isAgentPointerDoc(slug: string): boolean {
  if (AGENT_RUNTIME_DIRS.some((dir) => slug.startsWith(dir))) return true;
  return !slug.includes('/') && AGENT_POINTER_ROOT_SLUGS.has(slug.toLowerCase());
}

/**
 * The Library's own files: `sources/` holds verbatim copies whose citation hashes break if
 * frontmatter is written, `wiki/` pages are rewritten by Compile, and `.ontology-atlas/` is runtime
 * state (the browser walk prunes dotfiles, but other walks may not). Anchored at the vault root
 * like `build-local-manifest.ts`, so `notes/wiki/plan.md` stays a person's document.
 */
const LIBRARY_OWNED_DIRS = [WIKI_SOURCES_DIR, WIKI_DIR, VAULT_SIDECAR_DIR];

function isLibraryOwnedDoc(slug: string): boolean {
  return LIBRARY_OWNED_DIRS.some((dir) => slug.startsWith(`${dir}/`));
}

/** Documents that already carry ontology nodes drop out and are tallied in `alreadyTypedCount`. */
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
      runtimeOwnedSkipped += 1;
      continue;
    }
    if (isAgentPointerDoc(doc.slug)) {
      agentPointerSkipped += 1;
      continue;
    }
    if (isLibraryOwnedDoc(doc.slug)) {
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

export function selectedElements(
  plan: BootstrapPlan,
  acceptedDomains: ReadonlySet<string>,
): BootstrapElementCandidate[] {
  return plan.elements.filter((el) => el.domain === null || acceptedDomains.has(el.domain));
}

/**
 * The file tail must match derive's `domain:slugifyName(name)` ref for the graph to connect.
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
