import { Suspense } from "react";
import { OntologyEditRedirectPage } from "@/views/ontology-edit-redirect";
import { RouteLoadingFallback } from "@/shared/ui";

/**
 * `/ontology/edit` — retired ERD builder → thin redirect to `/topology`
 * (나침 무대 / Compass Stage, which now covers node assembly, relation
 * connecting, live preview, and real frontmatter writes). Kept so old
 * bookmarks / agent-handoff deep-links land in the map editor instead of 404-ing.
 */
export default function Page() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <OntologyEditRedirectPage />
    </Suspense>
  );
}
