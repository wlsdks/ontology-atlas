/**
 * Project source remedy — turns a diagnosis into something callable.
 *
 * `projectSource.nextAction.id` has always been a *name*. A name is not a
 * prescription: the app said "connect the source" while no tool, command, or
 * button existed that could. This module is the single mapping from every
 * action id in the receipt vocabulary to the exact MCP tool call and CLI
 * command that performs it — so an agent can execute it and a screen can
 * render it as one button, from the same table.
 *
 * It adds no new gap/action vocabulary. The ids come from
 * `project-source-receipt.mjs`; this only says what runs them.
 *
 * Pure. MCP callers and contract tests consume this table directly.
 */

export const PROJECT_SOURCE_REMEDY_CONTRACT = 'projectSourceRemedy:v1';

export const PROJECT_SOURCE_CONNECT_TOOL = 'connect_project_source';
export const PROJECT_SOURCE_DISCONNECT_TOOL = 'disconnect_project_source';
export const PROJECT_SOURCE_CONNECT_COMMAND = 'connect-source';
export const PROJECT_SOURCE_DISCONNECT_COMMAND = 'disconnect-source';

/**
 * What a person still has to supply before the remedy can run.
 * - `none`        — one confirmed call finishes it
 * - `path_choice` — the automatic proposal may be wrong; a folder must be chosen
 * - `authoring`   — the fix is meaning, not wiring: a node needs a real `path:`
 */
const REMEDIES = Object.freeze({
  connect_source: {
    tool: PROJECT_SOURCE_CONNECT_TOOL,
    command: PROJECT_SOURCE_CONNECT_COMMAND,
    automatable: true,
    requiresHuman: 'none',
    inferRoot: true,
  },
  repair_source_binding: {
    tool: PROJECT_SOURCE_CONNECT_TOOL,
    command: PROJECT_SOURCE_CONNECT_COMMAND,
    automatable: true,
    requiresHuman: 'none',
    inferRoot: true,
  },
  measure_source: {
    tool: PROJECT_SOURCE_CONNECT_TOOL,
    command: PROJECT_SOURCE_CONNECT_COMMAND,
    automatable: true,
    requiresHuman: 'none',
    inferRoot: false,
  },
  remeasure_source: {
    tool: PROJECT_SOURCE_CONNECT_TOOL,
    command: PROJECT_SOURCE_CONNECT_COMMAND,
    automatable: true,
    requiresHuman: 'none',
    inferRoot: false,
  },
  review_inventory_limit: {
    tool: PROJECT_SOURCE_CONNECT_TOOL,
    command: PROJECT_SOURCE_CONNECT_COMMAND,
    automatable: false,
    requiresHuman: 'path_choice',
    inferRoot: false,
  },
  record_source_role: {
    tool: 'patch_concept',
    command: 'node',
    automatable: false,
    requiresHuman: 'authoring',
    inferRoot: false,
  },
  repair_source_path: {
    tool: 'patch_concept',
    command: 'node',
    automatable: false,
    requiresHuman: 'authoring',
    inferRoot: false,
  },
  use_current_evidence: null,
});

function connectArguments(projectSlug, spec, target) {
  if (spec.tool === PROJECT_SOURCE_CONNECT_TOOL) {
    return { projectSlug, confirm: true };
  }
  return { slug: target ?? projectSlug };
}

function connectCliArguments(projectSlug, spec, target) {
  if (spec.tool === PROJECT_SOURCE_CONNECT_TOOL) {
    return [projectSlug, '--confirm'];
  }
  return [target ?? projectSlug];
}

/**
 * @param {{projectSlug?: string, nextAction?: {id?: string, target?: string}}} view
 *   a `ProjectSourceView` (the shape `agent_brief.projectSource` returns).
 */
export function projectSourceRemedy(view) {
  const actionId = view?.nextAction?.id ?? null;
  const projectSlug = typeof view?.projectSlug === 'string' ? view.projectSlug : null;
  const spec = actionId && Object.hasOwn(REMEDIES, actionId) ? REMEDIES[actionId] : undefined;
  if (spec === undefined) {
    return {
      contract: PROJECT_SOURCE_REMEDY_CONTRACT,
      actionId,
      resolvable: false,
      automatable: false,
      requiresHuman: 'none',
      requiresConfirm: false,
      inferRoot: false,
      tool: null,
      cli: null,
      undo: null,
    };
  }
  if (spec === null) {
    return {
      contract: PROJECT_SOURCE_REMEDY_CONTRACT,
      actionId,
      resolvable: false,
      automatable: false,
      requiresHuman: 'none',
      requiresConfirm: false,
      inferRoot: false,
      tool: null,
      cli: null,
      undo: undoPlan(projectSlug),
    };
  }
  const target = typeof view?.nextAction?.target === 'string' ? view.nextAction.target : null;
  return {
    contract: PROJECT_SOURCE_REMEDY_CONTRACT,
    actionId,
    resolvable: true,
    automatable: spec.automatable,
    requiresHuman: spec.requiresHuman,
    requiresConfirm: spec.tool === PROJECT_SOURCE_CONNECT_TOOL,
    inferRoot: spec.inferRoot,
    tool: { name: spec.tool, arguments: connectArguments(projectSlug, spec, target) },
    cli: { command: spec.command, args: connectCliArguments(projectSlug, spec, target) },
    undo: spec.tool === PROJECT_SOURCE_CONNECT_TOOL ? undoPlan(projectSlug) : null,
  };
}

/** Reversal is a first-class part of the prescription, not an afterthought. */
export function undoPlan(projectSlug) {
  if (!projectSlug) return null;
  return {
    tool: { name: PROJECT_SOURCE_DISCONNECT_TOOL, arguments: { projectSlug, confirm: true } },
    cli: { command: PROJECT_SOURCE_DISCONNECT_COMMAND, args: [projectSlug, '--confirm'] },
  };
}
