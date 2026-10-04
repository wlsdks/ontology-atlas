import {
  buildVaultMarkdown,
  vaultFolderForKind,
  vaultAgentCreatedBy,
  applyFrontmatterUpdates,
  type FrontmatterUpdateValue,
} from '@/entities/docs-vault';

import type {
  AgentProposal,
  ProposalChange,
  ProposalToolName,
  ProposedFileChange,
} from './types';
import type { VaultReadPort } from './vault-read-port';
import { containmentKeyFor } from '@/shared/lib/containment-keys';
import { parseFrontmatter } from '@/shared/lib/parse-frontmatter';

/** A model's attempted write becomes a proposal card; `after` is both what the card draws and what the applier writes. */

interface WriteIntent {
  name: string;
  args: unknown;
}

export interface BuildProposalInput {
  intents: readonly WriteIntent[];
  port: VaultReadPort;
  /** The nodes actually read this turn — the basis for the card's warning row. */
  readNodesThisTurn: readonly string[];
  /** When the vault is a git repository the save-point checkbox defaults to ON. */
  vaultIsGit: boolean;
  /** The screen's language — fills the per-locale name field of a new document. */
  locale: string;
  labels: ProposalLabels;
  /** The provider that drafted this turn, as the audit log records it; a person's [apply] is approval, not authorship. */
  agentName: string | null;
}

interface ProposalLabels {
  createFile: (path: string) => string;
  modifyFile: (path: string) => string;
  addRelation: (args: { from: string; to: string; type: string }) => string;
}

type Args = Record<string, unknown>;

