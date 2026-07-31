import {
  buildVaultMarkdown,
  vaultFolderForKind,
  vaultAgentCreatedBy,
} from '@/entities/docs-vault';
import {
  applyFrontmatterUpdates,
  type FrontmatterUpdateValue,
} from '@/entities/docs-vault/lib/frontmatter-updates';

import type {
  AgentProposal,
  ProposalChange,
  ProposalToolName,
  ProposedFileChange,
} from './types';
import type { VaultReadPort } from './vault-read-port';

/**
 * 모델의 쓰기 시도 → **제안 카드**.
 *
 * 여기서 만드는 `ProposedFileChange.after` 는 카드가 그리는 문자열이자
 * 적용기가 디스크에 쓰는 문자열이다 — **같은 값 하나**. 카드가 보여준 것과
 * 실제로 쓰이는 것이 다르면 동의는 동의가 아니다.
 *
 * 이 모듈은 디스크에 쓰지 않는다. 읽기 포트만 받는다.
 */

export interface WriteIntent {
  name: string;
  args: unknown;
}

export interface BuildProposalInput {
  intents: readonly WriteIntent[];
  port: VaultReadPort;
  /** 이 턴에 실제로 읽은 노드들 — 카드의 경고 행 판정 근거. */
  readNodesThisTurn: readonly string[];
  /** 볼트가 git 저장소면 저장점 체크박스가 기본 ON. */
  vaultIsGit: boolean;
  /** 화면 언어 — 새 문서의 어권별 이름 칸을 채운다. */
  locale: string;
  labels: ProposalLabels;
  /**
   * 이 턴의 초안을 실제로 쓴 행위자의 이름 — 패널이 물린 LLM 제공자
   * (`anthropic` / `openai` / …), 감사 로그(`llm-audit.jsonl`)가 이미 남기는
   * 그 신원이다. 새 신원 체계를 만들지 않는다.
   *
   * **이 표면은 웹 UI 지만 저작자는 에이전트다** (2026-07-31 원장). 사람의
   * 「적용」 클릭은 승인이지 저작이 아니므로 `human` 으로 뒤집히지 않는다.
   * 모르면 이름만 모르는 것이라 `agent:unknown` 으로 떨어진다.
   */
  agentName: string | null;
}

export interface ProposalLabels {
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

/** frontmatter 배열 키에 값을 더한다 (중복은 더하지 않는다). */
function appendRef(current: unknown, ref: string): string[] {
  const list = Array.isArray(current)
    ? current.filter((entry): entry is string => typeof entry === 'string')
    : typeof current === 'string' && current.trim()
      ? [current.trim()]
      : [];
  return list.includes(ref) ? list : [...list, ref];
}

/**
 * `add_relation` 의 관계 타입 → 소스 문서의 frontmatter 키.
 * MCP `add_relation` 의 정규화와 같은 매핑이다.
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
  // 같은 파일을 여러 번 고치는 제안이 와도 diff 는 한 번만 그려야 한다 —
  // 누적된 결과를 여기서 들고 이어 붙인다.
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
      // 화면 언어 칸은 반드시 채운다 — 한쪽만 채우면 다른 언어 사용자에게
      // 원문 title 이 그대로 노출된다.
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
  // 문서가 없는 개념에는 관계를 쓸 수 없다 — 남의 문서에 쓰면 그 문서가
  // 하지 않은 주장을 하게 된다 (#688 이 공방에서 고친 바로 그 결함).
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
    // 제안 시점의 mtime — 적용 때 달라져 있으면 쓰지 않는다.
    expectedMtime:
      typeof args.expected_mtime === 'number' ? args.expected_mtime : doc.mtime,
  };
}
