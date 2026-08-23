// Read-only "agent files" detection — pure logic, no filesystem access.
//
// Multi-agent-tool repos scatter instructions across 6+ formats (CLAUDE.md,
// AGENTS.md, .claude/rules|skills|agents, .agents/skills, .cursor, .codex,
// .mcp.json). Nobody sees which tool reads which file, and physically
// duplicated skill trees drift byte-by-byte with no watchdog. This module
// classifies known agent-file paths (data-driven table — one update point)
// and runs seven read-only drift checks. It never converts, syncs, or repairs.
//
// The web workbench mirrors this logic in
// `src/views/docs-vault/lib/agent-files.ts`; the two implementations are held
// together by `tests/contract/agent-files.contract.test.ts` over the shared
// fixture matrix `tests/fixtures/agent-files-cases.mjs` (R11 contract pattern).

export const CODEX_PROJECT_DOC_CAP_BYTES = 32 * 1024;

const CLAUDE_SKILLS_PREFIX = '.claude/skills/';
const AGENTS_SKILLS_PREFIX = '.agents/skills/';
const CLAUDE_AGENTS_PREFIX = '.claude/agents/';
const AGENTS_AGENTS_PREFIX = '.agents/agents/';

/**
 * Tool ids → human labels. Data, not code — when a tool renames or a new
 * client appears, this is the single update point (with AGENT_FILE_RULES).
 */
/**
 * `gemini-cli` stays beside `antigravity` rather than being replaced by it.
 * Gemini CLI stopped serving free, Pro and Ultra requests on 2026-06-18 and
 * Antigravity CLI is the successor, but Gemini Code Assist Standard/Enterprise,
 * Google Cloud access and paid API keys still reach it. Dropping the label would
 * be as wrong as leaving Antigravity out was.
 */
export const AGENT_TOOL_LABELS = Object.freeze({
  'claude-code': 'Claude Code',
  codex: 'Codex',
  cursor: 'Cursor',
  antigravity: 'Antigravity CLI',
  'gemini-cli': 'Gemini CLI',
  copilot: 'Copilot',
});

/**
 * Known agent-file patterns → which tools read them. Repo-root scoped
 * (desktop/repo-root-first slice): nested CLAUDE.md variants are out of scope.
 */
export const AGENT_FILE_RULES = Object.freeze([
  Object.freeze({ id: 'claude-md', kind: 'instructions', tools: Object.freeze(['claude-code']), pattern: /^CLAUDE\.md$/ }),
  Object.freeze({ id: 'agents-md', kind: 'instructions', tools: Object.freeze(['codex', 'cursor', 'antigravity', 'gemini-cli']), pattern: /^AGENTS\.md$/ }),
  Object.freeze({ id: 'gemini-md', kind: 'instructions', tools: Object.freeze(['antigravity', 'gemini-cli']), pattern: /^GEMINI\.md$/ }),
  // One level only. `cli/templates/vault/AGENTS.md` and its `vault-ko` twin are
  // product data shipped inside a starter vault, not instructions to an agent
  // working on this repository, and they sit three segments deep.
  Object.freeze({ id: 'nested-agents-md', kind: 'instructions', tools: Object.freeze(['codex', 'cursor', 'antigravity', 'gemini-cli']), pattern: /^[^/]+\/AGENTS\.md$/ }),
  Object.freeze({ id: 'claude-rules', kind: 'rules', tools: Object.freeze(['claude-code']), pattern: /^\.claude\/rules\/.+\.md$/ }),
  Object.freeze({ id: 'claude-skills', kind: 'skill', tools: Object.freeze(['claude-code']), pattern: /^\.claude\/skills\/.+/ }),
  Object.freeze({ id: 'claude-agents', kind: 'agent', tools: Object.freeze(['claude-code']), pattern: /^\.claude\/agents\/.+/ }),
  Object.freeze({ id: 'agents-skills', kind: 'skill', tools: Object.freeze(['codex']), pattern: /^\.agents\/skills\/.+/ }),
  // `.claude/agents` is Claude Code's **summoning registry** — a seat missing from
  // it cannot be spawned at all. Its twin here is where a tool without subagents
  // **opens and reads** the same brief. The purposes differ but the content must
  // match, which is what agent-copy enforces.
  Object.freeze({ id: 'agents-agents', kind: 'agent', tools: Object.freeze(['codex']), pattern: /^\.agents\/agents\/.+/ }),
  Object.freeze({ id: 'cursor-rules', kind: 'rules', tools: Object.freeze(['cursor']), pattern: /^\.cursor\/rules\/.+\.mdc$/ }),
  Object.freeze({ id: 'cursorrules', kind: 'rules', tools: Object.freeze(['cursor']), pattern: /^\.cursorrules$/ }),
  Object.freeze({ id: 'copilot-instructions', kind: 'instructions', tools: Object.freeze(['copilot']), pattern: /^\.github\/copilot-instructions\.md$/ }),
  Object.freeze({ id: 'claude-hooks', kind: 'config', tools: Object.freeze(['claude-code']), pattern: /^\.claude\/hooks\/.+/ }),
  Object.freeze({ id: 'claude-settings', kind: 'config', tools: Object.freeze(['claude-code']), pattern: /^\.claude\/settings\.json$/ }),
  Object.freeze({ id: 'codex-dir', kind: 'config', tools: Object.freeze(['codex']), pattern: /^\.codex\/.+/ }),
  Object.freeze({ id: 'mcp-json', kind: 'mcp-config', tools: Object.freeze(['claude-code', 'cursor']), pattern: /^\.mcp\.json$/ }),
]);

