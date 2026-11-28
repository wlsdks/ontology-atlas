import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { useTranslations } from "use-intl";

import { buildHumanPage, createWikiFile, deleteWikiFile, writeWikiFile } from "@/features/library";
import type { useFailureSentence } from "@/shared/lib/failures/use-failure-sentence";
import type { useToast } from "@/shared/ui";

import type { LibrarySelection } from "../library-selection";

/**
 * Starts a page a person writes by hand, from a title. Resolves false when nothing was written;
 * a title that already names a page opens that page instead. The toast offers Undo, which deletes
 * the file again.
 */
export function useNewWikiPage({
  t, toast, failureSentence, handle, nativeVaultRootPath, knownSlugs, markSelfWrite, unmarkSelfWrite, setSelected,
}: {
  t: ReturnType<typeof useTranslations<"library">>;
  toast: ReturnType<typeof useToast>;
  failureSentence: ReturnType<typeof useFailureSentence>;
  handle: FileSystemDirectoryHandle | null;
  nativeVaultRootPath: string | null;
  knownSlugs: Set<string>;
  markSelfWrite: (slug: string) => void;
  unmarkSelfWrite: (slug: string) => void;
  setSelected: Dispatch<SetStateAction<LibrarySelection>>;
}) {
  return useCallback(
    async (title: string) => {
      if (!handle) return false;
      const page = buildHumanPage({ title, now: new Date() });
      if (knownSlugs.has(page.slug)) {
        toast.show(t("wiki.newPageExists", { page: page.slug }), "error");
        setSelected({ kind: "wiki", slug: page.slug });
        return true;
      }
      let nativeWriteReserved = false;
      try {
        if (nativeVaultRootPath) {
          markSelfWrite(page.slug);
          nativeWriteReserved = true;
          if (!await createWikiFile(handle, page.path, page.text)) throw new Error(`Document already exists: "${page.slug}"`);
        } else {
          await writeWikiFile(handle, page.path, page.text);
          markSelfWrite(page.slug);
        }
        setSelected({ kind: "wiki", slug: page.slug });
        toast.show(
          t("wiki.newPageDone"),
          "success",
          {
            label: t("wiki.undo"),
            onClick: () => {
              void deleteWikiFile(handle, page.path).then(
                () => {
                  setSelected((current) => (current?.kind === "wiki" && current.slug === page.slug ? null : current));
                  toast.show(t("wiki.undone", { page: page.slug }), "success");
                },
                () => toast.show(t("wiki.undoFailed"), "error"),
              );
            },
          },
          { description: title },
        );
        return true;
      } catch (err) {
        if (nativeWriteReserved) unmarkSelfWrite(page.slug);
        toast.show(failureSentence(err, t("wiki.newPageFailed")).sentence, "error");
        return false;
      }
    },
    [failureSentence, handle, knownSlugs, markSelfWrite, nativeVaultRootPath, setSelected, t, toast, unmarkSelfWrite],
  );
}
