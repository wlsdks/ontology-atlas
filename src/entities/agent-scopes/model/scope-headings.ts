import type {
  HarnessScopes,
  ScopeFile,
  ScopeHook,
  ScopeName,
} from '@/shared/lib/harness-scopes/tauri-harness-scopes';

/** Pane 2 order: the repository's own files first, then User, then the organisation's. */
const PANE_ORDER: readonly ScopeName[] = ['project', 'local', 'user', 'managed', 'system'];

export interface ScopeHeading {
  file: ScopeFile;
  hooks: readonly ScopeHook[];
}

/**
 * One heading per file that holds hooks of the category, plus every file Atlas could not read, so
 * an invalid or unopenable file is named instead of looking empty. Picked files follow the User file
 * of their tool.
 */
export function scopeHeadings(
  scopes: HarnessScopes,
  inCategory: (hook: ScopeHook, file: ScopeFile) => boolean,
): ScopeHeading[] {
  return [...scopes.files]
    .sort((a, b) => PANE_ORDER.indexOf(a.scope) - PANE_ORDER.indexOf(b.scope))
    .map((file) => ({ file, hooks: file.hooks.filter((hook) => inCategory(hook, file)) }))
    .filter(
      ({ file, hooks }) => hooks.length > 0 || file.status === 'invalid' || file.status === 'unreadable',
    );
}
