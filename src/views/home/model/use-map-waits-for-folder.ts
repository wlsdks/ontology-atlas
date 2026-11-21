import { useEffect } from "react";
import { useArrivingManifest, useLocalVault } from "@/entities/vault-session";
import { useRouter } from "@/i18n/navigation";
import { DESTINATION_HREF } from "@/shared/config/destinations";
import { cancelMapNavigation } from "@/shared/lib/navigation/map-navigation-pending";
import { describeVaultShape } from "@/shared/lib/vault-folder/vault-shape";

/**
 * True while the map view must not draw: a folder of pages with no map is on its way to the Library,
 * or a folder arriving in parts has brought no concept yet, so the map would be empty. Shapes are read
 * per render, unmemoized, because memo dependencies kept a switched-away folder alive (`vault-switch-release`).
 */
export function useMapWaitsForFolder(mapEntryTicket: number | null): boolean {
  const vault = useLocalVault();
  const arriving = useArrivingManifest();
  const router = useRouter();
  const loaded = vault.status === "loaded" && vault.manifest ? describeVaultShape(vault.manifest.docs ?? []) : null;
  const leavingForLibrary = loaded !== null && loaded.wiki && !loaded.map;
  const noConceptYet = arriving !== null && !describeVaultShape(arriving.docs).map;
  useEffect(() => {
    if (!leavingForLibrary) return;
    cancelMapNavigation(mapEntryTicket);
    router.replace(DESTINATION_HREF.library);
  }, [leavingForLibrary, mapEntryTicket, router]);
  return leavingForLibrary || noConceptYet;
}
