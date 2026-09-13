import type { AgentTool } from './agent-files';

/**
 * **Where each "this tool reads this file" claim came from.**
 *
 * `analyzeAgentFiles` already answers *which* tool reads *which* file — that classifier is the
 * repository's one canonical answer and this module does not repeat it. What it adds is the half
 * the classifier never carried: the document each claim was read from.
 *
 * The distinction matters because every other column on the Harness screen is measured from the
 * repository itself, and this one is not. Presence, bytes, byte-drift and wiring are facts about
 * files on disk; "Codex merges nested `AGENTS.md` root-down" is a claim about somebody else's
 * product, true only until they change it. A wrong row here looks exactly like a right one, so the
 * screen prints the source beside the claim, and says so where we have none — a
 * correction the Evidence seat required on 2026-09-13 after finding `antigravity` resolved in the
 * classifier with nothing behind it.
 *
 * Sources were fetched and read on `CITATIONS_REVIEWED`; the digest behind them is
 * `harness-research.md` §2. Re-reading them is the standing maintenance cost of this file, and the
 * screen prints the date so a reader can weigh the row's age without asking anyone.
 */

/** The day a person last opened every URL below and confirmed the claim still stands. */
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

interface GuideCitation {
  /** The document the claim was read from. */
  source: string;
  /**
   * A condition the repository itself cannot see. Copilot reads `AGENTS.md` only in its coding
   * agent; Gemini CLI reads it only when a `context` block in `.gemini/settings.json` wires it.
   * Printing "reads it" flat would overstate both.
   */
  condition?: 'coding-agent' | 'settings-context';
}

/**
 * `${ruleId}:${tool}` → the document behind that claim. A pair absent from this map is **uncited**,
 * which the screen states; it is never silently rendered as though it were sourced.
 */
const CITATIONS: Readonly<Record<string, GuideCitation>> = Object.freeze({
  'claude-md:claude-code': { source: CLAUDE_STEERING },

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

/** The document behind one claim, or `null` when we have none and the screen must say so. */
export function guideCitation(ruleId: string, tool: AgentTool): GuideCitation | null {
  return CITATIONS[`${ruleId}:${tool}`] ?? null;
}

/**
 * Tools the classifier resolves but this module cannot cite from anything fetched. Antigravity CLI
 * is the live case: the classifier lists it beside Gemini CLI as its successor, and the research
 * digest's §2 covers neither its `AGENTS.md` handling nor its hooks. Naming it here is how the gap
 * stays visible instead of becoming a claim.
 */
export const UNCITED_TOOLS: readonly AgentTool[] = Object.freeze(['antigravity']);
