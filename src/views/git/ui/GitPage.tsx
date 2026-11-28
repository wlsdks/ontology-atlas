import { AtlasGitPanel, useAtlasGitContext } from "@/widgets/atlas-git-panel";

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
