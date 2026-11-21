"use client";

import { controlClass } from "@/shared/ui";
import type { GitChangeEntry } from "@/shared/lib/git/tauri-git";
import { statusMark } from "../../lib/commit-documents";

/** The files one step changed, one row each, with the open one marked. */
export function CommitFileList({
  files,
  activeFile,
  onOpenFile,
}: {
  files: readonly GitChangeEntry[];
  activeFile: string | null;
  onOpenFile: (path: string) => void;
}) {
  return (
    <ul
      data-testid="atlas-git-file-list"
      className="flex flex-none flex-col border-b border-[color:var(--color-divider)]"
    >
      {files.map((file) => (
        <li key={file.path}>
          <button
            type="button"
            data-testid="atlas-git-commit-file"
            /* `aria-current`, not pressed: the lens above already uses `aria-selected`. */
            aria-current={activeFile === file.path ? "true" : undefined}
            data-document-anchor={activeFile === file.path ? true : undefined}
            onClick={() => onOpenFile(file.path)}
            className={controlClass({ shape: "row", stacked: true, className: "min-h-8 min-w-0 gap-2.5 border-l-2 border-l-transparent py-1.5 pl-3.5 pr-4 hover:bg-[color:var(--color-overlay-1)] aria-[current=true]:border-l-[color:var(--color-indigo-brand)] aria-[current=true]:bg-[color:var(--color-overlay-2)]" })}
          >
            <span
              aria-hidden
              className="grid size-[18px] shrink-0 place-items-center rounded-[var(--radius-chip)] border border-[color:var(--color-border-soft)] font-mono text-caption text-[color:var(--color-text-tertiary)]"
            >
              {statusMark(file.status)}
            </span>
            <span className="min-w-0 truncate font-mono text-caption text-[color:var(--color-text-secondary)]">
              {file.path}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
