import type { VaultDoc } from '@/entities/docs-vault';

/**
 * Read-only "agent files" detection — web mirror of the CLI pure logic in
 * `cli/src/lib/agent-files.mjs`. The CLI ships as a separate npm package, so
 * the two implementations cannot share a physical module; they are held
 * together by `tests/contract/agent-files.contract.test.ts` over the shared
 * fixture matrix `tests/fixtures/agent-files-cases.mjs` (R11 contract
 * pattern — same as the 4-way frontmatter parser).
 *
 * Detection + display only. No conversion, no sync, no auto-repair, and no
 * vault nodes are minted from these files (the vault frontmatter stays the
 * single source of truth).
 */

export const CODEX_PROJECT_DOC_CAP_BYTES = 32 * 1024;

const CLAUDE_SKILLS_PREFIX = '.claude/skills/';
const AGENTS_SKILLS_PREFIX = '.agents/skills/';
const CLAUDE_AGENTS_PREFIX = '.claude/agents/';
const AGENTS_AGENTS_PREFIX = '.agents/agents/';

export type AgentFileKind =
  | 'instructions'
  | 'rules'
  | 'skill'
  | 'agent'
  | 'config'
  | 'mcp-config';

export type AgentTool = 'claude-code' | 'codex' | 'cursor' | 'gemini-cli' | 'copilot';

export type AgentDriftCheckStatus = 'ok' | 'drift' | 'not-applicable';

/** Tool ids → human labels (proper nouns: not translated). */
export const AGENT_TOOL_LABELS: Readonly<Record<AgentTool, string>> = Object.freeze({
  'claude-code': 'Claude Code',
  codex: 'Codex',
  cursor: 'Cursor',
  'gemini-cli': 'Gemini CLI',
  copilot: 'Copilot',
});

interface AgentFileRule {
  readonly id: string;
  readonly kind: AgentFileKind;
  readonly tools: readonly AgentTool[];
  readonly pattern: RegExp;
}

/**
 * Known agent-file patterns → which tools read them. Data, not code — keep in
 * byte-for-byte sync with `AGENT_FILE_RULES` in `cli/src/lib/agent-files.mjs`.
 */
export const AGENT_FILE_RULES: readonly AgentFileRule[] = Object.freeze([
  { id: 'claude-md', kind: 'instructions', tools: ['claude-code'], pattern: /^CLAUDE\.md$/ },
  { id: 'agents-md', kind: 'instructions', tools: ['codex', 'cursor', 'gemini-cli'], pattern: /^AGENTS\.md$/ },
  { id: 'gemini-md', kind: 'instructions', tools: ['gemini-cli'], pattern: /^GEMINI\.md$/ },
  { id: 'claude-rules', kind: 'rules', tools: ['claude-code'], pattern: /^\.claude\/rules\/.+\.md$/ },
  { id: 'claude-skills', kind: 'skill', tools: ['claude-code'], pattern: /^\.claude\/skills\/.+/ },
  { id: 'claude-agents', kind: 'agent', tools: ['claude-code'], pattern: /^\.claude\/agents\/.+/ },
  { id: 'agents-skills', kind: 'skill', tools: ['codex'], pattern: /^\.agents\/skills\/.+/ },
  { id: 'agents-agents', kind: 'agent', tools: ['codex'], pattern: /^\.agents\/agents\/.+/ },
  { id: 'cursor-rules', kind: 'rules', tools: ['cursor'], pattern: /^\.cursor\/rules\/.+\.mdc$/ },
  { id: 'cursorrules', kind: 'rules', tools: ['cursor'], pattern: /^\.cursorrules$/ },
  { id: 'copilot-instructions', kind: 'instructions', tools: ['copilot'], pattern: /^\.github\/copilot-instructions\.md$/ },
  { id: 'codex-dir', kind: 'config', tools: ['codex'], pattern: /^\.codex\/.+/ },
  { id: 'mcp-json', kind: 'mcp-config', tools: ['claude-code', 'cursor'], pattern: /^\.mcp\.json$/ },
] satisfies AgentFileRule[]);

