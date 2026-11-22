/**
 * Agent settings from every scope (User, Project, Local, Managed, System and picked files): the
 * catalogue of where each lives, pane 2's headings, and the facts Setup points out.
 */
export { hookFilePattern, SCOPE_FILES, SCOPES_BY_REACH } from './model/scope-files';
export { scopeHeadings, type ScopeHeading } from './model/scope-headings';
export {
  isWorkStatusHook,
  scopeFindings,
  scopeHookKey,
  WORK_STATUS_HELPER_NAME,
  type ScopeFinding,
  type ScopeFindings,
  type ScopeHookTag,
} from './model/scope-findings';
export { SCOPE_NAMES, SCOPE_REACH, type ReachScope, type ScopeReach } from './model/scope-reach';
export { ReachGrid, ReachMark } from './ui/ReachMark';