/** Classify a repo-root-relative path. Returns null for non-agent files. */
export function classifyAgentFilePath(path) {
  for (const rule of AGENT_FILE_RULES) {
    if (rule.pattern.test(path)) {
      return { ruleId: rule.id, kind: rule.kind, tools: [...rule.tools] };
    }
  }
  return null;
}

// ── @reference extraction ──────────────────────────────────────────────────

/** Extensions an @reference must end with to count as a file reference. */
const AT_REF_EXTENSIONS = Object.freeze([
  '.md', '.mdc', '.mjs', '.js', '.ts', '.tsx', '.json', '.toml', '.sh', '.yml', '.yaml',
]);

const AT_REF_RE = /(?:^|[\s(`"'])@([A-Za-z0-9._/-]+)/gm;

/**
 * Extract `@path/to/file.ext` references from markdown. Requires a known file
 * extension so emails (user@host), npm scopes (@scope/pkg), css at-rules
 * (@media) and versions (@4.11) never match. Trailing sentence punctuation is
 * trimmed. Returns refs in document order, deduplicated.
 */
export function extractAtRefs(content) {
  const out = [];
  const seen = new Set();
  const lines = String(content ?? '').split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    AT_REF_RE.lastIndex = 0;
    let match;
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

function utf8ByteLength(content) {
  return new TextEncoder().encode(String(content ?? '')).length;
}

function entryBytes(entry) {
  if (typeof entry.bytes === 'number') return entry.bytes;
  return utf8ByteLength(entry.content ?? '');
}

/** Normalize `a/b/../c` style joins without touching the filesystem. */
function normalizePath(path) {
  const parts = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (parts.length === 0) return null; // escapes the root: never resolvable
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join('/');
}

function dirnamePath(path) {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? '' : path.slice(0, idx);
}

/**
 * Detect a *real* `@AGENTS.md` import in CLAUDE.md — fenced code blocks and
 * inline code spans are stripped first, so a backticked mention (`@AGENTS.md`)
 * in prose does not count as a working bridge.
 */
function hasClaudeAgentsImport(content) {
  const withoutFences = String(content ?? '').replace(/```[\s\S]*?```/g, '');
  const withoutInlineCode = withoutFences.replace(/`[^`\n]*`/g, '');
  return /(^|\s)@AGENTS\.md(?=\s|$)/m.test(withoutInlineCode);
}

// ── the seven drift checks ──────────────────────────────────────────────────

function checkClaudeAgentsBridge(recordByPath, existingPathSet, drift) {
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
      message: 'CLAUDE.md does not import @AGENTS.md: Claude Code and AGENTS.md readers see different instructions',
      detail: { ref: 'AGENTS.md' },
    });
    claude.drift.push('missing-agents-import');
    return { status: 'drift' };
  }
  return { status: 'not-applicable' };
}

