"use client";

import { AtlasGitPanel, useAtlasGitContext } from "@/widgets/atlas-git-panel";

/**
 * The history destination, work you stay in rather than a modal, shown to every audience so the
 * rail's item count never varies. `AtlasGitPanel` is the whole body.
 */
export function GitPage() {
  const { vaultPath, changeset, graph } = useAtlasGitContext();

  return (
    <main
      id="main"
      data-testid="git-page"
      // Takes the shell's height and scrolls inside, or short content collapses the canvas.
      className="flex h-full flex-col overflow-hidden bg-[color:var(--color-canvas)]"
    >
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
        <AtlasGitPanel
          vaultPath={vaultPath}
          sessionChangeset={changeset}
          graph={graph}
          className="flex-1"
        />
      </div>
    </main>
  );
}
