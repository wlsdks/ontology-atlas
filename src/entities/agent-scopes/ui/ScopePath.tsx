import { cn } from '@/shared/lib/cn';

/**
 * A path that keeps its file name whole and lets the folders give way in the middle
 * (`~/.claude/ho…/agent-status.sh`); the full path, or `title` when given, is the title.
 */
export function ScopePath({ path, title, className }: { path: string; title?: string; className?: string }) {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  const folder = cut > 0 ? path.slice(0, cut) : '';
  const name = cut > 0 ? path.slice(cut) : path;
  return (
    <span title={title ?? path} className={cn('flex min-w-0 font-mono', className)}>
      {folder ? <span className="min-w-0 truncate">{folder}</span> : null}
      <span className={cn('whitespace-pre', folder ? 'shrink-0' : 'min-w-0 truncate')}>{name}</span>
    </span>
  );
}
