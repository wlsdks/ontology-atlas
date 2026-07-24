"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { translateOntologyDeeplinkToTopologyParam } from "@/entities/knowledge-graph";

/**
 * `/ontology/edit` — retired ERD builder. The 나침 무대(Compass Stage,
 * `/ontology/studio`) now covers node assembly, relation connecting, live
 * preview, and real frontmatter writes, so the ERD builder was removed
 * (master-plan follow-up, 2026-07-24). This route stays as a thin client
 * redirect so bookmarks / agent-handoff deep-links to the old builder land in
 * the studio instead of 404-ing.
 *
 * A `?node=<id>` deep-link is forwarded to the studio's own `?node=` contract
 * (ENHANCE mode opens that node with its relation sockets), normalizing the
 * id through `translateOntologyDeeplinkToTopologyParam` so the studio's
 * `n.id === requestedNode` match holds for both canonical (`capability:foo`)
 * and legacy plural-slash (`capabilities/foo`) forms.
 */
export function OntologyEditRedirectPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const node = searchParams.get("node");
    const target = node
      ? `/ontology/studio/?node=${encodeURIComponent(
          translateOntologyDeeplinkToTopologyParam(node),
        )}`
      : "/ontology/studio/";
    router.replace(target);
  }, [router, searchParams]);

  return null;
}
