import type { AgentTool } from './agent-files';

/**
 * The source document behind each "this tool reads this file" claim, reviewed on
 * `CITATIONS_REVIEWED` (digest: `harness-research.md` §2). An uncited pair is shown as uncited.
 */

/** The day every URL below was last reopened and confirmed. */
export const CITATIONS_REVIEWED = '2026-09-12';

const CODEX_CUSTOMIZATION = 'https://developers.openai.com/codex/concepts/customization';
const CODEX_SKILLS = 'https://developers.openai.com/codex/skills';
const CODEX_SUBAGENTS = 'https://developers.openai.com/codex/subagents';
const CLAUDE_STEERING =
  'https://claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more';
const CLAUDE_SUBAGENTS = 'https://code.claude.com/docs/en/sub-agents';
const CLAUDE_HOOKS = 'https://platform.claude.com/docs/en/agent-sdk/hooks';
const CURSOR_AGENTS_MD = 'https://agents.md/';
const COPILOT_INSTRUCTIONS =
  'https://docs.github.com/en/copilot/reference/custom-instructions-support';
const GEMINI_MD = 'https://google-gemini.github.io/gemini-cli/docs/cli/gemini-md.html';
const CURSOR_IGNORE = 'https://cursor.com/help/customization/ignore-files';
/* One page covers both: `.aiexclude` is Gemini Code Assist (not an `AgentTool`), `.geminiignore` is Gemini CLI. */
const GEMINI_EXCLUDE = 'https://docs.cloud.google.com/gemini/docs/codeassist/create-aiexclude-file';

interface GuideCitation {
  /** The document the claim was read from. */
  source: string;
  /** A condition the repository cannot see: Copilot's coding agent only, or Gemini's `context` setting. */
  condition?: 'coding-agent' | 'settings-context';
}

/** `${ruleId}:${tool}` → source; an absent pair is stated as uncited. */
const CITATIONS: Readonly<Record<string, GuideCitation>> = Object.freeze({
  'claude-md:claude-code': { source: CLAUDE_STEERING },

  'cursor-ignore:cursor': { source: CURSOR_IGNORE },
  'cursor-indexing-ignore:cursor': { source: CURSOR_IGNORE },
  'gemini-ignore:gemini-cli': { source: GEMINI_EXCLUDE },

  'agents-md:codex': { source: CODEX_CUSTOMIZATION },
  'agents-md:cursor': { source: CURSOR_AGENTS_MD },
  'agents-md:copilot': { source: COPILOT_INSTRUCTIONS, condition: 'coding-agent' },
  'agents-md:gemini-cli': { source: GEMINI_MD, condition: 'settings-context' },

  'nested-agents-md:codex': { source: CODEX_CUSTOMIZATION },
  'nested-agents-md:cursor': { source: CURSOR_AGENTS_MD },
  'nested-agents-md:copilot': { source: COPILOT_INSTRUCTIONS, condition: 'coding-agent' },
  'nested-agents-md:gemini-cli': { source: GEMINI_MD, condition: 'settings-context' },

  'gemini-md:gemini-cli': { source: GEMINI_MD },

  'claude-rules:claude-code': { source: CLAUDE_STEERING },
  'claude-skills:claude-code': { source: CLAUDE_STEERING },
  'claude-agents:claude-code': { source: CLAUDE_SUBAGENTS },
  'claude-hooks:claude-code': { source: CLAUDE_HOOKS },
  'claude-settings:claude-code': { source: CLAUDE_HOOKS },
  'mcp-json:claude-code': { source: CLAUDE_STEERING },

  'agents-skills:codex': { source: CODEX_SKILLS },
  'agents-agents:codex': { source: CODEX_SUBAGENTS },
  'codex-dir:codex': { source: CODEX_CUSTOMIZATION },

  'cursor-rules:cursor': { source: CURSOR_AGENTS_MD },
  'cursorrules:cursor': { source: CURSOR_AGENTS_MD },
  'mcp-json:cursor': { source: CURSOR_AGENTS_MD },

  'copilot-instructions:copilot': { source: COPILOT_INSTRUCTIONS },
});

/** `null` when uncited. */
export function guideCitation(ruleId: string, tool: AgentTool): GuideCitation | null {
  return CITATIONS[`${ruleId}:${tool}`] ?? null;
}

/** Tools the classifier resolves but no fetched source covers. */
export const UNCITED_TOOLS: readonly AgentTool[] = Object.freeze(['antigravity']);
