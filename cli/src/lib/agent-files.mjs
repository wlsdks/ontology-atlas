// Read-only "agent files" detection — pure logic, no filesystem access.
//
// Multi-agent-tool repos scatter instructions across 6+ formats (CLAUDE.md,
// AGENTS.md, .claude/rules|skills|agents, .agents/skills, .cursor, .codex,
// .mcp.json). Nobody sees which tool reads which file, and physically
// duplicated skill trees drift byte-by-byte with no watchdog. This module
// classifies known agent-file paths (data-driven table — one update point)
// and runs four read-only drift checks. It never converts, syncs, or repairs.
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
export const AGENT_TOOL_LABELS = Object.freeze({
  'claude-code': 'Claude Code',
  codex: 'Codex',
  cursor: 'Cursor',
  'gemini-cli': 'Gemini CLI',
  copilot: 'Copilot',
});

/**
 * Known agent-file patterns → which tools read them. Repo-root scoped
 * (desktop/repo-root-first slice): nested CLAUDE.md variants are out of scope.
 */
export const AGENT_FILE_RULES = Object.freeze([
  Object.freeze({ id: 'claude-md', kind: 'instructions', tools: Object.freeze(['claude-code']), pattern: /^CLAUDE\.md$/ }),
  Object.freeze({ id: 'agents-md', kind: 'instructions', tools: Object.freeze(['codex', 'cursor', 'gemini-cli']), pattern: /^AGENTS\.md$/ }),
  Object.freeze({ id: 'gemini-md', kind: 'instructions', tools: Object.freeze(['gemini-cli']), pattern: /^GEMINI\.md$/ }),
  Object.freeze({ id: 'claude-rules', kind: 'rules', tools: Object.freeze(['claude-code']), pattern: /^\.claude\/rules\/.+\.md$/ }),
  Object.freeze({ id: 'claude-skills', kind: 'skill', tools: Object.freeze(['claude-code']), pattern: /^\.claude\/skills\/.+/ }),
  Object.freeze({ id: 'claude-agents', kind: 'agent', tools: Object.freeze(['claude-code']), pattern: /^\.claude\/agents\/.+/ }),
  Object.freeze({ id: 'agents-skills', kind: 'skill', tools: Object.freeze(['codex']), pattern: /^\.agents\/skills\/.+/ }),
  // `.claude/agents` 는 Claude Code 의 **소환 등록부**(없으면 서브에이전트를 못
  // 띄운다)이고, 이 짝은 서브에이전트가 없는 도구가 같은 브리프를 **열어서
  // 읽는** 자리다. 목적은 달라도 내용은 같아야 하므로 agent-copy 가 지킨다.
  Object.freeze({ id: 'agents-agents', kind: 'agent', tools: Object.freeze(['codex']), pattern: /^\.agents\/agents\/.+/ }),
  Object.freeze({ id: 'cursor-rules', kind: 'rules', tools: Object.freeze(['cursor']), pattern: /^\.cursor\/rules\/.+\.mdc$/ }),
  Object.freeze({ id: 'cursorrules', kind: 'rules', tools: Object.freeze(['cursor']), pattern: /^\.cursorrules$/ }),
  Object.freeze({ id: 'copilot-instructions', kind: 'instructions', tools: Object.freeze(['copilot']), pattern: /^\.github\/copilot-instructions\.md$/ }),
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
      if (parts.length === 0) return null; // escapes the root — never resolvable
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

// ── the four drift checks ──────────────────────────────────────────────────

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
      message: 'CLAUDE.md does not import @AGENTS.md — Claude Code and AGENTS.md readers see different instructions',
      detail: { ref: 'AGENTS.md' },
    });
    claude.drift.push('missing-agents-import');
    return { status: 'drift' };
  }
  return { status: 'not-applicable' };
}

/**
 * `.claude/agents` ↔ `.agents/agents` — 자리 브리프의 교차 도구 짝.
 *
 * **왜 스킬과 따로 있나.** 스킬은 두 도구가 *같은 목적으로* 읽지만, 자리
 * 브리프는 목적이 다르다: Claude Code 에게 `.claude/agents/*.md` 는 서브에이전트
 * **등록부**(거기 없으면 소환 자체가 안 된다)이고, Codex 에게 `.agents/agents/*.md`
 * 는 카운슬을 순차로 돌 때 **여는 참고 문서**다. 목적이 달라도 내용은 같아야
 * 하므로 짝이 필요하고, 짝인데 게이트가 없으면 어긋나는 쪽이 기본값이 된다 —
 * 이 저장소가 스킬 이중화에서 이미 겪은 실패다.
 *
 * 한쪽에만 있는 파일도 drift 다. Claude 전용 자리를 새로 만들면 Codex 세션은
 * 그 자리를 **부를 수도 읽을 수도 없이** 이름만 받는다(2026-08-04 실측: 자리
 * 15개 전부가 그 상태였다).
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

function checkCodexSizeCap(recordByPath, drift) {
  const agents = recordByPath.get('AGENTS.md');
  if (!agents) return { status: 'not-applicable', agentsMdBytes: null, capBytes: CODEX_PROJECT_DOC_CAP_BYTES };
  const bytes = agents.bytes;
  if (bytes > CODEX_PROJECT_DOC_CAP_BYTES) {
    drift.push({
      check: 'codex-size-cap',
      code: 'agents-md-over-codex-cap',
      path: 'AGENTS.md',
      message: `AGENTS.md is ${bytes} bytes — over the Codex project_doc_max_bytes default of ${CODEX_PROJECT_DOC_CAP_BYTES}`,
      detail: { bytes, capBytes: CODEX_PROJECT_DOC_CAP_BYTES },
    });
    agents.drift.push('agents-md-over-codex-cap');
    return { status: 'drift', agentsMdBytes: bytes, capBytes: CODEX_PROJECT_DOC_CAP_BYTES };
  }
  return { status: 'ok', agentsMdBytes: bytes, capBytes: CODEX_PROJECT_DOC_CAP_BYTES };
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
 */
export function analyzeAgentFiles({
  files,
  existingPaths = [],
  unverifiablePrefixes = [],
  verifiableExtensions = null,
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
    codexSizeCap: checkCodexSizeCap(recordByPath, drift),
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
