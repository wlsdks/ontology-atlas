'use client';

import { useDocMove } from './use-doc-move';
import { useDocFrontmatterEdit } from './use-doc-frontmatter-edit';
import { useDocCreate } from './use-doc-create';
import { useDocTools } from './use-doc-tools';

type DocWriteActionsArgs = Parameters<typeof useDocMove>[0] &
  Parameters<typeof useDocCreate>[0] &
  Parameters<typeof useDocTools>[0] &
  Omit<Parameters<typeof useDocFrontmatterEdit>[0], 'moveDoc'>;

export function useDocWriteActions(args: DocWriteActionsArgs) {
  const move = useDocMove(args);
  const create = useDocCreate(args);
  const tools = useDocTools(args);
  const frontmatter = useDocFrontmatterEdit({ ...args, moveDoc: move.moveDoc });
  return { ...move, ...create, ...tools, ...frontmatter };
}
