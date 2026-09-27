// Read-only agent-file detection, pure logic: classifies known agent-file paths (one data table) and runs
// drift checks; never converts, syncs or repairs. Web twin `src/entities/agent-files/model/agent-files.ts`, held
// equal by `tests/contract/agent-files.contract.test.ts` over `tests/fixtures/agent-files-cases.mjs`.

export const CODEX_PROJECT_DOC_CAP_BYTES = 32 * 1024;

const CLAUDE_SKILLS_PREFIX = '.claude/skills/';
const AGENTS_SKILLS_PREFIX = '.agents/skills/';
const CLAUDE_AGENTS_PREFIX = '.claude/agents/';
const AGENTS_AGENTS_PREFIX = '.agents/agents/';

/**
 * Tool ids → human labels, the single update point with AGENT_FILE_RULES. `gemini-cli` stays beside
 * `antigravity`: paid Gemini Code Assist tiers and API keys still reach Gemini CLI.
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
  Object.freeze({ id: 'agents-md', kind: 'instructions', tools: Object.freeze(['codex', 'cursor', 'antigravity', 'gemini-cli', 'copilot']), pattern: /^AGENTS\.md$/ }),
  Object.freeze({ id: 'gemini-md', kind: 'instructions', tools: Object.freeze(['antigravity', 'gemini-cli']), pattern: /^GEMINI\.md$/ }),
  // One level only. `cli/templates/vault/AGENTS.md` and its `vault-ko` twin are
  // product data shipped inside a starter vault, not instructions to an agent
  // working on this repository, and they sit three segments deep.
  Object.freeze({ id: 'nested-agents-md', kind: 'instructions', tools: Object.freeze(['codex', 'cursor', 'antigravity', 'gemini-cli', 'copilot']), pattern: /^[^/]+\/AGENTS\.md$/ }),
  Object.freeze({ id: 'claude-rules', kind: 'rules', tools: Object.freeze(['claude-code']), pattern: /^\.claude\/rules\/.+\.md$/ }),
  Object.freeze({ id: 'claude-skills', kind: 'skill', tools: Object.freeze(['claude-code']), pattern: /^\.claude\/skills\/.+/ }),
  Object.freeze({ id: 'claude-agents', kind: 'agent', tools: Object.freeze(['claude-code']), pattern: /^\.claude\/agents\/.+/ }),
  Object.freeze({ id: 'agents-skills', kind: 'skill', tools: Object.freeze(['codex']), pattern: /^\.agents\/skills\/.+/ }),
  // `.claude/agents` is Claude Code's summoning registry (a seat missing there cannot be spawned); this twin
  // is where a tool without subagents reads the same brief. Purposes differ, content must match (agent-copy).
  Object.freeze({ id: 'agents-agents', kind: 'agent', tools: Object.freeze(['codex']), pattern: /^\.agents\/agents\/.+/ }),
  // `.cursorrules` is the legacy form Cursor ignores in agent mode, the mode every consumer here runs in;
  // `.cursor/rules/*.mdc` is the format to write.
  Object.freeze({ id: 'cursor-rules', kind: 'rules', tools: Object.freeze(['cursor']), pattern: /^\.cursor\/rules\/.+\.mdc$/ }),
  Object.freeze({ id: 'cursorrules', kind: 'rules', tools: Object.freeze(['cursor']), pattern: /^\.cursorrules$/ }),
  Object.freeze({ id: 'copilot-instructions', kind: 'instructions', tools: Object.freeze(['copilot']), pattern: /^\.github\/copilot-instructions\.md$/ }),
  Object.freeze({ id: 'claude-hooks', kind: 'config', tools: Object.freeze(['claude-code']), pattern: /^\.claude\/hooks\/.+/ }),
  Object.freeze({ id: 'claude-settings', kind: 'config', tools: Object.freeze(['claude-code']), pattern: /^\.claude\/settings\.json$/ }),
  Object.freeze({ id: 'codex-dir', kind: 'config', tools: Object.freeze(['codex']), pattern: /^\.codex\/.+/ }),
  Object.freeze({ id: 'mcp-json', kind: 'mcp-config', tools: Object.freeze(['claude-code', 'cursor']), pattern: /^\.mcp\.json$/ }),
  // Exclusion files, one product each: `.cursorignore`/`.cursorindexingignore` (Cursor), `.codeiumignore` (Windsurf),
  // `.aiexclude` (Gemini Code Assist; Gemini CLI reads `.geminiignore`), `.aiignore` (JetBrains AI). `.claudeignore`
  // and `.agentignore` are not real formats. Kept byte-for-byte in step with the web twin.
  Object.freeze({ id: 'cursor-ignore', kind: 'exclusion', tools: Object.freeze(['cursor']), pattern: /^\.cursorignore$/ }),
  Object.freeze({ id: 'cursor-indexing-ignore', kind: 'exclusion', tools: Object.freeze(['cursor']), pattern: /^\.cursorindexingignore$/ }),
  Object.freeze({ id: 'codeium-ignore', kind: 'exclusion', tools: Object.freeze([]), pattern: /^\.codeiumignore$/ }),
  Object.freeze({ id: 'ai-exclude', kind: 'exclusion', tools: Object.freeze([]), pattern: /^\.aiexclude$/ }),
  Object.freeze({ id: 'ai-ignore', kind: 'exclusion', tools: Object.freeze([]), pattern: /^\.aiignore$/ }),
  Object.freeze({ id: 'gemini-ignore', kind: 'exclusion', tools: Object.freeze(['gemini-cli']), pattern: /^\.geminiignore$/ }),
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


/** Extensions an @reference must end with to count as a file reference. */
const AT_REF_EXTENSIONS = Object.freeze([
  '.md', '.mdc', '.mjs', '.js', '.ts', '.tsx', '.json', '.toml', '.sh', '.yml', '.yaml',
]);

