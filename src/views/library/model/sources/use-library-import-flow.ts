import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { useTranslations } from "next-intl";

import { useVaultConnectors } from "@/features/mcp-connectors";
import { useRouter } from "@/i18n/navigation";
import { MCP_CONNECTORS_HREF } from "@/shared/config/destinations";
import { clearLibraryImportRequest, pendingLibraryImport, type ImportDestination } from "@/shared/lib/library-import/destination";
import { isRouteCrossfadeRunning, navigateWithViewTransition, subscribeRouteCrossfade } from "@/shared/lib/navigation/route-view-transition";
import type { useToast } from "@/shared/ui";

/**
 * The import dialog's state and the doors out of it. An import asked for from Planning arrives
 * through a route crossfade, so the dialog rises only once the pane has settled.
 */
export function useLibraryImportFlow({ handle, t, toast }: {
  handle: FileSystemDirectoryHandle | null;
  t: ReturnType<typeof useTranslations<"library">>;
  toast: ReturnType<typeof useToast>;
}) {
  const [importOpen, setImportOpen] = useState(() => pendingLibraryImport() !== null);
  const [importDestination, setImportDestination] = useState<ImportDestination>(() => pendingLibraryImport() ?? "sources");
  const connectors = useVaultConnectors(handle);
  const router = useRouter();
  const openConcept = useCallback((slug: string) => {
    navigateWithViewTransition(() => router.push(`/library/?tab=ontology&slug=${encodeURIComponent(slug)}`));
  }, [router]);
  const openImport = useCallback(() => { setImportDestination("sources"); setImportOpen(true); }, []);
  const openPlanning = useCallback(() => { navigateWithViewTransition(() => router.push("/planning/")); }, [router]);
  const openConnectorSettings = useCallback(() => { navigateWithViewTransition(() => router.push(MCP_CONNECTORS_HREF)); }, [router]);
  const routeCrossfading = useSyncExternalStore(subscribeRouteCrossfade, isRouteCrossfadeRunning, () => false);
  const importHeadsToPlanningRef = useRef(false);
  const offerPlanningAfterImport = useCallback(() => {
    if (!importHeadsToPlanningRef.current) return;
    importHeadsToPlanningRef.current = false;
    toast.show(t("sources.importedToPlanning"), "success", { label: t("sources.openPlanning"), onClick: openPlanning });
  }, [openPlanning, t, toast]);
  useEffect(() => { clearLibraryImportRequest(); }, []);
  return {
    importOpen, setImportOpen, importDestination, connectors, routeCrossfading, importHeadsToPlanningRef,
    openConcept, openImport, openPlanning, openConnectorSettings, offerPlanningAfterImport,
  };
}