export interface AgentFileEntry {
  path: string;
  content?: string | null;
  bytes?: number;
}

export interface AgentFileRecord {
  path: string;
  ruleId: string;
  kind: AgentFileKind;
  tools: AgentTool[];
  bytes: number;
  drift: string[];
}

export interface AgentDriftFinding {
  check: string;
  code: string;
  path: string;
  message: string;
  detail?: Record<string, unknown>;
}

export interface AgentFilesAnalysis {
  records: AgentFileRecord[];
  checks: {
    claudeAgentsBridge: { status: AgentDriftCheckStatus };
    skillCopy: {
      status: AgentDriftCheckStatus;
      comparedFiles: number;
      divergedFiles: number;
      oneSidedFiles: number;
      sharedSkills: string[];
      claudeOnlySkills: string[];
      agentsOnlySkills: string[];
    };
    agentCopy: {
      status: AgentDriftCheckStatus;
      comparedFiles: number;
      divergedFiles: number;
      oneSidedFiles: number;
    };
    atRefs: {
      status: AgentDriftCheckStatus;
      refsChecked: number;
      missingRefs: number;
      unverifiedRefs: number;
    };
    codexSizeCap: {
      status: AgentDriftCheckStatus;
      agentsMdBytes: number | null;
      capBytes: number;
    };
  };
  drift: AgentDriftFinding[];
  summary: {
    files: number;
    byTool: Record<string, number>;
    byKind: Record<string, number>;
    driftCount: number;
    checkStatuses: Record<string, AgentDriftCheckStatus>;
  };
}

export function classifyAgentFilePath(
  path: string,
): { ruleId: string; kind: AgentFileKind; tools: AgentTool[] } | null {
  for (const rule of AGENT_FILE_RULES) {
    if (rule.pattern.test(path)) {
      return { ruleId: rule.id, kind: rule.kind, tools: [...rule.tools] };
    }
  }
  return null;
}

// ── @reference extraction ──────────────────────────────────────────────────

const AT_REF_EXTENSIONS = Object.freeze([
  '.md', '.mdc', '.mjs', '.js', '.ts', '.tsx', '.json', '.toml', '.sh', '.yml', '.yaml',
]);

