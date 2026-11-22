import { cn } from '@/shared/lib/cn';

/** How many closing characters stay when a branch name is cut, so `…-tile` still tells rooms apart. */
const TAIL_CHARS = 8;

/** Splits `feat/vault-switch-tile` into its kind, the cuttable middle and the tail that always shows. */
export function branchParts(branch: string): { kind: string; middle: string; tail: string } {
  const slash = branch.indexOf('/');
  const kind = slash > 0 && slash < branch.length - 1 ? branch.slice(0, slash + 1) : '';
  const name = branch.slice(kind.length);
  if (name.length <= TAIL_CHARS * 2) return { kind, middle: name, tail: '' };
  // The tail starts at a word break, so it reads `-run-stage`, not `un-stage`.
  const point = name.length - TAIL_CHARS;
  const breakAt = Math.max(name.lastIndexOf('-', point), name.lastIndexOf('_', point), name.lastIndexOf('/', point));
  const cut = breakAt > 0 ? breakAt : point;
  return { kind, middle: name.slice(0, cut), tail: name.slice(cut) };
}

/**
 * A branch name in mono: its kind (`feat/`, `fix/`) muted, and when it does not fit, the ellipsis
 * in the middle, so the part that tells two branches apart survives.
 */
export function BranchName({ branch, className }: { branch: string; className?: string }) {
  const { kind, middle, tail } = branchParts(branch);
  return (
    <span className={cn('flex min-w-0 font-mono', className)} title={branch}>
      {kind ? <span className="shrink-0 text-[color:var(--color-text-tertiary)]">{kind}</span> : null}
      <span className="min-w-0 truncate">{middle}</span>
      {tail ? <span className="shrink-0">{tail}</span> : null}
    </span>
  );
}