const AT_REF_RE = /(?:^|[\s(`"'])@([A-Za-z0-9._/-]+)/gm;

/**
 * Extracts `@path/to/file.ext` references from markdown, in order and deduplicated. A known extension is
 * required so emails, npm scopes, css at-rules and versions never match; trailing punctuation is trimmed.
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
 * Detects a real `@AGENTS.md` import in CLAUDE.md: code fences and spans are stripped first, so a
 * backticked mention in prose is not a working bridge.
 */
function hasClaudeAgentsImport(content) {
  const withoutFences = String(content ?? '').replace(/```[\s\S]*?```/g, '');
  const withoutInlineCode = withoutFences.replace(/`[^`\n]*`/g, '');
  return /(^|\s)@AGENTS\.md(?=\s|$)/m.test(withoutInlineCode);
}


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
 * `.claude/agents` ↔ `.agents/agents`: seat briefs serve each tool differently (Claude Code's registry, a
 * reference Codex opens) with identical content, so a file on one side only is drift.
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

// Kept in sync with .githooks/commit-msg-language.mjs: Jamo blocks and
// halfwidth Kana/Hangul included, so jamo-only Korean cannot slip either gate.
const NON_ENGLISH_SCRIPT_RE =
  /[\u1100-\u11ff\u3040-\u30ff\u3130-\u318f\u3400-\u4dbf\u4e00-\u9fff\ua960-\ua97f\uac00-\ud7ff\uf900-\ufaff\uff65-\uffdc]/gu;

/**
 * An agent reads every agent file whole, so its string literals steer too; this repository is English-only.
 * Localized product data (`cli/templates/vault-ko/**`, `display_<locale>`) never matches AGENT_FILE_RULES.
 */
function checkAgentLanguage(records, drift, requireEnglish) {
  // Opt-in: one repository's policy, not a truth about agent files. The web docs workbench reads a user's
  // vault with this analyzer, where `cli/templates/vault-ko` is a supported starter.
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
 * `absent` and `unparseable` must not collapse: no config has nothing to contradict, but a config that
 * declares nothing makes every grant undeclared, and passing it would fail open.
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
 * Codex servers are TOML, and this module ships in the web bundle, so it reads `[mcp_servers.name]` section
 * headers instead of importing a parser; no such section declares nothing (`unparseable`, not a pass).
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
 * A brief's `tools:` list is an allowlist, and an undeclared server's tool is silently absent. `.claude`
 * briefs are measured against `.mcp.json`, `.agents` against `.codex/config.toml`, never a personal config.
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

/**
 * Codex concatenates AGENTS.md root-down and silently truncates past `project_doc_max_bytes`, so the
 * budget is root plus the largest nested file (nested files are one level deep).
 */
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


/**
 * Analyzes a scanned file set; pure, the caller supplies everything. `unverifiablePrefixes` marks paths the
 * scanner cannot see (refs report `unverified`, not `missing`); `requireEnglish` opts into this repository's
 * language policy, so analysing someone else's repository never imports it.
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