const AT_REF_RE = /(?:^|[\s(`"'])@([A-Za-z0-9._/-]+)/gm;

/** See the CLI twin for the boundary rules (no emails / npm scopes / css at-rules). */
export function extractAtRefs(content: string | null | undefined): Array<{ ref: string; line: number }> {
  const out: Array<{ ref: string; line: number }> = [];
  const seen = new Set<string>();
  const lines = String(content ?? '').split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    AT_REF_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = AT_REF_RE.exec(lines[i])) !== null) {
      const ref = match[1].replace(/[.,;:]+$/, '');
      if (!AT_REF_EXTENSIONS.some((ext) => ref.endsWith(ext))) continue;
      if (seen.has(ref)) continue;
      seen.add(ref);
      out.push({ ref, line: i + 1 });
    }
  }
  return out;
}

// ── helpers ────────────────────────────────────────────────────────────────

function utf8ByteLength(content: string): number {
  return new TextEncoder().encode(content).length;
}

function entryBytes(entry: AgentFileEntry): number {
  if (typeof entry.bytes === 'number') return entry.bytes;
  return utf8ByteLength(String(entry.content ?? ''));
}

function normalizePath(path: string): string | null {
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (parts.length === 0) return null;
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join('/');
}

function dirnamePath(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? '' : path.slice(0, idx);
}

function hasClaudeAgentsImport(content: string | null | undefined): boolean {
  const withoutFences = String(content ?? '').replace(/```[\s\S]*?```/g, '');
  const withoutInlineCode = withoutFences.replace(/`[^`\n]*`/g, '');
  return /(^|\s)@AGENTS\.md(?=\s|$)/m.test(withoutInlineCode);
}

// ── analysis ───────────────────────────────────────────────────────────────

interface InternalRecord extends AgentFileRecord {
  entry: AgentFileEntry;
}

export interface AnalyzeAgentFilesInput {
  files: AgentFileEntry[];
  existingPaths?: string[];
  unverifiablePrefixes?: string[];
  verifiableExtensions?: string[] | null;
}

export function analyzeAgentFiles({
  files,
  existingPaths = [],
  unverifiablePrefixes = [],
  verifiableExtensions = null,
}: AnalyzeAgentFilesInput): AgentFilesAnalysis {
  const records: InternalRecord[] = [];
  for (const entry of files) {
    const hit = classifyAgentFilePath(entry.path);
    if (!hit) continue;
    records.push({
      path: entry.path,
      ruleId: hit.ruleId,
      kind: hit.kind,
      tools: hit.tools,
      bytes: entryBytes(entry),
      drift: [],
      entry,
    });
  }
  records.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const recordByPath = new Map(records.map((r) => [r.path, r]));
  const recordPathSet = new Set(records.map((r) => r.path));
  const existingPathSet = new Set(existingPaths);
  const drift: AgentDriftFinding[] = [];

  // ① CLAUDE.md ↔ AGENTS.md import bridge
  const claudeAgentsBridge = ((): { status: AgentDriftCheckStatus } => {
    const claude = recordByPath.get('CLAUDE.md');
    if (!claude) return { status: 'not-applicable' };
    const agentsExists = recordByPath.has('AGENTS.md') || existingPathSet.has('AGENTS.md');
    const hasImport = hasClaudeAgentsImport(claude.entry.content);
    if (hasImport && agentsExists) return { status: 'ok' };
    if (hasImport && !agentsExists) {
      drift.push({
        check: 'claude-agents-bridge',
        code: 'broken-agents-import',
        path: 'CLAUDE.md',
        message: 'CLAUDE.md imports @AGENTS.md but AGENTS.md does not exist',
        detail: { ref: 'AGENTS.md' },
      });
      claude.drift.push('broken-agents-import');
      return { status: 'drift' };
    }
    if (!hasImport && agentsExists) {
      drift.push({
        check: 'claude-agents-bridge',
        code: 'missing-agents-import',
        path: 'CLAUDE.md',
        message:
          'CLAUDE.md does not import @AGENTS.md: Claude Code and AGENTS.md readers see different instructions',
        detail: { ref: 'AGENTS.md' },
      });
      claude.drift.push('missing-agents-import');
      return { status: 'drift' };
    }
    return { status: 'not-applicable' };
  })();

  // ② duplicated skill trees byte diff
  const skillCopy = (() => {
    const claudeByRel = new Map<string, InternalRecord>();
    const agentsByRel = new Map<string, InternalRecord>();
    for (const record of records) {
      if (record.path.startsWith(CLAUDE_SKILLS_PREFIX)) {
        claudeByRel.set(record.path.slice(CLAUDE_SKILLS_PREFIX.length), record);
      } else if (record.path.startsWith(AGENTS_SKILLS_PREFIX)) {
        agentsByRel.set(record.path.slice(AGENTS_SKILLS_PREFIX.length), record);
      }
    }
    const skillName = (rel: string) => rel.split('/')[0];
    const claudeSkills = new Set([...claudeByRel.keys()].map(skillName));
    const agentsSkills = new Set([...agentsByRel.keys()].map(skillName));
    const sharedSkills = [...claudeSkills].filter((name) => agentsSkills.has(name)).sort();
    const claudeOnlySkills = [...claudeSkills].filter((name) => !agentsSkills.has(name)).sort();
    const agentsOnlySkills = [...agentsSkills].filter((name) => !claudeSkills.has(name)).sort();

    let comparedFiles = 0;
    let divergedFiles = 0;
    let oneSidedFiles = 0;
    const sharedSet = new Set(sharedSkills);
    const rels = [...new Set([...claudeByRel.keys(), ...agentsByRel.keys()])]
      .filter((rel) => sharedSet.has(skillName(rel)))
      .sort();
    for (const rel of rels) {
      const claude = claudeByRel.get(rel);
      const agents = agentsByRel.get(rel);
      if (claude && agents) {
        comparedFiles += 1;
        const bytesDiffer = claude.bytes !== agents.bytes;
        const bothContents =
          typeof claude.entry.content === 'string' && typeof agents.entry.content === 'string';
        const contentDiffers = bothContents && claude.entry.content !== agents.entry.content;
        if (bytesDiffer || contentDiffers) {
          divergedFiles += 1;
          drift.push({
            check: 'skill-copy',
            code: 'skill-copy-diverged',
            path: rel,
            message: `duplicated skill file diverged between .claude/skills and .agents/skills: ${rel}`,
            detail: {
              claudePath: claude.path,
              agentsPath: agents.path,
              claudeBytes: claude.bytes,
              agentsBytes: agents.bytes,
            },
          });
          claude.drift.push('skill-copy-diverged');
          agents.drift.push('skill-copy-diverged');
        }
      } else {
        oneSidedFiles += 1;
        const present = (claude ?? agents)!;
        drift.push({
          check: 'skill-copy',
          code: 'skill-copy-file-missing',
          path: rel,
          message: `skill file exists in only one of the duplicated trees: ${rel}`,
          detail: { presentIn: claude ? '.claude/skills' : '.agents/skills' },
        });
        present.drift.push('skill-copy-file-missing');
      }
    }

    const status: AgentDriftCheckStatus =
      divergedFiles > 0 || oneSidedFiles > 0
        ? 'drift'
        : sharedSkills.length > 0
          ? 'ok'
          : 'not-applicable';
    return {
      status,
      comparedFiles,
      divergedFiles,
      oneSidedFiles,
      sharedSkills,
      claudeOnlySkills,
      agentsOnlySkills,
    };
  })();

  // Duplicated agent-brief byte diff.
  //
  // Separate from skills because `.claude/agents/*.md` is the subagent **summoning registry**
  // (without it a seat cannot be launched), while its counterpart is the **reference document** a
  // tool without subagents opens when walking a council sequentially. The purposes differ but the
  // contents must match. Unlike skills, a seat present on one side only is **drift**, not
  // informational — in that tool the protocol itself does not hold.
  const agentCopy = (() => {
    const claudeByName = new Map<string, InternalRecord>();
    const agentsByName = new Map<string, InternalRecord>();
    for (const record of records) {
      if (record.path.startsWith(CLAUDE_AGENTS_PREFIX)) {
        claudeByName.set(record.path.slice(CLAUDE_AGENTS_PREFIX.length), record);
      } else if (record.path.startsWith(AGENTS_AGENTS_PREFIX)) {
        agentsByName.set(record.path.slice(AGENTS_AGENTS_PREFIX.length), record);
      }
    }

    let comparedFiles = 0;
    let divergedFiles = 0;
    let oneSidedFiles = 0;
    const names = [...new Set([...claudeByName.keys(), ...agentsByName.keys()])].sort();
    for (const name of names) {
      const claude = claudeByName.get(name);
      const agents = agentsByName.get(name);
      if (claude && agents) {
        comparedFiles += 1;
        const bytesDiffer = claude.bytes !== agents.bytes;
        const bothContents =
          typeof claude.entry.content === 'string' && typeof agents.entry.content === 'string';
        const contentDiffers = bothContents && claude.entry.content !== agents.entry.content;
        if (bytesDiffer || contentDiffers) {
          divergedFiles += 1;
          drift.push({
            check: 'agent-copy',
            code: 'agent-copy-diverged',
            path: name,
            message: `duplicated agent brief diverged between .claude/agents and .agents/agents: ${name}`,
            detail: {
              claudePath: claude.path,
              agentsPath: agents.path,
              claudeBytes: claude.bytes,
              agentsBytes: agents.bytes,
            },
          });
          claude.drift.push('agent-copy-diverged');
          agents.drift.push('agent-copy-diverged');
        }
      } else {
        oneSidedFiles += 1;
        const present = (claude ?? agents)!;
        drift.push({
          check: 'agent-copy',
          code: 'agent-copy-file-missing',
          path: name,
          message: `agent brief exists in only one of the duplicated trees: ${name}`,
          detail: { presentIn: claude ? '.claude/agents' : '.agents/agents' },
        });
        present.drift.push('agent-copy-file-missing');
      }
    }

    const status: AgentDriftCheckStatus =
      divergedFiles > 0 || oneSidedFiles > 0 ? 'drift' : comparedFiles > 0 ? 'ok' : 'not-applicable';
    return { status, comparedFiles, divergedFiles, oneSidedFiles };
  })();

  // ③ @reference existence
  const atRefs = (() => {
    let refsChecked = 0;
    let missingRefs = 0;
    let unverifiedRefs = 0;
    for (const record of records) {
      if (!/\.(md|mdc)$/.test(record.path)) continue;
      if (typeof record.entry.content !== 'string') continue;
      for (const { ref } of extractAtRefs(record.entry.content)) {
        if (ref.includes('*')) continue;
        refsChecked += 1;
        const dir = dirnamePath(record.path);
        const candidates: string[] = [];
        const fileRelative = normalizePath(dir ? `${dir}/${ref}` : ref);
        if (fileRelative) candidates.push(fileRelative);
        const rootRelative = normalizePath(ref);
        if (rootRelative && !candidates.includes(rootRelative)) candidates.push(rootRelative);
        const exists = candidates.some(
          (candidate) => existingPathSet.has(candidate) || recordPathSet.has(candidate),
        );
        if (exists) continue;
        const extUnverifiable =
          Array.isArray(verifiableExtensions) &&
          !verifiableExtensions.some((ext) => ref.endsWith(ext));
        const prefixUnverifiable =
          unverifiablePrefixes.length > 0 &&
          candidates.every((candidate) =>
            unverifiablePrefixes.some((prefix) => candidate.startsWith(prefix)),
          );
        if (extUnverifiable || prefixUnverifiable) {
          unverifiedRefs += 1;
          continue;
        }
        missingRefs += 1;
        drift.push({
          check: 'at-refs',
          code: 'at-ref-missing',
          path: record.path,
          message: `@reference target not found: ${ref} (referenced from ${record.path})`,
          detail: { ref },
        });
        if (!record.drift.includes('at-ref-missing')) record.drift.push('at-ref-missing');
      }
    }
    const status: AgentDriftCheckStatus =
      missingRefs > 0 ? 'drift' : refsChecked > 0 ? 'ok' : 'not-applicable';
    return { status, refsChecked, missingRefs, unverifiedRefs };
  })();

  // ④ AGENTS.md Codex 32 KiB cap
  const codexSizeCap = (() => {
    const agents = recordByPath.get('AGENTS.md');
    if (!agents) {
      return {
        status: 'not-applicable' as AgentDriftCheckStatus,
        agentsMdBytes: null,
        capBytes: CODEX_PROJECT_DOC_CAP_BYTES,
      };
    }
    const bytes = agents.bytes;
    if (bytes > CODEX_PROJECT_DOC_CAP_BYTES) {
      drift.push({
        check: 'codex-size-cap',
        code: 'agents-md-over-codex-cap',
        path: 'AGENTS.md',
        message: `AGENTS.md is ${bytes} bytes: over the Codex project_doc_max_bytes default of ${CODEX_PROJECT_DOC_CAP_BYTES}`,
        detail: { bytes, capBytes: CODEX_PROJECT_DOC_CAP_BYTES },
      });
      agents.drift.push('agents-md-over-codex-cap');
      return {
        status: 'drift' as AgentDriftCheckStatus,
        agentsMdBytes: bytes,
        capBytes: CODEX_PROJECT_DOC_CAP_BYTES,
      };
    }
    return {
      status: 'ok' as AgentDriftCheckStatus,
      agentsMdBytes: bytes,
      capBytes: CODEX_PROJECT_DOC_CAP_BYTES,
    };
  })();

  const byTool: Record<string, number> = {};
  const byKind: Record<string, number> = {};
  for (const record of records) {
    byKind[record.kind] = (byKind[record.kind] ?? 0) + 1;
    for (const tool of record.tools) byTool[tool] = (byTool[tool] ?? 0) + 1;
  }

  const checks = { claudeAgentsBridge, skillCopy, agentCopy, atRefs, codexSizeCap };
  const publicRecords: AgentFileRecord[] = records.map((record) => ({
    path: record.path,
    ruleId: record.ruleId,
    kind: record.kind,
    tools: record.tools,
    bytes: record.bytes,
    drift: record.drift,
  }));
  return {
    records: publicRecords,
    checks,
    drift,
    summary: {
      files: publicRecords.length,
      byTool,
      byKind,
      driftCount: drift.length,
      checkStatuses: Object.fromEntries(
        Object.entries(checks).map(([name, check]) => [name, check.status]),
      ) as Record<string, AgentDriftCheckStatus>,
    },
  };
}

// ── manifest adapter (web-only) ────────────────────────────────────────────

/**
 * The FSA vault walk skips dot-entries (`build-local-manifest.ts`), so the
 * web can only ever see root-level, non-dot agent files. The honest gate:
 * this group exists only when the picked vault IS the repo root — detected by
 * CLAUDE.md / AGENTS.md at the manifest root. A vault picked deeper
 * (docs/ontology …) cannot reach the repo root through FSA, so the group is
 * not rendered at all rather than shown empty or half-true.
 */
export function manifestIncludesRepoRoot(docs: Array<Pick<VaultDoc, 'path'>>): boolean {
  return docs.some((doc) => doc.path === 'CLAUDE.md' || doc.path === 'AGENTS.md');
}

/** Manifest docs that classify as agent files (visible = non-dot paths only). */
export function selectAgentFileDocs<T extends Pick<VaultDoc, 'path' | 'slug'>>(docs: T[]): T[] {
  return docs.filter((doc) => classifyAgentFilePath(doc.path) !== null);
}

/**
 * Options the web scanner must pass to `analyzeAgentFiles` — dot-paths are
 * invisible to the FSA walk and only `.md` files are indexed, so refs into
 * either report `unverified` instead of a false `missing`.
 */
export const WEB_SCAN_ANALYZE_OPTIONS = Object.freeze({
  unverifiablePrefixes: Object.freeze(['.']) as unknown as string[],
  verifiableExtensions: Object.freeze(['.md']) as unknown as string[],
});

export interface AgentFilesUiRecord {
  slug: string;
  path: string;
  kind: AgentFileKind;
  tools: AgentTool[];
  drift: string[];
}

export interface AgentFilesUiModel {
  records: AgentFilesUiRecord[];
  driftCount: number;
}

/** Join analysis records back to manifest docs (slug needed for onSelect). */
export function buildAgentFilesUiModel(
  analysis: AgentFilesAnalysis,
  docs: Array<Pick<VaultDoc, 'path' | 'slug'>>,
): AgentFilesUiModel {
  const slugByPath = new Map(docs.map((doc) => [doc.path, doc.slug]));
  const records: AgentFilesUiRecord[] = [];
  for (const record of analysis.records) {
    const slug = slugByPath.get(record.path);
    if (!slug) continue;
    records.push({
      slug,
      path: record.path,
      kind: record.kind,
      tools: record.tools,
      drift: record.drift,
    });
  }
  return {
    records,
    driftCount: records.reduce((sum, record) => sum + record.drift.length, 0),
  };
}
