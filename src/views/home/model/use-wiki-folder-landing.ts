import { useEffect } from "react";
import { useLocalVault } from "@/entities/vault-session";
import { useRouter } from "@/i18n/navigation";
import { DESTINATION_HREF } from "@/shared/config/destinations";
import { cancelMapNavigation } from "@/shared/lib/navigation/map-navigation-pending";
import { describeVaultShape } from "@/shared/lib/vault-folder/vault-shape";

/**
 * True while a folder of pages with no map is on its way to the Library. The map view asks before it
 * mounts, so the map is never drawn for a folder it has nothing to show. It reads the loaded manifest,
 * since the derived graph is briefly empty on every open: O(documents) per render, and unmemoized,
 * because memo dependencies kept a switched-away folder's manifest alive (`vault-switch-release`).
 */
export function useWikiFolderLanding(mapEntryTicket: number | null): boolean {
  const vault = useLocalVault();
  const router = useRouter();
  const shape = vault.status === "loaded" && vault.manifest ? describeVaultShape(vault.manifest.docs ?? []) : null;
  const leavingForLibrary = shape !== null && shape.wiki && !shape.map;
  useEffect(() => {
    if (!leavingForLibrary) return;
    cancelMapNavigation(mapEntryTicket);
    router.replace(DESTINATION_HREF.library);
  }, [leavingForLibrary, mapEntryTicket, router]);
  return leavingForLibrary;
}
