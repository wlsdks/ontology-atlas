import type { NavRailContextHrefs } from "@/widgets/app-nav-rail";

export function buildNavRailContextHrefs(
  documentHref: string | null,
): NavRailContextHrefs | null {
  return documentHref ? { docs: documentHref } : null;
}