function asArgs(value: unknown): Args {
  return value && typeof value === 'object' ? (value as Args) : {};
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** Appends a value to a frontmatter array key (duplicates are not appended). */
function appendRef(current: unknown, ref: string): string[] {
  const list = Array.isArray(current)
    ? current.filter((entry): entry is string => typeof entry === 'string')
    : typeof current === 'string' && current.trim()
      ? [current.trim()]
      : [];
  return list.includes(ref) ? list : [...list, ref];
}

/** `add_relation` type to frontmatter key, as MCP `add_relation` normalizes it. */
const RELATION_KEY: Record<string, string> = {
  depends_on: 'dependencies',
  dependencies: 'dependencies',
  relates: 'relates',
  contains: 'contains',
  describes: 'describes',
  domains: 'domains',
  domain: 'domain',
  capabilities: 'capabilities',
  elements: 'elements',
};

let proposalSeq = 0;
let changeSeq = 0;

export async function buildProposal(
  input: BuildProposalInput,
): Promise<AgentProposal | null> {
  const changes: ProposalChange[] = [];
  // Several edits to one file accumulate so the diff is drawn once.
  const pending = new Map<string, { before: string | null; after: string }>();

  async function currentText(slug: string): Promise<string | null> {
    const held = pending.get(slug);
    if (held) return held.after;
    return input.port.readDocText(slug);
  }

  const creationIntent = (intent: WriteIntent) => ['add_concept', 'add_concepts'].includes(intent.name);
  const orderedIntents = [...input.intents.filter(creationIntent), ...input.intents.filter(intent => !creationIntent(intent))];
  for (const intent of orderedIntents) {
    const args = asArgs(intent.args);
    switch (intent.name as ProposalToolName) {
      case 'add_concept': {
        const change = buildAddConcept(args, input, pending);
        if (change) changes.push(change);
        break;
      }
      case 'add_concepts': {
        const rows = Array.isArray(args.concepts) ? args.concepts : [];
        for (const row of rows) {
          const change = buildAddConcept(asArgs(row), input, pending);
          if (change) changes.push(change);
        }
        break;
      }
      case 'add_relation': {
        const change = await buildAddRelation(args, input, pending, currentText);
        if (change) changes.push(change);
        break;
      }
      case 'add_relations': {
        const rows = Array.isArray(args.relations) ? args.relations : [];
        for (const row of rows) {
          const change = await buildAddRelation(asArgs(row), input, pending, currentText);
          if (change) changes.push(change);
        }
        break;
      }
      case 'patch_concept': {
        const change = await buildPatch(args, input, pending, currentText);
        if (change) changes.push(change);
        break;
      }
      default:
        break;
    }
  }

  if (changes.length === 0) return null;
  proposalSeq += 1;
  return {
    id: `proposal-${proposalSeq}`,
    status: 'pending',
    changes,
    snapshotRequested: input.vaultIsGit,
    readNodesThisTurn: [...input.readNodesThisTurn],
  };
}

function nextChangeId(): string {
  changeSeq += 1;
  return `change-${changeSeq}`;
}

function record(
  pending: Map<string, { before: string | null; after: string }>,
  slug: string,
  before: string | null,
  after: string,
): ProposedFileChange {
  pending.set(slug, { before: pending.get(slug)?.before ?? before, after });
  return {
    path: `${slug}.md`,
    kind: before === null ? 'create' : 'modify',
    before,
    after,
  };
}

function buildAddConcept(
  args: Args,
  input: BuildProposalInput,
  pending: Map<string, { before: string | null; after: string }>,
): ProposalChange | null {
  const title = str(args.title);
  const kind = str(args.kind);
  if (!title || !kind) return null;
  const slug = str(args.slug) ?? `${vaultFolderForKind(kind)}/${title}`;
  const labels = asArgs(args.labels);
  const draft = buildVaultMarkdown({
    kind,
    title,
    slug,
    domain: str(args.domain),
    localeLabels: {
  // Fill the screen locale's name field, or the raw title shows to that locale's speakers.
      [input.locale]: str(labels[input.locale]) ?? title,
      ...Object.fromEntries(
        Object.entries(labels).filter(([, value]) => typeof value === 'string'),
      ),
    } as Record<string, string>,
    createdBy: vaultAgentCreatedBy(input.agentName),
  });
  const metadata: Record<string, FrontmatterUpdateValue> = {};
  const path = typeof args.path === 'string' && args.path ? args.path : undefined;
  if (path) metadata.path = path;
  for (const key of ['capabilities', 'elements'] as const) {
    if (Array.isArray(args[key])) metadata[key] = args[key].filter((value): value is string => typeof value === 'string');
  }
  const markdown = Object.keys(metadata).length ? applyFrontmatterUpdates(draft, metadata) : draft;
  const withBody = str(args.body)
    ? markdown.replace(/\n{2}[\s\S]*$/, `\n\n${str(args.body)}\n`)
    : markdown;
  return {
    id: nextChangeId(),
    tool: 'add_concept',
    summary: input.labels.createFile(`${slug}.md`),
    files: [record(pending, slug, null, withBody)],
    selected: true,
  };
}

async function buildAddRelation(
  args: Args,
  input: BuildProposalInput,
  pending: Map<string, { before: string | null; after: string }>,
  currentText: (slug: string) => Promise<string | null>,
): Promise<ProposalChange | null> {
  const from = str(args.from);
  const to = str(args.to);
  const type = str(args.type);
  if (!from || !to || !type) return null;
  const key = RELATION_KEY[type];
  if (!key) return null;

  const slugs = [...new Set([...input.port.docs.map(candidate => candidate.slug), ...pending.keys()])];
  const matches = slugs.includes(from) ? [from] : slugs.filter(slug => slug.endsWith(`/${from}`));
  // Only one existing or proposed document can assert this relation.
  if (matches.length !== 1) return null;
  const slug = matches[0];
  const doc = input.port.docs.find(candidate => candidate.slug === slug);
  const before = await currentText(slug);
  if (before === null) return null;
  const { frontmatter } = parseFrontmatter(before);
  if (['domain', 'domains', 'capabilities', 'elements'].includes(key)) {
    const targetSlugs = [...new Set([...input.port.docs.map(candidate => candidate.slug), ...pending.keys()])];
    const exactTarget = targetSlugs.find(candidate => candidate === to);
    const targetMatches = exactTarget ? [exactTarget] : targetSlugs.filter(candidate => candidate.endsWith(`/${to}`));
    const targetSlug = targetMatches.length === 1 ? targetMatches[0] : undefined;
    const target = input.port.docs.find(candidate => candidate.slug === targetSlug);
    const targetText = targetSlug ? pending.get(targetSlug)?.after : undefined;
    const targetKind = targetText ? parseFrontmatter(targetText).frontmatter.kind : target?.kind;
    if (key === 'domain') {
      if (!['capability', 'element'].includes(String(frontmatter.kind)) || targetKind !== 'domain') return null;
    } else if (containmentKeyFor(String(frontmatter.kind), typeof targetKind === 'string' ? targetKind : null) !== key) return null;
  }
  const updates: Record<string, FrontmatterUpdateValue> =
    key === 'domain'
      ? { domain: to }
      : { [key]: appendRef(frontmatter[key], to) };
  const why = str(args.why);
  if (why) {
    const notes = frontmatter.relation_notes;
    updates.relation_notes = {
      ...(notes && typeof notes === 'object' && !Array.isArray(notes)
        ? (notes as Record<string, string>)
        : {}),
      [to]: why,
    };
  }
  const after = applyFrontmatterUpdates(before, updates);
  return {
    id: nextChangeId(),
    tool: 'add_relation',
    summary: input.labels.addRelation({ from: slug, to, type }),
    files: [record(pending, slug, before, after)],
    selected: true,
    expectedMtime: doc?.mtime,
  };
}

async function buildPatch(
  args: Args,
  input: BuildProposalInput,
  pending: Map<string, { before: string | null; after: string }>,
  currentText: (slug: string) => Promise<string | null>,
): Promise<ProposalChange | null> {
  const slugInput = str(args.slug);
  if (!slugInput) return null;
  const doc = input.port.docs.find(
    (candidate) => candidate.slug === slugInput || candidate.slug.endsWith(`/${slugInput}`),
  );
  if (!doc) return null;
  const before = await currentText(doc.slug);
  if (before === null) return null;

  const frontmatter = asArgs(args.frontmatter);
  let after = Object.keys(frontmatter).length
    ? applyFrontmatterUpdates(before, frontmatter as Record<string, FrontmatterUpdateValue>)
    : before;
  const body = typeof args.body === 'string' ? args.body : undefined;
  if (body !== undefined) {
    const end = after.startsWith('---') ? after.indexOf('\n---', 3) : -1;
    after = end === -1 ? body : `${after.slice(0, end + 4)}\n\n${body.replace(/^\n+/, '')}`;
  }
  if (after === before) return null;
  return {
    id: nextChangeId(),
    tool: 'patch_concept',
    summary: input.labels.modifyFile(`${doc.slug}.md`),
    files: [record(pending, doc.slug, before, after)],
    selected: true,
    // The mtime at proposal time — if it differs at apply time, nothing is written.
    expectedMtime:
      typeof args.expected_mtime === 'number' ? args.expected_mtime : doc.mtime,
  };
}
