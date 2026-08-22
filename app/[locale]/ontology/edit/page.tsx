import { Suspense } from "react";
import { OntologyEditRedirectPage } from "@/views/ontology-edit-redirect";
import { RouteLoadingFallback } from "@/shared/ui";

/**
 * `/ontology/edit` — the retired ERD builder, now a thin redirect to `/topology`, whose contextual
 * editor covers node assembly, relation connecting, live preview, and real frontmatter writes. Kept
 * so old bookmarks and agent-handoff deep-links land in the map editor instead of 404-ing.
 */
export default function Page() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <OntologyEditRedirectPage />
    </Suspense>
  );
}
