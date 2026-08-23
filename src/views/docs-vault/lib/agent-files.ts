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
const MCP_TOOL_RE = /\bmcp__([a-z0-9][a-z0-9_-]*)__[a-z0-9_]+/gi;

/**
 * Codex declares its servers in TOML. This module ships in the web bundle, so it
 * reads section headers rather than pulling in a parser the browser build has no
 * reason to carry, and the CLI twin reads them the same way so the two cannot
 * disagree. `[mcp_servers.name]` and `[mcp_servers.name.env]` name one server;
 * only the first segment counts.
 */
const TOML_MCP_SECTION_RE =
  /^[ \t]*\[[ \t]*(?:mcp_servers|"mcp_servers"|'mcp_servers')[ \t]*\.[ \t]*(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_-]+))/gm;

const NON_ENGLISH_SCRIPT_RE =
  /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff]/gu;

export const AGENT_FILE_RULES: readonly AgentFileRule[] = Object.freeze([
  { id: 'claude-md', kind: 'instructions', tools: ['claude-code'], pattern: /^CLAUDE\.md$/ },
  { id: 'agents-md', kind: 'instructions', tools: ['codex', 'cursor', 'gemini-cli'], pattern: /^AGENTS\.md$/ },
  { id: 'gemini-md', kind: 'instructions', tools: ['gemini-cli'], pattern: /^GEMINI\.md$/ },
  // One level only. `cli/templates/vault/AGENTS.md` and its `vault-ko` twin are
  // product data shipped inside a starter vault, not instructions to an agent
  // working on this repository, and they sit three segments deep.
  { id: 'nested-agents-md', kind: 'instructions', tools: ['codex', 'cursor', 'gemini-cli'], pattern: /^[^/]+\/AGENTS\.md$/ },
  { id: 'claude-rules', kind: 'rules', tools: ['claude-code'], pattern: /^\.claude\/rules\/.+\.md$/ },
  { id: 'claude-skills', kind: 'skill', tools: ['claude-code'], pattern: /^\.claude\/skills\/.+/ },
  { id: 'claude-agents', kind: 'agent', tools: ['claude-code'], pattern: /^\.claude\/agents\/.+/ },
  { id: 'agents-skills', kind: 'skill', tools: ['codex'], pattern: /^\.agents\/skills\/.+/ },
  { id: 'agents-agents', kind: 'agent', tools: ['codex'], pattern: /^\.agents\/agents\/.+/ },
  { id: 'cursor-rules', kind: 'rules', tools: ['cursor'], pattern: /^\.cursor\/rules\/.+\.mdc$/ },
  { id: 'cursorrules', kind: 'rules', tools: ['cursor'], pattern: /^\.cursorrules$/ },
  { id: 'copilot-instructions', kind: 'instructions', tools: ['copilot'], pattern: /^\.github\/copilot-instructions\.md$/ },
  { id: 'claude-hooks', kind: 'config', tools: ['claude-code'], pattern: /^\.claude\/hooks\/.+/ },
  { id: 'claude-settings', kind: 'config', tools: ['claude-code'], pattern: /^\.claude\/settings\.json$/ },
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
    agentLanguage: {
      status: AgentDriftCheckStatus;
      scannedFiles: number;
      flaggedFiles: number;
      codePoints: number;
    };
    mcpGrants: {
      status: AgentDriftCheckStatus;
      briefsChecked: number;
      grantsChecked: number;
      undeclaredServers: string[];
      unparseableConfigs: string[];
    };
    codexSizeCap: {
      status: AgentDriftCheckStatus;
      agentsMdBytes: number | null;
      nestedFiles: number;
      worstNestedPath: string | null;
      worstCaseBytes: number | null;
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
  /**
   * Opt in to the English-only agent-text check. Off by default so analysing
   * someone else's repository or vault never imports this repository's language
   * policy.
   */
  requireEnglish?: boolean;
}

export function analyzeAgentFiles({
  files,
  existingPaths = [],
  unverifiablePrefixes = [],
  verifiableExtensions = null,
  requireEnglish = false,
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

  /**
   * ⑤ English-only agent text. Every agent file is read by an agent, so its whole
   * content — not only its comments — is steering text. A guard whose
   * `permissionDecisionReason` was Korean shipped for months because
   * `scripts/quality/source-language` audits comments in `.sh` and skips `.json`,
   * and the string literal an agent actually reads sat in neither subject set
   * (2026-08-23 audit). Localized product data is out of the subject set by
   * construction: neither `cli/templates/vault-ko/**` nor `display_<locale>`
   * frontmatter matches AGENT_FILE_RULES.
   */
  const agentLanguage = (() => {
    // Opt-in. This is one repository's policy, not a truth about agent files,
    // and this analyzer also reads a user's own vault — where a Korean starter
    // is supported. Imposing English there would call a correct vault broken.
    if (!requireEnglish) {
      return {
        status: 'not-applicable' as AgentDriftCheckStatus,
        scannedFiles: 0,
        flaggedFiles: 0,
        codePoints: 0,
      };
    }
    let scannedFiles = 0;
    let flaggedFiles = 0;
    let codePoints = 0;
    for (const record of records) {
      if (typeof record.entry.content !== 'string') continue;
      scannedFiles += 1;
      const hits = record.entry.content.match(NON_ENGLISH_SCRIPT_RE);
      if (!hits) continue;
      flaggedFiles += 1;
      codePoints += hits.length;
      const sample = Array.from(new Set(hits)).slice(0, 8).join('');
      drift.push({
        check: 'agent-language',
        code: 'non-english-agent-text',
        path: record.path,
        message:
          `${record.path} carries ${hits.length} non-English code point(s) (${sample}); `
          + 'agent files are English-only because their text is what a blocked or '
          + 'steered agent reads',
        detail: { codePoints: hits.length, sample },
      });
      if (!record.drift.includes('non-english-agent-text')) {
        record.drift.push('non-english-agent-text');
      }
    }
    const status: AgentDriftCheckStatus =
      flaggedFiles > 0 ? 'drift' : scannedFiles > 0 ? 'ok' : 'not-applicable';
    return { status, scannedFiles, flaggedFiles, codePoints };
  })();

  /**
   * ④ Merged Codex instruction budget. Codex concatenates AGENTS.md root-down
   * along the working directory and stops once the combined size reaches
   * `project_doc_max_bytes`, then truncates silently. Measuring the root file
   * alone understates the budget the moment a nested AGENTS.md exists. Nested
   * files are one level deep, so the worst case any path reaches is root plus
   * the largest of them.
   */
  /**
   * ⑥ Agent-brief MCP grants. A brief's `tools:` list is an allowlist, not a
   * request: naming `mcp__chrome-devtools__evaluate_script` on a seat whose
   * server no repository config declares does not fail loudly — the tool is
   * simply absent and the seat runs on unable to measure anything. A personal
   * `~/.claude.json` cannot be the repository's contract; what a fresh clone can
   * start is what `.mcp.json` says.
   *
   * `absent` and `unparseable` must not collapse together. No `.mcp.json` means
   * nothing to contradict. One that will not parse declares no server at all,
   * which makes every grant undeclared — reading that as a pass is fail-open.
   */
  /**
   * ⑥ Agent-brief MCP grants. A brief's `tools:` list is an allowlist, not a
   * request: naming `mcp__chrome-devtools__evaluate_script` on a seat whose
   * server no repository config declares does not fail loudly — the tool is
   * simply absent and the seat runs on unable to measure anything.
   *
   * Each tree is measured against the config its own reader consults: `.claude`
   * briefs against `.mcp.json`, `.agents` briefs against `.codex/config.toml`.
   * Measuring both against `.mcp.json` passed while `.codex/config.toml`
   * declared one server and eight mirrored Codex seats granted two — the same
   * defect the check exists to catch, hidden by the wrong denominator.
   *
   * A config that exists but declares nothing makes every grant undeclared;
   * reading that as a pass is fail-open.
   */
  const mcpGrants = (() => {
    const sources = [
      {
        prefix: '.claude/agents/',
        configPath: '.mcp.json',
        read: (text: string): Set<string> => {
          const servers = (JSON.parse(text) as { mcpServers?: unknown })?.mcpServers;
          return new Set(servers && typeof servers === 'object' ? Object.keys(servers) : []);
        },
      },
      {
        prefix: '.agents/agents/',
        configPath: '.codex/config.toml',
        read: (text: string): Set<string> => {
          const found = new Set<string>();
          for (const match of text.matchAll(TOML_MCP_SECTION_RE)) {
            found.add((match[1] ?? match[2] ?? match[3]) as string);
          }
          return found;
        },
      },
    ];

    const undeclared = new Set<string>();
    const unparseableConfigs: string[] = [];
    let briefsChecked = 0;
    let grantsChecked = 0;
    let anyConfig = false;

    for (const source of sources) {
      const configRecord = recordByPath.get(source.configPath);
      const briefs = records.filter(
        (r) => r.path.startsWith(source.prefix) && typeof r.entry.content === 'string',
      );
      if (!configRecord || typeof configRecord.entry.content !== 'string') continue;
      if (briefs.length === 0) continue;
      anyConfig = true;
      briefsChecked += briefs.length;

      let declared = new Set<string>();
      try {
        declared = source.read(configRecord.entry.content);
      } catch {
        declared = new Set();
      }
      if (declared.size === 0) {
        unparseableConfigs.push(source.configPath);
        drift.push({
          check: 'mcp-grants',
          code: 'mcp-config-unparseable',
          path: source.configPath,
          message:
            `${source.configPath} exists but declares no MCP server: every agent-brief grant in `
            + `${source.prefix} is undeclared and a fresh clone silently loses those tools`,
          detail: { prefix: source.prefix },
        });
        if (!configRecord.drift.includes('mcp-config-unparseable')) {
          configRecord.drift.push('mcp-config-unparseable');
        }
      }

      for (const record of briefs) {
        const frontmatter = (record.entry.content as string).split('\n---')[0];
        const seen = new Set<string>();
        for (const [, server] of frontmatter.matchAll(MCP_TOOL_RE)) {
          grantsChecked += 1;
          if (declared.has(server) || seen.has(server)) continue;
          seen.add(server);
          undeclared.add(server);
          drift.push({
            check: 'mcp-grants',
            code: 'undeclared-mcp-server',
            path: record.path,
            message:
              `${record.path} grants tools from the MCP server "${server}", which `
              + `${source.configPath} does not declare; a fresh clone gets the seat without the `
              + 'tools and no error',
            detail: { server, configPath: source.configPath },
          });
          if (!record.drift.includes('undeclared-mcp-server')) {
            record.drift.push('undeclared-mcp-server');
          }
        }
      }
    }

    if (!anyConfig) {
      return {
        status: 'not-applicable' as AgentDriftCheckStatus,
        briefsChecked: 0,
        grantsChecked: 0,
        undeclaredServers: [] as string[],
        unparseableConfigs: [] as string[],
      };
    }
    return {
      status: (undeclared.size > 0 || unparseableConfigs.length > 0
        ? 'drift'
        : 'ok') as AgentDriftCheckStatus,
      briefsChecked,
      grantsChecked,
      undeclaredServers: [...undeclared].sort(),
      unparseableConfigs: unparseableConfigs.sort(),
    };
  })();

  const codexSizeCap = (() => {
    const agents = recordByPath.get('AGENTS.md');
    const nested = records.filter((r) => r.ruleId === 'nested-agents-md');
    const nestedBytes = nested.reduce((max, r) => Math.max(max, r.bytes), 0);
    const worst = nested.reduce<typeof nested[number] | null>(
      (a, b) => (a && a.bytes >= b.bytes ? a : b),
      null,
    );
    if (!agents) {
      return {
        status: 'not-applicable' as AgentDriftCheckStatus,
        agentsMdBytes: null,
        nestedFiles: nested.length,
        worstNestedPath: worst?.path ?? null,
        worstCaseBytes: null,
        capBytes: CODEX_PROJECT_DOC_CAP_BYTES,
      };
    }
    const worstCaseBytes = agents.bytes + nestedBytes;
    const shared = {
      agentsMdBytes: agents.bytes,
      nestedFiles: nested.length,
      worstNestedPath: worst?.path ?? null,
      worstCaseBytes,
      capBytes: CODEX_PROJECT_DOC_CAP_BYTES,
    };
    if (worstCaseBytes > CODEX_PROJECT_DOC_CAP_BYTES) {
      const via = worst ? ` (AGENTS.md ${agents.bytes} + ${worst.path} ${worst.bytes})` : '';
      drift.push({
        check: 'codex-size-cap',
        code: 'agents-md-over-codex-cap',
        path: worst?.path ?? 'AGENTS.md',
        message:
          `the merged Codex instruction set reaches ${worstCaseBytes} bytes${via}: over the `
          + `project_doc_max_bytes default of ${CODEX_PROJECT_DOC_CAP_BYTES}, past which Codex `
          + 'truncates silently',
        detail: shared,
      });
      (worst ?? agents).drift.push('agents-md-over-codex-cap');
      return { status: 'drift' as AgentDriftCheckStatus, ...shared };
    }
    return { status: 'ok' as AgentDriftCheckStatus, ...shared };
  })();

  const byTool: Record<string, number> = {};
  const byKind: Record<string, number> = {};
  for (const record of records) {
    byKind[record.kind] = (byKind[record.kind] ?? 0) + 1;
    for (const tool of record.tools) byTool[tool] = (byTool[tool] ?? 0) + 1;
  }

  const checks = {
    claudeAgentsBridge,
    skillCopy,
    agentCopy,
    atRefs,
    codexSizeCap,
    agentLanguage,
    mcpGrants,
  };
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