/**
 * `.claude/agents` ↔ `.agents/agents` — the cross-tool pair for seat briefs.
 *
 * **Why this is separate from the skill pair.** Two tools read a skill for the
 * *same* purpose; seat briefs serve different ones. For Claude Code
 * `.claude/agents/*.md` is the subagent **registry** (a seat absent from it cannot
 * be summoned); for Codex `.agents/agents/*.md` is a **reference document it
 * opens** while walking a council sequentially. Different purposes, identical
 * content — so the pair is required, and a pair with no gate drifts by default.
 * This repository already lived that failure with duplicated skills.
 *
 * A file present on one side only is drift too. Adding a Claude-only seat leaves a
 * Codex session with a name it can **neither summon nor read** (measured
 * 2026-08-04: all 15 seats were in that state).
 */
function checkAgentCopy(records, drift) {
  const claudeByName = new Map();
  const agentsByName = new Map();
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
      const present = claude ?? agents;
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

  const status =
    divergedFiles > 0 || oneSidedFiles > 0 ? 'drift' : comparedFiles > 0 ? 'ok' : 'not-applicable';
  return { status, comparedFiles, divergedFiles, oneSidedFiles };
}

function checkSkillCopy(records, drift) {
  const claudeByRel = new Map();
  const agentsByRel = new Map();
  for (const record of records) {
    if (record.path.startsWith(CLAUDE_SKILLS_PREFIX)) {
      claudeByRel.set(record.path.slice(CLAUDE_SKILLS_PREFIX.length), record);
    } else if (record.path.startsWith(AGENTS_SKILLS_PREFIX)) {
      agentsByRel.set(record.path.slice(AGENTS_SKILLS_PREFIX.length), record);
    }
  }
  const skillName = (rel) => rel.split('/')[0];
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
      const present = claude ?? agents;
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

  const status =
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
}

function checkAtRefs(records, options, drift) {
  const { existingPathSet, recordPathSet, unverifiablePrefixes, verifiableExtensions } = options;
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
      const candidates = [];
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
  return {
    status: missingRefs > 0 ? 'drift' : refsChecked > 0 ? 'ok' : 'not-applicable',
    refsChecked,
    missingRefs,
    unverifiedRefs,
  };
}

/**
 * Every agent file is read by an agent, so its whole content — not only its
 * comments — is steering text. A guard whose `permissionDecisionReason` was
 * Korean shipped for months because `scripts/quality/source-language` audits
 * comments in `.sh` and skips `.json` entirely, and the string literal that
 * an agent actually reads sat in neither subject set (2026-08-23 audit). This
 * repository is open source and English-only, and a Codex, Cursor or Gemini
 * run has no reason to parse Hangul, kana or Han at the moment it is blocked.
 *
 * Localized product data is not an agent file: `cli/templates/vault-ko/**` and
 * `display_<locale>` frontmatter never match AGENT_FILE_RULES, so they are out
 * of this subject set by construction rather than by exception.
 */
const NON_ENGLISH_SCRIPT_RE =
  /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff]/gu;

