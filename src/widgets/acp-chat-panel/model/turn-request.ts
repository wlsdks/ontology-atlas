import type { AcpTurnRequest, AcpTurnRequestAction } from '../ui/chat-panel/types';

interface RequestFacts {
  title: string | null;
  toolKind: string | null;
  filePath: string | null;
  reviewKind: 'permission' | 'ontology-write';
}

const ACTION_BY_KIND: Readonly<Record<string, AcpTurnRequestAction>> = {
  edit: 'edit',
  move: 'edit',
  delete: 'delete',
  execute: 'execute',
  read: 'read',
  search: 'read',
  fetch: 'read',
};

/** A path inside the folder by its folder-relative name; any other path whole. */
function folderRelative(path: string, vaultRoot: string | null): string {
  const normalized = path.replaceAll('\\', '/');
  const root = vaultRoot?.replaceAll('\\', '/').replace(/\/+$/, '') ?? null;
  return root && normalized.startsWith(`${root}/`) ? normalized.slice(root.length + 1) : path;
}

/** Who wants what, as the work card names a waiting request away from its conversation. */
export function turnRequestOf(request: RequestFacts, vaultRoot: string | null): AcpTurnRequest {
  const title = request.title?.trim() || null;
  if (request.reviewKind === 'ontology-write') return { action: 'ontology', target: title };
  const action = ACTION_BY_KIND[request.toolKind?.trim().toLowerCase() ?? ''] ?? 'unknown';
  if (action === 'unknown' || action === 'execute') return { action, target: title };
  return { action, target: request.filePath ? folderRelative(request.filePath, vaultRoot) : title };
}
