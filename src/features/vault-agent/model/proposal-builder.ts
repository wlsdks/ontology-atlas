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

/**
 * A model's attempted write → **a proposal card**.
 *
 * The `ProposedFileChange.after` built here is both the string the card draws and
 * the string the applier writes to disk — **one and the same value**. If what the
 * card showed differs from what actually gets written, consent is not consent.
 *
 * This module does not write to disk. It takes only a read port.
 */

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
  /**
   * The name of the actor who actually wrote this turn's draft — the LLM provider
   * the panel is attached to (`anthropic` / `openai` / …), the same identity the
   * audit log (`llm-audit.jsonl`) already records. No new identity scheme is invented.
   *
   * **This surface is a web UI but the author is an agent** (2026-07-31 ledger). A
   * person's [apply] click is approval, not authorship, so it does not flip to
   * `human`. When unknown, only the name is unknown, so it falls to `agent:unknown`.
   */
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

/**
 * `add_relation`'s relation type → the source document's frontmatter key. The same
 * mapping as MCP `add_relation`'s normalization.
 */
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
  // Even when a proposal edits the same file several times, the diff must be drawn
  // once — the accumulated result is held here and appended to.
  const pending = new Map<string, { before: string | null; after: string }>();

  async function currentText(slug: string): Promise<string | null> {
    const held = pending.get(slug);
    if (held) return held.after;
    return input.port.readDocText(slug);
  }

  for (const intent of input.intents) {
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
  const markdown = buildVaultMarkdown({
    kind,
    title,
    slug,
    domain: str(args.domain),
    localeLabels: {
  // The screen language's field must always be filled — filling only one exposes the
  // raw title to speakers of the other language.
      [input.locale]: str(labels[input.locale]) ?? title,
      ...Object.fromEntries(
        Object.entries(labels).filter(([, value]) => typeof value === 'string'),
      ),
    } as Record<string, string>,
    createdBy: vaultAgentCreatedBy(input.agentName),
  });
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

  const doc = input.port.docs.find(
    (candidate) => candidate.slug === from || candidate.slug.endsWith(`/${from}`),
  );
  // A relation cannot be written on a concept with no document — writing it into
  // someone else's document makes that document assert something it never said.
  if (!doc) return null;

  const before = await currentText(doc.slug);
  if (before === null) return null;
  const updates: Record<string, FrontmatterUpdateValue> =
    key === 'domain'
      ? { domain: to }
      : { [key]: appendRef(doc.frontmatter[key], to) };
  const why = str(args.why);
  if (why) {
    const notes = doc.frontmatter.relation_notes;
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
    summary: input.labels.addRelation({ from: doc.slug, to, type }),
    files: [record(pending, doc.slug, before, after)],
    selected: true,
    expectedMtime: doc.mtime,
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
