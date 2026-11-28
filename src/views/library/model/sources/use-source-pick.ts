import { useCallback, useMemo, useState } from "react";
import type { useTranslations } from "use-intl";

import type { LibrarySourceRow } from "@/entities/docs-vault";
import { sourceGroupKey, type SourcePick } from "@/widgets/library-sources-overview";

/**
 * The folder or file type a row picked on the Sources home narrows the index list to. A pick belongs
 * to its folder, so switching folders drops it.
 */
export function useSourcePick({ workVaultScope, t }: {
  workVaultScope: string;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  const [pickAt, setPickAt] = useState<{ scope: string; pick: SourcePick } | null>(null);
  const sourcePick = pickAt?.scope === workVaultScope ? pickAt.pick : null;
  const setSourcePick = useCallback(
    (pick: SourcePick | null) => setPickAt(pick ? { scope: workVaultScope, pick } : null),
    [workVaultScope],
  );
  const sourceGroupFilter = useMemo(() => {
    if (!sourcePick) return null;
    const keys = new Set(sourcePick.keys);
    return {
      label: sourcePick.grouping === "folder" ? t("sourcesHome.listFolder", { folder: sourcePick.name }) : t("sourcesHome.listType", { type: sourcePick.name }),
      includes: (row: LibrarySourceRow) => keys.has(sourceGroupKey(row, sourcePick.grouping)),
      onClear: () => setSourcePick(null),
    };
  }, [setSourcePick, sourcePick, t]);
  return { sourcePick, setSourcePick, sourceGroupFilter };
}