function checkAgentLanguage(records, drift, requireEnglish) {
  // Opt-in. This is one repository's policy, not a truth about agent files, and
  // the same analyzer reads a user's own vault through the web docs workbench —
  // where `cli/templates/vault-ko` is a supported starter. Imposing English
  // there would call a correct Korean vault broken (contract, 2026-08-24).
  if (!requireEnglish) {
    return { status: 'not-applicable', scannedFiles: 0, flaggedFiles: 0, codePoints: 0 };
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
  return {
    status: flaggedFiles > 0 ? 'drift' : scannedFiles > 0 ? 'ok' : 'not-applicable',
    scannedFiles,
    flaggedFiles,
    codePoints,
  };
}

/**
 * Codex concatenates AGENTS.md root-down along the working directory and stops
 * adding files once the combined size reaches `project_doc_max_bytes`, then
 * truncates silently. Measuring the root file alone therefore understates the
 * budget the moment a nested AGENTS.md exists: what a session actually loads is
 * root plus the nested files on its path. Nested files here are one level deep,
 * so the worst case any path can reach is root plus the largest of them.
 */
/**
 * `absent` and `unparseable` must not collapse together. A vault with no config
 * has nothing to contradict, so the check does not apply. A config that exists
 * but declares nothing makes every grant undeclared — reading that as a pass is
 * the fail-open shape this repository has already been bitten by (probe,
 * 2026-08-24).
 */
function declaredFromMcpJson(record) {
  if (!record || typeof record.entry.content !== 'string') {
    return { state: 'absent', servers: new Set() };
  }
  try {
    const servers = JSON.parse(record.entry.content)?.mcpServers;
    return {
      state: 'parsed',
      servers: new Set(servers && typeof servers === 'object' ? Object.keys(servers) : []),
    };
  } catch {
    return { state: 'unparseable', servers: new Set() };
  }
}

/**
 * Codex declares its servers in TOML, and this module is shared with the web
 * bundle, so it reads section headers rather than importing a parser the browser
 * build has no reason to carry. `[mcp_servers.name]` and
 * `[mcp_servers.name.env]` both name the same server; only the first segment
 * counts. A config with no such section declares nothing, which is the
 * `unparseable` verdict above rather than a pass.
 */
const TOML_MCP_SECTION_RE =
  /^[ \t]*\[[ \t]*(?:mcp_servers|"mcp_servers"|'mcp_servers')[ \t]*\.[ \t]*(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_-]+))/gm;

function declaredFromCodexConfig(record) {
  if (!record || typeof record.entry.content !== 'string') {
    return { state: 'absent', servers: new Set() };
  }
  const servers = new Set();
  for (const match of record.entry.content.matchAll(TOML_MCP_SECTION_RE)) {
    servers.add(match[1] ?? match[2] ?? match[3]);
  }
  return { state: servers.size > 0 ? 'parsed' : 'unparseable', servers };
}

/**
 * An agent brief's `tools:` list is an allowlist, not a request. Naming
 * `mcp__chrome-devtools__evaluate_script` on a seat whose server no repository
 * config declares does not fail loudly — the tool is simply absent, and the seat
 * runs on with no way to measure anything. Eight design seats and one PO seat
 * granted exactly that for months while `.mcp.json` declared one server; the
 * design gate AGENTS.md calls mandatory was inoperable for anyone but the author,
 * whose personal `~/.claude.json` happened to carry it (2026-08-24 audit).
 *
 * Each tree is measured against the config its own reader consults: `.claude`
 * briefs against `.mcp.json`, `.agents` briefs against `.codex/config.toml`. The
 * first version measured both against `.mcp.json` and therefore passed while
 * `.codex/config.toml` declared one server and the eight mirrored Codex seats
 * granted two — the same defect the check was written to catch, hidden by the
 * wrong denominator. Because the two brief trees are byte identical, this means
 * in practice that every granted server must be declared in both configs.
 *
 * A personal config cannot be the repository's contract. What a fresh clone can
 * start is what these files say, so that is what this measures.
 */
const MCP_TOOL_RE = /\bmcp__([a-z0-9][a-z0-9_-]*)__[a-z0-9_]+/gi;

const GRANT_SOURCES = Object.freeze([
  Object.freeze({ prefix: '.claude/agents/', configPath: '.mcp.json', read: declaredFromMcpJson }),
  Object.freeze({
    prefix: '.agents/agents/',
    configPath: '.codex/config.toml',
    read: declaredFromCodexConfig,
  }),
]);

