import { Suspense } from "react";
import { OntologyEditRedirectPage } from "@/views/ontology-edit-redirect";

/**
 * `/ontology/edit` — retired ERD builder → thin redirect to `/ontology/studio`
 * (나침 무대 / Compass Stage, which now covers node assembly, relation
 * connecting, live preview, and real frontmatter writes). Kept so old
 * bookmarks / agent-handoff deep-links land in the studio instead of 404-ing.
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <OntologyEditRedirectPage />
    </Suspense>
  );
}