function checkMcpGrants(recordByPath, records, drift) {
  const undeclared = new Set();
  const unparseableConfigs = [];
  let briefsChecked = 0;
  let grantsChecked = 0;
  let anyConfig = false;

  for (const source of GRANT_SOURCES) {
    const briefs = records.filter(
      (r) => r.path.startsWith(source.prefix) && typeof r.entry.content === 'string',
    );
    const config = source.read(recordByPath.get(source.configPath));
    if (config.state === 'absent' || briefs.length === 0) continue;
    anyConfig = true;
    briefsChecked += briefs.length;

    if (config.state === 'unparseable') {
      unparseableConfigs.push(source.configPath);
      const configRecord = recordByPath.get(source.configPath);
      drift.push({
        check: 'mcp-grants',
        code: 'mcp-config-unparseable',
        path: source.configPath,
        message:
          `${source.configPath} exists but declares no MCP server: every agent-brief grant in `
          + `${source.prefix} is undeclared and a fresh clone silently loses those tools`,
        detail: { prefix: source.prefix },
      });
      if (configRecord && !configRecord.drift.includes('mcp-config-unparseable')) {
        configRecord.drift.push('mcp-config-unparseable');
      }
    }

    for (const record of briefs) {
      const frontmatter = record.entry.content.split('\n---')[0];
      const seen = new Set();
      for (const [, server] of frontmatter.matchAll(MCP_TOOL_RE)) {
        grantsChecked += 1;
        if (config.servers.has(server) || seen.has(server)) continue;
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
      status: 'not-applicable',
      briefsChecked: 0,
      grantsChecked: 0,
      undeclaredServers: [],
      unparseableConfigs: [],
    };
  }
  return {
    status: undeclared.size > 0 || unparseableConfigs.length > 0 ? 'drift' : 'ok',
    briefsChecked,
    grantsChecked,
    undeclaredServers: [...undeclared].sort(),
    unparseableConfigs: unparseableConfigs.sort(),
  };
}

function checkCodexSizeCap(recordByPath, records, drift) {
  const agents = recordByPath.get('AGENTS.md');
  const nested = records.filter((r) => r.ruleId === 'nested-agents-md');
  const nestedBytes = nested.reduce((max, r) => Math.max(max, r.bytes), 0);
  const worst = nested.reduce((a, b) => (a && a.bytes >= b.bytes ? a : b), null);
  if (!agents) {
    return {
      status: 'not-applicable',
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
    return { status: 'drift', ...shared };
  }
  return { status: 'ok', ...shared };
}

// ── entry point ────────────────────────────────────────────────────────────

/**
 * Analyze a scanned file set. Pure — the caller supplies everything:
 *
 * - `files`: `{ path, content?, bytes? }[]` — repo-root-relative paths with
 *   contents where the scanner could read them. Non-agent paths are ignored.
 * - `existingPaths`: every extra path the scanner can confirm exists
 *   (used to resolve `@references` and the AGENTS.md bridge target).
 * - `unverifiablePrefixes`: path prefixes the scanner *cannot see* (the web
 *   FSA scanner passes `['.']` — dot files are invisible to the vault walk),
 *   so refs into them report `unverified` instead of false `missing`.
 * - `verifiableExtensions`: when set, only refs with these extensions can be
 *   judged missing (the web manifest only indexes `.md`).
 * - `requireEnglish`: opt in to the English-only agent-text check. Off by
 *   default so analysing someone else's repository or vault never imports this
 *   repository's language policy.
 */
export function analyzeAgentFiles({
  files,
  existingPaths = [],
  unverifiablePrefixes = [],
  verifiableExtensions = null,
  requireEnglish = false,
}) {
  const records = [];
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
  const drift = [];

  const checks = {
    claudeAgentsBridge: checkClaudeAgentsBridge(recordByPath, existingPathSet, drift),
    skillCopy: checkSkillCopy(records, drift),
    agentCopy: checkAgentCopy(records, drift),
    atRefs: checkAtRefs(
      records,
      { existingPathSet, recordPathSet, unverifiablePrefixes, verifiableExtensions },
      drift,
    ),
    codexSizeCap: checkCodexSizeCap(recordByPath, records, drift),
    agentLanguage: checkAgentLanguage(records, drift, requireEnglish),
    mcpGrants: checkMcpGrants(recordByPath, records, drift),
  };

  const byTool = {};
  const byKind = {};
  for (const record of records) {
    byKind[record.kind] = (byKind[record.kind] ?? 0) + 1;
    for (const tool of record.tools) byTool[tool] = (byTool[tool] ?? 0) + 1;
  }

  const publicRecords = records.map((record) => ({
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
      ),
    },
  };
}
